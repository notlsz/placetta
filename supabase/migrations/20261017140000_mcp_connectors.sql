-- Connect any app: a business's own remote MCP servers, for Odelia (supabase/functions/integrations/mcp.ts).
--   mcp_servers   one row per connected server: its address, the tools it listed (with whether each only reads), the
--                 tools an owner switched off, and its sign-in in the vault (secret_id). Owners connect and disconnect.
--   mcp_calls     a call Odelia proposed to a tool that changes something. It runs once, after an owner approves it in
--                 the app: mcp_claim_call moves it from waiting to running in one statement only one caller can win.
--   oauth_pending also holds an MCP sign-in in progress (kind 'mcp'): the PKCE verifier in the vault until the code
--                 comes back, then the tokens until the app finishes.
-- Vault secrets go with the rows that hold them, as for integrations (drop_row_secret), and expired calls are tidied
-- by purge_expired. Everything here is for the server only: no customer role can read or write these tables.
-- Safe to run twice.

create table if not exists public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- the short name its tools go under for Odelia: mcp__<slug>__<tool>
  slug text not null check (slug ~ '^[a-z][a-z0-9]{0,15}$'),
  name text not null check (length(name) between 1 and 80),
  url text not null check (url ~ '^https://' and length(url) <= 500),
  catalog_id text check (catalog_id is null or catalog_id ~ '^[a-z0-9_]{1,40}$'),
  auth text not null check (auth in ('none', 'bearer', 'oauth')),
  secret_id uuid,
  status text not null default 'connected' check (status in ('connected', 'error')),
  error text,
  tools jsonb not null default '[]'::jsonb check (jsonb_typeof(tools) = 'array'),
  disabled text[] not null default '{}',
  protocol text,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  listed_at timestamptz,
  last_used_at timestamptz,
  unique (workspace_id, slug),
  unique (workspace_id, url),
  check (auth = 'none' or secret_id is not null)
);
comment on table public.mcp_servers is 'Apps a workspace connected through their own MCP servers, for Odelia. Tokens in the vault. Server only.';
create index if not exists mcp_servers_connected_by on public.mcp_servers(connected_by);
alter table public.mcp_servers enable row level security;
revoke all on public.mcp_servers from public, anon, authenticated;

create table if not exists public.mcp_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  server_id uuid not null references public.mcp_servers(id) on delete cascade,
  tool text not null check (length(tool) between 1 and 128),
  arguments jsonb not null default '{}'::jsonb check (jsonb_typeof(arguments) = 'object' and octet_length(arguments::text) <= 20000),
  proposed_by uuid references auth.users(id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'running', 'done', 'failed', 'declined', 'expired')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  finished_at timestamptz,
  -- how it went, in a few words (the app's answer itself is never stored)
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
comment on table public.mcp_calls is 'Calls to a connected app''s tools that change something, waiting for an owner''s approval; each runs at most once. Server only.';
create index if not exists mcp_calls_waiting on public.mcp_calls(workspace_id) where status = 'waiting';
create index if not exists mcp_calls_server on public.mcp_calls(server_id);
alter table public.mcp_calls enable row level security;
revoke all on public.mcp_calls from public, anon, authenticated;

-- A proposed call, claimed to run: only by an owner of its workspace, only while it waits and hasn't expired, and only
-- once (the update below is the claim; a second caller finds it running and gets null).
create or replace function public.mcp_claim_call(p_id uuid, p_ws uuid, p_uid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.mcp_calls;
begin
  if not exists (select 1 from public.workspace_members where workspace_id = p_ws and user_id = p_uid and role = 'owner') then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  update public.mcp_calls set status = 'expired' where workspace_id = p_ws and status = 'waiting' and expires_at <= now();
  update public.mcp_calls set status = 'running', decided_by = p_uid, decided_at = now()
   where id = p_id and workspace_id = p_ws and status = 'waiting' and expires_at > now()
  returning * into r;
  if not found then return null; end if;
  return jsonb_build_object('id', r.id, 'server_id', r.server_id, 'tool', r.tool, 'arguments', r.arguments);
end $$;
revoke execute on function public.mcp_claim_call(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.mcp_claim_call(uuid, uuid, uuid) to service_role;

-- An MCP sign-in waits on oauth_pending like any other.
alter table public.oauth_pending drop constraint if exists oauth_pending_kind_check;
alter table public.oauth_pending add constraint oauth_pending_kind_check
  check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'square', 'mcp'));

-- Secrets follow their rows (as in the security hardening): now mcp_servers too.
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
     or exists (select 1 from public.oauth_pending where secret_id = sid)
     or exists (select 1 from public.mcp_servers where secret_id = sid) then
    return null;
  end if;
  perform public.vault_drop(sid);
  return null;
end $$;
revoke execute on function public.drop_row_secret() from public, anon, authenticated;

drop trigger if exists mcp_servers_drop_secret on public.mcp_servers;
create trigger mcp_servers_drop_secret after delete or update of secret_id on public.mcp_servers
  for each row execute function public.drop_row_secret();

-- The daily tidy-up, as before, and: pending sign-ins keep a secret an MCP server now holds, calls nobody approved in
-- time expire, and finished calls go after 90 days.
create or replace function public.purge_expired() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_chat int; n_pages int; n_runs int; n_routines int; n_pending int := 0; n_calls int; r record;
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
       and not exists (select 1 from public.agency_logins where secret_id = r.secret_id)
       and not exists (select 1 from public.mcp_servers where secret_id = r.secret_id) then
      perform public.vault_drop(r.secret_id);
    end if;
  end loop;
  update public.mcp_calls set status = 'expired' where status = 'waiting' and expires_at <= now();
  delete from public.mcp_calls where status <> 'waiting' and created_at < now() - interval '90 days';
  get diagnostics n_calls = row_count;
  return jsonb_build_object('chat_events', n_chat, 'page_stats', n_pages, 'agent_run_transcripts', n_runs,
                            'routine_runs', n_routines, 'oauth_pending', n_pending, 'mcp_calls', n_calls);
end $$;
revoke execute on function public.purge_expired() from public, anon, authenticated;
grant execute on function public.purge_expired() to service_role;
