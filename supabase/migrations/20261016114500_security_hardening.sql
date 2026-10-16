-- Security hardening from the October audit. Safe to run twice.
--   H1  vault secrets go with the rows that hold them (integrations, agency_logins, oauth_pending), cascades included
--   H2  audit_log is append-only for every role, stamped by the database, and outlives its workspace
--   M2  new tables, functions and sequences in public are not granted to anon or authenticated by default; server-only
--       tables lose their API grants; every SECURITY DEFINER function has a fixed search_path
--   M4  a document row must point into its own workspace's folder and name its real uploader
--   M5  shared (workspace-less) agent skills are the team's unless published as global
--   M6  retention: purge_expired() daily, and owners can delete a document (the file and the row)
--   low monitor_key_ok compares digests; the documents bucket only takes PDFs, images and office files
-- The live table public.autopilot (applied outside these files) is left alone; see docs/MIGRATION_DRIFT.md.

/* ================================ H1: secrets follow their rows ================================ */

-- After a row is deleted, or its secret replaced, its vault secret is dropped, unless another row still holds it.
-- oauth_pending is the one exception: integrations "finish" claims a live pending row by deleting it and then hands
-- its secret to the new integration (or drops it itself on every failure), so a direct delete of a row that hasn't
-- expired keeps the secret. Expired rows, and rows deleted with their workspace (the workspace is already gone when
-- this runs after a cascade), drop it.
create or replace function public.drop_row_secret() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if tg_op = 'UPDATE' and new.secret_id is not distinct from old.secret_id then return null; end if;
  sid := old.secret_id;
  if sid is null then return null; end if;
  if tg_table_name = 'oauth_pending' and tg_op = 'DELETE' then
    if old.expires_at > now() and exists (select 1 from public.workspaces where id = old.workspace_id) then return null; end if;
  end if;
  if exists (select 1 from public.integrations where secret_id = sid)
     or exists (select 1 from public.agency_logins where secret_id = sid)
     or exists (select 1 from public.oauth_pending where secret_id = sid) then
    return null;
  end if;
  perform public.vault_drop(sid);
  return null;
end $$;
revoke execute on function public.drop_row_secret() from public, anon, authenticated;

drop trigger if exists integrations_drop_secret on public.integrations;
create trigger integrations_drop_secret after delete or update of secret_id on public.integrations
  for each row execute function public.drop_row_secret();
drop trigger if exists agency_logins_drop_secret on public.agency_logins;
create trigger agency_logins_drop_secret after delete or update of secret_id on public.agency_logins
  for each row execute function public.drop_row_secret();
drop trigger if exists oauth_pending_drop_secret on public.oauth_pending;
create trigger oauth_pending_drop_secret after delete or update of secret_id on public.oauth_pending
  for each row execute function public.drop_row_secret();

/* ================================ H2: a tamper-evident audit log ================================ */

-- No UPDATE, DELETE or TRUNCATE, whoever asks (service_role and the table owner included). There is no bypass: nothing
-- needs one today. A retention rule for audit rows would add one deliberately.
create or replace function public.audit_log_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'The audit log is append-only: % is not allowed.', lower(tg_op) using errcode = '42501';
end $$;
revoke execute on function public.audit_log_append_only() from public, anon, authenticated;

drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_append_only();

-- The time on a row is when the database wrote it, never what the writer says.
create or replace function public.audit_log_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.audit_log_stamp() from public, anon, authenticated;
drop trigger if exists audit_log_stamp on public.audit_log;
create trigger audit_log_stamp before insert on public.audit_log for each row execute function public.audit_log_stamp();

-- From the app, a member records only their own actions. The agent's, the team's and the agency's entries are written
-- by the server (service role) and by SECURITY DEFINER functions, never by a browser.
drop policy if exists "members log their own actions, team logs theirs" on public.audit_log;
drop policy if exists "members log their own actions" on public.audit_log;
create policy "members log their own actions" on public.audit_log for insert to authenticated
  with check (public.is_member(workspace_id) and actor = 'you' and actor_id = (select auth.uid()));
revoke update, delete, truncate on public.audit_log from anon, authenticated;

-- Audit rows outlive their workspace: the cascading foreign key goes (a SET NULL would be an UPDATE, which is blocked).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.audit_log'::regclass and contype = 'f' and confrelid = 'public.workspaces'::regclass
  loop
    execute format('alter table public.audit_log drop constraint %I', c.conname);
  end loop;
end $$;
comment on column public.audit_log.workspace_id is 'The workspace the entry is about. No foreign key: the trail outlives the workspace.';

/* ================================ M2: grants ================================ */

-- Supabase grants every new object in public to the API roles. From here on, each migration grants what it means to.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Server-only tables (RLS on, no policies): no API grants either.
revoke all on public.chat_events, public.page_stats, public.routine_runs from public, anon, authenticated;

-- Helpers that only SECURITY DEFINER functions call; nobody outside needs them.
revoke execute on function public.ai_rules(), public.is_blank_value(text), public.phone_consent_version() from public, anon;

-- autopilot_stamp is a trigger function on the live autopilot table (not in these files).
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p where p.proname = 'autopilot_stamp' and p.pronamespace = 'public'::regnamespace loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- The settings PIN functions ran with search_path "public, extensions", which leaves pg_temp searched first for tables.
-- Same bodies, every name qualified, search_path empty.
create or replace function public.pin_status() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'on', exists (select 1 from public.account_pins where user_id = auth.uid()),
    'unlocked_until', (select unlocked_until from public.account_pins where user_id = auth.uid() and unlocked_until > now()),
    'locked_until', (select locked_until from public.account_pins where user_id = auth.uid() and locked_until > now()));
$$;

create or replace function public.pin_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.account_pins where user_id = auth.uid() and (unlocked_until is null or unlocked_until <= now()));
$$;

create or replace function public.pin_check(p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.account_pins;
begin
  select * into r from public.account_pins where user_id = auth.uid() for update;
  if not found then return 'ok'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked:' || r.locked_until::text; end if;
  if r.pin_hash = extensions.crypt(coalesce(p_pin, ''), r.pin_hash) then
    update public.account_pins set fails = 0, locked_until = null, unlocked_until = now() + interval '15 minutes', updated_at = now() where user_id = auth.uid();
    return 'ok';
  end if;
  if r.fails + 1 >= 5 then
    update public.account_pins set fails = 0, locked_until = now() + interval '15 minutes', unlocked_until = null, updated_at = now() where user_id = auth.uid();
    return 'locked:' || (now() + interval '15 minutes')::text;
  end if;
  update public.account_pins set fails = r.fails + 1, updated_at = now() where user_id = auth.uid();
  return 'wrong:' || (4 - r.fails)::text;
end $$;

create or replace function public.pin_unlock(p_pin text) returns json
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  c := public.pin_check(p_pin);
  if c <> 'ok' then return public.pin_refusal(c); end if;
  return public.pin_status();
end $$;

create or replace function public.pin_set(p_pin text, p_current text default null) returns json
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_pin !~ '^[0-9]{6}$' then raise exception 'pin_format'; end if;
  if exists (select 1 from public.account_pins where user_id = auth.uid()) then
    c := public.pin_check(p_current);
    if c <> 'ok' then return public.pin_refusal(c); end if;
  end if;
  insert into public.account_pins (user_id, pin_hash, unlocked_until)
  values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), now() + interval '15 minutes')
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, fails = 0, locked_until = null, unlocked_until = excluded.unlocked_until, updated_at = now();
  return public.pin_status();
end $$;

create or replace function public.pin_clear(p_pin text) returns json
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  c := public.pin_check(p_pin);
  if c <> 'ok' then return public.pin_refusal(c); end if;
  delete from public.account_pins where user_id = auth.uid();
  return public.pin_status();
end $$;

create or replace function public.pin_lock() returns json
language sql security definer set search_path = '' as $$
  update public.account_pins set unlocked_until = null, updated_at = now() where user_id = auth.uid();
  select public.pin_status();
$$;

-- Any other SECURITY DEFINER function in public without a search_path (none in these files; this catches ones added
-- outside them) gets one with pg_temp last, which keeps unqualified names working.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f);
  end loop;
end $$;

/* ================================ M4: adding documents ================================ */

alter table public.documents alter column uploaded_by set default auth.uid();
drop policy if exists "members and team add documents" on public.documents;
create policy "members and team add documents" on public.documents for insert to authenticated
  with check (
    ((public.is_member(workspace_id) and source in ('customer', 'agent')) or public.is_staff())
    and length(path) > 37 and left(path, 37) = workspace_id::text || '/'
    and uploaded_by = (select auth.uid())
  );

/* ================================ M5: shared agent skills ================================ */

-- Skills recorded without a workspace hold the steps of real customers' portal runs. They're the team's (the filer
-- worker reads and writes them with the service role); members see them only once the team publishes one as global.
alter table public.agent_skills add column if not exists published boolean not null default false;
comment on column public.agent_skills.published is 'A shared skill (no workspace) every signed-in member may read. Set by the team only.';
drop policy if exists "members read their skills and shared ones" on public.agent_skills;
drop policy if exists "members read their skills, published ones" on public.agent_skills;
create policy "members read their skills, published ones" on public.agent_skills for select to authenticated
  using (public.is_member(workspace_id) or public.is_staff() or (workspace_id is null and published));

/* ================================ M6: retention ================================ */

-- Chat event ids 30 days, page counters untouched for 400 days, finished runs' transcripts (the model conversation,
-- steps and draft; the prompt and the reply stay) after 365 days, routine claims 180 days, pending OAuth rows 1 day.
create or replace function public.purge_expired() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_chat int; n_pages int; n_runs int; n_routines int; n_pending int := 0; r record;
begin
  delete from public.chat_events where at < now() - interval '30 days';
  get diagnostics n_chat = row_count;
  delete from public.page_stats where updated_at < now() - interval '400 days';
  get diagnostics n_pages = row_count;
  update public.agent_runs set state = null, steps = '[]'::jsonb, draft = null
   where status in ('done', 'failed', 'stopped') and updated_at < now() - interval '365 days'
     and (state is not null or steps <> '[]'::jsonb or draft is not null);
  get diagnostics n_runs = row_count;
  delete from public.routine_runs where created_at < now() - interval '180 days';
  get diagnostics n_routines = row_count;
  for r in delete from public.oauth_pending where created_at < now() - interval '1 day' returning secret_id loop
    n_pending := n_pending + 1;
    if not exists (select 1 from public.integrations where secret_id = r.secret_id)
       and not exists (select 1 from public.agency_logins where secret_id = r.secret_id) then
      perform public.vault_drop(r.secret_id);
    end if;
  end loop;
  return jsonb_build_object('chat_events', n_chat, 'page_stats', n_pages, 'agent_run_transcripts', n_runs,
                            'routine_runs', n_routines, 'oauth_pending', n_pending);
end $$;
revoke execute on function public.purge_expired() from public, anon, authenticated;
grant execute on function public.purge_expired() to service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; old rows are not purged on a schedule.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-purge';
  perform cron.schedule('placetta-purge', '23 9 * * *', 'select public.purge_expired()');
end $$;

-- Owners delete a document: the app removes the file through the Storage API (which deletes the object itself, not
-- just its row), then the documents row. Neither is allowed while an open filing still uses the file.
create or replace function public.document_in_use(ws uuid, p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.filings f
     where f.workspace_id = ws and f.status in ('requested', 'in_progress', 'needs_info')
       and (f.receipt_path = p_path or strpos(f.payload::text, p_path) > 0)
  );
$$;

create or replace function public.can_delete_file(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
     where m.user_id = auth.uid() and m.role = 'owner' and m.workspace_id::text = (storage.foldername(object_name))[1]
       and not public.document_in_use(m.workspace_id, object_name)
  ) and public.mfa_ok();
$$;
revoke execute on function public.document_in_use(uuid, text), public.can_delete_file(text) from public, anon;
grant execute on function public.document_in_use(uuid, text), public.can_delete_file(text) to authenticated;

drop policy if exists "placetta: owners delete workspace files" on storage.objects;
create policy "placetta: owners delete workspace files" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.can_delete_file(name));

drop policy if exists "owners delete documents" on public.documents;
create policy "owners delete documents" on public.documents for delete to authenticated
  using (public.is_owner(workspace_id) and not public.document_in_use(workspace_id, path));
grant delete on public.documents to authenticated;

-- A deleted document leaves a line in the audit trail (a person's delete; workspace cascades don't).
create or replace function public.documents_deleted_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and exists (select 1 from public.workspaces where id = old.workspace_id) then
    insert into public.audit_log (workspace_id, actor, actor_id, action, object)
    values (old.workspace_id, 'you', auth.uid(), '{"en": "Deleted a document", "zh": "删除了文件"}'::jsonb,
            jsonb_build_object('en', old.name, 'zh', old.name));
  end if;
  return null;
end $$;
revoke execute on function public.documents_deleted_audit() from public, anon, authenticated;
drop trigger if exists documents_deleted_audit on public.documents;
create trigger documents_deleted_audit after delete on public.documents for each row execute function public.documents_deleted_audit();

/* ================================ lows ================================ */

-- The monitor key check compares SHA-256 digests, so the time it takes says nothing about how much of the key matched.
create or replace function public.monitor_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select length(p_key) >= 32
       and extensions.digest(p_key, 'sha256') = extensions.digest(s.decrypted_secret, 'sha256')
      from vault.decrypted_secrets s where s.name = 'monitor_key' limit 1), false);
$$;
revoke execute on function public.monitor_key_ok(text) from public, anon, authenticated;
grant execute on function public.monitor_key_ok(text) to service_role;

-- The documents bucket: PDFs, photos and office files, up to 50 MB. No SVG or HTML (they can carry script).
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets set file_size_limit = 52428800, allowed_mime_types = array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/tiff',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
      'text/plain', 'text/csv'
    ] where id = 'documents';
  else
    update storage.buckets set file_size_limit = 52428800 where id = 'documents';
    raise notice 'storage.buckets has no allowed_mime_types column; only the size limit was set.';
  end if;
end $$;
