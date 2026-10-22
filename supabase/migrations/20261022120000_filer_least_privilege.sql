-- The portal filer (worker/filer) without the service role key. Until now it used the service role, which bypasses
-- every row-level security rule and can read every table. Here it gets its own database role, placetta_filer, with
-- no table grants at all, and a fixed set of functions that do exactly what the worker needs, each limited to the
-- filings handed to it. Opening a saved agency login now writes the audit entry first and only then reads the
-- password, in one transaction: if the audit entry can't be written, no password leaves the database.
--
-- Safe to run twice. Not applied to the live database by this commit: docs/soc2/runbooks/filer-least-privilege.md has
-- the order (this migration, then the filer, then the role's key). Every function is also granted to service_role,
-- so the filer keeps working on the service key until the founder switches it to FILER_DB_KEY.
-- Controls: SOC 2 CC6.1, CC6.3; ISO/IEC 27001:2022 A.8.2, A.8.18; FedRAMP AC-6. Tests: supabase/tests/filer_role.sql.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    create role placetta_filer nologin noinherit;
  end if;
  -- PostgREST signs in as authenticator and switches to the role named in the request's key.
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'grant placetta_filer to authenticator';
  end if;
end $$;

grant usage on schema public to placetta_filer;
-- No table, view or sequence in public is readable or writable by the role directly, now or later.
revoke all on all tables in schema public from placetta_filer;
revoke all on all sequences in schema public from placetta_filer;

-- The filing the worker is on, with the columns it uses. Only filings that were handed to the portal agent.
create or replace function public.filer_filing(p_id uuid)
returns table (id uuid, workspace_id uuid, app_id text, title jsonb, status text, payload jsonb, channel text, agent_state text,
  agent_log jsonb, handoff_url text, submit_clicked_at timestamptz, attempts int, confirmation_number text)
language sql stable security definer set search_path = '' as $$
  select f.id, f.workspace_id, f.app_id, f.title, f.status, f.payload, f.channel, f.agent_state, f.agent_log, f.handoff_url,
         f.submit_clicked_at, f.attempts, f.confirmation_number
  from public.filings f where f.id = p_id and f.agent_state is not null
$$;

-- The saved logins of the workspace whose filing the worker is running: names and addresses, never the password.
create or replace function public.filer_logins(p_filing uuid)
returns table (id uuid, agency text, url text, username text)
language sql stable security definer set search_path = '' as $$
  select l.id, l.agency, l.url, l.username
  from public.agency_logins l join public.filings f on f.workspace_id = l.workspace_id
  where f.id = p_filing and f.agent_state = 'running'
  order by l.created_at
$$;

-- Open one saved login for a running filing: the audit entry first, then the time it was opened, then the password.
create or replace function public.filer_open_login(p_filing uuid, p_login uuid)
returns table (username text, password text)
language plpgsql security definer set search_path = '' as $$
declare f public.filings; l public.agency_logins; pw text;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is distinct from 'running' then raise exception 'filing_not_running'; end if;
  select * into l from public.agency_logins where id = p_login and workspace_id = f.workspace_id;
  if l.id is null then raise exception 'login_not_in_workspace'; end if;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object)
    values (f.workspace_id, 'agent', null,
            jsonb_build_object('en', 'Placetta opened the saved login for ' || l.agency, 'zh', '快哉打开了 ' || l.agency || ' 的已保存登录'),
            f.title);
  update public.agency_logins set last_opened_at = now(), last_opened_by = null where id = l.id;
  pw := public.vault_get(l.secret_id);
  if pw is null then raise exception 'login_unreadable'; end if;
  return query select l.username, pw;
end $$;

-- Recorded portal steps shared by every workspace (workspace_id null); a workspace's own skills stay out of reach.
create or replace function public.filer_skill(p_key text) returns setof public.agent_skills
language sql stable security definer set search_path = '' as $$
  select * from public.agent_skills where workspace_id is null and key = p_key
$$;

create or replace function public.filer_save_skill(p_key text, p_name text, p_body jsonb, p_uses int, p_last_seconds int, p_best_seconds int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.agent_skills set kind = 'portal', name = p_name, description = 'Recorded from a submitted filing', body = p_body,
    source = 'agent', enabled = true, uses = p_uses, fails_in_a_row = 0, last_seconds = p_last_seconds, best_seconds = p_best_seconds,
    updated_at = now()
  where workspace_id is null and key = p_key;
  if not found then
    insert into public.agent_skills (workspace_id, key, kind, name, description, body, source, enabled, uses, fails_in_a_row, last_seconds, best_seconds)
    values (null, p_key, 'portal', p_name, 'Recorded from a submitted filing', p_body, 'agent', true, p_uses, 0, p_last_seconds, p_best_seconds);
  end if;
end $$;

-- One more failed replay; the third in a row switches the skill off. Returns whether it is now off.
create or replace function public.filer_skill_failed(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.agent_skills set fails_in_a_row = fails_in_a_row + 1, enabled = (fails_in_a_row + 1) < 3
  where workspace_id is null and key = p_key returning fails_in_a_row into n;
  return coalesce(n, 0) >= 3;
end $$;

-- How many times this form went out through Placetta's own channels, across workspaces: a count, nothing else.
create or replace function public.filer_self_filed(p_official text) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.filings
  where payload ->> 'official' = p_official and channel in ('email', 'fax', 'mail', 'portal') and status in ('submitted', 'accepted')
$$;

-- A receipt or screenshot the worker stored for a filing it was given, listed in the workspace's Documents.
create or replace function public.filer_save_doc(p_filing uuid, p_name text, p_path text, p_size bigint, p_mime text) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.filings;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is null then raise exception 'filing_not_given_to_agent'; end if;
  if p_path not like f.workspace_id::text || '/receipts/' || f.id::text || '-%' then raise exception 'path_outside_filing'; end if;
  insert into public.documents (workspace_id, app_id, filing_id, name, path, size, mime, source, uploaded_by)
  values (f.workspace_id, f.app_id, f.id, p_name, p_path, p_size, p_mime, 'agent', null);
end $$;

-- A task for the Placetta team, once per dedupe key; with a filing, only one the worker was given.
create or replace function public.filer_team_task(p_filing uuid, p_kind text, p_title text, p_detail jsonb, p_dedupe text) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if p_filing is not null then
    select workspace_id into ws from public.filings where id = p_filing and agent_state is not null;
    if ws is null then raise exception 'filing_not_given_to_agent'; end if;
  end if;
  insert into public.team_tasks (kind, filing_id, workspace_id, title, detail, dedupe)
  values (p_kind, p_filing, ws, p_title, p_detail, p_dedupe) on conflict (dedupe) do nothing;
end $$;

-- An update in the workspace's feed about a filing the worker was given, once per dedupe key.
create or replace function public.filer_notify(p_filing uuid, p_title jsonb, p_body jsonb, p_dedupe text) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.filings;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is null then raise exception 'filing_not_given_to_agent'; end if;
  insert into public.updates (workspace_id, kind, app_id, title, body, dedupe)
  values (f.workspace_id, 'filing', f.app_id, p_title, p_body, p_dedupe) on conflict (workspace_id, dedupe) do nothing;
end $$;

revoke execute on function public.filer_filing(uuid), public.filer_logins(uuid), public.filer_open_login(uuid, uuid),
  public.filer_skill(text), public.filer_save_skill(text, text, jsonb, int, int, int), public.filer_skill_failed(text),
  public.filer_self_filed(text), public.filer_save_doc(uuid, text, text, bigint, text),
  public.filer_team_task(uuid, text, text, jsonb, text), public.filer_notify(uuid, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.filer_filing(uuid), public.filer_logins(uuid), public.filer_open_login(uuid, uuid),
  public.filer_skill(text), public.filer_save_skill(text, text, jsonb, int, int, int), public.filer_skill_failed(text),
  public.filer_self_filed(text), public.filer_save_doc(uuid, text, text, bigint, text),
  public.filer_team_task(uuid, text, text, jsonb, text), public.filer_notify(uuid, jsonb, jsonb, text)
  to placetta_filer, service_role;
-- The queue functions the worker already used.
grant execute on function public.claim_agent_filing(), public.take_held_filing(uuid), public.filing_agent_step(uuid, jsonb, jsonb, boolean)
  to placetta_filer;

-- For the storage policies below, which run as the filer and so can't read filings themselves: does this workspace
-- (a storage folder name) have a filing the agent is running (p_running) or was ever given?
create or replace function public.filer_folder_ok(p_folder text, p_running boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.filings f
    where f.workspace_id::text = p_folder and (case when p_running then f.agent_state = 'running' else f.agent_state is not null end))
$$;
revoke execute on function public.filer_folder_ok(text, boolean) from public, anon, authenticated;
grant execute on function public.filer_folder_ok(text, boolean) to placetta_filer, service_role;

-- Files: the role reads and adds files only in the documents bucket, only under a workspace with a filing the worker
-- is running, and adds only receipts and proof screenshots. Storage belongs to Supabase's own schema, so if this
-- project doesn't let the migration grant on it, the notice says so and the filer keeps using the service key for
-- files (the runbook's step 4 checks which).
do $$ begin
  -- Storage's server switches to the role named in the request's key, like PostgREST.
  if exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then
    execute 'grant placetta_filer to supabase_storage_admin';
  end if;
  execute 'grant usage on schema storage to placetta_filer';
  execute 'grant select, insert, delete on storage.objects to placetta_filer';
  execute 'drop policy if exists "filer reads files of running filings" on storage.objects';
  execute $p$create policy "filer reads files of running filings" on storage.objects for select to placetta_filer
    using (bucket_id = 'documents' and public.filer_folder_ok((storage.foldername(name))[1], true))$p$;
  execute 'drop policy if exists "filer adds receipts and proof" on storage.objects';
  execute $p$create policy "filer adds receipts and proof" on storage.objects for insert to placetta_filer
    with check (bucket_id = 'documents' and (storage.foldername(name))[2] in ('receipts', 'proof')
      and public.filer_folder_ok((storage.foldername(name))[1], false))$p$;
  execute 'drop policy if exists "filer removes a receipt it could not list" on storage.objects';
  execute $p$create policy "filer removes a receipt it could not list" on storage.objects for delete to placetta_filer
    using (bucket_id = 'documents' and (storage.foldername(name))[2] = 'receipts' and public.filer_folder_ok((storage.foldername(name))[1], false))$p$;
exception when insufficient_privilege then
  raise notice 'storage grants for placetta_filer were refused (%); the filer keeps the service key for files', sqlerrm;
end $$;
