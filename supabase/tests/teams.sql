-- Teams, roles and two-step sign-in, as each kind of user. Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); res jsonb := '{}'::jsonb; iid uuid; iid2 uuid; t jsonb; n int; me jsonb;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@t.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'member@t.test', now(), now(), now(), '{}', '{}'),
    (inst, c, 'authenticated', 'authenticated', 'invitee@t.test', now(), now(), now(), '{}', '{}'),
    (inst, st, 'authenticated', 'authenticated', 'staff@placetta.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (b, 'email'), (c, 'email'), (st, 'email');
  insert into public.staff_emails (email) values ('staff@placetta.test');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'T', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, b, 'member');
  insert into public.billing (workspace_id, comped) values (w, true);
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    values (gen_random_uuid(), b, 'test', 'totp', 'verified', now(), now());

  -- service-role view
  res := res || jsonb_build_object(
    'access owner', public.access_for(w, a, 'aal1') = 'owner',
    'access member needs code', public.access_for(w, b, 'aal1') = 'mfa_required',
    'access member with code', public.access_for(w, b, 'aal2') = 'member',
    'access staff needs code', public.access_for(w, st, 'aal1') = 'staff_mfa_required',
    'access staff with code', public.access_for(w, st, 'aal2') = 'staff',
    'access stranger', public.access_for(w, c, 'aal2') = 'none');

  execute 'set local role authenticated';

  -- owner A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('owner is owner', public.is_owner(w), 'owner lists workspace', (select count(*) from public.my_workspaces()) = 1);
  iid := public.invite_member(w, ' Invitee@T.test ', 'member');
  res := res || jsonb_build_object('invite created', iid is not null);
  begin perform public.invite_member(w, 'not-an-email', 'member'); res := res || '{"bad email rejected": false}'; exception when others then res := res || '{"bad email rejected": true}'; end;
  begin perform public.invite_member(w, 'member@t.test', 'member'); res := res || '{"existing member rejected": false}'; exception when others then res := res || '{"existing member rejected": true}'; end;
  t := public.team_list(w);
  res := res || jsonb_build_object('owner sees invite', jsonb_array_length(t->'invites') = 1, 'team has two', jsonb_array_length(t->'members') = 2,
                                   'invites table visible to owner', (select count(*) from public.workspace_invites) = 1);
  begin perform public.check_remove_member(w, a); res := res || '{"last owner protected": false}'; exception when others then res := res || '{"last owner protected": true}'; end;
  begin
    insert into public.filings (workspace_id, app_id, title, payload) values (w, 'x-food', '{"en":"Food","zh":"Food"}', '{"fields":[],"checklist":[],"attachments":[],"does":[]}');
    res := res || '{"owner can request filing": true}';
  exception when others then res := res || jsonb_build_object('owner can request filing', false, 'owner filing error', sqlerrm); end;
  iid2 := public.invite_member(w, 'temp@t.test', 'owner');
  perform public.revoke_invite(iid2);
  res := res || jsonb_build_object('revoked invite gone', jsonb_array_length(public.team_list(w)->'invites') = 1);

  -- member B with two-step on, signed in without the code
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('member without code locked out', not public.is_member(w) and (select count(*) from public.my_workspaces()) = 0
                                     and (select count(*) from public.workspaces) = 0);
  -- with the code
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('member with code', public.is_member(w) and not public.is_owner(w), 'member sees no invites', (select count(*) from public.workspace_invites) = 0,
                                   'member team_list hides invites', jsonb_array_length(public.team_list(w)->'invites') = 0);
  begin perform public.invite_member(w, 'x@t.test', 'member'); res := res || '{"member cannot invite": false}'; exception when others then res := res || '{"member cannot invite": true}'; end;
  begin
    insert into public.filings (workspace_id, app_id, title, payload) values (w, 'x-sign', '{"en":"Sign","zh":"Sign"}', '{"fields":[],"checklist":[],"attachments":[],"does":[]}');
    res := res || '{"member cannot request filing": false}';
  exception when others then res := res || '{"member cannot request filing": true}'; end;
  update public.filings set status = 'canceled' where workspace_id = w;
  get diagnostics n = row_count;
  res := res || jsonb_build_object('member cannot cancel', n = 0);
  begin perform public.calendar_token(w, true); res := res || '{"member cannot reset feed": false}'; exception when others then res := res || '{"member cannot reset feed": true}'; end;
  res := res || jsonb_build_object('member reads feed', public.calendar_token(w, false) is not null);

  -- staff
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  me := public.whoami();
  res := res || jsonb_build_object('staff without code', not (me->>'staff')::boolean and (me->>'staff_email')::boolean and (select count(*) from public.workspaces) = 0);
  begin perform * from public.filing_queue_v2(); res := res || '{"queue locked without code": false}'; exception when others then res := res || '{"queue locked without code": true}'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('staff with code', public.is_staff() and (select count(*) from public.filing_queue_v2()) = 1 and (select count(*) from public.workspaces) >= 1);

  -- invitee C accepts by signing in
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  n := public.accept_invites();
  res := res || jsonb_build_object('invite accepted', n = 1 and public.is_member(w) and not public.is_owner(w), 'accept is idempotent', public.accept_invites() = 0);

  -- owner A promotes C, then leaves
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.set_member_role(w, c, 'owner');
  -- as the team function does: the database checks and records it, then the membership row goes
  perform public.check_remove_member(w, a);
  execute 'reset role';
  delete from public.workspace_members where workspace_id = w and user_id = a;
  execute 'set local role authenticated';
  res := res || jsonb_build_object('owner left after promoting', not public.is_member(w));

  -- a Microsoft-only account with the invited address can't claim an invite or staff access
  execute 'reset role';
  declare x uuid := gen_random_uuid(); begin
    insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      values (inst, x, 'authenticated', 'authenticated', 'msft@t.test', now(), now(), now(), '{}', '{}');
    insert into auth.identities (user_id, provider) values (x, 'azure');
    insert into public.staff_emails (email) values ('msft@t.test');
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform public.invite_member(w, 'msft@t.test', 'owner');
    perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    res := res || jsonb_build_object('microsoft-only account cannot claim invite', public.accept_invites() = 0 and not public.is_member(w),
                                     'microsoft-only account is not staff', not public.is_staff());
    execute 'reset role';
    res := res || jsonb_build_object('usage counters closed to users', not has_function_privilege('authenticated', 'public.track_usage(uuid, int, bigint, bigint, bigint)', 'execute'));
  end;
  execute 'reset role';
  res := res || jsonb_build_object('audit rows written', (select count(*) from public.audit_log where workspace_id = w) >= 6);
  raise exception 'TEST_RESULTS %', res;
end $test$;
