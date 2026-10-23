-- Memories brought over from another assistant (20261028120000_memory_import): only an owner or admin, only with memory
-- on, each line a suggestion only the importer sees, untrusted until they approve it; a line with a secret is left out.
-- Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); m uuid := gen_random_uuid(); w uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; n int;
  items jsonb := '[{"text":"Prefers replies in Chinese for anything about the Flushing store","topic":"preferences"},
                   {"text":"The landlord at Main St wants 30 days notice before any construction","topic":"stores"},
                   {"text":"My SSN is 123-45-6789 for the forms","topic":"company"}]';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@import.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@import.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (m, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values (w, 'Import Tea', now(), o, o, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w, m, 'member');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.agent_memory_import(w, items); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('memory has to be on', ok);
  perform public.agent_memory_settings_set(w, true);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.agent_memory_import(w, items); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t import', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  n := public.agent_memory_import(w, items);
  res := res || jsonb_build_object('the two clean lines come in, the one with a number like an SSN doesn''t', n = 2,
    'each is a suggestion only the importer sees, untrusted', (select count(*) from public.agent_memories where workspace_id = w and status = 'suggested' and trust = 'untrusted' and scope_kind = 'person' and scope_id = o::text) = 2);
  begin perform public.agent_memory_import(w, (select jsonb_agg(x) from generate_series(1, 51) x)); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('at most 50 at a time', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('another person on the workspace can''t read them', (select count(*) from public.agent_memories where workspace_id = w) = 0);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('the import is in the audit trail', exists (select 1 from public.audit_log where workspace_id = w and action->>'en' = 'Brought memories over from another assistant'),
    'nothing with the number was kept anywhere', not exists (select 1 from public.agent_memories where text_en like '%123-45-6789%'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
