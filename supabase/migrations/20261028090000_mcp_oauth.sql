-- OAuth 2.1 for Placetta's MCP server (supabase/functions/mcp/oauth.ts), so Claude's connector directory and ChatGPT
-- apps can connect it: both directories take OAuth for a service that reads a person's account
-- (https://claude.com/docs/connectors/building/submission, https://developers.openai.com/apps-sdk/build/auth).
--   mcp_oauth_clients: assistants that registered themselves (RFC 7591 dynamic client registration). Public clients
--     only: no secret, PKCE with S256 on every sign-in. Redirect addresses are https, or a loopback address on any port
--     (Claude Code, RFC 8252).
--   mcp_oauth_codes: one-time codes, ten minutes, bound to the client, the redirect address, the PKCE challenge, the
--     workspace, the person and the scopes they allowed. Only the code's SHA-256 is kept.
--   mcp_tokens gains OAuth grants: the same row as a pasted token (so Settings lists it and Revoke stops it), with an
--     access token that lasts an hour and a refresh token that lasts 90 days and changes on every use. A refresh token
--     used twice revokes the grant (OAuth 2.1 refresh token rotation). A code used twice revokes what it was traded for.
--   mcp_oauth_approve: the person, signed in to Placetta, allows an assistant to read one workspace. Owners and admins
--     only, as for pasted tokens. It goes in the audit trail.
--   The token and refresh functions are the mcp function's (service role) only.
-- Safe to run twice.

create table if not exists public.mcp_oauth_clients (
  client_id text primary key check (client_id ~ '^plc_client_[0-9a-f]{32}$'),
  name text not null check (length(name) between 1 and 100),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
comment on table public.mcp_oauth_clients is 'AI assistants registered with Placetta''s MCP sign-in (RFC 7591). Public clients, PKCE only.';
alter table public.mcp_oauth_clients enable row level security;
revoke all on public.mcp_oauth_clients from public, anon, authenticated;

create table if not exists public.mcp_oauth_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scopes text[] not null check (cardinality(scopes) between 1 and 5 and scopes <@ array['status', 'deadlines', 'readiness', 'plan', 'filings']),
  redirect_uri text not null,
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  resource text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz
);
alter table public.mcp_oauth_codes enable row level security;
revoke all on public.mcp_oauth_codes from public, anon, authenticated;

alter table public.mcp_tokens add column if not exists client_id text references public.mcp_oauth_clients(client_id) on delete cascade;
alter table public.mcp_tokens add column if not exists expires_at timestamptz;
alter table public.mcp_tokens add column if not exists refresh_hash text;
alter table public.mcp_tokens add column if not exists refresh_prev_hash text;
alter table public.mcp_tokens add column if not exists refresh_expires_at timestamptz;
alter table public.mcp_tokens add column if not exists from_code text;
create unique index if not exists mcp_tokens_refresh on public.mcp_tokens(refresh_hash) where refresh_hash is not null;
create index if not exists mcp_tokens_refresh_prev on public.mcp_tokens(refresh_prev_hash) where refresh_prev_hash is not null;
create index if not exists mcp_tokens_from_code on public.mcp_tokens(from_code) where from_code is not null;

/** A redirect address an assistant may register: https with a host and no fragment, or http on a loopback host. */
create or replace function public.mcp_oauth_redirect_ok(u text) returns boolean
language sql immutable set search_path = '' as $$
  select u is not null and length(u) <= 500 and position('#' in u) = 0 and (
    u ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^\s]*)?$'
    or u ~ '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?(/[^\s]*)?$')
$$;

/** Whether an asked-for redirect matches a registered one: exactly, or for a loopback address with any port (RFC 8252
 *  7.3, and what Claude Code needs for localhost as well). */
create or replace function public.mcp_oauth_redirect_matches(registered text[], asked text) returns boolean
language sql immutable set search_path = '' as $$
  select asked is not null and exists (
    select 1 from unnest(registered) r
    where r = asked
      or (r ~ '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?/'
          and asked ~ '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?/'
          and regexp_replace(r, '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?', 'http://\1') = regexp_replace(asked, '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?', 'http://\1')))
$$;

-- Dynamic client registration (the mcp function, service role). Clients nobody used in 30 days are dropped.
create or replace function public.mcp_oauth_register(p_name text, p_redirects text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cid text; nm text; r text;
begin
  if p_redirects is null or cardinality(p_redirects) not between 1 and 5 then raise exception 'invalid_redirect_uri'; end if;
  foreach r in array p_redirects loop
    if not public.mcp_oauth_redirect_ok(r) then raise exception 'invalid_redirect_uri'; end if;
  end loop;
  nm := coalesce(nullif(left(regexp_replace(trim(coalesce(p_name, '')), '[[:cntrl:]]', '', 'g'), 100), ''), 'AI assistant');
  delete from public.mcp_oauth_clients c where c.last_used_at is null and c.created_at < now() - interval '30 days'
    and not exists (select 1 from public.mcp_tokens t where t.client_id = c.client_id);
  cid := 'plc_client_' || encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.mcp_oauth_clients(client_id, name, redirect_uris) values (cid, nm, (select array_agg(distinct x) from unnest(p_redirects) x));
  return jsonb_build_object('client_id', cid, 'client_name', nm, 'redirect_uris', to_jsonb((select array_agg(distinct x) from unnest(p_redirects) x)));
end $$;

-- What the consent screen shows: the assistant's name, and whether this redirect address is one it registered.
create or replace function public.mcp_oauth_client(p_client_id text, p_redirect text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', c.name, 'redirect_ok', public.mcp_oauth_redirect_matches(c.redirect_uris, p_redirect))
  from public.mcp_oauth_clients c where c.client_id = p_client_id
$$;

-- The person allows the assistant to read one workspace with these scopes: a one-time code for its redirect.
create or replace function public.mcp_oauth_approve(ws uuid, p_client_id text, p_redirect text, p_scopes text[], p_challenge text, p_resource text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare c public.mcp_oauth_clients; code text; sc text[];
begin
  if not public.is_admin(ws) or not public.mfa_ok() then raise exception 'Only an owner or admin of this workspace can connect an AI assistant to it.'; end if;
  select * into c from public.mcp_oauth_clients where client_id = p_client_id;
  if c.client_id is null or not public.mcp_oauth_redirect_matches(c.redirect_uris, p_redirect) then raise exception 'That assistant isn''t registered for this address.'; end if;
  if p_challenge is null or p_challenge !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'The sign-in request has no valid PKCE challenge.'; end if;
  sc := coalesce(p_scopes, array['status', 'deadlines', 'readiness', 'plan', 'filings']);
  if cardinality(sc) = 0 or not (sc <@ array['status', 'deadlines', 'readiness', 'plan', 'filings']) then raise exception 'Unknown scope.'; end if;
  code := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.mcp_oauth_codes(code_hash, client_id, workspace_id, user_id, scopes, redirect_uri, code_challenge, resource)
  values (encode(extensions.digest(code, 'sha256'), 'hex'), c.client_id, ws, auth.uid(), (select array_agg(distinct s order by s) from unnest(sc) s), p_redirect, p_challenge, nullif(left(coalesce(p_resource, ''), 300), ''));
  delete from public.mcp_oauth_codes where expires_at < now() - interval '1 day';
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (ws, 'you', auth.uid(), jsonb_build_object('en', 'Connected an AI assistant', 'zh', '连接了 AI 助手'),
    jsonb_build_object('en', c.name || ': ' || array_to_string(sc, ', '), 'zh', c.name || '：' || array_to_string(sc, '、')));
  return code;
end $$;

-- New access and refresh tokens for a grant row (same prefix, so the audit trail still reads as one connection).
create or replace function public.mcp_oauth_issue(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.mcp_tokens; acc text; ref text;
begin
  select * into t from public.mcp_tokens where id = p_id;
  acc := 'plc_mcp_' || t.prefix || '_' || encode(extensions.gen_random_bytes(24), 'hex');
  ref := 'plc_mrt_' || encode(extensions.gen_random_bytes(32), 'hex');
  update public.mcp_tokens set token_hash = encode(extensions.digest(acc, 'sha256'), 'hex'), refresh_prev_hash = refresh_hash,
    refresh_hash = encode(extensions.digest(ref, 'sha256'), 'hex'), expires_at = now() + interval '1 hour', refresh_expires_at = now() + interval '90 days'
  where id = p_id;
  return jsonb_build_object('access_token', acc, 'token_type', 'Bearer', 'expires_in', 3600, 'refresh_token', ref, 'scope', array_to_string(t.scopes, ' '));
end $$;

-- The token endpoint, authorization_code (the mcp function, service role). p_challenge is the S256 of the verifier the
-- assistant sent; a code is good once, for ten minutes, for the client and redirect it was made for.
create or replace function public.mcp_oauth_exchange(p_code_hash text, p_client_id text, p_redirect text, p_challenge text, p_resource text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k public.mcp_oauth_codes; c public.mcp_oauth_clients; pre text; kid uuid; r text;
begin
  select * into k from public.mcp_oauth_codes where code_hash = p_code_hash for update;
  if k.code_hash is null then return jsonb_build_object('error', 'invalid_grant'); end if;
  if k.used_at is not null then
    -- a code traded twice: someone else may hold it, so what it gave is revoked
    update public.mcp_tokens set revoked_at = now() where from_code = p_code_hash and revoked_at is null;
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  update public.mcp_oauth_codes set used_at = now() where code_hash = p_code_hash;
  if k.expires_at < now() or k.client_id <> p_client_id or k.redirect_uri <> coalesce(p_redirect, '') or k.code_challenge <> coalesce(p_challenge, '')
     or (p_resource is not null and k.resource is not null and rtrim(p_resource, '/') <> rtrim(k.resource, '/')) then
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  r := public.agent_actor_role(k.workspace_id, k.user_id);
  if r not in ('owner', 'admin') then return jsonb_build_object('error', 'invalid_grant'); end if;
  select * into c from public.mcp_oauth_clients where client_id = k.client_id;
  update public.mcp_oauth_clients set last_used_at = now() where client_id = k.client_id;
  -- one live grant per person, workspace and assistant name: connecting again replaces the last one; at most 25 a workspace
  update public.mcp_tokens t set revoked_at = now() from public.mcp_oauth_clients oc
    where t.client_id = oc.client_id and oc.name = c.name and t.workspace_id = k.workspace_id and t.created_by = k.user_id and t.revoked_at is null;
  update public.mcp_tokens set revoked_at = now() where id in (
    select id from public.mcp_tokens where workspace_id = k.workspace_id and client_id is not null and revoked_at is null order by created_at desc offset 24);
  loop
    pre := encode(extensions.gen_random_bytes(4), 'hex');
    exit when not exists (select 1 from public.mcp_tokens where prefix = pre);
  end loop;
  insert into public.mcp_tokens(workspace_id, created_by, label, prefix, token_hash, scopes, client_id, from_code)
  values (k.workspace_id, k.user_id, left(c.name, 60), pre, encode(extensions.gen_random_bytes(32), 'hex'), k.scopes, k.client_id, p_code_hash)
  returning id into kid;
  return public.mcp_oauth_issue(kid);
end $$;

-- The token endpoint, refresh_token (the mcp function, service role). The refresh token changes every time; an old one
-- used again means it leaked, so the grant is revoked.
create or replace function public.mcp_oauth_refresh(p_refresh_hash text, p_client_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.mcp_tokens; r text;
begin
  if p_refresh_hash is null or p_refresh_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error', 'invalid_grant'); end if;
  select * into t from public.mcp_tokens where refresh_hash = p_refresh_hash for update;
  if t.id is null then
    update public.mcp_tokens set revoked_at = now() where refresh_prev_hash = p_refresh_hash and revoked_at is null returning * into t;
    if t.id is not null then
      insert into public.audit_log(workspace_id, actor, actor_id, action, object)
      values (t.workspace_id, 'team', null, jsonb_build_object('en', 'Disconnected an AI assistant: an old sign-in was reused', 'zh', '已断开 AI 助手：旧的登录凭证被重复使用'),
        jsonb_build_object('en', t.label || ' (plc_mcp_' || t.prefix || ')', 'zh', t.label || '（plc_mcp_' || t.prefix || '）'));
    end if;
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  if t.revoked_at is not null or t.client_id is distinct from p_client_id or t.refresh_expires_at < now() then return jsonb_build_object('error', 'invalid_grant'); end if;
  r := public.agent_actor_role(t.workspace_id, t.created_by);
  if r not in ('owner', 'admin') then return jsonb_build_object('error', 'invalid_grant'); end if;
  update public.mcp_oauth_clients set last_used_at = now() where client_id = t.client_id;
  return public.mcp_oauth_issue(t.id);
end $$;

-- An access token from OAuth stops at its expiry; a pasted token has none. Otherwise as before.
create or replace function public.mcp_token_auth(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.mcp_tokens; r text;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into t from public.mcp_tokens where token_hash = p_hash and revoked_at is null and (expires_at is null or expires_at > now());
  if t.id is null then return null; end if;
  r := public.agent_actor_role(t.workspace_id, t.created_by);
  if r not in ('owner', 'admin') then return null; end if;
  if t.last_used_at is null or t.last_used_at < now() - interval '1 minute' then
    update public.mcp_tokens set last_used_at = now() where id = t.id;
  end if;
  return jsonb_build_object('token_id', t.id, 'prefix', t.prefix, 'workspace_id', t.workspace_id, 'scopes', to_jsonb(t.scopes), 'actor_id', t.created_by, 'role', r);
end $$;

-- Pasted tokens keep their limit of 10; OAuth grants don't count toward it (they have their own, above).
create or replace function public.mcp_token_create(ws uuid, p_label text default null, p_scopes text[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre text; k text; kid uuid; sc text[]; lab text;
begin
  if not public.is_admin(ws) or not public.mfa_ok() then raise exception 'Only an owner or admin of this workspace can make an AI assistant token.'; end if;
  sc := coalesce(p_scopes, array['status', 'deadlines', 'readiness', 'plan', 'filings']);
  if cardinality(sc) = 0 or not (sc <@ array['status', 'deadlines', 'readiness', 'plan', 'filings']) then raise exception 'Unknown scope.'; end if;
  if (select count(*) from public.mcp_tokens where workspace_id = ws and revoked_at is null and client_id is null) >= 10 then
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

-- The list says which rows are OAuth connections (signed in from the assistant) and which are pasted tokens.
drop function if exists public.mcp_token_list(uuid);
create function public.mcp_token_list(ws uuid) returns table (id uuid, label text, prefix text, scopes text[], created_at timestamptz, last_used_at timestamptz, revoked_at timestamptz, oauth boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(ws) or not public.mfa_ok() then raise exception 'Only an owner or admin of this workspace can see its AI assistant tokens.'; end if;
  return query select t.id, t.label, t.prefix, t.scopes, t.created_at, t.last_used_at, t.revoked_at, t.client_id is not null
    from public.mcp_tokens t where t.workspace_id = ws order by t.revoked_at nulls first, t.created_at desc limit 50;
end $$;

revoke execute on function public.mcp_oauth_register(text, text[]), public.mcp_oauth_client(text, text), public.mcp_oauth_approve(uuid, text, text, text[], text, text),
  public.mcp_oauth_issue(uuid), public.mcp_oauth_exchange(text, text, text, text, text), public.mcp_oauth_refresh(text, text),
  public.mcp_token_create(uuid, text, text[]), public.mcp_token_list(uuid), public.mcp_token_auth(text) from public, anon;
revoke execute on function public.mcp_oauth_register(text, text[]), public.mcp_oauth_issue(uuid), public.mcp_oauth_exchange(text, text, text, text, text),
  public.mcp_oauth_refresh(text, text), public.mcp_token_auth(text) from authenticated;
grant execute on function public.mcp_oauth_client(text, text), public.mcp_oauth_approve(uuid, text, text, text[], text, text),
  public.mcp_token_create(uuid, text, text[]), public.mcp_token_list(uuid) to authenticated;
grant execute on function public.mcp_oauth_register(text, text[]), public.mcp_oauth_client(text, text), public.mcp_oauth_exchange(text, text, text, text, text),
  public.mcp_oauth_refresh(text, text), public.mcp_token_auth(text) to service_role;
