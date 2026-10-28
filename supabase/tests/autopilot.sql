-- Autopilot (20261103090000_autopilot.sql): an owner signs one standing authorization; Odelia's server files inside
-- it and nowhere else; revoking stops what hasn't left; an expired or revoked grant can't submit. Run with
-- scripts/test-db.sh (ends by raising TEST_RESULTS).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); m uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; n int; st jsonb; v text; e text; g uuid; g_old uuid; f1 uuid; f2 uuid; f3 uuid; mirror jsonb;
  scope jsonb := '{"stores":["s1"],"agencies":["City of San José"],"forms":["sj-sign","ca-cdtfa"]}';
  ver text := public.current_terms_version();
  pay jsonb := '{"official":"sj-sign","fields":[{"id":"l1","label":{"en":"Business name","zh":"名称"},"value":"Moonleaf Tea LLC"}],"checklist":[]}';
  ttl jsonb := '{"en":"File the sign permit","zh":"提交招牌许可"}';
  agy jsonb := '{"en":"City of San José","zh":"圣何塞市"}';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'mei@moonleaf.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'jun@moonleaf.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'staff@moonleaf.test', now(), now(), now(), '{}', '{}'),
    (inst, eve, 'authenticated', 'authenticated', 'eve@other.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (b, 'email'), (m, 'email'), (eve, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Moonleaf', now(), a, a, '{"apps":[],"controls":{"autonomy":"usual"}}'), (w2, 'Eve Co', now(), eve, eve, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, b, 'owner'), (w, m, 'member'), (w2, eve, 'owner');
  insert into public.billing (workspace_id, comped) values (w, true), (w2, true);

  execute 'set local role authenticated';
  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.7, 10.0.0.1", "user-agent": "Safari test"}', true);

  /* ------------------------------ signing ------------------------------ */
  -- a member can't sign it
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.autopilot_grant(w, 'Staff Person', null, true, ver, scope, 100, 500, 'typed', null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t sign Autopilot', ok);
  -- another workspace's owner can't either
  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.autopilot_grant(w, 'Eve', null, true, ver, scope, 100, 500, 'typed', null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace''s owner can''t sign it', ok);
  begin perform public.autopilot_revoke(w); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace''s owner can''t revoke it', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.autopilot_grant(w, 'Mei Lin', null, false, ver, scope, 100, 500, 'typed', null); ok := false; exception when others then ok := sqlerrm like 'autopilot_agree%'; end;
  res := res || jsonb_build_object('unticked box: not signed', ok);
  begin perform public.autopilot_grant(w, 'Mei Lin', null, true, '2026-10-13', scope, 100, 500, 'typed', null); ok := false; exception when others then ok := sqlerrm = 'terms_version'; end;
  res := res || jsonb_build_object('an old version of the authorization: not signed', ok);
  begin perform public.autopilot_grant(w, 'M', null, true, ver, scope, 100, 500, 'typed', null); ok := false; exception when others then ok := sqlerrm like 'autopilot_name%'; end;
  res := res || jsonb_build_object('no typed name: not signed', ok);
  begin perform public.autopilot_grant(w, 'Mei Lin', null, true, ver, '{"stores":[],"agencies":["x"],"forms":["y"]}', 100, 500, 'typed', null); ok := false; exception when others then ok := sqlerrm like 'autopilot_scope%'; end;
  res := res || jsonb_build_object('an empty scope: not signed', ok);
  begin perform public.autopilot_grant(w, 'Mei Lin', null, true, ver, scope, 600, 500, 'typed', null); ok := false; exception when others then ok := sqlerrm like 'autopilot_caps%'; end;
  res := res || jsonb_build_object('a monthly cap below the per-filing cap: not signed', ok);
  begin perform public.autopilot_grant(w, 'Mei Lin', null, true, ver, scope, 100, 500, 'drawn', 'not a png'); ok := false; exception when others then ok := sqlerrm like 'autopilot_signature%'; end;
  res := res || jsonb_build_object('a drawn signature that isn''t a PNG: not signed', ok);

  mirror := public.autopilot_grant(w, ' Mei Lin ', 'Managing Member', true, ver, scope, 100, 500, 'drawn', 'data:image/png;base64,iVBORw0KGgo=');
  g := (mirror ->> 'id')::uuid;
  res := res || jsonb_build_object('an owner signs it', g is not null and mirror ->> 'by' = 'Mei Lin');
  select count(*) into n from public.autopilot_grants where id = g and ip = '198.51.100.7' and terms_version = ver
     and expires_at between now() + interval '364 days' and now() + interval '366 days';
  res := res || jsonb_build_object('recorded with the IP, browser, version and a 12-month expiry', n = 1);
  select count(*) into n from public.audit_log where workspace_id = w and action ->> 'en' = 'Signed the Autopilot authorization';
  res := res || jsonb_build_object('and in the audit trail', n = 1);
  select state into st from public.workspaces where id = w;
  res := res || jsonb_build_object('the workspace mirrors it and the dial moves to Autopilot', st -> 'controls' -> 'autopilot' ->> 'id' = g::text and st -> 'controls' ->> 'autonomy' = 'autopilot');
  -- the signature is in the vault, not the row, and the client can't read its id
  begin execute format('select signature_secret_id::text from public.autopilot_grants where id = %L', g) into v; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('the client can''t read the vault id', ok);
  select count(*) into n from public.autopilot_grants where workspace_id = w;
  res := res || jsonb_build_object('members read the authorization', n = 1);
  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.autopilot_grants where workspace_id = w;
  res := res || jsonb_build_object('another workspace sees none of it', n = 0);
  -- clients can't call the server's functions
  begin perform public.autopilot_file(w, g, 'x', ttl, agy, null, 0, pay, 's1', 'sj-sign'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a client can''t file under Autopilot', ok);
  begin perform public.autopilot_signature(g); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a client can''t read the adopted signature', ok);
  -- a customer's own insert can't claim to be an Autopilot filing
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  insert into public.filings (workspace_id, app_id, title, payload, autopilot_grant) values (w, 'own', ttl, pay, g) returning id into f3;
  select autopilot_grant into g_old from public.filings where id = f3;
  res := res || jsonb_build_object('an owner''s own filing never carries the Autopilot mark', g_old is null);
  reset role;

  /* ------------------------------ filing inside it, and outside ------------------------------ */
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.autopilot_grants g2 join vault.secrets s on s.id = g2.signature_secret_id
   where g2.id = g and g2.user_agent = 'Safari test' and s.secret like 'data:image/png;base64,%';
  res := res || jsonb_build_object('the browser is kept, and the drawn signature is in the vault', n = 1);
  select count(*) into n from public.terms_acceptances where user_id = a and doc = 'autopilot' and version = ver and ip = '198.51.100.7';
  res := res || jsonb_build_object('and as an acceptance of the Autopilot terms', n = 1);
  f1 := public.autopilot_file(w, g, 'sign', ttl, agy, 'https://www.sjpermits.org/', 80, pay, 's1', 'sj-sign');
  select count(*) into n from public.filings where id = f1 and approved_by = a and autopilot_grant = g and status = 'requested';
  res := res || jsonb_build_object('a filing inside the scope goes in, approved by the owner who signed', n = 1);
  select count(*) into n from public.updates where workspace_id = w and dedupe = 'autopilot:' || f1::text and title ->> 'en' like 'Filed for you:%';
  res := res || jsonb_build_object('the owner gets a Filed for you update', n = 1);
  select count(*) into n from public.audit_log where workspace_id = w and actor = 'agent' and action ->> 'en' = 'Filed for you under Autopilot';
  res := res || jsonb_build_object('every Autopilot filing is in the audit trail', n = 1);
  begin perform public.autopilot_file(w, g, 'x2', ttl, '{"en":"Santa Clara County"}', null, 0, pay, 's1', 'sj-sign'); ok := false; exception when others then ok := sqlerrm like 'autopilot_scope%agency%'; end;
  res := res || jsonb_build_object('the wrong agency is refused', ok);
  begin perform public.autopilot_file(w, g, 'x3', ttl, agy, null, 0, pay, 's2', 'sj-sign'); ok := false; exception when others then ok := sqlerrm like 'autopilot_scope%store%'; end;
  res := res || jsonb_build_object('a store outside the scope is refused', ok);
  begin perform public.autopilot_file(w, g, 'x4', ttl, agy, null, 0, pay, 's1', 'sj-building-ti'); ok := false; exception when others then ok := sqlerrm like 'autopilot_scope%type%'; end;
  res := res || jsonb_build_object('a filing type outside the scope is refused', ok);
  begin perform public.autopilot_file(w, g, 'x5', ttl, agy, null, 101, pay, 's1', 'ca-cdtfa'); ok := false; exception when others then ok := sqlerrm like 'autopilot_cap%per-filing%'; end;
  res := res || jsonb_build_object('a fee over the per-filing cap is refused', ok);
  begin perform public.autopilot_file(w, g, 'x6', ttl, agy, null, null, pay, 's1', 'ca-cdtfa'); ok := false; exception when others then ok := sqlerrm like 'autopilot_cap%'; end;
  res := res || jsonb_build_object('an unknown fee is refused', ok);
  f2 := public.autopilot_file(w, g, 'seller', ttl, agy, null, 100, '{"official":"ca-cdtfa","fields":[]}', 's1', 'ca-cdtfa');
  update public.filings set fee_estimate = 100 where id = f2;   -- (as the team would)
  insert into public.filings (workspace_id, app_id, title, payload, approved_by, autopilot_grant, fee_estimate) values (w, 'seller-2', ttl, '{}', a, g, 130);
  insert into public.filings (workspace_id, app_id, title, payload, approved_by, autopilot_grant, fee_estimate) values (w, 'seller-3', ttl, '{}', a, g, 130);
  begin perform public.autopilot_file(w, g, 'x7', ttl, agy, null, 90, pay, 's1', 'ca-cdtfa'); ok := false; exception when others then ok := sqlerrm like 'autopilot_cap%monthly%'; end;
  res := res || jsonb_build_object('over the monthly cap is refused', ok);
  begin perform public.autopilot_file(w, g, 'x8', ttl, agy, null, 0, '{"fields":[{"value":"123-45-6789"}]}', 's1', 'sj-sign'); ok := false; exception when others then ok := sqlerrm like 'autopilot_secret%'; end;
  res := res || jsonb_build_object('an SSN in the payload is refused', ok);
  begin perform public.autopilot_file(w2, g, 'x9', ttl, agy, null, 0, pay, 's1', 'sj-sign'); ok := false; exception when others then ok := sqlerrm like 'autopilot_scope%'; end;
  res := res || jsonb_build_object('one workspace''s grant can''t file for another', ok);
  update public.workspaces set state = jsonb_set(state, '{controls,business}', '[{"id":"br","when":{"event":"filing_approval"},"then":{"action":"second_owner"}}]') where id = w;
  begin perform public.autopilot_file(w, g, 'x10', ttl, agy, null, 0, pay, 's1', 'sj-sign'); ok := false; exception when others then ok := sqlerrm like 'second_owner%'; end;
  res := res || jsonb_build_object('a business rule wanting two owners keeps Autopilot out', ok);
  update public.workspaces set state = state #- '{controls,business}' where id = w;
  begin update public.filings set autopilot_grant = null where id = f1; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('the Autopilot mark can''t be taken off', ok);

  /* ------------------------------ expiry ------------------------------ */
  update public.autopilot_grants set signed_at = now() - interval '13 months', expires_at = now() - interval '1 month' where id = g;
  begin perform public.autopilot_file(w, g, 'x11', ttl, agy, null, 0, pay, 's1', 'sj-sign'); ok := false; exception when others then ok := sqlerrm like 'autopilot_expired%'; end;
  res := res || jsonb_build_object('an expired authorization files nothing', ok);
  begin update public.filings set submit_clicked_at = now() where id = f1; ok := false; exception when others then ok := sqlerrm like 'filing_stopped%'; end;
  res := res || jsonb_build_object('a filing under an expired grant can''t be submitted', ok);
  update public.autopilot_grants set signed_at = now(), expires_at = now() + interval '12 months' where id = g;
  update public.filings set agent_state = 'held' where id = f1;

  /* ------------------------------ revoking, in one tap, mid-run ------------------------------ */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  st := public.autopilot_revoke(w);
  res := res || jsonb_build_object('any owner revokes it in one call', (st ->> 'revoked')::boolean and (st ->> 'stopped')::int >= 2);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.filings where id in (f1, f2) and status = 'canceled' and agent_log @> '[{"ref":"autopilot_revoked"}]';
  res := res || jsonb_build_object('what hadn''t left Placetta is stopped', n = 2);
  select count(*) into n from public.filings where id = f3 and status = 'requested';
  res := res || jsonb_build_object('an owner''s own approved filing is left alone', n = 1);
  begin perform public.filing_agent_step(f1, null, '{"submit_clicked_at":"2026-11-03T10:00:00Z"}'::jsonb, false); ok := false; exception when others then ok := sqlerrm like 'filing_stopped%'; end;
  res := res || jsonb_build_object('a run already under way can''t submit after the revoke', ok);
  begin perform public.autopilot_file(w, g, 'x12', ttl, agy, null, 0, pay, 's1', 'sj-sign'); ok := false; exception when others then ok := sqlerrm like 'autopilot_revoked%'; end;
  res := res || jsonb_build_object('a revoked authorization files nothing', ok);
  select state into st from public.workspaces where id = w;
  res := res || jsonb_build_object('the dial goes back to asking each time', st -> 'controls' ->> 'autonomy' = 'usual' and st -> 'controls' -> 'autopilot' ? 'revokedAt');
  select count(*) into n from public.audit_log where workspace_id = w and action ->> 'en' = 'Turned off Autopilot' and actor_id = b;
  res := res || jsonb_build_object('the revoke is in the audit trail, as the owner who did it', n = 1);
  select public.autopilot_signature(g) into v;
  res := res || jsonb_build_object('a revoked grant''s signature is never handed out', v is null);

  -- signing again replaces: one live grant per workspace
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  mirror := public.autopilot_grant(w, 'Mei Lin', null, true, ver, scope, 100, 500, 'typed', null);
  g_old := g; g := (mirror ->> 'id')::uuid;
  mirror := public.autopilot_grant(w, 'Mei Lin', null, true, ver, scope, 50, 200, 'typed', null);
  reset role;
  select count(*) into n from public.autopilot_grants where workspace_id = w and revoked_at is null;
  res := res || jsonb_build_object('signing again leaves one live grant', n = 1);
  select count(*) into n from public.autopilot_grants where id = g and revoked_why = 'replaced';
  res := res || jsonb_build_object('the one it replaced ends', n = 1);
  perform set_config('request.jwt.claims', '', true);
  select public.autopilot_signature((mirror ->> 'id')::uuid) into v;
  res := res || jsonb_build_object('the server reads the live signature', v = 'Mei Lin');

  raise exception 'TEST_RESULTS %', res;
end
$test$;
