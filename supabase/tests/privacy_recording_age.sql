-- Privacy (20261105090600): accounts for people 18 or older only, checked on the server, with nothing of a minor
-- kept; and recording of a person's screen, teach-mode actions or calls only with their opt-in where the business or
-- the person is in California, or where nothing says where they are.
-- Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  adult uuid := gen_random_uuid(); kid uuid := gen_random_uuid(); tot uuid := gen_random_uuid(); late uuid := gen_random_uuid();
  pal uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); ny uuid := gen_random_uuid(); blank uuid := gen_random_uuid(); w uuid;
  f uuid; r jsonb; ok boolean; n int;
  res jsonb := '{}'::jsonb;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, adult, 'authenticated', 'authenticated', 'adult@age.test', now(), now(), now(), '{}', '{}'),
    (inst, kid, 'authenticated', 'authenticated', 'kid@age.test', now(), now(), now(), '{}', '{}'),
    (inst, tot, 'authenticated', 'authenticated', 'tot@age.test', now(), now(), now(), '{}', '{}'),
    (inst, late, 'authenticated', 'authenticated', 'late@age.test', now(), now(), now(), '{}', '{}'),
    (inst, pal, 'authenticated', 'authenticated', 'pal@age.test', now(), now(), now(), '{}', '{}'),
    (inst, eve, 'authenticated', 'authenticated', 'eve@age.test', now(), now(), now(), '{}', '{}');
  -- these four haven't answered the question yet (the stubs confirm every test account)
  delete from public.age_confirmations where user_id in (adult, kid, tot, late);

  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (ca, 'San Jose Tea', now(), late, late, '{"meta": {"city": "San Jose", "region": "CA"}, "stores": [{"id": "s1", "address": "1 Main St, San Jose, CA 95112"}]}'),
    (ny, 'Queens Tea', now(), pal, pal, '{"meta": {"city": "Queens", "region": "NY"}, "stores": [{"id": "s1", "address": "9 Main St, Flushing, NY 11354"}]}'),
    (blank, 'Somewhere Tea', now(), pal, pal, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (ca, late, 'owner'), (ca, pal, 'member'), (ny, pal, 'owner'), (blank, pal, 'owner');
  insert into public.billing (workspace_id) values (ca), (ny), (blank);

  /* ------------------------------ age ------------------------------ */
  res := res || jsonb_build_object('the table has no place for a date of birth',
    not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'age_confirmations' and column_name ~ 'birth|dob|date'));

  perform set_config('request.jwt.claims', jsonb_build_object('sub', late, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := res || jsonb_build_object('an existing member who hasn''t confirmed reaches nothing', not public.can_view(ca) and public.my_role(ca) is null);
  res := res || jsonb_build_object('they read no workspace row', (select count(*) from public.workspaces where id = ca) = 0);
  res := res || jsonb_build_object('age_status says unconfirmed', (public.age_status() ->> 'confirmed')::boolean = false);
  execute 'reset role';
  res := res || jsonb_build_object('the server functions get age_required', public.access_for(ca, late, 'aal1', '{}'::jsonb) = 'age_required');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', adult, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.create_workspace('Skipped', '{}'::jsonb, true); ok := false;
  exception when others then ok := sqlerrm ~ 'age_required'; end;
  res := res || jsonb_build_object('a crafted request can''t create a workspace before confirming', ok);
  begin
    perform public.confirm_age(current_date + 3); ok := false;
  exception when others then ok := sqlerrm ~ 'age_format'; end;
  res := res || jsonb_build_object('a date in the future is refused', ok);
  r := public.confirm_age((current_date - interval '30 years')::date);
  res := res || jsonb_build_object('an adult is confirmed', (r ->> 'ok')::boolean and public.age_ok());
  w := public.create_workspace('Adult Tea', '{}'::jsonb, true);
  res := res || jsonb_build_object('then the workspace is made and reachable', public.is_owner(w));
  execute 'reset role';
  res := res || jsonb_build_object('only that they confirmed, and when, is kept', (select method = 'birthdate' and confirmed_at is not null from public.age_confirmations where user_id = adult));

  -- 17: the account made at sign-in goes, nothing kept
  perform set_config('request.jwt.claims', jsonb_build_object('sub', kid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.confirm_age((current_date - interval '17 years')::date);
  execute 'reset role';
  res := res || jsonb_build_object('under 18 is refused', (r ->> 'ok')::boolean = false and r ->> 'code' = 'under_18');
  res := res || jsonb_build_object('under 18: the account is deleted', not exists (select 1 from auth.users where id = kid) and (r ->> 'deleted')::boolean);
  res := res || jsonb_build_object('under 18: no confirmation is stored', not exists (select 1 from public.age_confirmations where user_id = kid));

  -- 12 (COPPA): the app never sends the date; the account goes all the same
  perform set_config('request.jwt.claims', jsonb_build_object('sub', tot, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.age_refused();
  execute 'reset role';
  res := res || jsonb_build_object('under 13: the account is deleted with nothing collected', not exists (select 1 from auth.users where id = tot));

  -- someone already in a workspace who says they're under 18: kept (the workspace's records), with no access
  perform set_config('request.jwt.claims', jsonb_build_object('sub', late, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.confirm_age((current_date - interval '16 years')::date);
  ok := public.can_view(ca);
  execute 'reset role';
  res := res || jsonb_build_object('an under-18 member keeps no access and the workspace keeps its records', not ok and (r ->> 'deleted')::boolean = false and exists (select 1 from public.workspaces where id = ca));
  insert into public.age_confirmations (user_id) values (late);   -- for the rest: an adult owner after all

  -- the day before an 18th birthday in any time zone is still under 18; the birthday itself is 18
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pal, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.confirm_age(((current_date - interval '18 years')::date));
  execute 'reset role';
  res := res || jsonb_build_object('turning 18 today counts', (r ->> 'ok')::boolean);

  /* ------------------------------ recording ------------------------------ */
  res := res || jsonb_build_object('California is read from the store address and meta', public.workspace_states(ca) = array['CA']);
  res := res || jsonb_build_object('New York likewise', public.workspace_states(ny) = array['NY']);
  res := res || jsonb_build_object('a workspace that says nothing is unknown', public.workspace_states(blank) = '{}'::text[]);
  res := res || jsonb_build_object('California is strict', public.recording_strict(public.privacy_states(ca, late)));
  res := res || jsonb_build_object('unknown is treated as California', public.recording_strict(public.privacy_states(blank, pal)));
  res := res || jsonb_build_object('New York with nothing else known is not strict', not public.recording_strict(public.privacy_states(ny, pal)));

  perform set_config('request.jwt.claims', jsonb_build_object('sub', pal, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.note_my_region('US', 'CA');
  r := public.recording_policy(ny);
  res := res || jsonb_build_object('a person opening the app in California makes a New York workspace strict for them', (r ->> 'strict')::boolean);
  perform public.note_my_region('US', 'NY');
  r := public.recording_policy(ny);
  res := res || jsonb_build_object('back in New York it isn''t', not (r ->> 'strict')::boolean);
  perform public.note_my_region('GB', 'ENG');
  res := res || jsonb_build_object('outside the US: the region isn''t kept, the person is known not to be in California', (select region is null from public.user_regions where user_id = pal) and not (public.recording_policy(ny) ->> 'strict')::boolean);
  perform public.note_my_region('US', 'NY');

  r := public.give_recording_consent(ca, 'screen', 'zh');
  res := res || jsonb_build_object('consent is recorded with the time', r ->> 'given_at' is not null and r ->> 'version' = public.recording_consent_version());
  perform public.give_recording_consent(ca, 'screen', 'zh');
  execute 'reset role';
  res := res || jsonb_build_object('the stored words are the server''s own, in the person''s language',
    (select text = public.recording_consent_text('screen', 'zh') and lang = 'zh' from public.recording_consents where user_id = pal and workspace_id = ca and kind = 'screen'));
  res := res || jsonb_build_object('giving it twice keeps one', (select count(*) from public.recording_consents where user_id = pal and workspace_id = ca) = 1);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', eve, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.recording_consents (user_id, workspace_id, kind, text, version) values (eve, ca, 'screen', 'I agree to be recorded, written by the client', 'x'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a person can''t write a consent row with their own words', ok);
  begin
    perform public.give_recording_consent(ca, 'screen', 'en'); ok := false;
  exception when others then ok := true; end;
  res := res || jsonb_build_object('nor consent in a workspace they''re not in', ok);
  res := res || jsonb_build_object('nor read another person''s consents', (select count(*) from public.recording_consents) = 0);
  res := res || jsonb_build_object('nor see another workspace''s policy', public.recording_policy(ca) is null);
  execute 'reset role';

  -- the worker's rule: every member who may be handed the page has to have opted in
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (ca, 'bl', '{"en":"License","zh":"执照"}', '{"official":"x"}', late) returning id into f;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.filing_agent_step(f, null, '{"channel":"portal","agent_state":"running"}');
  r := public.filer_recording_policy(f);
  res := res || jsonb_build_object('the worker sees California', (r ->> 'strict')::boolean and r -> 'states' ? 'CA');
  res := res || jsonb_build_object('one of two members agreeing isn''t enough', not (r ->> 'screen')::boolean and not (r ->> 'teach')::boolean);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', late, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.give_recording_consent(ca, 'screen', 'en');
  execute 'reset role';
  r := public.filer_recording_policy(f);
  res := res || jsonb_build_object('with both, the screen may be recorded, teach still not', (r ->> 'screen')::boolean and not (r ->> 'teach')::boolean and not (r ->> 'synthetic')::boolean);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pal, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.withdraw_recording_consent(ca, 'screen');
  execute 'reset role';
  res := res || jsonb_build_object('a withdrawal counts at once', not (public.filer_recording_policy(f) ->> 'screen')::boolean);
  res := res || jsonb_build_object('the withdrawal keeps the record with its time', (select withdrawn_at is not null from public.recording_consents where user_id = pal and workspace_id = ca and kind = 'screen'));
  res := res || jsonb_build_object('a call consent is per person', not (public.recording_policy_for(ca, pal) ->> 'call')::boolean and (public.recording_policy_for(ca, pal) ->> 'strict')::boolean);

  -- grants: only the service role (and the worker) reads another person's region or the worker's rule
  res := res || jsonb_build_object('people can''t call the worker''s rule', not has_function_privilege('authenticated', 'public.filer_recording_policy(uuid)', 'execute'));
  res := res || jsonb_build_object('people can''t read others'' states', not has_function_privilege('authenticated', 'public.privacy_states(uuid, uuid)', 'execute'));
  res := res || jsonb_build_object('anon can''t confirm an age', not has_function_privilege('anon', 'public.confirm_age(date)', 'execute'));
  select count(*) into n from pg_class c where c.relname in ('age_confirmations', 'user_regions', 'recording_consents') and c.relrowsecurity;
  res := res || jsonb_build_object('row-level security on all three new tables', n = 3);

  perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end
$test$;
