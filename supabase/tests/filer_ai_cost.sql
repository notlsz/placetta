-- The run's AI ledger, the CAPTCHA log and preferences, and the business's signed-in session on a portal
-- (20261105090800_filer_ai_cost.sql). Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); f uuid; f2 uuid; l uuid; l2 uuid; t text; s text;
  res jsonb := '{}'::jsonb; ok boolean;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@ai.test', now(), now(), now(), '{}', '{}'),
    (inst, x, 'authenticated', 'authenticated', 'stranger@ai.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (x, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Tea One', now(), a, a), (w2, 'Tea Two', now(), x, x);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w2, x, 'owner');
  insert into public.filings (workspace_id, app_id, title, agency, payload, status, requirements_checked, channel, agent_state)
    values (w, 'llc', '{"en":"LLC","zh":"LLC"}', '{"en":"SOS","zh":"SOS"}', '{"official":"ca-llc"}', 'in_progress', true, 'portal', 'running') returning id into f;
  insert into public.filings (workspace_id, app_id, title, agency, payload, status, requirements_checked, channel, agent_state)
    values (w2, 'llc', '{"en":"LLC","zh":"LLC"}', '{"en":"SOS","zh":"SOS"}', '{"official":"ca-llc"}', 'in_progress', true, 'portal', 'running') returning id into f2;
  insert into public.agency_logins (workspace_id, agency, url, username, secret_id) values (w, 'SOS', 'https://bizfileonline.sos.ca.gov/', 'acme', public.vault_put('pw1', 'login')) returning id into l;
  insert into public.agency_logins (workspace_id, agency, url, username, secret_id) values (w2, 'SOS', 'https://bizfileonline.sos.ca.gov/', 'other', public.vault_put('pw2', 'login')) returning id into l2;

  -- 1. the run's ledger, onto the row its token names
  t := public.filer_begin_run(f, 30);
  perform set_config('request.headers', json_build_object('x-filer-run', t)::text, true);
  res := res || jsonb_build_object('the ledger is written to the run''s own row', public.filer_run_usage('{"provider":"browserbase","calls":3,"usd":0.0412,"input":4500,"output":900,"cache_read":3000,"cache_write":1500,"replayed_steps":2,"by_tier":{"fast":{"calls":2,"usd":0.0006},"strong":{"calls":1,"usd":0.0406}},"steps":[{"tier":"fast","model":"anthropic:claude-haiku-5-5","usd":0.0003}]}'::jsonb));
  res := res || jsonb_build_object('and adds up per filing', (select ai_usd = 0.0412 and calls = 3 and replayed_steps = 2 and providers = array['browserbase'] from public.filer_run_costs where filing_id = f));
  begin perform public.filer_run_usage(jsonb_build_object('steps', (select jsonb_agg(i) from generate_series(1, 201) i))); ok := false; exception when others then ok := sqlerrm = 'usage_too_large'; end;
  res := res || jsonb_build_object('a ledger too large is refused', ok);

  -- 2. the challenges, and whether a host shows CAPTCHAs
  perform public.filer_challenge_seen(f, 'BizFileOnline.sos.ca.gov', 'captcha', 'browserbase');
  res := res || jsonb_build_object('a CAPTCHA is logged per host and browser', public.portal_captcha_host('bizfileonline.sos.ca.gov'),
    'a host without one is not', not public.portal_captcha_host('www.sanjoseca.gov'));

  -- 3. the owner's answer for a site, read only for the filing's own workspace
  insert into public.captcha_preferences (workspace_id, host, choice, set_by) values (w, 'bizfileonline.sos.ca.gov', 'route', a);
  res := res || jsonb_build_object('the saved answer is read for the filing''s workspace', public.filer_captcha_choice(f, 'bizfileonline.sos.ca.gov') = 'route',
    'never another workspace''s', public.filer_captcha_choice(f2, 'bizfileonline.sos.ca.gov') is null);

  -- 4. the signed-in session: this workspace and host only, in Vault, gone on a security event
  perform public.filer_session_put(f, 'bizfileonline.sos.ca.gov', '{"cookies":[{"name":"sid","value":"secret-sid"}],"origins":[]}', now() + interval '90 days');
  res := res || jsonb_build_object('kept for this workspace and host', public.filer_session_get(f, 'bizfileonline.sos.ca.gov') like '%secret-sid%',
    'for 30 days at most', (select expires_at <= now() + interval '30 days 1 second' from public.agency_sessions where workspace_id = w),
    'not in the table itself (Vault)', not exists (select 1 from public.agency_sessions where secret_id::text like '%sid%'));
  perform set_config('request.headers', '{}', true);
  t := public.filer_begin_run(f2, 30);
  perform set_config('request.headers', json_build_object('x-filer-run', t)::text, true);
  res := res || jsonb_build_object('another workspace never gets it (same host)', public.filer_session_get(f2, 'bizfileonline.sos.ca.gov') is null);
  begin perform public.filer_session_put(f2, 'eddservices.edd.ca.gov', '{}', now() + interval '1 hour'); ok := false; exception when others then ok := sqlerrm = 'no_login_for_host'; end;
  res := res || jsonb_build_object('no state is kept for a host without the workspace''s login', ok);
  perform set_config('request.headers', '{}', true);
  -- a password change is a security event
  update public.agency_logins set secret_id = public.vault_put('pw-new', 'login') where id = l;
  res := res || jsonb_build_object('a changed password ends the saved session', not exists (select 1 from public.agency_sessions where workspace_id = w));
  t := public.filer_begin_run(f, 30);
  perform set_config('request.headers', json_build_object('x-filer-run', t)::text, true);
  perform public.filer_session_put(f, 'bizfileonline.sos.ca.gov', '{"cookies":[]}', now() + interval '1 hour');
  perform public.filer_session_drop(f, 'bizfileonline.sos.ca.gov', 'sign_in_failed');
  res := res || jsonb_build_object('a sign-in failure drops it, and the audit trail says so', not exists (select 1 from public.agency_sessions where workspace_id = w)
    and exists (select 1 from public.audit_log where workspace_id = w and action->>'en' like 'Placetta ended the saved sign-in%'));
  perform public.filer_session_put(f, 'bizfileonline.sos.ca.gov', '{"cookies":[]}', now() - interval '1 minute');
  res := res || jsonb_build_object('an expired one is never used', public.filer_session_get(f, 'bizfileonline.sos.ca.gov') is null);
  perform public.filer_session_put(f, 'bizfileonline.sos.ca.gov', '{"cookies":[]}', now() + interval '1 hour');
  delete from public.agency_logins where id = l;
  res := res || jsonb_build_object('removing the login removes it', not exists (select 1 from public.agency_sessions where workspace_id = w));
  perform set_config('request.headers', '{}', true);

  -- nobody signed in reads any of it
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin perform 1 from public.agency_sessions; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a customer can''t read saved sessions', ok);
  begin perform 1 from public.ai_batch_jobs; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('or batch jobs', ok);
  begin perform 1 from public.filer_run_costs; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('or run costs', ok);
  begin perform public.filer_session_get(f, 'bizfileonline.sos.ca.gov'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('or call the filer''s functions', ok);
  res := res || jsonb_build_object('the owner reads the workspace''s CAPTCHA answer', (select count(*) from public.captcha_preferences) = 1,
    'and sees no challenge log (staff only)', (select count(*) from public.portal_challenges) = 0);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
