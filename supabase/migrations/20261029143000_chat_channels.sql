-- Odelia in Microsoft Teams and Telegram (docs/CHANNELS.md).
--   A run can come from Teams or Telegram (agent_runs.channel 'teams' and 'telegram', answered through chat_to), and a
--   business's own Teams bot or Telegram bot is kept in the vault like its Slack, Lark and WeChat bots (integrations
--   kinds 'teams_bot' and 'telegram_bot').
--   Teams says who is asking by their work email, like Slack and Lark, so nothing more is stored. Telegram shares no
--   email, so each teammate links their Telegram once with a 6-digit code from Settings, exactly as WeChat does
--   (telegram_links): codes are stored only as bcrypt hashes, last 30 minutes, and every try counts against the
--   Telegram user (5 an hour) and the workspace (60 an hour).
-- All of it is for the server only: no customer role can read or write the table or call these functions.
-- Safe to run twice.

alter table public.agent_runs drop constraint if exists agent_runs_channel_check;
alter table public.agent_runs add constraint agent_runs_channel_check
  check (channel in ('app', 'sms', 'voice', 'slack', 'lark', 'email', 'wechat', 'teams', 'telegram'));

alter table public.integrations drop constraint if exists integrations_kind_check;
alter table public.integrations add constraint integrations_kind_check
  check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams', 'dingtalk',
    'slack_bot', 'lark_bot', 'wechat_bot', 'square', 'toast', 'webhook', 'gbp', 'clover', 'shopify', 'xero', 'dropbox_sign',
    'teams_bot', 'telegram_bot'));

/* ---------------------------------------------------------------- Telegram links */

create table if not exists public.telegram_links (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- the bot's own id (the number before the colon in its token): a link is to this bot, so a new bot starts fresh
  bot_id text check (bot_id is null or bot_id ~ '^\d{3,20}$'),
  -- the Telegram user's id (a number, the same in every chat)
  tg_user text check (tg_user is null or tg_user ~ '^\d{3,20}$'),
  linked_at timestamptz,
  code_hash text,
  code_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
comment on table public.telegram_links is 'Which Telegram user each member linked to the workspace''s own Telegram bot, and the code they are linking with. Server only.';
create unique index if not exists telegram_links_user on public.telegram_links(workspace_id, bot_id, tg_user) where tg_user is not null;
alter table public.telegram_links enable row level security;
revoke all on public.telegram_links from public, anon, authenticated;

-- A new link code for a member, after the integrations function checked who is asking (and their settings PIN): six
-- digits, 30 minutes, at most 5 an hour. The code exists in the clear only in this answer.
create or replace function public.telegram_link_start(p_ws uuid, p_uid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare code text; exp timestamptz := now() + interval '30 minutes'; i int := 0;
begin
  if not exists (select 1 from public.workspace_members where workspace_id = p_ws and user_id = p_uid) then raise exception 'not_member'; end if;
  if not public.rate_hit('telegram_code:' || p_ws || ':' || p_uid, 5, 3600) then raise exception 'rate_limited'; end if;
  loop
    code := lpad(((('x' || lpad(encode(extensions.gen_random_bytes(4), 'hex'), 16, '0'))::bit(64)::bigint) % 1000000)::text, 6, '0');
    i := i + 1;
    exit when i > 5 or not exists (select 1 from public.telegram_links where workspace_id = p_ws and user_id <> p_uid
      and code_expires_at > now() and code_hash = extensions.crypt(code, code_hash));
  end loop;
  insert into public.telegram_links as l (workspace_id, user_id, code_hash, code_expires_at, updated_at)
  values (p_ws, p_uid, extensions.crypt(code, extensions.gen_salt('bf', 8)), exp, now())
  on conflict (workspace_id, user_id) do update set code_hash = excluded.code_hash, code_expires_at = excluded.code_expires_at, updated_at = now();
  return jsonb_build_object('code', code, 'expires_at', exp);
end $$;

-- A Telegram user sent the workspace's bot a code (in a private chat). ok: linked (the Telegram user moves off anyone it
-- was linked to before, and the code is used up); wrong; or locked (5 tries an hour from one user, 60 for the whole
-- workspace). Only a member can be linked.
create or replace function public.telegram_link_claim(p_ws uuid, p_bot text, p_tg_user text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.telegram_links; c text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
begin
  if coalesce(p_bot, '') !~ '^\d{3,20}$' or coalesce(p_tg_user, '') !~ '^\d{3,20}$' then return jsonb_build_object('result', 'wrong'); end if;
  if not public.rate_hit('telegram_claim:' || p_bot || ':' || p_tg_user, 5, 3600) then return jsonb_build_object('result', 'locked'); end if;
  if not public.rate_hit('telegram_claim_ws:' || p_ws, 60, 3600) then return jsonb_build_object('result', 'locked'); end if;
  if length(c) <> 6 then return jsonb_build_object('result', 'wrong'); end if;
  select l.* into r from public.telegram_links l
   where l.workspace_id = p_ws and l.code_hash is not null and l.code_expires_at > now() and l.code_hash = extensions.crypt(c, l.code_hash)
     and exists (select 1 from public.workspace_members m where m.workspace_id = p_ws and m.user_id = l.user_id)
   order by l.updated_at desc limit 1 for update;
  if r.user_id is null then return jsonb_build_object('result', 'wrong'); end if;
  update public.telegram_links set bot_id = null, tg_user = null, linked_at = null, updated_at = now()
   where workspace_id = p_ws and tg_user = p_tg_user and user_id <> r.user_id;
  update public.telegram_links set bot_id = p_bot, tg_user = p_tg_user, linked_at = now(), code_hash = null, code_expires_at = null, updated_at = now()
   where workspace_id = p_ws and user_id = r.user_id;
  return jsonb_build_object('result', 'ok', 'user_id', r.user_id);
end $$;

-- Who a Telegram user is here: the member they're linked to and whether that person is still a member. null when this
-- Telegram user isn't linked in this workspace (for this bot).
create or replace function public.telegram_sender(p_ws uuid, p_bot text, p_tg_user text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id', l.user_id,
    'member', exists (select 1 from public.workspace_members m where m.workspace_id = l.workspace_id and m.user_id = l.user_id))
    from public.telegram_links l
   where l.workspace_id = p_ws and l.bot_id = p_bot and l.tg_user = p_tg_user and l.linked_at is not null
$$;

revoke execute on function public.telegram_link_start(uuid, uuid), public.telegram_link_claim(uuid, text, text, text), public.telegram_sender(uuid, text, text) from public, anon, authenticated;
grant execute on function public.telegram_link_start(uuid, uuid), public.telegram_link_claim(uuid, text, text, text), public.telegram_sender(uuid, text, text) to service_role;
