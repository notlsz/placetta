-- The October security pass (migration 20261016114500_security_hardening), as each kind of user. Run with
-- scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); z uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); w3 uuid := gen_random_uuid();
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; c1 uuid; c2 uuid; c3 uuid;
  res jsonb := '{}'::jsonb; ok boolean; n int; j jsonb; d uuid; d2 uuid; f uuid; r uuid; r2 uuid; k text;
  inst uuid := '00000000-0000-0000-0000-000000000000';
  mimes text[];
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@h.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'member@h.test', now(), now(), now(), '{}', '{}'),
    (inst, z, 'authenticated', 'authenticated', 'stranger@h.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (b, 'email'), (z, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values
    (w, 'H', now(), a, a), (w2, 'H2', now(), z, z), (w3, 'H3', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, b, 'member'), (w2, z, 'owner'), (w3, a, 'owner');

  /* ---------------- H1: vault secrets follow their rows ---------------- */
  s1 := public.vault_put('tok1', 'integration:gmail'); s2 := public.vault_put('pw', 'login'); s3 := public.vault_put('pending-live', 'integration:gcal');
  s4 := public.vault_put('pending-expired', 'integration:gdrive'); s5 := public.vault_put('tok2', 'integration:gmail');
  insert into public.integrations (workspace_id, kind, secret_id) values (w, 'gmail', s1);
  insert into public.agency_logins (workspace_id, agency, username, secret_id) values (w, 'CDTFA', 'me', s2);
  insert into public.oauth_pending (id, workspace_id, user_id, kind, secret_id) values (repeat('a', 64), w, a, 'gcal', s3);
  insert into public.oauth_pending (id, workspace_id, user_id, kind, secret_id, expires_at) values (repeat('b', 64), w, a, 'gdrive', s4, now() - interval '1 minute');
  update public.integrations set secret_id = s5 where workspace_id = w and kind = 'gmail';
  res := res || jsonb_build_object('replacing an integration''s secret drops the old one',
    not exists (select 1 from vault.secrets where id = s1) and exists (select 1 from vault.secrets where id = s5));
  update public.integrations set account = 'x@h.test' where workspace_id = w;
  res := res || jsonb_build_object('other updates keep the secret', exists (select 1 from vault.secrets where id = s5));
  delete from public.agency_logins where workspace_id = w;
  res := res || jsonb_build_object('deleting a saved login drops its secret', not exists (select 1 from vault.secrets where id = s2));
  delete from public.oauth_pending where id = repeat('a', 64);
  res := res || jsonb_build_object('claiming a live pending connection keeps its secret for the integration', exists (select 1 from vault.secrets where id = s3));
  delete from public.oauth_pending where id = repeat('b', 64);
  res := res || jsonb_build_object('deleting an expired pending connection drops its secret', not exists (select 1 from vault.secrets where id = s4));
  -- a secret another row still holds is kept
  insert into public.agency_logins (workspace_id, agency, username, secret_id) values (w, 'A', 'u1', s3), (w, 'B', 'u2', s3);
  delete from public.agency_logins where workspace_id = w and agency = 'A';
  res := res || jsonb_build_object('a secret still held by another row is kept', exists (select 1 from vault.secrets where id = s3));
  delete from public.agency_logins where workspace_id = w;
  -- a workspace delete cascades to all three, live pending rows included
  c1 := public.vault_put('c1', 'integration:slack'); c2 := public.vault_put('c2', 'login'); c3 := public.vault_put('c3', 'integration:gcal');
  insert into public.integrations (workspace_id, kind, secret_id) values (w3, 'slack', c1);
  insert into public.agency_logins (workspace_id, agency, username, secret_id) values (w3, 'DMV', 'me', c2);
  insert into public.oauth_pending (id, workspace_id, user_id, kind, secret_id) values (repeat('c', 64), w3, a, 'gcal', c3);
  insert into public.audit_log (workspace_id, actor, actor_id, action, object) values (w3, 'you', a, '{"en":"kept","zh":"kept"}', '{"en":"o","zh":"o"}');
  delete from public.workspaces where id = w3;
  res := res || jsonb_build_object('a workspace delete drops every secret it held',
    not exists (select 1 from vault.secrets where id in (c1, c2, c3)));

  /* ---------------- H2: the audit log ---------------- */
  res := res || jsonb_build_object('audit rows outlive their workspace', exists (select 1 from public.audit_log where workspace_id = w3));
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, created_at)
    values (w, 'agent', null, '{"en":"server","zh":"server"}', '{"en":"o","zh":"o"}', '2001-01-01');
  res := res || jsonb_build_object('created_at is the database''s time, whoever writes',
    (select created_at > now() - interval '1 minute' from public.audit_log where workspace_id = w and action->>'en' = 'server'));
  begin update public.audit_log set action = '{"en":"x","zh":"x"}' where workspace_id = w; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('the owner role cannot update audit rows', ok);
  execute 'set local role service_role';
  begin update public.audit_log set detail = '{"en":"x","zh":"x"}' where workspace_id = w; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('service_role cannot update audit rows', ok);
  begin delete from public.audit_log where workspace_id = w; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('service_role cannot delete audit rows', ok);
  begin truncate public.audit_log; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('service_role cannot truncate the audit log', ok);
  -- the agent's upsert (on conflict do nothing) still works
  insert into public.audit_log (workspace_id, client_id, actor, action, object) values (w, 'x-h-1', 'agent', '{"en":"a","zh":"a"}', '{"en":"o","zh":"o"}')
    on conflict (workspace_id, client_id) do nothing;
  insert into public.audit_log (workspace_id, client_id, actor, action, object) values (w, 'x-h-1', 'agent', '{"en":"a","zh":"a"}', '{"en":"o","zh":"o"}')
    on conflict (workspace_id, client_id) do nothing;
  execute 'reset role';
  res := res || jsonb_build_object('server upserts still land once', (select count(*) from public.audit_log where workspace_id = w and client_id = 'x-h-1') = 1);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin insert into public.audit_log (workspace_id, actor, actor_id, action, object) values (w, 'agent', b, '{"en":"Submitted by Placetta","zh":"x"}', '{"en":"o","zh":"o"}');
    ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a member cannot write as the agent', ok);
  begin insert into public.audit_log (workspace_id, actor, actor_id, action, object) values (w, 'team', b, '{"en":"t","zh":"t"}', '{"en":"o","zh":"o"}');
    ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a member cannot write as the team', ok);
  begin insert into public.audit_log (workspace_id, actor, actor_id, action, object) values (w, 'you', a, '{"en":"t","zh":"t"}', '{"en":"o","zh":"o"}');
    ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a member cannot write as someone else', ok);
  begin insert into public.audit_log (workspace_id, actor, actor_id, action, object) values (w2, 'you', b, '{"en":"t","zh":"t"}', '{"en":"o","zh":"o"}');
    ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a member cannot write into another workspace', ok);
  insert into public.audit_log (workspace_id, client_id, actor, actor_id, action, object, created_at)
    values (w, 'x-h-you', 'you', b, '{"en":"Approved","zh":"x"}', '{"en":"o","zh":"o"}', '2001-01-01')
    on conflict (workspace_id, client_id) do nothing;
  res := res || jsonb_build_object('a member logs their own action, stamped now',
    (select created_at > now() - interval '1 minute' from public.audit_log where workspace_id = w and client_id = 'x-h-you'));
  begin update public.audit_log set object = '{"en":"x","zh":"x"}' where workspace_id = w; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a member cannot update audit rows', ok);

  /* ---------------- M4: adding documents ---------------- */
  begin insert into public.documents (workspace_id, name, path) values (w, 'x.pdf', w2::text || '/x.pdf');
    ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a document must live in its workspace''s folder', ok);
  begin insert into public.documents (workspace_id, name, path) values (w, 'x.pdf', w::text || 'x.pdf');
    ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a look-alike prefix is refused', ok);
  begin insert into public.documents (workspace_id, name, path, uploaded_by) values (w, 'x.pdf', w::text || '/u/x.pdf', a);
    ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('uploaded_by must be the uploader', ok);
  insert into public.documents (workspace_id, name, path) values (w, 'lease.pdf', w::text || '/u1/lease.pdf') returning id into d;
  res := res || jsonb_build_object('a member adds a document in their folder', (select uploaded_by = b from public.documents where id = d));

  /* ---------------- M6: deleting a document (owners) ---------------- */
  begin delete from public.documents where id = d; get diagnostics n = row_count; ok := n = 0; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a member cannot delete a document', ok);
  execute 'reset role';
  insert into storage.objects (bucket_id, name) values ('documents', w::text || '/u1/lease.pdf'), ('documents', w::text || '/u2/form.pdf');
  insert into public.documents (workspace_id, name, path, uploaded_by) values (w, 'form.pdf', w::text || '/u2/form.pdf', a) returning id into d2;
  alter table public.filings disable trigger filings_guard;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by, status)
    values (w, 'app1', '{"en":"x","zh":"x"}', jsonb_build_object('form', w::text || '/u2/form.pdf'), a, 'requested') returning id into f;
  alter table public.filings enable trigger filings_guard;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  delete from storage.objects where bucket_id = 'documents' and name = w::text || '/u1/lease.pdf';
  get diagnostics n = row_count;
  res := res || jsonb_build_object('a member cannot delete a stored file', n = 0);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  delete from storage.objects where bucket_id = 'documents' and name = w::text || '/u1/lease.pdf';
  get diagnostics n = row_count;
  delete from public.documents where id = d;
  res := res || jsonb_build_object('an owner deletes the file and the row', n = 1 and not exists (select 1 from public.documents where id = d));
  delete from storage.objects where bucket_id = 'documents' and name = w::text || '/u2/form.pdf';
  get diagnostics n = row_count;
  delete from public.documents where id = d2;
  res := res || jsonb_build_object('a file an open filing uses stays', n = 0 and exists (select 1 from public.documents where id = d2));
  execute 'reset role';
  res := res || jsonb_build_object('a document delete is in the audit trail',
    exists (select 1 from public.audit_log where workspace_id = w and actor = 'you' and actor_id = a and action->>'en' = 'Deleted a document' and object->>'en' = 'lease.pdf'));

  /* ---------------- M5: shared agent skills ---------------- */
  insert into public.agent_skills (workspace_id, key, name) values (null, 'portal:shared-private', 'p'), (null, 'portal:shared-global', 'g'),
    (w, 'portal:mine', 'm'), (w2, 'portal:theirs', 't');
  update public.agent_skills set published = true where key = 'portal:shared-global';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('members read their own workspace''s skills', exists (select 1 from public.agent_skills where key = 'portal:mine'),
    'members don''t read another workspace''s skills', not exists (select 1 from public.agent_skills where key = 'portal:theirs'),
    'members don''t read unpublished shared skills', not exists (select 1 from public.agent_skills where key = 'portal:shared-private'),
    'members read skills published as global', exists (select 1 from public.agent_skills where key = 'portal:shared-global'));
  execute 'reset role';

  /* ---------------- M2: grants and search_path ---------------- */
  res := res || jsonb_build_object('server-only tables have no API grants', not (
    has_table_privilege('anon', 'public.chat_events', 'select') or has_table_privilege('authenticated', 'public.chat_events', 'insert')
    or has_table_privilege('anon', 'public.page_stats', 'update') or has_table_privilege('authenticated', 'public.page_stats', 'select')
    or has_table_privilege('anon', 'public.routine_runs', 'select') or has_table_privilege('authenticated', 'public.routine_runs', 'delete')));
  res := res || jsonb_build_object('page_hit still works for visitors', has_function_privilege('anon', 'public.page_hit(text, boolean, boolean)', 'execute'));
  create table public.zz_hardening_new (id bigint generated always as identity primary key);
  create function public.zz_hardening_fn() returns int language sql as $$ select 1 $$;
  res := res || jsonb_build_object('new tables are not granted to the API roles',
    not has_table_privilege('anon', 'public.zz_hardening_new', 'select') and not has_table_privilege('authenticated', 'public.zz_hardening_new', 'insert'),
    'new sequences are not granted to the API roles',
    not has_sequence_privilege('anon', pg_get_serial_sequence('public.zz_hardening_new', 'id'), 'usage')
    and not has_sequence_privilege('authenticated', pg_get_serial_sequence('public.zz_hardening_new', 'id'), 'usage'),
    'new functions are not granted to the API roles by name',
    not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                 where p.oid = 'public.zz_hardening_fn()'::regprocedure and x.grantee in ('anon'::regrole, 'authenticated'::regrole)));
  res := res || jsonb_build_object('every SECURITY DEFINER function has a search_path', not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')));
  res := res || jsonb_build_object('the PIN functions run with an empty search_path', not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'pin\_%'
       and not ('search_path=""' = any (coalesce(p.proconfig, '{}')))));
  res := res || jsonb_build_object('helpers are not callable by visitors',
    not has_function_privilege('anon', 'public.ai_rules()', 'execute') and not has_function_privilege('anon', 'public.is_blank_value(text)', 'execute'));
  -- the PIN still works end to end
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.pin_set('123456');
  res := res || jsonb_build_object('pin_set works', (j->>'on')::boolean and j->>'unlocked_until' is not null);
  j := public.pin_lock();
  res := res || jsonb_build_object('pin_lock works', j->>'unlocked_until' is null and not public.pin_ok());
  j := public.pin_unlock('000000');
  res := res || jsonb_build_object('a wrong PIN is refused', j->>'error' = 'pin_wrong' and j->>'hint' = '4');
  j := public.pin_unlock('123456');
  res := res || jsonb_build_object('the right PIN unlocks', j->>'unlocked_until' is not null and public.pin_ok());
  j := public.pin_clear('123456');
  res := res || jsonb_build_object('pin_clear works', not (j->>'on')::boolean);
  execute 'reset role';

  /* ---------------- M6: retention ---------------- */
  insert into public.chat_events (id, at) values ('ev-old', now() - interval '31 days'), ('ev-new', now() - interval '1 day');
  insert into public.page_stats (path, views, updated_at) values ('/guides/old', 1, now() - interval '401 days'), ('/guides/new', 1, now());
  insert into public.agent_runs (workspace_id, created_by, prompt, status, state, steps, draft, reply, updated_at)
    values (w, a, 'old', 'done', '{"messages":[1]}', '[{"en":"s"}]', 'draft', '{"en":"answer"}', now() - interval '366 days') returning id into r;
  insert into public.agent_runs (workspace_id, created_by, prompt, status, state, updated_at)
    values (w, a, 'recent', 'done', '{"messages":[1]}', now() - interval '10 days') returning id into r2;
  insert into public.agent_runs (workspace_id, created_by, prompt, status, state, updated_at)
    values (w, a, 'running', 'running', '{"messages":[1]}', now() - interval '400 days');
  insert into public.routine_runs (workspace_id, routine_id, day, created_at) values (w, 'r1', current_date - 200, now() - interval '200 days'), (w, 'r1', current_date, now());
  s1 := public.vault_put('old-pending', 'integration:gmail'); s2 := public.vault_put('new-pending', 'integration:gmail');
  insert into public.oauth_pending (id, workspace_id, user_id, kind, secret_id, created_at, expires_at)
    values (repeat('d', 64), w, a, 'gmail', s1, now() - interval '2 days', now() + interval '1 day'),
           (repeat('e', 64), w, a, 'outlook_mail', s2, now(), now() + interval '10 minutes');
  j := public.purge_expired();
  res := res || jsonb_build_object('purge reports what it removed', j is not null,
    'chat events: 30 days', not exists (select 1 from public.chat_events where id = 'ev-old') and exists (select 1 from public.chat_events where id = 'ev-new'),
    'page stats: 400 days', not exists (select 1 from public.page_stats where path = '/guides/old') and exists (select 1 from public.page_stats where path = '/guides/new'),
    'finished transcripts: 365 days, prompt and reply kept',
      (select state is null and steps = '[]'::jsonb and draft is null and prompt = 'old' and reply->>'en' = 'answer' from public.agent_runs where id = r)
      and (select state is not null from public.agent_runs where id = r2)
      and (select state is not null from public.agent_runs where prompt = 'running'),
    'routine claims: 180 days', (select count(*) from public.routine_runs where workspace_id = w) = 1,
    'pending connections: 1 day, with their secret',
      not exists (select 1 from public.oauth_pending where id = repeat('d', 64)) and not exists (select 1 from vault.secrets where id = s1)
      and exists (select 1 from public.oauth_pending where id = repeat('e', 64)) and exists (select 1 from vault.secrets where id = s2));
  execute 'set local role authenticated';
  begin perform public.purge_expired(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('members cannot run the purge', ok);
  execute 'reset role';

  /* ---------------- lows ---------------- */
  select decrypted_secret into k from vault.decrypted_secrets where name = 'monitor_key' limit 1;
  res := res || jsonb_build_object('monitor key: right key passes', public.monitor_key_ok(k),
    'monitor key: wrong key fails', not public.monitor_key_ok(repeat('0', 64)),
    'monitor key: a prefix fails', not public.monitor_key_ok(left(k, 40)),
    'monitor key: null fails', not public.monitor_key_ok(null));
  select allowed_mime_types into mimes from storage.buckets where id = 'documents';
  res := res || jsonb_build_object('documents bucket takes PDFs, images and office files only',
    'application/pdf' = any (mimes) and 'image/jpeg' = any (mimes)
    and 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' = any (mimes)
    and not ('image/svg+xml' = any (mimes)) and not ('text/html' = any (mimes)),
    'documents bucket has a size limit', (select file_size_limit = 52428800 from storage.buckets where id = 'documents'));

  raise exception 'TEST_RESULTS %', res;
end $test$;
