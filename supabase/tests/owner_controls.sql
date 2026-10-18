-- Owner controls: only an owner changes Odelia's controls in the workspace state, owner approvals are each owner's
-- own, and a filing a business rule gives to two owners goes in only with two different owners. Run with
-- scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); m uuid := gen_random_uuid(); w uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; n int; st jsonb;
  inst uuid := '00000000-0000-0000-0000-000000000000';
  rule_two jsonb := '[{"id":"br1","when":{"event":"filing_approval"},"then":{"action":"second_owner"},"at":"2026-10-17"}]';
  rule_fee jsonb := '[{"id":"br2","when":{"event":"fee_over","amount":500},"then":{"action":"second_owner"},"at":"2026-10-17"}]';
  filing_payload jsonb := '{"fields":[{"id":"a","label":{"en":"Owner"},"value":"Mei"}],"checklist":[]}';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'a@controls.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'b@controls.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'm@controls.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (b, 'email'), (m, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Controls', now(), a, a, '{"apps":[],"controls":{"autonomy":"usual","rules":[]}}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, b, 'owner'), (w, m, 'member');

  execute 'set local role authenticated';

  -- a member's save keeps the controls as they were, and the rest of the save goes through
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  update public.workspaces set state = '{"apps":[{"id":"x"}],"controls":{"autonomy":"ask","rules":[{"id":"r1","kind":"allow","action":"filing"}]}}' where id = w;
  select state into st from public.workspaces where id = w;
  res := res || jsonb_build_object('a member''s save keeps the controls', st -> 'controls' ->> 'autonomy' = 'usual' and jsonb_array_length(st -> 'controls' -> 'rules') = 0);
  res := res || jsonb_build_object('and the rest of a member''s save goes through', jsonb_array_length(st -> 'apps') = 1);
  update public.workspaces set state = '{"apps":[]}' where id = w;
  select state into st from public.workspaces where id = w;
  res := res || jsonb_build_object('a member can''t drop the controls either', st -> 'controls' ->> 'autonomy' = 'usual');

  -- an owner changes them
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  update public.workspaces set state = jsonb_set(state, '{controls,autonomy}', '"plan"') where id = w;
  select state into st from public.workspaces where id = w;
  res := res || jsonb_build_object('an owner changes them', st -> 'controls' ->> 'autonomy' = 'plan');

  -- owner approvals: an owner writes their own, never someone else's; a member writes none
  insert into public.owner_approvals (workspace_id, app_id) values (w, 'sign');
  select count(*) into n from public.owner_approvals where workspace_id = w and app_id = 'sign' and user_id = a;
  res := res || jsonb_build_object('an owner records their own approval', n = 1);
  begin insert into public.owner_approvals (workspace_id, app_id, user_id) values (w, 'sign', b); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an owner can''t record another owner''s approval', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin insert into public.owner_approvals (workspace_id, app_id) values (w, 'sign'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t record an owner approval', ok);
  select count(*) into n from public.owner_approvals where workspace_id = w;
  res := res || jsonb_build_object('members can read them', n = 1);

  -- two owners for a filing, when a business rule asks
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.workspaces set state = jsonb_set(state, '{controls,business}', rule_two) where id = w;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin insert into public.filings (workspace_id, app_id, title, payload) values (w, 'sign', '{"en":"Sign","zh":"招牌"}', filing_payload); ok := false;
  exception when others then ok := sqlerrm like 'second_owner%'; end;
  res := res || jsonb_build_object('one owner''s approval isn''t enough', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  insert into public.owner_approvals (workspace_id, app_id) values (w, 'sign');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin insert into public.filings (workspace_id, app_id, title, payload) values (w, 'sign', '{"en":"Sign","zh":"招牌"}', filing_payload); ok := true;
  exception when others then ok := false; end;
  res := res || jsonb_build_object('two different owners: it goes in', ok);
  select count(*) into n from public.owner_approvals where workspace_id = w and app_id = 'sign';
  res := res || jsonb_build_object('and the approvals clear for the next filing', n = 0);

  -- a fee over $500: only then
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.workspaces set state = jsonb_set(state, '{controls,business}', rule_fee) where id = w;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin insert into public.filings (workspace_id, app_id, title, payload, fee_estimate) values (w, 'small', '{"en":"Small","zh":"小"}', filing_payload, 100); ok := true;
  exception when others then ok := false; end;
  res := res || jsonb_build_object('under the amount: one owner files it', ok);
  begin insert into public.filings (workspace_id, app_id, title, payload, fee_estimate) values (w, 'big', '{"en":"Big","zh":"大"}', filing_payload, 600); ok := false;
  exception when others then ok := sqlerrm like 'second_owner%'; end;
  res := res || jsonb_build_object('over the amount: two owners', ok);

  -- a rule that's off doesn't ask
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.workspaces set state = jsonb_set(state, '{controls,business}', '[{"id":"br3","when":{"event":"filing_approval"},"then":{"action":"second_owner"},"on":false,"at":"x"}]') where id = w;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin insert into public.filings (workspace_id, app_id, title, payload) values (w, 'off', '{"en":"Off","zh":"关"}', filing_payload); ok := true;
  exception when others then ok := false; end;
  res := res || jsonb_build_object('a rule turned off doesn''t ask', ok);

  -- the service role keeps its bookkeeping in the controls (which rules fired)
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.workspaces set state = jsonb_set(state, '{controls,fired}', '[{"key":"br1|approval:x","at":"now"}]') where id = w;
  select state into st from public.workspaces where id = w;
  res := res || jsonb_build_object('the service role writes its bookkeeping', jsonb_array_length(st -> 'controls' -> 'fired') = 1);
  raise exception 'TEST_RESULTS %', res;
end $test$;
