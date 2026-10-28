-- Parked runs (migration 20261105091100_park_resume): the worker queues a parked filing again only with the key it
-- parked it under, only from needs_you, and changes nothing else; without the RPC the filer still can't touch a filing
-- with no run token. Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  o uuid := gen_random_uuid(); w uuid := gen_random_uuid(); f uuid; g uuid; ok boolean; res jsonb := '{}'::jsonb;
  inst uuid := '00000000-0000-0000-0000-000000000000';
  k text := repeat('a1', 24); sub timestamptz := now() - interval '1 minute';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@park.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Park', now(), o, o);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner');
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'llc', '{"en":"LLC","zh":"LLC"}', '{"official":"sf-nbr"}') returning id into f;
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'ein', '{"en":"EIN","zh":"EIN"}', '{"official":"sf-nbr"}') returning id into g;
  update public.filings set channel = 'portal', agent_state = 'needs_you', provider_ref = 'parked:' || k, handoff_url = 'https://x.test/live' where id in (f, g);
  update public.filings set submit_clicked_at = sub where id = g;

  execute 'set local role placetta_filer';
  res := res || jsonb_build_object(
    'a wrong key queues nothing', public.filer_resume_parked(f, repeat('b2', 24)) = false,
    'a short key queues nothing', public.filer_resume_parked(f, 'parked') = false,
    'the right key queues it', public.filer_resume_parked(f, k) = true,
    'only once', public.filer_resume_parked(f, k) = false);
  begin update public.filings set agent_state = 'queued', provider_ref = null where id = g; ok := false;
  exception when others then ok := sqlerrm = 'run_token_invalid' or sqlstate = '42501'; end;
  res := res || jsonb_build_object('without the RPC the filer can''t move a parked filing', ok);
  res := res || jsonb_build_object('the submit guard stays: a filing that may have been submitted keeps submit_clicked_at', public.filer_resume_parked(g, k) = true);
  execute 'reset role';
  res := res || jsonb_build_object(
    'queued, its live link and key gone', (select agent_state = 'queued' and provider_ref is null and handoff_url is null from public.filings where id = f),
    'the log says the person finished', (select agent_log -> -1 ->> 'kind' = 'resume' from public.filings where id = f),
    'submit_clicked_at untouched', (select submit_clicked_at = sub from public.filings where id = g),
    'the claim takes a queued filing', (select count(*) = 1 from public.claim_agent_filing()),
    'anyone else can''t call it', not has_function_privilege('authenticated', 'public.filer_resume_parked(uuid, text)', 'execute'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
