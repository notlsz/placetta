-- The security audit (docs/SECURITY-AUDIT.md, 20261026090000_security_audit.sql): across the whole schema, what a
-- signed-in person in another workspace and an anonymous caller can reach. Cross-tenant: Eve owns her own workspace and
-- asks for Olivia's ids through every security definer function that takes a workspace or a record id, and reads every
-- table that holds a workspace's data; each must refuse or come back empty. Then the schema-wide rules: row-level
-- security on every table, a fixed search_path on every security definer function, only the website's functions open to
-- anon, no table readable by anon, Placetta's AI cost hidden from customers, the public forms bucket closed to
-- clients, and the website's plan form limited. Run with scripts/test-db.sh (ends by raising TEST_RESULTS).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  r1 uuid := gen_random_uuid(); c1 uuid := gen_random_uuid(); t1 uuid := gen_random_uuid(); h1 uuid := gen_random_uuid();
  i1 uuid := gen_random_uuid(); f1 uuid := gen_random_uuid(); p1 uuid := gen_random_uuid(); n1 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; v text; n int; e text; q text; leaks text[] := '{}'; x text;
  claims text;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'olivia@acme.test', now(), now(), now(), '{}', '{}'),
    (inst, eve, 'authenticated', 'authenticated', 'eve@other.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (eve, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Acme Tea', now(), o, o, '{"apps":[{"id":"bl","name":{"en":"Business license","zh":"营业执照"}}]}'), (w2, 'Eve Co', now(), eve, eve, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w2, eve, 'owner');
  insert into public.billing (workspace_id, comped) values (w, true), (w2, true);

  -- Olivia's workspace's records: a run (with its cost), a comment, an assistant token, a headquarters link, an invite,
  -- a memory, a form link, a document, a filing, a purchase, a notice, an update and a chat log line
  insert into public.agent_runs (id, workspace_id, prompt, created_by, cost_usd, input_tokens, cache_calls) values (r1, w, 'secret plan for Acme', o, 0.42, 1000, 1);
  insert into public.comments (id, workspace_id, item_kind, item_id, body, author_id) values (c1, w, 'app', 'bl', 'Acme comment', o);
  insert into public.mcp_tokens (id, workspace_id, created_by, label, prefix, token_hash) values (t1, w, o, 'Claude', 'abcd1234', repeat('a', 64));
  insert into public.hq_links (id, workspace_id, hq_email, brand) values (h1, w, 'hq@acme.test', 'Acme');
  insert into public.workspace_invites (id, workspace_id, email, role) values (i1, w, 'new@acme.test', 'member');
  insert into public.agent_memories (id, workspace_id, topic, entity, attr, value, text_en, text_zh, source_kind, status, trust) values
    ('acme-mem', w, 'company', 'entity:e1', 'name', 'Acme Tea LLC', 'Acme files as Acme Tea LLC', 'Acme', 'chat', 'suggested', 'agent');
  insert into public.form_links (token, workspace_id, app_id, version, path, name, created_by, expires_at) values ('AcmeFormToken0123456789', w, 'bl', 1, w::text || '/forms/bl.pdf', 'bl.pdf', o, now() + interval '1 day');
  insert into public.documents (workspace_id, path, name) values (w, w::text || '/lease.pdf', 'lease.pdf');
  insert into public.filings (id, workspace_id, app_id, payload, title) values (f1, w, 'bl', '{}', '{"en":"Business license","zh":"营业执照"}');
  insert into public.purchases (id, workspace_id, category, payee, amount_cents, why) values (p1, w, 'filing_fee', 'City', 5000, '{"en":"fee","zh":"费用"}');
  insert into public.mention_notices (id, workspace_id, user_id, kind, title) values (n1, w, o, 'mention', '{"en":"x","zh":"x"}');
  insert into public.updates (workspace_id, kind, title, dedupe) values (w, 'team', '{"en":"Acme update","zh":"x"}', 'sec-audit-1');
  insert into public.odelia_messages (workspace_id, channel, direction, body) values (w, 'sms', 'in', 'Acme chat log');
  insert into public.mail_threads (workspace_id, kind, message_id, thread_id, subject, to_addrs) values (w, 'gmail', 'm1', 't1', 'Acme mail', 'a@b.test');
  insert into storage.objects (bucket_id, name) values ('documents', w::text || '/lease.pdf');

  /* ------------------------------ Eve asks for Olivia's ------------------------------ */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1', 'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1)))::text, true);

  -- Every call must refuse (raise) or give nothing back (null, false, 0, an empty list).
  foreach q in array array[
    format('public.accept_terms(public.current_terms_version(), %L)', w),
    format('public.agent_cache_stats(%L)', w),
    format('public.agent_memory_brief_set(%L, %L, %L, %L)', w, 'company', 'workspace', 'x'),
    format('public.agent_memory_forget_all(%L, true)', w),
    format('public.agent_memory_settings_set(%L, true, true, false)', w),
    format('public.ai_margin(%L, current_date)', w),
    format('public.ai_status(%L)', w),
    format('public.ask_person(%L, %L, %L, %L)', w, 'help me', '{}', 'en'),
    format('public.autopilot_grant(%L, %L, null, true, public.current_terms_version(), %L, 10, 10, %L, null)', w, 'Eve Evil', '{"stores":["s"],"agencies":["a"],"forms":["f"]}', 'typed'),
    format('public.autopilot_revoke(%L)', w),
    format('public.assign_item(%L, %L, %L, %L)', w, 'app', 'bl', eve),
    format('(select count(*) from public.audit_export(%L, now() - interval ''1 day'', now() + interval ''1 day''))', w),
    format('public.audit_record_export(%L, %L)', w, 'documents'),
    format('public.calendar_token(%L, false)', w),
    format('public.check_remove_member(%L, %L)', w, o),
    format('public.comment_post(%L, %L, %L, %L, %L, false)', w, 'app', 'bl', 'hi', '[]'),
    format('public.filing_cap_set(%L, 1000)', w),
    format('public.filing_month(%L)', w),
    format('(select count(*) from public.hq_comments(%L, null))', w),
    format('(select count(*) from public.hq_links_for(%L))', w),
    format('public.hq_remind(%L, %L, current_date + 1, null)', w, '["bl"]'),
    format('public.hq_share(%L, %L, %L)', w, 'eve@other.test', 'Evil'),
    format('public.invite_member(%L, %L, %L)', w, 'eve2@other.test', 'owner'),
    format('public.is_member(%L)', w), format('public.is_admin(%L)', w), format('public.is_owner(%L)', w), format('public.can_view(%L)', w),
    format('public.mcp_token_create(%L, %L, %L)', w, 'x', '{read}'),
    format('(select count(*) from public.mcp_token_list(%L))', w),
    format('public.my_role(%L)', w),
    format('public.network_view(%L, %L)', w, '{}'),
    format('public.odelia_month_detail(%L, current_date)', w),
    format('public.read_updates(%L)', w),
    format('public.referral_consent_set(%L, true)', w),
    format('public.referral_for(%L)', w),
    format('public.request_specialist_review(%L, %L, %L, %L)', w, 'bl', '{"en":"x","zh":"x"}', 'x'),
    format('public.scim_token_create(%L)', w),
    format('public.scim_token_revoke(%L)', w),
    format('public.security_settings(%L)', w),
    format('public.set_member_role(%L, %L, %L)', w, eve, 'owner'),
    format('public.specialist_reviews_for(%L)', w),
    format('public.sso_set_domain(%L, %L)', w, 'acme.test'),
    format('public.sso_set_enforced(%L, true, %L)', w, 'saml'),
    format('public.team_list(%L)', w),
    format('public.hq_sees(%L)', w),
    format('public.trust_link_create(%L, %L, %L, null, 90, %L)', w, 'x', 'x', '{}'),
    format('(select count(*) from public.trust_link_list(%L))', w),
    format('public.trust_refresh(%L, %L, %L)', w, 'x', '{}'),
    format('(select count(*) from public.trust_requests_for(%L))', w),
    -- record ids from Olivia's workspace
    format('public.poll_agent_run(%L)', r1), format('public.stop_agent_run(%L)', r1), format('public.agent_run_replay(%L)', r1),
    format('public.comment_resolve(%L, true)', c1), format('public.mcp_token_revoke(%L)', t1), format('public.hq_unshare(%L)', h1),
    format('public.revoke_invite(%L)', i1), format('public.agent_memory_delete(%L)', 'acme-mem'), format('public.agent_memory_edit(%L, %L, %L)', 'acme-mem', 'x', 'x'),
    format('public.agent_memory_pin(%L, true)', 'acme-mem'), format('public.agent_memory_review(%L, true)', 'acme-mem'),
    format('(select count(*) from public.open_form_link(%L))', 'AcmeFormToken0123456789'),
    format('public.notices_read(%L)', array[n1]::text), format('public.finish_team_task(%L)', gen_random_uuid()),
    format('public.filing_add_team_minutes(%L, 5)', f1), format('public.answer_person(%L, %L)', gen_random_uuid(), 'hi')
  ] loop
    begin
      execute 'select (' || q || ')::text' into v;
      if not (v is null or v in ('f', 'false', '0', '[]', '{}', '', 'null')) then leaks := leaks || (q || ' => ' || left(v, 80)); end if;
    exception when others then null;   -- refused: what we want
    end;
  end loop;
  res := res || jsonb_build_object('another workspace''s ids get a refusal or nothing from every function', coalesce(array_length(leaks, 1), 0) = 0);
  if coalesce(array_length(leaks, 1), 0) > 0 then raise notice 'cross-tenant leaks: %', leaks; end if;

  -- and nothing from any table that holds a workspace's data
  leaks := '{}';
  foreach x in array array['workspaces', 'workspace_members', 'workspace_invites', 'documents', 'filings', 'comments', 'agent_memories', 'agent_runs',
                           'purchases', 'updates', 'audit_log', 'mention_notices', 'odelia_messages', 'mail_threads', 'integrations', 'agency_logins', 'billing',
                           'trust_links', 'trust_requests', 'autopilot_grants'] loop
    begin
      execute format('select count(*) from public.%I where %s = %L', x, case when x = 'workspaces' then 'id' else 'workspace_id' end, w) into n;
      if n > 0 then leaks := leaks || x; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  res := res || jsonb_build_object('another workspace''s rows are invisible in every table', coalesce(array_length(leaks, 1), 0) = 0);
  if coalesce(array_length(leaks, 1), 0) > 0 then raise notice 'cross-tenant rows: %', leaks; end if;
  select count(*) into n from storage.objects where name like w::text || '/%';
  res := res || jsonb_build_object('another workspace''s files are invisible', n = 0);

  -- Eve's own workspace still works (the checks above aren't refusing everyone)
  res := res || jsonb_build_object('Eve still sees her own workspace', public.is_owner(w2));

  /* ------------------------------ the public forms bucket ------------------------------ */
  begin
    insert into storage.objects (bucket_id, name) values ('official-forms', 'acme-lease.pdf');
    res := res || '{"a signed-in person can''t put a file in the public forms bucket": false}';
  exception when others then res := res || '{"a signed-in person can''t put a file in the public forms bucket": true}';
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('documents', w2::text || '/mine.pdf');
    res := res || '{"a signed-in person can still add to their own workspace''s documents": true}';
  exception when others then res := res || '{"a signed-in person can still add to their own workspace''s documents": false}';
  end;

  /* ------------------------------ Placetta's cost stays with the team ------------------------------ */
  begin
    execute format('select cost_usd::text from public.agent_runs where workspace_id = %L', w2) into v;
    res := res || '{"a member can''t read the AI cost of a run": false}';
  exception when insufficient_privilege then res := res || '{"a member can''t read the AI cost of a run": true}';
  end;
  begin
    execute 'select ai_ws_daily_limit_usd::text from public.app_settings' into v;
    res := res || '{"a member can''t read the company''s AI ceiling": false}';
  exception when insufficient_privilege then res := res || '{"a member can''t read the company''s AI ceiling": true}';
  end;
  begin
    execute 'select payments_on::text from public.app_settings' into v;
    res := res || '{"the app still reads the payments switch": true}';
  exception when others then res := res || '{"the app still reads the payments switch": false}';
  end;
  reset role;

  /* ------------------------------ the website's plan form ------------------------------ */
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.9", "user-agent": "test"}', true);
  n := 0;
  for i in 1..7 loop
    begin
      insert into public.plan_requests (client_id, email, market) values (gen_random_uuid(), 'lead' || i || '@acme.test', 'San Jose');
      n := n + 1;
    exception when others then e := sqlerrm;
    end;
  end loop;
  res := res || jsonb_build_object('one address sends at most 5 plan requests an hour', n = 5 and e like 'Too many requests%');
  if n <> 5 then raise notice 'plan requests: % went in, last error %', n, e; end if;
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.10", "user-agent": "test"}', true);
  begin
    insert into public.plan_requests (client_id, email, market) values (gen_random_uuid(), 'not an email', 'San Jose');
    res := res || '{"a plan request needs a real-looking email": false}';
  exception when check_violation then res := res || '{"a plan request needs a real-looking email": true}';
  end;
  begin
    perform count(*) from public.plan_requests;
    res := res || '{"anon can''t read plan requests": false}';
  exception when insufficient_privilege then res := res || '{"anon can''t read plan requests": true}';
  end;
  reset role;

  /* ------------------------------ schema-wide rules ------------------------------ */
  select string_agg(c.relname, ', ') into e from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  res := res || jsonb_build_object('every public table has row-level security', e is null);
  if e is not null then raise notice 'no RLS: %', e; end if;

  select string_agg(p.proname, ', ') into e from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  res := res || jsonb_build_object('every security definer function fixes its search_path', e is null);
  if e is not null then raise notice 'no search_path: %', e; end if;

  -- anon may run only the website's own functions (the public incident log, guide page counts, a partner's name for a
  -- referral link, whether an email's domain needs SSO, a text-to-start link, the stats page's gated numbers, and a store's shared status page with its
  -- document request, both by a token only the owner was shown: supabase/tests/trust_pages.sql)
  select string_agg(p.proname, ', ') into e from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not in ('incident_log_public', 'page_hit', 'partner_lookup', 'sso_for_email', 'text_start_peek', 'trust_page', 'trust_request', 'public_outcomes', 'proof_page');
  res := res || jsonb_build_object('anon runs only the website''s functions', e is null);
  if e is not null then raise notice 'anon can run: %', e; end if;

  select string_agg(p.proname, ', ') into e from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prorettype = 'trigger'::regtype and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  res := res || jsonb_build_object('no client can call a trigger function', e is null);

  -- no policy lets anon read a table (with Supabase's default grants, a policy is the only thing in the way)
  select string_agg(tablename || ':' || policyname, ', ') into e from pg_policies
   where schemaname = 'public' and cmd in ('SELECT', 'ALL') and (roles && array['anon', 'public']::name[]);
  res := res || jsonb_build_object('no policy lets anon read a table', e is null);
  if e is not null then raise notice 'anon read policies: %', e; end if;

  raise exception 'TEST_RESULTS %', res;
end
$test$;
