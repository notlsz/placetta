-- Enterprise access (20261022000000_enterprise_access.sql): the four roles in row-level security, SSO domain rules,
-- SCIM provisioning and deprovisioning, and the audit trail with its export. Run with scripts/test-db.sh (ends by
-- raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); ad uuid := gen_random_uuid(); mb uuid := gen_random_uuid(); vw uuid := gen_random_uuid();
  sam uuid := gen_random_uuid(); bob uuid := gen_random_uuid(); ss uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); prov uuid := gen_random_uuid(); other_prov uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; n int; t jsonb; tok jsonb; tok2 jsonb; s jsonb; su jsonb; sid uuid; g jsonb; g2 jsonb; iid uuid; e text;
  saml jsonb; pw jsonb; oauth jsonb;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'olivia@acme.test', now(), now(), now(), '{}', '{}'),
    (inst, ad, 'authenticated', 'authenticated', 'adam@admins.test', now(), now(), now(), '{}', '{}'),
    (inst, mb, 'authenticated', 'authenticated', 'mia@corp.test', now(), now(), now(), '{}', '{}'),
    (inst, vw, 'authenticated', 'authenticated', 'vic@corp.test', now(), now(), now(), '{}', '{}'),
    (inst, sam, 'authenticated', 'authenticated', 'sam@acme.test', now(), now(), now(), '{}', '{}'),
    (inst, bob, 'authenticated', 'authenticated', 'bob@corp.test', now(), now(), now(), '{}', '{}'),
    (inst, ss, 'authenticated', 'authenticated', 'sue@acme.test', now(), now(), now(), '{}', '{}'),
    (inst, eve, 'authenticated', 'authenticated', 'eve@evil.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (o, 'azure'), (ad, 'email'), (mb, 'email'), (vw, 'email'), (sam, 'email'),
    (bob, 'email'), (ss, 'sso:' || prov), (eve, 'sso:' || other_prov);
  insert into auth.sso_providers (id) values (prov), (other_prov);
  insert into auth.sso_domains (sso_provider_id, domain) values (prov, 'acme.test'), (other_prov, 'evil.test');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Acme', now(), o, o), (w2, 'Other', now(), eve, eve);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w, ad, 'admin'), (w, mb, 'member'), (w, vw, 'viewer'), (w, sam, 'member'),
    (w2, eve, 'owner');
  insert into public.billing (workspace_id, comped) values (w, true), (w2, true);
  insert into storage.objects (bucket_id, name) values ('documents', w || '/lease.pdf');
  pw := jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1)));
  saml := jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'sso/saml', 'timestamp', 1, 'provider', prov)));
  oauth := jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', 1)));

  /* ---------------- roles ---------------- */
  res := res || jsonb_build_object(
    'access_for says viewer', public.access_for(w, vw, 'aal1') = 'viewer',
    'access_for says admin', public.access_for(w, ad, 'aal1', pw) = 'admin',
    'role constraint refuses a made-up role', (select count(*) from pg_constraint where conname = 'workspace_members_role_check' and pg_get_constraintdef(oid) like '%viewer%') = 1);
  begin insert into public.workspace_members (workspace_id, user_id, role) values (w2, mb, 'superuser'); res := res || '{"unknown role rejected": false}';
  exception when check_violation then res := res || '{"unknown role rejected": true}'; end;

  execute 'set local role authenticated';

  -- viewer: reads everything, changes nothing
  perform set_config('request.jwt.claims', json_build_object('sub', vw, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object(
    'viewer can view', public.can_view(w) and not public.is_member(w) and not public.is_admin(w),
    'viewer reads the workspace', (select count(*) from public.workspaces where id = w) = 1,
    'viewer reads the audit log', (select count(*) from public.audit_log where workspace_id = w) >= 0,
    'viewer reads files', (select count(*) from storage.objects where name = w || '/lease.pdf') = 1,
    'viewer reads the team', jsonb_array_length(public.team_list(w) -> 'members') = 5,
    'viewer sees no invites', jsonb_array_length(public.team_list(w) -> 'invites') = 0);
  update public.workspaces set state = '{"x": 1}' where id = w;
  get diagnostics n = row_count;
  res := res || jsonb_build_object('viewer cannot edit the workspace', n = 0);
  begin insert into public.audit_log (workspace_id, actor, actor_id, action, object) values (w, 'you', vw, '{"en":"x","zh":"x"}', '{"en":"x","zh":"x"}');
    res := res || '{"viewer cannot write the audit log": false}';
  exception when others then res := res || '{"viewer cannot write the audit log": true}'; end;
  begin insert into public.documents (workspace_id, name, path, uploaded_by) values (w, 'a.pdf', w || '/a.pdf', vw);
    res := res || '{"viewer cannot add documents": false}';
  exception when others then res := res || '{"viewer cannot add documents": true}'; end;
  begin insert into storage.objects (bucket_id, name) values ('documents', w || '/b.pdf');
    res := res || '{"viewer cannot upload files": false}';
  exception when others then res := res || '{"viewer cannot upload files": true}'; end;
  begin perform public.comment_post(w, 'app', 'x-food', 'hello', '[]'::jsonb, false); res := res || '{"viewer cannot comment": false}';
  exception when others then res := res || '{"viewer cannot comment": true}'; end;
  begin perform public.invite_member(w, 'new@corp.test', 'viewer'); res := res || '{"viewer cannot invite": false}';
  exception when others then res := res || '{"viewer cannot invite": true}'; end;
  begin perform public.audit_export(w); res := res || '{"viewer cannot export the audit trail": false}';
  exception when others then res := res || '{"viewer cannot export the audit trail": true}'; end;
  begin perform public.audit_record_export(w, 'workspace_data'); res := res || '{"viewer data export is recorded": true}';
  exception when others then res := res || jsonb_build_object('viewer data export is recorded', false, 'viewer export error', sqlerrm); end;

  -- member: works in the workspace, manages nobody
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  update public.workspaces set state = '{"x": 2}' where id = w;
  get diagnostics n = row_count;
  res := res || jsonb_build_object('member edits the workspace', n = 1);
  begin insert into storage.objects (bucket_id, name) values ('documents', w || '/c.pdf'); res := res || '{"member uploads files": true}';
  exception when others then res := res || '{"member uploads files": false}'; end;
  begin perform public.set_member_role(w, vw, 'member'); res := res || '{"member cannot change roles": false}';
  exception when others then res := res || '{"member cannot change roles": true}'; end;
  begin perform public.security_settings(w); res := res || '{"member cannot see security settings": false}';
  exception when others then res := res || '{"member cannot see security settings": true}'; end;

  -- admin: people, roles, invites; never owners, never filings
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  iid := public.invite_member(w, 'new@corp.test', 'viewer');
  res := res || jsonb_build_object('admin invites a viewer', iid is not null, 'admin sees invites', jsonb_array_length(public.team_list(w) -> 'invites') = 1);
  begin perform public.invite_member(w, 'boss@corp.test', 'owner'); res := res || '{"admin cannot invite an owner": false}';
  exception when others then res := res || '{"admin cannot invite an owner": true}'; end;
  perform public.set_member_role(w, vw, 'member');
  perform public.set_member_role(w, vw, 'viewer');
  res := res || jsonb_build_object('admin changes roles', (select role from public.workspace_members where workspace_id = w and user_id = vw) = 'viewer');
  begin perform public.set_member_role(w, mb, 'owner'); res := res || '{"admin cannot make an owner": false}';
  exception when others then res := res || '{"admin cannot make an owner": true}'; end;
  begin perform public.set_member_role(w, o, 'member'); res := res || '{"admin cannot demote an owner": false}';
  exception when others then res := res || '{"admin cannot demote an owner": true}'; end;
  begin perform public.check_remove_member(w, o); res := res || '{"admin cannot remove an owner": false}';
  exception when others then res := res || '{"admin cannot remove an owner": true}'; end;
  res := res || jsonb_build_object('admin may remove a member', public.check_remove_member(w, vw) = 'viewer');
  begin
    insert into public.filings (workspace_id, app_id, title, payload) values (w, 'x-admin', '{"en":"A","zh":"A"}', '{"fields":[],"checklist":[],"attachments":[],"does":[]}');
    res := res || '{"admin cannot request a filing": false}';
  exception when others then res := res || '{"admin cannot request a filing": true}'; end;

  -- owner
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.set_member_role(w, ad, 'owner');
  perform public.set_member_role(w, ad, 'admin');
  res := res || jsonb_build_object('owner makes and unmakes owners', (select role from public.workspace_members where workspace_id = w and user_id = ad) = 'admin');
  begin perform public.set_member_role(w, o, 'admin'); res := res || '{"last owner kept": false}';
  exception when others then res := res || '{"last owner kept": true}'; end;
  insert into public.owner_approvals (workspace_id, app_id, user_id) values (w, 'x-food', o);

  /* ---------------- single sign-on ---------------- */
  perform set_config('request.jwt.claims', (json_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  s := public.sso_set_domain(w, ' Acme.TEST. ');
  res := res || jsonb_build_object('domain is normalized', s ->> 'domain' = 'acme.test' and s ->> 'txt_name' = '_placetta-verify.acme.test'
                                     and s ->> 'txt_value' ~ '^placetta-verify=[0-9a-f]{32}$' and s ->> 'verified_at' is null);
  begin perform public.sso_set_domain(w, 'not a domain'); res := res || '{"bad domain rejected": false}';
  exception when others then res := res || '{"bad domain rejected": true}'; end;
  begin perform public.sso_set_enforced(w, true, 'saml'); res := res || '{"enforcing needs a verified domain": false}';
  exception when others then res := res || '{"enforcing needs a verified domain": true}'; end;
  begin perform public.sso_mark_verified(w, 'acme.test', ad); res := res || '{"only the server marks a domain verified": false}';
  exception when insufficient_privilege then res := res || '{"only the server marks a domain verified": true}'; end;

  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  res := res || jsonb_build_object('server marks the domain verified', public.sso_mark_verified(w, 'acme.test', ad),
                                   'a second verify is a no-op', not public.sso_mark_verified(w, 'acme.test', ad));
  execute 'reset role';
  insert into public.workspace_sso (workspace_id, domain, verify_token) values (w2, 'acme.test', 'placetta-verify=' || repeat('a', 32));
  begin
    execute 'set local role service_role';
    perform public.sso_mark_verified(w2, 'acme.test', eve);
    res := res || '{"a domain is verified by one workspace only": false}';
  exception when others then res := res || '{"a domain is verified by one workspace only": true}'; end;
  execute 'reset role';
  execute 'set local role authenticated';

  -- the owner is at acme.test: turning it on from a password session would lock them out, so it's refused
  perform set_config('request.jwt.claims', (json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  begin perform public.sso_set_enforced(w, true, 'saml'); res := res || '{"enforcing from a non-SSO session at the domain is refused": false}';
  exception when others then res := res || jsonb_build_object('enforcing from a non-SSO session at the domain is refused', sqlerrm like 'Sign in with SAML single sign-on first%'); end;
  -- an admin outside the domain may turn it on
  perform set_config('request.jwt.claims', (json_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  s := public.sso_set_enforced(w, true, 'saml');
  res := res || jsonb_build_object('admin outside the domain enforces SAML', (s ->> 'enforced')::boolean and s ->> 'method' = 'saml');
  res := res || jsonb_build_object('sign-in screen learns the rule', (public.sso_for_email('Anyone@ACME.test') ->> 'required')::boolean
                                     and public.sso_for_email('anyone@acme.test') ->> 'method' = 'saml'
                                     and not (public.sso_for_email('x@corp.test') ->> 'required')::boolean);

  -- sam@acme.test: a password session reaches nothing; a SAML session from the domain's provider reaches everything
  perform set_config('request.jwt.claims', (json_build_object('sub', sam, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  res := res || jsonb_build_object('password session at an enforced domain is locked out', not public.can_view(w) and (select count(*) from public.workspaces) = 0
                                     and (select count(*) from public.my_workspaces()) = 0);
  perform set_config('request.jwt.claims', (json_build_object('sub', sam, 'role', 'authenticated', 'aal', 'aal1')::jsonb
    || jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'sso/saml', 'provider', other_prov))))::text, true);
  res := res || jsonb_build_object('SAML from another domain''s provider does not count', not public.can_view(w));
  perform set_config('request.jwt.claims', (json_build_object('sub', sam, 'role', 'authenticated', 'aal', 'aal1')::jsonb || saml)::text, true);
  res := res || jsonb_build_object('SAML session from the domain''s provider works', public.is_member(w) and (select count(*) from public.workspaces where id = w) = 1);
  -- the owner's own session is held to it too
  perform set_config('request.jwt.claims', (json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  res := res || jsonb_build_object('enforced owner on a password session is locked out', not public.is_owner(w));
  -- people outside the domain are unaffected
  perform set_config('request.jwt.claims', (json_build_object('sub', mb, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  res := res || jsonb_build_object('other domains are unaffected', public.is_member(w));

  execute 'reset role';
  res := res || jsonb_build_object(
    'server functions see sso_required', public.access_for(w, sam, 'aal1', pw) = 'sso_required' and public.access_for(w, sam, 'aal1') = 'sso_required',
    'server functions see the role with SAML', public.access_for(w, sam, 'aal1', saml) = 'member',
    'strangers stay none', public.access_for(w, eve, 'aal1', pw) = 'none',
    'SAML identity counts as a proven email for its domain', public.email_proven(ss));
  -- eve's provider covers evil.test and her email is evil.test, so hers is proven; one asserting acme.test from evil.test's provider is not
  update auth.users set email = 'eve@acme.test' where id = eve;
  res := res || jsonb_build_object('a provider asserting another domain''s email proves nothing', not public.email_proven(eve));
  update auth.users set email = 'eve@evil.test' where id = eve;

  -- OIDC: Microsoft (azure) required; the owner has an azure identity
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', (json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::jsonb || oauth)::text, true);
  res := res || jsonb_build_object('under SAML, a Microsoft session is locked out too', not public.is_owner(w));
  perform set_config('request.jwt.claims', (json_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  s := public.sso_set_enforced(w, true, 'azure');
  perform set_config('request.jwt.claims', (json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::jsonb || oauth)::text, true);
  res := res || jsonb_build_object('Microsoft required: the owner''s Microsoft session works', s ->> 'method' = 'azure' and public.is_owner(w)
                                     and (public.security_settings(w) ->> 'session_ok')::boolean);
  perform set_config('request.jwt.claims', (json_build_object('sub', sam, 'role', 'authenticated', 'aal', 'aal1')::jsonb || saml)::text, true);
  res := res || jsonb_build_object('SAML no longer counts once Microsoft is required', not public.can_view(w));
  execute 'reset role';
  insert into auth.identities (user_id, provider) values (o, 'github');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', (json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::jsonb || oauth)::text, true);
  res := res || jsonb_build_object('an account with another OAuth provider can''t prove which one it used', not public.is_owner(w));
  execute 'reset role';
  delete from auth.identities where user_id = o and provider = 'github';
  update public.workspace_sso set enforced = false where workspace_id = w;

  /* ---------------- SCIM ---------------- */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', (json_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  tok := public.scim_token_create(w);
  tok2 := public.scim_token_create(w);
  res := res || jsonb_build_object('token shown once, in its format', tok2 ->> 'token' ~ '^scim_[0-9a-f]{8}_[0-9a-f]{64}$',
    'settings show only the prefix', (public.security_settings(w) -> 'scim' ->> 'prefix') = tok2 ->> 'prefix' and public.security_settings(w)::text !~ (tok2 ->> 'token'));
  perform set_config('request.jwt.claims', (json_build_object('sub', mb, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  begin perform public.scim_token_create(w); res := res || '{"member cannot make a SCIM token": false}';
  exception when others then res := res || '{"member cannot make a SCIM token": true}'; end;
  begin perform public.scim_user_put(w, null, '{"user_name": "x@corp.test"}'); res := res || '{"the browser cannot call SCIM writes": false}';
  exception when insufficient_privilege then res := res || '{"the browser cannot call SCIM writes": true}'; end;

  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  res := res || jsonb_build_object(
    'only the SHA-256 is stored', (select count(*) from public.scim_tokens where token_hash = encode(extensions.digest(tok2 ->> 'token', 'sha256'), 'hex')) = 1
                                   and (select count(*) from public.scim_tokens where token_hash = tok2 ->> 'token') = 0,
    'the new token works', public.scim_auth(encode(extensions.digest(tok2 ->> 'token', 'sha256'), 'hex')) = w,
    'rotating ends the old token', public.scim_auth(encode(extensions.digest(tok ->> 'token', 'sha256'), 'hex')) is null,
    'a made-up token is nobody', public.scim_auth(repeat('0', 64)) is null);

  -- create bob (not yet signed in here): provisioned, no access until he signs in
  su := public.scim_user_put(w, null, '{"user_name": "Bob@Corp.test", "email": "Bob@Corp.test", "given_name": "Bob", "family_name": "Jones", "external_id": "00u1", "active": true}');
  sid := (su ->> 'id')::uuid;
  res := res || jsonb_build_object('userName kept as sent, email lowercased', su ->> 'user_name' = 'Bob@Corp.test' and su ->> 'email' = 'bob@corp.test' and (su ->> 'active')::boolean,
    'not on the workspace before signing in', not exists (select 1 from public.workspace_members where workspace_id = w and user_id = bob));
  begin perform public.scim_user_put(w, null, '{"user_name": "bob@corp.test"}'); res := res || '{"duplicate userName is a conflict": false}';
  exception when others then res := res || jsonb_build_object('duplicate userName is a conflict', sqlerrm = 'scim_conflict'); end;
  begin perform public.scim_user_put(w, null, '{"user_name": "x", "email": "not-an-email"}'); res := res || '{"email must be an email": false}';
  exception when others then res := res || jsonb_build_object('email must be an email', sqlerrm like 'scim_invalid%'); end;
  su := public.scim_user_put(w, null, '{"user_name": "bjensen", "external_id": "bjensen", "given_name": "Barbara", "family_name": "Jensen"}');
  res := res || jsonb_build_object('RFC 7644 example user without an email is kept, with no access', su ->> 'user_name' = 'bjensen' and su ->> 'email' is null and su ->> 'user_id' is null);
  begin perform public.scim_user_put(w, gen_random_uuid(), '{"active": false}'); res := res || '{"unknown id is not found": false}';
  exception when others then res := res || jsonb_build_object('unknown id is not found', sqlerrm = 'scim_not_found'); end;
  begin perform public.scim_user_put(w2, sid, '{"active": false}'); res := res || '{"another workspace''s token can''t touch this user": false}';
  exception when others then res := res || jsonb_build_object('another workspace''s token can''t touch this user', sqlerrm = 'scim_not_found'); end;

  -- bob signs in: the provisioned membership is his
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', (json_build_object('sub', bob, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  -- (separate statements: a stable function doesn't see what a volatile one in the same statement wrote)
  n := public.scim_claim();
  res := res || jsonb_build_object('signing in claims the provisioned access', n = 1 and public.is_member(w) and not public.is_admin(w),
                                   'claiming twice adds nothing', public.scim_claim() = 0,
                                   'is_owner is false, never null, for a non-owner', public.is_owner(w) = false and public.is_owner(w2) = false);

  -- groups map to roles
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  g := public.scim_group_put(w, null, jsonb_build_object('display_name', 'Compliance Admins', 'members', jsonb_build_array(sid)));
  res := res || jsonb_build_object('group created with a member', jsonb_array_length(g -> 'members') = 1,
    'an unmapped group gives member', (select role from public.workspace_members where workspace_id = w and user_id = bob) = 'member');
  begin perform public.scim_group_put(w, null, jsonb_build_object('display_name', 'Bad', 'members', jsonb_build_array(gen_random_uuid()))); res := res || '{"group members must be provisioned here": false}';
  exception when others then res := res || jsonb_build_object('group members must be provisioned here', sqlerrm like 'scim_invalid%'); end;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', (json_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  perform public.scim_group_role(w, (g ->> 'id')::uuid, 'admin');
  res := res || jsonb_build_object('mapping the group to admin makes bob an admin', (select role from public.workspace_members where workspace_id = w and user_id = bob) = 'admin');
  begin perform public.scim_group_role(w, (g ->> 'id')::uuid, 'owner'); res := res || '{"a group can''t give owner": false}';
  exception when others then res := res || '{"a group can''t give owner": true}'; end;
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  g2 := public.scim_group_put(w, (g ->> 'id')::uuid, jsonb_build_object('remove', jsonb_build_array(sid)));
  res := res || jsonb_build_object('leaving the group drops the role', jsonb_array_length(g2 -> 'members') = 0
                                     and (select role from public.workspace_members where workspace_id = w and user_id = bob) = 'member');
  perform public.scim_group_put(w, (g ->> 'id')::uuid, jsonb_build_object('add', jsonb_build_array(sid)));
  perform public.scim_group_delete(w, (g ->> 'id')::uuid);
  res := res || jsonb_build_object('deleting the group drops the role', (select role from public.workspace_members where workspace_id = w and user_id = bob) = 'member');

  -- deprovision: PATCH active false
  execute 'reset role';
  insert into auth.sessions (id, user_id) values (gen_random_uuid(), bob) returning id into iid;
  insert into auth.refresh_tokens (token, user_id, session_id) values ('rt', bob::text, iid);
  insert into public.workspace_invites (workspace_id, email, role, invited_by) values (w, 'bob@corp.test', 'admin', o)
    on conflict do nothing;
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  su := public.scim_user_put(w, sid, '{"active": false}');
  execute 'reset role';
  res := res || jsonb_build_object(
    'deactivated user is off the workspace', not exists (select 1 from public.workspace_members where workspace_id = w and user_id = bob),
    'their sessions are ended', not exists (select 1 from auth.sessions where user_id = bob) and not exists (select 1 from auth.refresh_tokens where user_id = bob::text),
    'their open invites are canceled', not exists (select 1 from public.workspace_invites where workspace_id = w and email = 'bob@corp.test' and revoked_at is null and accepted_at is null),
    'the row stays, inactive', not (su ->> 'active')::boolean);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', (json_build_object('sub', bob, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  res := res || jsonb_build_object('an inactive user can''t claim back in', public.scim_claim() = 0 and not public.can_view(w)
                                     and (select count(*) from public.workspaces where id = w) = 0);

  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform public.scim_user_put(w, sid, '{"active": true}');
  res := res || jsonb_build_object('reactivating restores access', exists (select 1 from public.workspace_members where workspace_id = w and user_id = bob));
  perform public.scim_user_delete(w, sid);
  res := res || jsonb_build_object('DELETE removes access and the record', not exists (select 1 from public.workspace_members where workspace_id = w and user_id = bob)
                                     and not exists (select 1 from public.scim_users where id = sid));

  -- an existing member provisioned by email is linked at once; owners are never deprovisioned by SCIM
  su := public.scim_user_put(w, null, '{"user_name": "mia@corp.test", "email": "mia@corp.test"}');
  res := res || jsonb_build_object('existing member is linked right away', (su ->> 'user_id')::uuid = mb);
  su := public.scim_user_put(w, null, '{"user_name": "olivia", "email": "olivia@acme.test"}');
  begin perform public.scim_user_put(w, (su ->> 'id')::uuid, '{"active": false}'); res := res || '{"SCIM cannot deactivate an owner": false}';
  exception when others then res := res || jsonb_build_object('SCIM cannot deactivate an owner', sqlerrm = 'scim_owner'); end;
  res := res || jsonb_build_object('the owner is still an owner', (select role from public.workspace_members where workspace_id = w and user_id = o) = 'owner');

  -- SSO accounts are separate from password accounts in Supabase: a SAML sign-in takes over a provisioned link
  su := public.scim_user_put(w, null, '{"user_name": "sue@acme.test", "email": "sue@acme.test"}');
  execute 'reset role';
  update public.scim_users set user_id = sam where id = (su ->> 'id')::uuid;   -- linked to some other account earlier
  insert into public.workspace_members (workspace_id, user_id, role) values (w, sam, 'member') on conflict do nothing;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', (json_build_object('sub', ss, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  res := res || jsonb_build_object('a non-SAML session can''t take over a link', public.scim_claim() = 0);
  perform set_config('request.jwt.claims', (json_build_object('sub', ss, 'role', 'authenticated', 'aal', 'aal1')::jsonb || saml)::text, true);
  n := public.scim_claim();
  res := res || jsonb_build_object('the SAML account takes over the provisioned access', n = 1 and public.is_member(w));
  execute 'reset role';
  res := res || jsonb_build_object('the old account loses the provisioned access', not exists (select 1 from public.workspace_members where workspace_id = w and user_id = sam));
  execute 'set local role authenticated';

  /* ---------------- audit trail ---------------- */
  perform set_config('request.jwt.claims', (json_build_object('sub', mb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', 'sess-1')::jsonb || pw)::text, true);
  res := res || jsonb_build_object('sign-in recorded once per session', public.audit_sign_in() = 1 and public.audit_sign_in() = 0);
  begin perform public.audit_export(w); res := res || '{"member cannot export the audit trail": false}';
  exception when others then res := res || '{"member cannot export the audit trail": true}'; end;
  perform set_config('request.jwt.claims', (json_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal1')::jsonb || pw)::text, true);
  select jsonb_agg(to_jsonb(x)) into t from public.audit_export(w) x;
  res := res || jsonb_build_object(
    'export has role changes', t @> '[{"action_en": "Changed a role", "detail_en": "Member to Viewer", "actor_email": "adam@admins.test"}]',
    'export has invites', t @> '[{"action_en": "Invited someone", "object_en": "new@corp.test"}]',
    'export has SSO changes', t @> '[{"action_en": "Set the sign-in domain"}]' and t @> '[{"action_en": "Verified the sign-in domain"}]' and t @> '[{"action_en": "Required single sign-on"}]',
    'export has SCIM tokens', t @> '[{"action_en": "Created a SCIM token"}]' and t @> '[{"action_en": "Replaced the SCIM token"}]',
    'export has SCIM changes', t @> '[{"action_en": "Provisioned by your identity provider", "actor": "idp"}]' and t @> '[{"action_en": "Deactivated by your identity provider", "detail_en": "Removed from the workspace and signed out everywhere"}]'
                                and t @> '[{"action_en": "Role changed by your identity provider", "detail_en": "Member to Admin"}]' and t @> '[{"action_en": "Deleted by your identity provider"}]',
    'export has group mapping', t @> '[{"action_en": "Mapped a SCIM group to a role"}]',
    'export has sign-ins', t @> '[{"action_en": "Signed in", "detail_en": "With a password", "object_en": "mia@corp.test"}]',
    'export has second-owner approvals', t @> '[{"action_en": "Approved as an owner"}]',
    'export has data exports', t @> '[{"action_en": "Exported data", "object_en": "Workspace data (JSON)"}]',
    'export records itself', t @> '[{"action_en": "Exported the audit trail"}]',
    'export is oldest first', (t -> 0 ->> 'created_at')::timestamptz <= (t -> (jsonb_array_length(t) - 1) ->> 'created_at')::timestamptz);
  begin perform public.audit_export(w2); res := res || '{"no export of another workspace": false}';
  exception when others then res := res || '{"no export of another workspace": true}'; end;

  execute 'reset role';
  res := res || jsonb_build_object(
    'anon may ask the sign-in rule', has_function_privilege('anon', 'public.sso_for_email(text)', 'execute'),
    'anon may not read settings', not has_function_privilege('anon', 'public.security_settings(uuid)', 'execute'),
    'browser may not mark domains verified', not has_function_privilege('authenticated', 'public.sso_mark_verified(uuid, text, uuid)', 'execute'),
    'browser may not end sessions', not has_function_privilege('authenticated', 'public.revoke_sessions(uuid)', 'execute'),
    'browser may not read SCIM tables', not has_table_privilege('authenticated', 'public.scim_tokens', 'select') and not has_table_privilege('authenticated', 'public.scim_users', 'select'));
  begin update public.audit_log set action = '{"en":"x","zh":"x"}' where workspace_id = w; res := res || '{"audit rows can''t be changed": false}';
  exception when others then res := res || '{"audit rows can''t be changed": true}'; end;
  raise exception 'TEST_RESULTS %', res;
end $test$;
