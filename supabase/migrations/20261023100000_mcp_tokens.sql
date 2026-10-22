-- Placetta's own MCP server (supabase/functions/mcp): workspace tokens for Claude, ChatGPT and other AI assistants.
--   mcp_tokens: one row per token. Only the SHA-256 of a token is kept; the token itself is shown once, when it is made.
--     Each token reads one workspace, with the scopes it was given (status, deadlines, readiness, plan, filings), and
--     can be revoked at any time. Nobody reads the table directly.
--   mcp_token_create / mcp_token_list / mcp_token_revoke: owners and admins of the workspace (with two-step sign-in when
--     it's on for them). Making and revoking a token go in the audit trail.
--   mcp_token_auth(hash): the mcp function (service role) only. A token works while it is live and while the person who
--     made it is still an owner or admin of that workspace: remove them or lower their role and their tokens stop.
--   Every call the server answers is logged in agent_tool_calls (tool "mcp:<method or tool>"), next to Odelia's own.
-- Safe to run twice.

create table if not exists public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  label text not null default 'AI assistant' check (length(label) between 1 and 60),
  prefix text not null unique check (prefix ~ '^[0-9a-f]{8}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default array['status', 'deadlines', 'readiness', 'plan', 'filings']
    check (cardinality(scopes) between 1 and 5 and scopes <@ array['status', 'deadlines', 'readiness', 'plan', 'filings']),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
comment on table public.mcp_tokens is 'Tokens for Placetta''s MCP server, one workspace each. Only the SHA-256 of each token is kept; the token is shown once.';
create index if not exists mcp_tokens_workspace on public.mcp_tokens(workspace_id) where revoked_at is null;
alter table public.mcp_tokens enable row level security;
revoke all on public.mcp_tokens from public, anon, authenticated;

create or replace function public.mcp_token_create(ws uuid, p_label text default null, p_scopes text[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre text; k text; kid uuid; sc text[]; lab text;
begin
  if not public.is_admin(ws) or not public.mfa_ok() then raise exception 'Only an owner or admin of this workspace can make an AI assistant token.'; end if;
  sc := coalesce(p_scopes, array['status', 'deadlines', 'readiness', 'plan', 'filings']);
  if cardinality(sc) = 0 or not (sc <@ array['status', 'deadlines', 'readiness', 'plan', 'filings']) then raise exception 'Unknown scope.'; end if;
  if (select count(*) from public.mcp_tokens where workspace_id = ws and revoked_at is null) >= 10 then
    raise exception 'Up to 10 AI assistant tokens at a time. Revoke one first.';
  end if;
  loop
    pre := encode(extensions.gen_random_bytes(4), 'hex');
    exit when not exists (select 1 from public.mcp_tokens where prefix = pre);
  end loop;
  k := 'plc_mcp_' || pre || '_' || encode(extensions.gen_random_bytes(24), 'hex');
  lab := coalesce(nullif(left(trim(coalesce(p_label, '')), 60), ''), 'AI assistant');
  insert into public.mcp_tokens(workspace_id, created_by, label, prefix, token_hash, scopes)
  values (ws, auth.uid(), lab, pre, encode(extensions.digest(k, 'sha256'), 'hex'), (select array_agg(distinct s order by s) from unnest(sc) s))
  returning id into kid;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (ws, 'you', auth.uid(), jsonb_build_object('en', 'Made an AI assistant token', 'zh', '创建了 AI 助手令牌'), jsonb_build_object('en', lab || ' (plc_mcp_' || pre || ')', 'zh', lab || '（plc_mcp_' || pre || '）'));
  return jsonb_build_object('id', kid, 'prefix', pre, 'token', k);
end $$;

create or replace function public.mcp_token_list(ws uuid) returns table (id uuid, label text, prefix text, scopes text[], created_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(ws) or not public.mfa_ok() then raise exception 'Only an owner or admin of this workspace can see its AI assistant tokens.'; end if;
  return query select t.id, t.label, t.prefix, t.scopes, t.created_at, t.last_used_at, t.revoked_at
    from public.mcp_tokens t where t.workspace_id = ws order by t.revoked_at nulls first, t.created_at desc limit 50;
end $$;

create or replace function public.mcp_token_revoke(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.mcp_tokens;
begin
  select * into t from public.mcp_tokens where id = p_id;
  if t.id is null or not public.is_admin(t.workspace_id) or not public.mfa_ok() then raise exception 'No such token.'; end if;
  if t.revoked_at is not null then return; end if;
  update public.mcp_tokens set revoked_at = now() where id = p_id;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (t.workspace_id, 'you', auth.uid(), jsonb_build_object('en', 'Revoked an AI assistant token', 'zh', '撤销了 AI 助手令牌'), jsonb_build_object('en', t.label || ' (plc_mcp_' || t.prefix || ')', 'zh', t.label || '（plc_mcp_' || t.prefix || '）'));
end $$;

-- The mcp function, with the service key: the token a hash belongs to, while it is live and its maker is still an owner
-- or admin of its workspace. Last use is noted at most once a minute.
create or replace function public.mcp_token_auth(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.mcp_tokens; r text;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into t from public.mcp_tokens where token_hash = p_hash and revoked_at is null;
  if t.id is null then return null; end if;
  r := public.agent_actor_role(t.workspace_id, t.created_by);
  if r not in ('owner', 'admin') then return null; end if;
  if t.last_used_at is null or t.last_used_at < now() - interval '1 minute' then
    update public.mcp_tokens set last_used_at = now() where id = t.id;
  end if;
  return jsonb_build_object('token_id', t.id, 'prefix', t.prefix, 'workspace_id', t.workspace_id, 'scopes', to_jsonb(t.scopes), 'actor_id', t.created_by, 'role', r);
end $$;

revoke execute on function public.mcp_token_create(uuid, text, text[]), public.mcp_token_list(uuid), public.mcp_token_revoke(uuid), public.mcp_token_auth(text) from public, anon;
grant execute on function public.mcp_token_create(uuid, text, text[]), public.mcp_token_list(uuid), public.mcp_token_revoke(uuid) to authenticated;
revoke execute on function public.mcp_token_auth(text) from authenticated;
grant execute on function public.mcp_token_auth(text) to service_role;
