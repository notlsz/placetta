-- The portal filer's own role (20261022120000_filer_least_privilege.sql): no table access, only its functions, only
-- for filings handed to it; a saved password leaves the database only after its audit entry is written. Since
-- 20261022150000_agent_security.sql each call also carries the run's token for that filing (the x-filer-run header);
-- supabase/tests/agent_security.sql checks what happens without one.
-- Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); f uuid; f2 uuid; fother uuid;
  l1 uuid; l2 uuid; lother uuid; s1 uuid; s2 uuid; s3 uuid; res jsonb := '{}'::jsonb; ok boolean; n int; n2 int; u text; p text; tf text; tf2 text;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@filer.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Filer', now(), a, a), (w2, 'Other', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w2, a, 'owner');
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'seller', '{"en":"Seller permit","zh":"卖方许可"}', '{"official":"cdtfa-400"}', a) returning id into f;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'ein', '{"en":"EIN","zh":"EIN"}', '{"official":"irs-ss4"}', a) returning id into f2;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w2, 'seller', '{"en":"Other","zh":"其他"}', '{"official":"cdtfa-400"}', a) returning id into fother;
  perform public.filing_agent_step(f, null, '{"channel":"portal","agent_state":"running"}');
  perform public.filing_agent_step(fother, null, '{"channel":"portal","agent_state":"running"}');
  s1 := vault.create_secret('pw-one'); s2 := vault.create_secret('pw-two'); s3 := vault.create_secret('pw-other');
  insert into public.agency_logins (workspace_id, agency, url, username, secret_id) values (w, 'CDTFA', 'https://onlineservices.cdtfa.ca.gov/', 'filer1', s1) returning id into l1;
  insert into public.agency_logins (workspace_id, agency, url, username, secret_id) values (w, 'IRS', 'https://sa.www4.irs.gov/', 'filer2', s2) returning id into l2;
  insert into public.agency_logins (workspace_id, agency, url, username, secret_id) values (w2, 'CDTFA', 'https://onlineservices.cdtfa.ca.gov/', 'other', s3) returning id into lother;
  insert into storage.buckets (id, name) values ('documents', 'documents') on conflict do nothing;

  -- What the role holds at all
  res := res || jsonb_build_object(
    'filer role exists and cannot log in', exists (select 1 from pg_roles where rolname = 'placetta_filer' and not rolcanlogin and not rolbypassrls),
    'filer role has no privilege on any public table', not exists (
      select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
        and (has_table_privilege('placetta_filer', c.oid, 'select') or has_table_privilege('placetta_filer', c.oid, 'insert')
          or has_table_privilege('placetta_filer', c.oid, 'update') or has_table_privilege('placetta_filer', c.oid, 'delete'))),
    'filer role cannot call vault_get', not has_function_privilege('placetta_filer', 'public.vault_get(uuid)', 'execute'),
    'signed-in users cannot open a login through the filer', not has_function_privilege('authenticated', 'public.filer_open_login(uuid, uuid)', 'execute'),
    'anonymous callers cannot list logins', not has_function_privilege('anon', 'public.filer_logins(uuid)', 'execute'),
    'the filer can claim, step and open logins', has_function_privilege('placetta_filer', 'public.claim_agent_filing()', 'execute')
      and has_function_privilege('placetta_filer', 'public.filing_agent_step(uuid, jsonb, jsonb, boolean)', 'execute')
      and has_function_privilege('placetta_filer', 'public.filer_open_login(uuid, uuid)', 'execute'));

  -- the run on f starts: its token goes with every call, as the worker's header does
  tf := public.filer_begin_run(f);
  perform set_config('request.headers', json_build_object('x-filer-run', tf)::text, true);
  execute 'set local role placetta_filer';
  begin perform 1 from public.agency_logins limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('filer cannot read saved logins directly', ok);
  begin perform 1 from public.filings limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('filer cannot read filings directly', ok);
  begin insert into public.audit_log (workspace_id, actor, action, object) values (w, 'agent', '{}', '{}'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('filer cannot write the audit log directly', ok);

  select count(*) into n from public.filer_logins(f);
  select count(*) into n2 from public.filer_logins(f2);
  res := res || jsonb_build_object('lists the running filing''s logins, without passwords', n = 2,
    'lists nothing for a filing that isn''t running', n2 = 0,
    'reads a filing handed to the agent', (select count(*) from public.filer_filing(f)) = 1,
    'does not read a filing never handed to the agent', (select count(*) from public.filer_filing(f2)) = 0);

  select o.username, o.password into u, p from public.filer_open_login(f, l1) o;
  res := res || jsonb_build_object('opens its own workspace''s login', u = 'filer1' and p = 'pw-one');
  begin perform public.filer_open_login(f, lother); ok := false; exception when others then ok := sqlerrm = 'login_not_in_workspace'; end;
  res := res || jsonb_build_object('refuses another workspace''s login', ok);
  begin perform public.filer_open_login(f2, l2); ok := false; exception when others then ok := sqlerrm = 'filing_not_running'; end;
  res := res || jsonb_build_object('refuses a login for a filing that isn''t running', ok);
  execute 'reset role';
  res := res || jsonb_build_object('the opening is in the audit trail',
    (select count(*) from public.audit_log where workspace_id = w and actor = 'agent' and action->>'en' = 'Placetta opened the saved login for CDTFA') = 1,
    'the opening time is recorded', (select last_opened_at is not null from public.agency_logins where id = l1),
    'nothing was recorded for the refused logins', (select last_opened_at is null from public.agency_logins where id = l2)
      and (select last_opened_at is null from public.agency_logins where id = lother));

  -- The audit entry comes first: when it can't be written, no password comes back and nothing else changes.
  perform public.filing_agent_step(f2, null, '{"channel":"portal","agent_state":"running"}');
  tf2 := public.filer_begin_run(f2);
  perform set_config('request.headers', json_build_object('x-filer-run', tf2)::text, true);
  create function pg_temp.no_audit() returns trigger language plpgsql as $f$ begin raise exception 'audit_down'; end $f$;
  create trigger no_audit before insert on public.audit_log for each row execute function pg_temp.no_audit();
  execute 'set local role placetta_filer';
  p := null;
  begin select o.password into p from public.filer_open_login(f2, l2) o; ok := false; exception when others then ok := sqlerrm = 'audit_down'; end;
  execute 'reset role';
  drop trigger no_audit on public.audit_log;
  res := res || jsonb_build_object('no audit entry, no password', ok and p is null,
    'no audit entry, no opening time either', (select last_opened_at is null from public.agency_logins where id = l2));

  -- Documents, tasks, updates and skills, each limited to what the worker was given
  perform set_config('request.headers', json_build_object('x-filer-run', tf)::text, true);
  execute 'set local role placetta_filer';
  begin perform public.filer_save_doc(f, 'x.png', w2::text || '/receipts/' || f::text || '-1-x.png', 10, 'image/png'); ok := false;
  exception when others then ok := sqlerrm = 'path_outside_filing'; end;
  res := res || jsonb_build_object('cannot list a document outside the filing''s folder', ok);
  perform public.filer_save_doc(f, 'confirmation.png', w::text || '/receipts/' || f::text || '-1-confirmation.png', 10, 'image/png');
  perform public.filer_notify(f, '{"en":"Submitted","zh":"已提交"}', '{"en":"Confirmation 1","zh":"确认号 1"}', 'agent:test:1');
  perform public.filer_notify(f, '{"en":"Submitted","zh":"已提交"}', '{"en":"Confirmation 1","zh":"确认号 1"}', 'agent:test:1');
  perform public.filer_team_task(f, 'review', 'Review it', null, 'review:test:1');
  begin perform public.filer_notify(gen_random_uuid(), '{"en":"x"}', null, 'x'); ok := false; exception when others then ok := sqlerrm = 'filing_not_given_to_agent'; end;
  res := res || jsonb_build_object('cannot post an update for a filing it wasn''t given', ok);
  perform public.filer_save_skill('portal:test.gov:form', 'Test form', '{"steps":[]}', 1, 30, 30);
  perform public.filer_save_skill('portal:test.gov:form', 'Test form', '{"steps":[1]}', 2, 25, 25);
  ok := public.filer_skill_failed('portal:test.gov:form'); ok := public.filer_skill_failed('portal:test.gov:form');
  res := res || jsonb_build_object('two failed replays leave the skill on', not ok);
  ok := public.filer_skill_failed('portal:test.gov:form');
  res := res || jsonb_build_object('the third switches it off', ok);
  -- Files
  begin insert into storage.objects (bucket_id, name) values ('documents', w::text || '/receipts/' || f::text || '-2-shot.png'); ok := true; exception when others then ok := false; end;
  res := res || jsonb_build_object('adds a receipt for a filing it was given', ok);
  begin insert into storage.objects (bucket_id, name) values ('documents', w2::text || '/uploads/secret.pdf'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('cannot add files outside receipts and proof', ok);
  execute 'reset role';
  insert into storage.objects (bucket_id, name) values ('documents', w::text || '/uploads/lease.pdf'), ('documents', gen_random_uuid()::text || '/uploads/x.pdf');
  execute 'set local role placetta_filer';
  begin select count(*) into n from storage.objects where bucket_id = 'documents'; exception when insufficient_privilege then n := -1; end;
  execute 'reset role';
  res := res || jsonb_build_object('reads only files of workspaces with a running filing',
    n = (select count(*) from storage.objects where bucket_id = 'documents' and (storage.foldername(name))[1] in (w::text, w2::text)));
  res := res || jsonb_build_object(
    'the document is listed for the workspace', exists (select 1 from public.documents where workspace_id = w and filing_id = f and source = 'agent'),
    'one update per dedupe key', (select count(*) from public.updates where workspace_id = w and dedupe = 'agent:test:1') = 1,
    'the team task is filed', exists (select 1 from public.team_tasks where dedupe = 'review:test:1' and workspace_id = w),
    'the skill is shared, not a workspace''s', exists (select 1 from public.agent_skills where key = 'portal:test.gov:form' and workspace_id is null and uses = 2 and not enabled));
  raise exception 'TEST_RESULTS %', res;
end $test$;
