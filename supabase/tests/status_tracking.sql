-- Daily status tracking (20261026120000_status_tracking.sql): the timeline gets every status change, members read only
-- their own, only the server writes, staff set a lookup link and read the cost. Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); f uuid; j jsonb; res jsonb := '{}'::jsonb; ok boolean; n int;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@track.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'other@track.test', now(), now(), now(), '{}', '{}'),
    (inst, st, 'authenticated', 'authenticated', 'staff-track@placetta.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (st, 'email'), (a, 'email'), (b, 'email');
  insert into public.staff_emails (email) values ('staff-track@placetta.test');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Track Tea', now(), a, a, '{"stores":[{"id":"s1"},{"id":"s2"}]}'), (w2, 'Other Tea', now(), b, b, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w2, b, 'owner');
  insert into public.billing (workspace_id, comped) values (w, true), (w2, true);
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'bp', '{"en":"Building permit","zh":"建筑许可"}', '{"official":"sf-building"}', a) returning id into f;

  update public.filings set status = 'in_progress', requirements_checked = true where id = f;
  update public.filings set note = 'a note, not a stage' where id = f;
  update public.filings set status = 'submitted', confirmation_number = '202610221234' where id = f;
  select count(*) into n from public.filing_events where filing_id = f and kind = 'status';
  res := res || jsonb_build_object('every status change lands on the timeline once (requested, in progress, submitted)', n = 3);
  res := res || jsonb_build_object('by the server it reads as Placetta', (select bool_and(source = 'placetta') from public.filing_events where filing_id = f));
  res := res || jsonb_build_object('a status change is movement: the escalation clock restarts and the next check is now',
    exists (select 1 from public.filing_tracking where filing_id = f and last_movement_at is not null and unchanged_checks = 0 and next_check_at <= now()));

  -- the monitor's writes (service role here)
  insert into public.filing_checks (workspace_id, filing_id, source, url, content_hash, status_seen, changed, confidence, model_used, cost_usd)
  values (w, f, 'open_data', 'https://data.sf.gov/resource/i98e-djp9.json', repeat('a', 64), 'filed', true, 0.95, false, 0),
         (w, f, 'model', null, null, null, false, null, true, 0.0128);
  insert into public.filing_events (workspace_id, filing_id, kind, status, title, source, confidence, url, dedupe)
  values (w, f, 'agency', 'filed', '{"en":"The agency''s record shows: filed","zh":"机构记录显示：已受理"}', 'open_data', 0.95, 'https://dbiweb02.sfgov.org/dbipts/', 'agency:x');
  insert into public.filing_events (workspace_id, filing_id, kind, status, title, source, dedupe)
  values (w, f, 'agency', 'filed', '{"en":"again"}', 'open_data', 'agency:x') on conflict do nothing;
  res := res || jsonb_build_object('an agency event is recorded once per dedupe', (select count(*) from public.filing_events where filing_id = f and dedupe = 'agency:x') = 1);
  begin insert into public.filing_events (workspace_id, filing_id, kind, title, source) values (w, f, 'agency', '{"en":"x"}', 'rumor'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a source must be one of the known ones', ok);
  begin insert into public.filing_tracking (filing_id, workspace_id, lookup_url) values (gen_random_uuid(), w, 'http://insecure.gov/x'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a lookup link must be https', ok);

  -- the owner reads the timeline
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  j := public.filing_timeline(f);
  res := res || jsonb_build_object('the owner reads the timeline, newest first', jsonb_array_length(j->'events') = 4 and (j->'events'->0->>'at') >= (j->'events'->3->>'at'),
    'with when it was last moved', (j->'tracking'->>'last_movement_at') is not null);
  begin perform public.filing_lookup_set(f, 'https://sfdbi.org/x'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a customer can''t set the lookup link', ok);
  begin perform public.status_check_costs(30); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor read the costs', ok);

  -- another workspace's owner reads nothing
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin perform public.filing_timeline(f); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace can''t read the timeline', ok);

  -- staff
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.filing_lookup_set(f, 'https://dbiweb02.sfgov.org/dbipts/default.aspx?page=Permit&PermitNumber=202610221234');
  res := res || jsonb_build_object('staff set the lookup link and the next check is now',
    exists (select 1 from public.filing_tracking where filing_id = f and lookup_url like 'https://dbiweb02.sfgov.org/%' and next_check_at <= now() and last_hash is null));
  j := public.status_check_costs(30);
  res := res || jsonb_build_object('costs: two checks, one by the model', (j->>'checks')::int = 2 and (j->>'model_checks')::int = 1,
    'per check is the total over the checks', (j->>'per_check_usd')::numeric = 0.0064,
    'per store-month over the workspace''s two stores', (j->>'per_store_month_usd')::numeric = 0.0064);
  perform set_config('request.jwt.claims', '', true);

  res := res || jsonb_build_object('customers can''t write the tables',
    not has_table_privilege('authenticated', 'public.filing_events', 'insert') and not has_table_privilege('authenticated', 'public.filing_checks', 'insert')
    and not has_table_privilege('authenticated', 'public.filing_tracking', 'update'),
    'anonymous callers can''t read them', not has_table_privilege('anon', 'public.filing_events', 'select') and not has_function_privilege('anon', 'public.filing_timeline(uuid)', 'execute'),
    'row level security is on', (select bool_and(relrowsecurity) from pg_class where relname in ('filing_events', 'filing_checks', 'filing_tracking')));
  raise exception 'TEST_RESULTS %', res;
end $test$;
