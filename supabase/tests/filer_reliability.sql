-- The portal worker's backoff and selector drift (migration 20261027090000). Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid(); f uuid; got uuid; ok boolean; res jsonb := '{}'::jsonb;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@rel.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'R', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner');
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'llc', '{"en":"LLC","zh":"LLC"}', '{"official":"ca-llc1"}') returning id into f;

  -- the portal was down: queued with a wait the claim respects
  perform public.filing_agent_step(f, '{"en":"The agency''s site isn''t answering. Trying again in 2 minutes.","zh":"x","kind":"retry"}',
    jsonb_build_object('channel', 'portal', 'agent_state', 'queued', 'status', 'in_progress', 'provider_ref', 'retry-after:' || to_char((now() + interval '2 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  res := res || jsonb_build_object('a filing waiting out a down portal is not claimed', not exists (select 1 from public.claim_agent_filing()));
  update public.filings set provider_ref = 'retry-after:' || to_char((now() - interval '1 minute') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') where id = f;
  select id into got from public.claim_agent_filing();
  res := res || jsonb_build_object('once the wait is over it is claimed', got = f and (select agent_state from public.filings where id = f) = 'running');

  -- a held session is still left to its worker (the old rule kept)
  update public.filings set agent_state = 'queued', provider_ref = 'held-until:' || to_char((now() + interval '5 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') where id = f;
  res := res || jsonb_build_object('a held session is still not claimed', not exists (select 1 from public.claim_agent_filing()));

  -- selector drift is a team task kind; made-up kinds still aren't
  insert into public.team_tasks (kind, filing_id, workspace_id, title, dedupe) values ('selector_drift', f, w, 'portal:x:y: 1 step found again', 'drift-test');
  res := res || jsonb_build_object('selector drift reaches the team', exists (select 1 from public.team_tasks where dedupe = 'drift-test' and kind = 'selector_drift'));
  begin insert into public.team_tasks (kind, title, dedupe) values ('anything', 'x', 'bad-kind'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('other kinds are still refused', ok);
  res := res || jsonb_build_object('margin and team time kinds are kept', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'team_tasks_kind_check') like '%team_time%');

  -- users still can't claim
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.claim_agent_filing(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('users cannot claim', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
