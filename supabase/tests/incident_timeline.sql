-- The incident log's severity and stage times (20261022130000_incident_timeline.sql). Run with scripts/test-db.sh
-- (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  st uuid := gen_random_uuid(); a uuid := gen_random_uuid(); iid uuid; res jsonb := '{}'::jsonb; ok boolean; j jsonb; i public.incidents;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, st, 'authenticated', 'authenticated', 'staff-timeline@placetta.test', now(), now(), now(), '{}', '{}'),
    (inst, a, 'authenticated', 'authenticated', 'owner-timeline@tea.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (st, 'email'), (a, 'email');
  insert into public.staff_emails (email) values ('staff-timeline@placetta.test');
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);

  iid := public.incident_add(now() - interval '3 days', 'Function secret exposed in a log', 'One key rotated; no customer data', null, false);
  perform public.incident_timeline(iid, 'SEV2', now() - interval '3 days', now() - interval '70 hours', null, null);
  select * into i from public.incidents where id = iid;
  res := res || jsonb_build_object('staff set severity and stage times', i.severity = 'SEV2' and i.detected_at is not null and i.contained_at is not null and i.resolved_at is null);
  perform public.incident_timeline(iid, p_resolved_at => now() - interval '2 days');
  select * into i from public.incidents where id = iid;
  res := res || jsonb_build_object('a later call fills in a stage and keeps the rest', i.severity = 'SEV2' and i.resolved_at is not null and i.contained_at is not null);
  j := public.incident_timings();
  res := res || jsonb_build_object('timings: hours from detection to containment', (j->0->>'hours_to_contain')::numeric = 2.0,
    'and to resolution', (j->0->>'hours_to_resolve')::numeric = 24.0, 'closed', (j->0->>'open')::boolean = false);
  begin perform public.incident_timeline(iid, 'SEV9'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('only SEV1 to SEV3', ok);
  begin perform public.incident_timeline(iid, p_contained_at => now() - interval '4 days'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('containment can''t come before detection', ok);
  begin perform public.incident_timeline(iid, p_resolved_at => now() + interval '1 day'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('no stage in the future', ok);
  begin perform public.incident_timeline(gen_random_uuid(), 'SEV3'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an unknown incident is refused', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin perform public.incident_timeline(iid, 'SEV1'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('customers can''t change an incident', ok);
  begin perform public.incident_timings(); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor read the timings', ok);
  res := res || jsonb_build_object('anonymous callers can''t run either',
    not has_function_privilege('anon', 'public.incident_timeline(uuid, text, timestamptz, timestamptz, timestamptz, timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.incident_timings()', 'execute'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
