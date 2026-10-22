-- Stage alerts: each new stage a filing reaches asks the monitor to tell the people in charge, right away.
-- Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid(); f uuid;
  res jsonb := '{}'::jsonb; before bigint; q record;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@stage.test', now(), now(), now(), '{}', '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Stage Tea', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner');
  insert into public.billing (workspace_id, comped) values (w, true);
  if not exists (select 1 from vault.decrypted_secrets where name = 'monitor_key') then perform vault.create_secret('test-monitor-key', 'monitor_key'); end if;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'fse', '{"en":"Food permit","zh":"食品许可"}', '{"official":"nyc-fse"}', a) returning id into f;
  select coalesce(max(id), 0) into before from net.http_request_queue;

  update public.filings set status = 'in_progress', requirements_checked = true where id = f;
  update public.filings set status = 'submitted', confirmation_number = 'DOH-1' where id = f;
  update public.filings set note = 'just a note' where id = f;                       -- not a stage: nothing
  update public.filings set status = 'needs_info' where id = f;
  update public.filings set agent_state = 'needs_you' where id = f;                   -- a step that needs the person
  update public.filings set agent_state = 'needs_you' where id = f;                   -- the same again: nothing
  update public.filings set status = 'accepted' where id = f;

  select count(*) as n,
         bool_and(url like '%/functions/v1/monitor') as to_monitor,
         bool_and(body->>'action' = 'stage' and body->>'filing_id' = f::text) as says_which,
         bool_and(headers->>'x-monitor-key' = (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)) as with_key
    into q from net.http_request_queue where id > before;
  res := res || jsonb_build_object(
    'every new stage asks the monitor once (5: filing, submitted, action needed, needs you, approved)', q.n = 5,
    'to the monitor function', q.to_monitor,
    'naming the filing', q.says_which,
    'with the monitor key', q.with_key);

  -- canceling, or the person's own approval, isn't announced
  select coalesce(max(id), 0) into before from net.http_request_queue;
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'ein', '{"en":"EIN","zh":"EIN"}', '{"official":"irs-ss4"}') returning id into f;
  update public.filings set status = 'canceled' where id = f;
  res := res || jsonb_build_object('a canceled filing sends nothing', not exists (select 1 from net.http_request_queue where id > before));

  -- live on screen
  res := res || jsonb_build_object(
    'updates are live (Realtime)', exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'updates')
                                   or not exists (select 1 from pg_publication where pubname = 'supabase_realtime'),
    'filings are live (Realtime)', exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'filings')
                                   or not exists (select 1 from pg_publication where pubname = 'supabase_realtime'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
