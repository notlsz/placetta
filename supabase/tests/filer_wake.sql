-- Wake on demand (migration 20261102090300_filer_wake): one ping at a time to a worker that beat before and isn't
-- beating; a beat after the ping answers the attempt; filer_wake_due runs the per-minute sweep only while a queued
-- portal filing waits on a worker that isn't beating; nobody but the service role calls any of it.
-- Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid(); f uuid; ok boolean; res jsonb := '{}'::jsonb; r record;
  inst uuid := '00000000-0000-0000-0000-000000000000'; t0 timestamptz;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@wake.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Wake', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner');
  delete from public.filer_status;

  -- never beat: nothing to wake (not set up)
  res := res || jsonb_build_object('a worker that never beat is not pinged', public.filer_wake_claim() = false);

  -- it beat, and is beating: no ping needed
  perform public.filer_heartbeat('{"version":"v"}'::jsonb);
  res := res || jsonb_build_object('a beating worker is not pinged', public.filer_wake_claim() = false);
  select * into r from public.filer_live();
  res := res || jsonb_build_object('live while it beats, no wake attempt', r.live and r.wake_since is null);

  -- asleep for 20 minutes: one ping, then none for 30 seconds
  update public.filer_status set seen_at = now() - interval '20 minutes';
  res := res || jsonb_build_object('an asleep worker gets one ping', public.filer_wake_claim() = true);
  res := res || jsonb_build_object('not a second within 30 seconds', public.filer_wake_claim() = false);
  select wake_since into t0 from public.filer_status;
  res := res || jsonb_build_object('the attempt began with that ping', t0 is not null and not (select live from public.filer_live()));
  -- 40 seconds on, still asleep: another ping, the same attempt
  update public.filer_status set woken_at = now() - interval '40 seconds', wake_since = now() - interval '40 seconds';
  select wake_since into t0 from public.filer_status;
  res := res || jsonb_build_object('another ping after 30 seconds', public.filer_wake_claim() = true);
  res := res || jsonb_build_object('it keeps the attempt''s start', (select wake_since from public.filer_status) = t0);
  -- it wakes and beats: the attempt is answered
  perform public.filer_heartbeat('{"version":"v"}'::jsonb);
  select * into r from public.filer_live();
  res := res || jsonb_build_object('a beat after the ping: live, the attempt answered', r.live and r.seen_at >= r.wake_since);
  -- asleep again later: a new attempt starts
  update public.filer_status set seen_at = now() - interval '1 hour', woken_at = now() - interval '2 hours', wake_since = now() - interval '2 hours';
  perform public.filer_wake_claim();
  res := res || jsonb_build_object('a new attempt after the worker beat', (select wake_since > now() - interval '5 seconds' from public.filer_status));
  -- the period can't be made shorter than 10 seconds
  update public.filer_status set woken_at = now() - interval '5 seconds';
  res := res || jsonb_build_object('at most one ping every 10 seconds whatever is asked', public.filer_wake_claim(interval '0 seconds') = false);

  -- filer_wake_due: only while a queued portal filing waits on a worker that isn't beating
  res := res || jsonb_build_object('nothing queued: not due', public.filer_wake_due() = false);
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'llc', '{"en":"LLC","zh":"LLC"}', '{"official":"ca-llc1"}') returning id into f;
  perform public.filing_agent_step(f, '{"en":"Opening the agency''s site","zh":"x","kind":"queued"}', '{"channel":"portal","agent_state":"queued","status":"in_progress"}'::jsonb);
  res := res || jsonb_build_object('a queued portal filing and a sleeping worker: due', public.filer_wake_due() = true);
  update public.filings set provider_ref = 'retry-after:' || to_char((now() + interval '20 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') where id = f;
  res := res || jsonb_build_object('waiting out a retry: not due', public.filer_wake_due() = false);
  update public.filings set provider_ref = 'retry-after:' || to_char((now() - interval '1 minute') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') where id = f;
  res := res || jsonb_build_object('the retry is over: due again', public.filer_wake_due() = true);
  update public.filings set provider_ref = 'something-else' where id = f;
  res := res || jsonb_build_object('any other provider_ref is read safely', public.filer_wake_due() = true);
  perform public.filer_heartbeat('{"version":"v"}'::jsonb);
  res := res || jsonb_build_object('the worker beats: not due', public.filer_wake_due() = false);

  -- nobody else calls them
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.filer_wake_claim(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('users cannot ping', ok);
  begin perform public.filer_live(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('users cannot read the heartbeat function', ok);
  begin perform public.filer_wake_due(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('users cannot call wake_due', ok);
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.filer_wake_claim(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anon cannot ping', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
