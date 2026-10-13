-- Clickwrap records: accept_terms, terms_status and the Filing Authorization trigger. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); x uuid := gen_random_uuid(); w uuid; wx uuid := gen_random_uuid();
  inst uuid := '00000000-0000-0000-0000-000000000000';
  res jsonb := '{}'::jsonb; s jsonb; ok boolean; cur text := public.current_terms_version(); msg text; hint text;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'a@terms.test', now(), now(), now(), '{}', '{}'),
    (inst, x, 'authenticated', 'authenticated', 'x@terms.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (x, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values (wx, 'Other', now(), x, x, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (wx, x, 'owner');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "TermsTest/1.0"}', true);

  s := public.terms_status();
  res := res || jsonb_build_object('a new account has not accepted', not (s->>'accepted')::boolean and s->>'version' is null and s->>'current' = cur);

  begin perform public.accept_terms('2001-01-01'); ok := false; exception when others then get stacked diagnostics msg = message_text, hint = pg_exception_hint; ok := msg = 'terms_version' and hint = cur; end;
  res := res || jsonb_build_object('an old version is refused, naming the current one', ok);
  begin perform public.accept_terms(null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('no version is refused', ok);
  begin perform public.accept_terms(cur, wx); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('cannot accept for someone else''s workspace', ok);

  s := public.accept_terms(cur);
  res := res || jsonb_build_object('accepting the current version', (s->>'accepted')::boolean and s->>'version' = cur);
  perform public.accept_terms(cur);
  begin perform count(*) from public.terms_acceptances; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('users cannot read the records directly', ok);
  begin insert into public.terms_acceptances (user_id, doc, version) values (a, 'terms', cur); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('users cannot write the records directly', ok);

  -- onboarding: the workspace, then acceptance tied to it; the Filing Authorization is recorded by the trigger
  w := public.create_workspace('Terms Tea', '{}'::jsonb, true);
  perform public.accept_terms(cur, w);
  execute 'reset role';
  res := res || jsonb_build_object('terms and privacy recorded once each without a workspace',
    (select count(*) from public.terms_acceptances where user_id = a and workspace_id is null and doc in ('terms', 'privacy')) = 2);
  res := res || jsonb_build_object('and once each for the workspace',
    (select count(*) from public.terms_acceptances where user_id = a and workspace_id = w and doc in ('terms', 'privacy')) = 2);
  res := res || jsonb_build_object('the IP and browser are kept',
    (select bool_and(ip = '203.0.113.7' and user_agent = 'TermsTest/1.0') from public.terms_acceptances where user_id = a and doc = 'terms'));
  res := res || jsonb_build_object('the Filing Authorization is recorded with its version',
    (select count(*) from public.terms_acceptances where user_id = a and workspace_id = w and doc = 'authorization' and version = cur) = 1);

  -- someone whose last acceptance is an older version must accept again
  insert into public.terms_acceptances (user_id, doc, version, accepted_at) values (x, 'terms', '2026-01-01', now() - interval '1 day'), (x, 'privacy', '2026-01-01', now() - interval '1 day');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  s := public.terms_status();
  res := res || jsonb_build_object('an older version is not accepted', not (s->>'accepted')::boolean and s->>'version' = '2026-01-01');
  execute 'reset role';

  -- the records outlive the account
  delete from auth.users where id = a;
  res := res || jsonb_build_object('records survive account deletion', (select count(*) from public.terms_acceptances where user_id = a) >= 5);

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  begin perform public.accept_terms(cur); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('signed-out callers cannot accept', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('helpers closed to users', not has_function_privilege('authenticated', 'public.request_client()', 'execute')
    and not has_function_privilege('authenticated', 'public.terms_authorization_track()', 'execute'));

  raise exception 'TEST_RESULTS %', res;
end $test$;
