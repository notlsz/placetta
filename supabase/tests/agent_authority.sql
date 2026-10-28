-- Placetta as your agent (20261103090100_agent_authority.sql): an owner signs the packet once; a filing goes in as
-- agent only inside it; the wrong agency, an expired or revoked packet, or an agency form past its time is refused;
-- every act is logged append-only; revoking (or turning Autopilot off) stops everything; single-use card payments stay
-- inside the grant's caps and only with cards switched on. Run with scripts/test-db.sh (ends by raising TEST_RESULTS).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; n int; st jsonb; mirror jsonb; ag uuid; ag2 uuid; g uuid; f1 uuid; f2 uuid; v text;
  ver text := public.current_terms_version();
  agencies jsonb := '["County of Santa Clara Department of Environmental Health","City of San José Building Division"]';
  forms jsonb := '["scc-health-permit","sj-building-ti"]';
  pk jsonb;
  pay jsonb := '{"official":"scc-health-permit","fields":[],"agent":{"auth":null,"by":"Dana Reyes"}}';
  ttl jsonb := '{"en":"File the health permit","zh":"提交卫生许可"}';
  agy jsonb := '{"en":"County of Santa Clara Department of Environmental Health","zh":"圣克拉拉县环境卫生局"}';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'mei@moonleaf.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'staff@moonleaf.test', now(), now(), now(), '{}', '{}'),
    (inst, eve, 'authenticated', 'authenticated', 'eve@other.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (m, 'email'), (eve, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Moonleaf', now(), a, a, '{"apps":[],"controls":{"autonomy":"usual"}}'), (w2, 'Eve Co', now(), eve, eve, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, m, 'member'), (w2, eve, 'owner');
  insert into public.billing (workspace_id, comped) values (w, true), (w2, true);
  pk := jsonb_build_array(
    jsonb_build_object('id', 'placetta-agent', 'sig', 'esign'),
    jsonb_build_object('id', 'sj-building-section-c', 'form', 'sj-building-ti', 'agency', 'City of San José Building Division', 'sig', 'esign', 'months', 12, 'names_agent', true, 'doc', w::text || '/agent/section-c.pdf'),
    jsonb_build_object('id', 'scc-health-permit-owner', 'form', 'scc-health-permit', 'sig', 'hand', 'doc', w::text || '/agent/health-permit-signed.jpg'));

  execute 'set local role authenticated';
  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.7", "user-agent": "Safari test"}', true);

  /* ------------------------------ signing ------------------------------ */
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.agent_authorize(w, 'Staff', null, true, ver, agencies, forms, pk, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t make Placetta the agent', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.agent_authorize(w, 'Eve', null, true, ver, agencies, forms, pk, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace''s owner can''t either', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.agent_authorize(w, 'Mei Lin', null, true, ver, agencies, forms, pk, null); ok := false; exception when others then ok := sqlerrm like 'agent_of_record%'; end;
  res := res || jsonb_build_object('no agent of record named: a packet naming an agent can''t be signed', ok);
  reset role;
  update public.app_settings set agent_of_record = '{"name":"Dana Reyes","title":"Filing agent","phone":"(408) 555-0100","email":"agent@placetta.test"}' where id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.agent_authorize(w, 'Mei Lin', null, false, ver, agencies, forms, pk, null); ok := false; exception when others then ok := sqlerrm like 'agent_agree%'; end;
  res := res || jsonb_build_object('unticked box: not signed', ok);
  begin perform public.agent_authorize(w, 'Mei Lin', null, true, ver, agencies, forms, jsonb_build_array(jsonb_build_object('id', 'scc-health-permit-owner', 'form', 'scc-health-permit', 'sig', 'hand')), null); ok := false; exception when others then ok := sqlerrm like 'agent_items%photo%'; end;
  res := res || jsonb_build_object('a hand-signed page needs its photo', ok);
  begin perform public.agent_authorize(w, 'Mei Lin', null, true, ver, agencies, forms, jsonb_build_array(jsonb_build_object('id', 'x-owner', 'sig', 'hand', 'doc', w2::text || '/stolen.jpg')), null); ok := false; exception when others then ok := sqlerrm like 'agent_items%workspace%'; end;
  res := res || jsonb_build_object('a page from another workspace''s folder is refused', ok);
  begin perform public.agent_authorize(w, 'Mei Lin', null, true, ver, agencies, forms, jsonb_build_array(jsonb_build_object('id', 'x-owner', 'sig', 'hand', 'doc', w::text || '/../' || w2::text || '/x.jpg')), null); ok := false; exception when others then ok := sqlerrm like 'agent_items%workspace%'; end;
  res := res || jsonb_build_object('and a path that climbs out of the folder', ok);
  mirror := public.agent_authorize(w, ' Mei Lin ', 'Managing Member', true, ver, agencies, forms, pk, 'AP@Moonleaf.test');
  ag := (mirror ->> 'id')::uuid;
  res := res || jsonb_build_object('an owner signs the packet in one call', ag is not null and mirror ->> 'by' = 'Mei Lin' and mirror ->> 'agent' = 'Dana Reyes' and mirror ->> 'apEmail' = 'ap@moonleaf.test');
  select count(*) into n from public.agent_authorizations where id = ag and ip = '198.51.100.7' and user_agent = 'Safari test' and terms_version = ver and expires_at > now() + interval '364 days';
  res := res || jsonb_build_object('recorded with the IP, browser, version and 12 months', n = 1);
  select count(*) into n from public.agent_authorizations, jsonb_array_elements(items) it where id = ag and it ->> 'id' = 'sj-building-section-c' and (it ->> 'expires')::timestamptz > now() + interval '364 days';
  res := res || jsonb_build_object('Section C carries the 12 months the city honors', n = 1);
  reset role;
  select count(*) into n from public.terms_acceptances where user_id = a and doc = 'agent' and version = ver;
  res := res || jsonb_build_object('and as an acceptance of the agent terms', n = 1);
  select state into st from public.workspaces where id = w;
  res := res || jsonb_build_object('the workspace mirrors it', st -> 'controls' -> 'agent' ->> 'id' = ag::text);
  select count(*) into n from public.spend_policies where workspace_id = w and ap_email = 'ap@moonleaf.test';
  res := res || jsonb_build_object('agency bills go to the accounts-payable email', n = 1);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.agent_authorizations where workspace_id = w;
  res := res || jsonb_build_object('another workspace sees none of it', n = 0);
  begin perform public.agent_act_ok(w, ag, 'scc-health-permit', agy ->> 'en'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a client can''t call the server''s check', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  insert into public.filings (workspace_id, app_id, title, payload, agent_auth) values (w, 'own', ttl, pay, ag) returning id into f2;
  select count(*) into n from public.filings where id = f2 and agent_auth is null;
  res := res || jsonb_build_object('an owner''s own filing never carries the agent mark', n = 1);
  reset role;
  perform set_config('request.jwt.claims', '', true);

  /* ------------------------------ acting as agent ------------------------------ */
  res := res || jsonb_build_object('inside the packet: covered', public.agent_act_ok(w, ag, 'scc-health-permit', agy ->> 'en'));
  begin perform public.agent_act_ok(w, ag, 'scc-health-permit', 'City of Milpitas'); ok := false; exception when others then ok := sqlerrm like 'agent_scope%agency%'; end;
  res := res || jsonb_build_object('the wrong agency is refused', ok);
  begin perform public.agent_act_ok(w, ag, 'irs-ss4', agy ->> 'en'); ok := false; exception when others then ok := sqlerrm like 'agent_scope%filing%'; end;
  res := res || jsonb_build_object('a filing outside the packet is refused', ok);
  begin perform public.agent_act_ok(w2, ag, 'scc-health-permit', agy ->> 'en'); ok := false; exception when others then ok := sqlerrm like 'agent_scope%workspace%'; end;
  res := res || jsonb_build_object('one workspace''s packet can''t act for another', ok);
  insert into public.filings (workspace_id, app_id, title, agency, payload, approved_by, agent_auth)
  values (w, 'pto', ttl, agy, jsonb_set(pay, '{agent,auth}', to_jsonb(ag::text)), a, ag) returning id into f1;
  select count(*) into n from public.agent_acts where workspace_id = w and authorization_id = ag and act = 'queued' and form = 'scc-health-permit';
  res := res || jsonb_build_object('a filing as agent goes in, and the act is logged', n = 1);
  begin insert into public.filings (workspace_id, app_id, title, agency, payload, approved_by, agent_auth) values (w, 'bad', ttl, '{"en":"City of Milpitas"}', pay, a, ag); ok := false; exception when others then ok := sqlerrm like 'agent_scope%'; end;
  res := res || jsonb_build_object('a filing as agent for the wrong agency can''t go in', ok);
  begin update public.agent_acts set act = 'refused' where workspace_id = w; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('the log of acts can''t be edited', ok);
  begin delete from public.agent_acts where workspace_id = w; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('or deleted', ok);
  begin update public.filings set agent_auth = null where id = f1; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('the agent mark can''t be taken off', ok);
  -- Section C past the 12 months: building permit acts are refused
  update public.agent_authorizations set items = (select jsonb_agg(case when it ->> 'id' = 'sj-building-section-c' then it || '{"expires":"2026-01-01T00:00:00Z"}' else it end) from jsonb_array_elements(items) it) where id = ag;
  begin perform public.agent_act_ok(w, ag, 'sj-building-ti', 'City of San José Building Division'); ok := false; exception when others then ok := sqlerrm like 'agent_item_expired%'; end;
  res := res || jsonb_build_object('an agency form past the time it''s honored is refused', ok);
  -- expired packet: nothing is submitted
  update public.agent_authorizations set signed_at = now() - interval '13 months', expires_at = now() - interval '1 month' where id = ag;
  begin perform public.agent_act_ok(w, ag, 'scc-health-permit', agy ->> 'en'); ok := false; exception when others then ok := sqlerrm like 'agent_expired%'; end;
  res := res || jsonb_build_object('an expired packet is refused', ok);
  begin update public.filings set submit_clicked_at = now() where id = f1; ok := false; exception when others then ok := sqlerrm like 'filing_stopped%'; end;
  res := res || jsonb_build_object('a filing under an expired packet can''t be submitted', ok);
  update public.agent_authorizations set signed_at = now(), expires_at = now() + interval '12 months' where id = ag;
  update public.filings set requirements_checked = true, confirmation_number = 'DEH-1', status = 'submitted' where id = f1;
  select count(*) into n from public.agent_acts where filing_id = f1 and act = 'submitted' and actor_name = 'Dana Reyes';
  res := res || jsonb_build_object('a submission as agent is logged with the named person', n = 1);
  update public.filings set status = 'requested' where id = f1;

  /* ------------------------------ single-use cards ------------------------------ */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  mirror := public.autopilot_grant(w, 'Mei Lin', null, true, ver, '{"stores":["s1"],"agencies":["County of Santa Clara Department of Environmental Health"],"forms":["scc-health-permit"]}', 500, 600, 'typed', null);
  g := (mirror ->> 'id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  begin perform public.autopilot_spend_ok(w, g, 10000); ok := false; exception when others then ok := sqlerrm like 'cards_off%'; end;
  res := res || jsonb_build_object('cards off: no card payment', ok);
  begin perform public.autopilot_file(w, g, 'pto2', ttl, agy, null, null, pay, 's1', 'scc-health-permit'); ok := false; exception when others then ok := sqlerrm like 'autopilot_cap%'; end;
  res := res || jsonb_build_object('cards off: an unknown fee is still refused', ok);
  update public.app_settings set issuing_on = true where id;
  res := res || jsonb_build_object('cards on: a fee within the caps may go on a card', public.autopilot_spend_ok(w, g, 45000));
  begin perform public.autopilot_spend_ok(w, g, 50001); ok := false; exception when others then ok := sqlerrm like 'autopilot_cap%per-filing%'; end;
  res := res || jsonb_build_object('a card payment over the per-filing cap is refused', ok);
  insert into public.purchases (workspace_id, category, payee, amount_cents, why, status, autopilot_grant) values (w, 'gov_fees', 'County of Santa Clara', 45000, '{"en":"x","zh":"x"}', 'paid', g);
  begin perform public.autopilot_spend_ok(w, g, 20000); ok := false; exception when others then ok := sqlerrm like 'autopilot_cap%monthly%'; end;
  res := res || jsonb_build_object('and past the monthly cap with this month''s card payments', ok);
  begin perform public.autopilot_spend_ok(w2, g, 100); ok := false; exception when others then ok := sqlerrm like 'autopilot_scope%'; end;
  res := res || jsonb_build_object('another workspace can''t pay under this grant', ok);
  f2 := public.autopilot_file(w, g, 'pto2', ttl, agy, null, null, pay, 's1', 'scc-health-permit');
  select count(*) into n from public.filings where id = f2 and fee_estimate = 500 and payload ? 'fee_held_by_card' and autopilot_grant = g;
  res := res || jsonb_build_object('cards on: a fee the county states later may go in, held by the card', n = 1);
  begin perform public.autopilot_file(w, g, 'pto3', ttl, agy, null, null, pay, 's1', 'scc-health-permit'); ok := false; exception when others then ok := sqlerrm like 'autopilot_cap%monthly%'; end;
  res := res || jsonb_build_object('its per-filing cap is reserved toward the month', ok);
  update public.app_settings set issuing_on = false where id;

  /* ------------------------------ revoking stops everything ------------------------------ */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  st := public.autopilot_revoke(w);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.agent_authorizations where id = ag and revoked_at is not null and revoked_why = 'Autopilot turned off';
  res := res || jsonb_build_object('turning Autopilot off ends the agent packet too', n = 1);
  select count(*) into n from public.filings where id = f1 and status = 'canceled' and agent_log @> '[{"ref":"autopilot_revoked"}]';
  res := res || jsonb_build_object('a filing as agent that hadn''t left is stopped', n = 1);
  begin perform public.agent_act_ok(w, ag, 'scc-health-permit', agy ->> 'en'); ok := false; exception when others then ok := sqlerrm like 'agent_revoked%'; end;
  res := res || jsonb_build_object('a revoked packet is refused', ok);
  select state into st from public.workspaces where id = w;
  res := res || jsonb_build_object('the workspace mirror says revoked', st -> 'controls' -> 'agent' ? 'revokedAt');

  -- signing again, then revoking the agent packet on its own
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  mirror := public.agent_authorize(w, 'Mei Lin', null, true, ver, agencies, forms, pk, null);
  ag2 := (mirror ->> 'id')::uuid;
  select count(*) into n from public.agent_authorizations where workspace_id = w and revoked_at is null;
  res := res || jsonb_build_object('one live packet per workspace', n = 1);
  st := public.agent_revoke(w);
  res := res || jsonb_build_object('an owner revokes Placetta as agent in one call', (st ->> 'revoked')::boolean);
  reset role;
  select count(*) into n from public.audit_log where workspace_id = w and action ->> 'en' = 'Revoked Placetta as your agent' and actor_id = a;
  res := res || jsonb_build_object('the revoke is in the audit trail', n = 1);
  update public.app_settings set agent_of_record = null where id;

  raise exception 'TEST_RESULTS %', res;
end
$test$;
