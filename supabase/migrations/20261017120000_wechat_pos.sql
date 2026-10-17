-- WeChat, Square and Toast.
--   Odelia in WeChat: a business points its own WeChat Official Account (a verified service account) at chat-events.
--   A run can come from WeChat (agent_runs.channel 'wechat', answered through chat_to); the account's AppID, AppSecret,
--   Token and EncodingAESKey are kept in the vault like the Slack and Lark bots (integrations kind 'wechat_bot'); and
--   each teammate links their WeChat once by sending the account a 6-digit code from Settings (wechat_links). Codes are
--   stored only as bcrypt hashes, last 30 minutes, and every try counts against the follower (5 an hour) and the
--   account (60 an hour), so guessing gets nowhere.
--   Square (OAuth) and Toast (Toast's partner API) for monthly sales and staff schedules: integrations kinds 'square'
--   and 'toast', and oauth_pending takes 'square'. Toast gives a partner one token for every restaurant, to be reused
--   for hours, so it is cached once in the vault (server_tokens). Each workspace gets its own code to type into Toast
--   (pos_link_codes): only someone who manages the restaurant's Toast integrations can put it there, which is how
--   Placetta knows which Toast locations are this business's own.
-- All of it is for the server only: no customer role can read or write these tables or call these functions.
-- Safe to run twice.

alter table public.agent_runs drop constraint if exists agent_runs_channel_check;
alter table public.agent_runs add constraint agent_runs_channel_check check (channel in ('app', 'sms', 'voice', 'slack', 'lark', 'email', 'wechat'));

alter table public.integrations drop constraint if exists integrations_kind_check;
alter table public.integrations add constraint integrations_kind_check
  check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams', 'dingtalk',
    'slack_bot', 'lark_bot', 'wechat_bot', 'square', 'toast'));

alter table public.oauth_pending drop constraint if exists oauth_pending_kind_check;
alter table public.oauth_pending add constraint oauth_pending_kind_check
  check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'square'));

/* ---------------------------------------------------------------- WeChat links */

create table if not exists public.wechat_links (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- an OpenID is per account, so the link is to this AppID's OpenID; another account later doesn't inherit it
  appid text check (appid is null or appid ~ '^[A-Za-z0-9_-]{6,40}$'),
  openid text check (openid is null or openid ~ '^[A-Za-z0-9_-]{6,64}$'),
  linked_at timestamptz,
  code_hash text,
  code_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
comment on table public.wechat_links is 'Which WeChat (an OpenID of the workspace''s own Official Account) each member linked, and the code they are linking with. Server only.';
create unique index if not exists wechat_links_openid on public.wechat_links(workspace_id, appid, openid) where openid is not null;
alter table public.wechat_links enable row level security;
revoke all on public.wechat_links from public, anon, authenticated;

-- A new link code for a member, after the integrations function checked who is asking (and their settings PIN): six
-- digits, 30 minutes, at most 5 an hour. The code exists in the clear only in this answer. A member's new code
-- replaces their old one; one already linked stays linked until the new code arrives.
create or replace function public.wechat_link_start(p_ws uuid, p_uid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare code text; exp timestamptz := now() + interval '30 minutes'; i int := 0;
begin
  if not exists (select 1 from public.workspace_members where workspace_id = p_ws and user_id = p_uid) then raise exception 'not_member'; end if;
  if not public.rate_hit('wechat_code:' || p_ws || ':' || p_uid, 5, 3600) then raise exception 'rate_limited'; end if;
  loop
    code := lpad(((('x' || lpad(encode(extensions.gen_random_bytes(4), 'hex'), 16, '0'))::bit(64)::bigint) % 1000000)::text, 6, '0');
    i := i + 1;
    -- never the same live code as another member here, so a code always means one person
    exit when i > 5 or not exists (select 1 from public.wechat_links where workspace_id = p_ws and user_id <> p_uid
      and code_expires_at > now() and code_hash = extensions.crypt(code, code_hash));
  end loop;
  insert into public.wechat_links as l (workspace_id, user_id, code_hash, code_expires_at, updated_at)
  values (p_ws, p_uid, extensions.crypt(code, extensions.gen_salt('bf', 8)), exp, now())
  on conflict (workspace_id, user_id) do update set code_hash = excluded.code_hash, code_expires_at = excluded.code_expires_at, updated_at = now();
  return jsonb_build_object('code', code, 'expires_at', exp);
end $$;

-- A follower of the workspace's account sent a code. ok: linked (the OpenID moves off anyone it was linked to before,
-- and the code is used up); wrong; or locked (5 tries an hour from one follower, 60 for the whole account). Only a
-- member can be linked.
create or replace function public.wechat_link_claim(p_ws uuid, p_appid text, p_openid text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.wechat_links; c text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
begin
  if coalesce(p_appid, '') !~ '^[A-Za-z0-9_-]{6,40}$' or coalesce(p_openid, '') !~ '^[A-Za-z0-9_-]{6,64}$' then return jsonb_build_object('result', 'wrong'); end if;
  if not public.rate_hit('wechat_claim:' || p_appid || ':' || p_openid, 5, 3600) then return jsonb_build_object('result', 'locked'); end if;
  if not public.rate_hit('wechat_claim_ws:' || p_ws, 60, 3600) then return jsonb_build_object('result', 'locked'); end if;
  if length(c) <> 6 then return jsonb_build_object('result', 'wrong'); end if;
  select l.* into r from public.wechat_links l
   where l.workspace_id = p_ws and l.code_hash is not null and l.code_expires_at > now() and l.code_hash = extensions.crypt(c, l.code_hash)
     and exists (select 1 from public.workspace_members m where m.workspace_id = p_ws and m.user_id = l.user_id)
   order by l.updated_at desc limit 1 for update;
  if r.user_id is null then return jsonb_build_object('result', 'wrong'); end if;
  update public.wechat_links set appid = null, openid = null, linked_at = null, updated_at = now()
   where workspace_id = p_ws and openid = p_openid and user_id <> r.user_id;
  update public.wechat_links set appid = p_appid, openid = p_openid, linked_at = now(), code_hash = null, code_expires_at = null, updated_at = now()
   where workspace_id = p_ws and user_id = r.user_id;
  return jsonb_build_object('result', 'ok', 'user_id', r.user_id);
end $$;

-- Who a follower is here: the member their WeChat is linked to, and whether they are still a member. null when this
-- WeChat isn't linked in this workspace (for this account).
create or replace function public.wechat_sender(p_ws uuid, p_appid text, p_openid text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id', l.user_id,
    'member', exists (select 1 from public.workspace_members m where m.workspace_id = l.workspace_id and m.user_id = l.user_id))
    from public.wechat_links l
   where l.workspace_id = p_ws and l.appid = p_appid and l.openid = p_openid and l.linked_at is not null
$$;

revoke execute on function public.wechat_link_start(uuid, uuid), public.wechat_link_claim(uuid, text, text, text), public.wechat_sender(uuid, text, text) from public, anon, authenticated;
grant execute on function public.wechat_link_start(uuid, uuid), public.wechat_link_claim(uuid, text, text, text), public.wechat_sender(uuid, text, text) to service_role;

/* ---------------------------------------------------------------- Toast */

-- One row per token the server shares across instances (Toast's partner token): the vault secret holding it and when
-- it expires.
create table if not exists public.server_tokens (
  name text primary key check (name ~ '^[a-z_]{1,40}$'),
  secret_id uuid not null,
  expires_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
comment on table public.server_tokens is 'Tokens the server shares across instances (the secret is in the vault). Server only.';
alter table public.server_tokens enable row level security;
revoke all on public.server_tokens from public, anon, authenticated;

-- The code a workspace's owner types into Toast (Integrations, Configure integrations, Placetta, Location ID or Group
-- ID) so Placetta can find that business's locations among every restaurant that added Placetta.
create table if not exists public.pos_link_codes (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  toast_code text not null unique check (toast_code ~ '^PLACETTA-[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);
comment on table public.pos_link_codes is 'Each workspace''s code for matching its Toast locations. Server only.';
alter table public.pos_link_codes enable row level security;
revoke all on public.pos_link_codes from public, anon, authenticated;
