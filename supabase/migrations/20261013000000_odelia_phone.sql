-- Text and call Odelia. A person links their phone (a code texted to it proves it's theirs), then texts or calls
-- Odelia at Placetta's number and she answers from their workspace; she texts or calls them first when something needs
-- them. Telnyx carries the texts and calls: supabase/functions/odelia-sms and odelia-voice. Safe to run twice.
--   phone_links       one number per person: what they want to hear about, and when (quiet hours in their time zone)
--   phone_codes       codes that prove a number: texted when linking, and on calls whose caller ID isn't fully attested
--   odelia_messages   every text and call with Odelia, both ways; each person reads only their own
--   odelia_outbox     what the monitor and finished runs want to tell people, held for quiet hours and daily limits
--   odelia_calls      calls in progress and their verification (server only)
--   odelia_strangers  numbers that texted without a link: they get one explanation, then nothing
-- agent_runs gets channel (app, sms or voice) and reply_to (the verified number the answer is texted to).
-- The app reads and changes all of this through phone_status, phone_link_start, phone_link_confirm, phone_link_remove
-- and phone_prefs; the edge functions use the service role.

create extension if not exists pgcrypto with schema extensions;

/* ------------------------------ tables ------------------------------ */

create table if not exists public.phone_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  number text not null check (number ~ '^\+[1-9][0-9]{7,14}$'),
  verified_at timestamptz,
  texts_on boolean not null default true,
  calls_on boolean not null default false,
  quiet_start time not null default '21:00',
  quiet_end time not null default '08:00',
  tz text not null default 'America/Los_Angeles' check (length(tz) between 1 and 64),
  lang text not null default 'en' check (lang in ('en', 'zh')),
  last_workspace_id uuid references public.workspaces(id) on delete set null,
  opted_out_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.phone_links is 'A person''s phone for texting and calling Odelia. One verified owner per number. Read through phone_status().';
create unique index if not exists phone_links_verified_number on public.phone_links(number) where verified_at is not null;
create index if not exists phone_links_number on public.phone_links(number);
create index if not exists phone_links_last_workspace on public.phone_links(last_workspace_id);
alter table public.phone_links enable row level security;
revoke all on public.phone_links from public, anon, authenticated;

create table if not exists public.phone_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('link', 'call')),
  number text not null check (number ~ '^\+[1-9][0-9]{7,14}$'),
  code_hash text,                               -- bcrypt; null until odelia-sms has made and texted the code
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.phone_codes is 'Codes that prove a phone number, kept only as bcrypt hashes. Server only.';
create index if not exists phone_codes_user on public.phone_codes(user_id, purpose, created_at desc);
create index if not exists phone_codes_number on public.phone_codes(number, created_at desc);
alter table public.phone_codes enable row level security;
revoke all on public.phone_codes from public, anon, authenticated;

create table if not exists public.odelia_messages (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,      -- null for a number nobody linked
  workspace_id uuid references public.workspaces(id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  channel text not null check (channel in ('sms', 'voice')),
  kind text not null default 'chat' check (kind in ('chat', 'ack', 'reply', 'code', 'update', 'urgent', 'system', 'call')),
  body text not null default '' check (length(body) <= 2000),
  provider_id text,                                              -- Telnyx's message id (or call:<call control id>)
  run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.odelia_messages is 'Every text and call with Odelia. Codes are never stored, only that one was sent.';
create unique index if not exists odelia_messages_provider on public.odelia_messages(provider_id, direction) where provider_id is not null;
create index if not exists odelia_messages_user on public.odelia_messages(user_id, created_at desc);
create index if not exists odelia_messages_workspace on public.odelia_messages(workspace_id);
create index if not exists odelia_messages_run on public.odelia_messages(run_id) where run_id is not null;
alter table public.odelia_messages enable row level security;
drop policy if exists "People read their own texts and calls with Odelia" on public.odelia_messages;
create policy "People read their own texts and calls with Odelia" on public.odelia_messages for select to authenticated
  using (user_id = (select auth.uid()) and (select public.mfa_ok()));
revoke all on public.odelia_messages from public, anon, authenticated;
grant select on public.odelia_messages to authenticated;

create table if not exists public.odelia_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('text', 'call')),
  urgent boolean not null default false,
  body text not null check (length(body) between 1 and 1000),
  link text check (link is null or link ~ '^https?://'),
  dedupe text not null check (length(dedupe) <= 300),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  dropped_at timestamptz,
  note text
);
comment on table public.odelia_outbox is 'Texts and calls waiting for the person''s quiet hours and daily limits. odelia-sms sends them every 10 minutes.';
create unique index if not exists odelia_outbox_dedupe on public.odelia_outbox(user_id, dedupe);
create index if not exists odelia_outbox_open on public.odelia_outbox(created_at) where sent_at is null and dropped_at is null;
create index if not exists odelia_outbox_workspace on public.odelia_outbox(workspace_id);
alter table public.odelia_outbox enable row level security;
revoke all on public.odelia_outbox from public, anon, authenticated;

create table if not exists public.odelia_calls (
  call_control_id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  number text,
  attestation text,
  verified_at timestamptz,
  lang text not null default 'en' check (lang in ('en', 'zh')),
  outbox_id uuid references public.odelia_outbox(id) on delete set null,
  tool_calls int not null default 0,
  texts int not null default 0,
  code_tries int not null default 0,
  answered_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.odelia_calls is 'Calls with Odelia and whether the caller is verified. Server only.';
create index if not exists odelia_calls_user on public.odelia_calls(user_id, created_at desc);
create index if not exists odelia_calls_workspace on public.odelia_calls(workspace_id);
create index if not exists odelia_calls_outbox on public.odelia_calls(outbox_id);
alter table public.odelia_calls enable row level security;
revoke all on public.odelia_calls from public, anon, authenticated;

create table if not exists public.odelia_strangers (
  number text primary key,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  replied_at timestamptz,
  messages int not null default 1,
  opted_out_at timestamptz
);
comment on table public.odelia_strangers is 'Numbers that texted Odelia without a link: one explanation every 90 days at most. Server only.';
alter table public.odelia_strangers enable row level security;
revoke all on public.odelia_strangers from public, anon, authenticated;

alter table public.agent_runs add column if not exists channel text not null default 'app';
alter table public.agent_runs drop constraint if exists agent_runs_channel_check;
alter table public.agent_runs add constraint agent_runs_channel_check check (channel in ('app', 'sms', 'voice'));
alter table public.agent_runs add column if not exists reply_to text;
alter table public.agent_runs drop constraint if exists agent_runs_reply_to_check;
alter table public.agent_runs add constraint agent_runs_reply_to_check check (reply_to is null or reply_to ~ '^\+[1-9][0-9]{7,14}$');
grant select (channel) on public.agent_runs to authenticated;

/* ------------------------------ helpers ------------------------------ */

-- A real IANA time zone name, or null.
create or replace function public.phone_tz(p text) returns text
language sql stable set search_path = '' as $$
  select name from pg_catalog.pg_timezone_names where name = p and p is not null and length(p) <= 64 limit 1;
$$;

-- "HH:MM" (24-hour) as a time, or null.
create or replace function public.phone_time(p text) returns time
language sql immutable set search_path = '' as $$
  select case when p ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then p::time else null end;
$$;

/* ------------------------------ for the app ------------------------------ */

-- This person's link (or null) and their last 30 texts and calls with Odelia.
create or replace function public.phone_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.phone_links;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not public.mfa_ok() then raise exception 'mfa_required'; end if;
  select * into r from public.phone_links where user_id = uid;
  return jsonb_build_object(
    'link', case when r.user_id is null then null else jsonb_build_object(
      'number', r.number, 'verified', r.verified_at is not null, 'verified_at', r.verified_at,
      'texts_on', r.texts_on, 'calls_on', r.calls_on,
      'quiet_start', to_char(r.quiet_start, 'HH24:MI'), 'quiet_end', to_char(r.quiet_end, 'HH24:MI'),
      'tz', r.tz, 'lang', r.lang, 'opted_out', r.opted_out_at is not null, 'last_error', r.last_error,
      'code_pending', exists (select 1 from public.phone_codes c where c.user_id = uid and c.purpose = 'link' and c.number = r.number
                                and c.used_at is null and c.expires_at > now())) end,
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'direction', m.direction, 'channel', m.channel, 'kind', m.kind,
                                                         'body', m.body, 'created_at', m.created_at) order by m.created_at desc)
                       from (select * from public.odelia_messages where user_id = uid order by created_at desc limit 30) m), '[]'::jsonb));
end $$;

-- Start linking a number: needs the settings PIN when it's on (whoever links a phone can text Odelia as you). Rate
-- limited to 5 codes an hour per person and 8 a day per number. The code itself is made and texted by odelia-sms,
-- called here through pg_net with the monitor key, so it never passes through the database in the clear.
create or replace function public.phone_link_start(p_number text, p_tz text default null, p_lang text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n text := btrim(coalesce(p_number, '')); recent int; code_id uuid; key text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not public.mfa_ok() then raise exception 'mfa_required'; end if;
  if not public.pin_ok() then raise exception 'pin_required'; end if;
  if n !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'phone_format'; end if;
  if exists (select 1 from public.phone_links where number = n and verified_at is not null and user_id <> uid) then raise exception 'phone_taken'; end if;
  select count(*) into recent from public.phone_codes where user_id = uid and purpose = 'link' and created_at > now() - interval '1 hour';
  if recent >= 5 then raise exception 'phone_rate_limited'; end if;
  select count(*) into recent from public.phone_codes where number = n and purpose = 'link' and created_at > now() - interval '1 day';
  if recent >= 8 then raise exception 'phone_rate_limited'; end if;

  insert into public.phone_links as l (user_id, number, tz, lang)
  values (uid, n, coalesce(public.phone_tz(p_tz), 'America/Los_Angeles'), case when p_lang = 'zh' then 'zh' else 'en' end)
  on conflict (user_id) do update set
    number = excluded.number,
    verified_at = case when l.number = excluded.number then l.verified_at else null end,
    opted_out_at = case when l.number = excluded.number then l.opted_out_at else null end,
    tz = coalesce(public.phone_tz(p_tz), l.tz),
    lang = case when p_lang in ('en', 'zh') then p_lang else l.lang end,
    last_error = null, updated_at = now();

  -- One live code at a time.
  update public.phone_codes set expires_at = least(expires_at, now()) where user_id = uid and purpose = 'link' and used_at is null;
  insert into public.phone_codes (user_id, purpose, number, expires_at) values (uid, 'link', n, now() + interval '10 minutes') returning id into code_id;

  select decrypted_secret into key from vault.decrypted_secrets where name = 'monitor_key' limit 1;
  perform net.http_post(
    url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/odelia-sms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', key),
    body := jsonb_build_object('action', 'send_code', 'code_id', code_id),
    timeout_milliseconds := 15000
  );
  return public.phone_status();
end $$;

-- Check a code (server only for 'call'; phone_link_confirm for 'link'). Returns ok, wrong, locked or expired.
-- It never raises on a wrong code: raising would roll back the attempt count.
create or replace function public.phone_code_check(p_user uuid, p_purpose text, p_code text, p_number text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.phone_codes;
begin
  select * into r from public.phone_codes
   where user_id = p_user and purpose = p_purpose and used_at is null and code_hash is not null and (p_number is null or number = p_number)
   order by created_at desc limit 1 for update;
  if r.id is null or r.expires_at <= now() then return 'expired'; end if;
  if r.attempts >= 5 then return 'locked'; end if;
  if r.code_hash = extensions.crypt(coalesce(p_code, ''), r.code_hash) then
    update public.phone_codes set used_at = now() where id = r.id;
    return 'ok';
  end if;
  update public.phone_codes set attempts = attempts + 1 where id = r.id;
  return case when r.attempts + 1 >= 5 then 'locked' else 'wrong' end;
end $$;

-- Finish linking with the texted code. A wrong code comes back as data ({"error": "code_wrong"}), not an error.
create or replace function public.phone_link_confirm(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.phone_links; c text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not public.mfa_ok() then raise exception 'mfa_required'; end if;
  select * into r from public.phone_links where user_id = uid;
  if r.user_id is null then raise exception 'phone_none'; end if;
  if r.verified_at is not null then return public.phone_status(); end if;
  c := public.phone_code_check(uid, 'link', regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), r.number);
  if c <> 'ok' then return public.phone_status() || jsonb_build_object('error', 'code_' || c); end if;
  if exists (select 1 from public.phone_links where number = r.number and verified_at is not null and user_id <> uid) then raise exception 'phone_taken'; end if;
  update public.phone_links set verified_at = now(), last_error = null, updated_at = now() where user_id = uid;
  return public.phone_status();
end $$;

-- Unlink: Odelia stops answering this number and drops anything waiting to be sent. The log stays with the account.
create or replace function public.phone_link_remove() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not public.mfa_ok() then raise exception 'mfa_required'; end if;
  delete from public.phone_codes where user_id = uid;
  update public.odelia_outbox set dropped_at = now(), note = 'unlinked' where user_id = uid and sent_at is null and dropped_at is null;
  delete from public.phone_links where user_id = uid;
  return public.phone_status();
end $$;

-- What they want to hear about and when. Each argument left null keeps its current value.
create or replace function public.phone_prefs(p_texts boolean default null, p_calls boolean default null, p_quiet_start text default null,
                                              p_quiet_end text default null, p_tz text default null, p_lang text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not public.mfa_ok() then raise exception 'mfa_required'; end if;
  if p_quiet_start is not null and public.phone_time(p_quiet_start) is null then raise exception 'time_format'; end if;
  if p_quiet_end is not null and public.phone_time(p_quiet_end) is null then raise exception 'time_format'; end if;
  update public.phone_links set
    texts_on = coalesce(p_texts, texts_on), calls_on = coalesce(p_calls, calls_on),
    quiet_start = coalesce(public.phone_time(p_quiet_start), quiet_start), quiet_end = coalesce(public.phone_time(p_quiet_end), quiet_end),
    tz = coalesce(public.phone_tz(p_tz), tz), lang = case when p_lang in ('en', 'zh') then p_lang else lang end, updated_at = now()
   where user_id = uid;
  if not found then raise exception 'phone_none'; end if;
  return public.phone_status();
end $$;

/* ------------------------------ for the edge functions ------------------------------ */

-- odelia-sms fills in the code it texts (only once, only before it expires) and learns where to send it.
create or replace function public.phone_code_set(p_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.phone_codes;
begin
  if coalesce(p_code, '') !~ '^[0-9]{4,8}$' then raise exception 'code_format'; end if;
  update public.phone_codes set code_hash = extensions.crypt(p_code, extensions.gen_salt('bf', 8))
   where id = p_id and code_hash is null and used_at is null and expires_at > now()
  returning * into r;
  if r.id is null then return null; end if;
  return jsonb_build_object('user_id', r.user_id, 'number', r.number, 'purpose', r.purpose,
    'lang', (select l.lang from public.phone_links l where l.user_id = r.user_id));
end $$;

-- odelia-voice issues a code for a call whose caller ID isn't fully attested.
create or replace function public.phone_code_issue(p_user uuid, p_purpose text, p_number text, p_code text, p_minutes int default 10) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if coalesce(p_code, '') !~ '^[0-9]{4,8}$' then raise exception 'code_format'; end if;
  update public.phone_codes set expires_at = least(expires_at, now()) where user_id = p_user and purpose = p_purpose and used_at is null;
  insert into public.phone_codes (user_id, purpose, number, code_hash, expires_at)
  values (p_user, p_purpose, p_number, extensions.crypt(p_code, extensions.gen_salt('bf', 8)), now() + make_interval(mins => least(greatest(coalesce(p_minutes, 10), 1), 30)))
  returning phone_codes.id into new_id;
  return new_id;
end $$;

revoke execute on function public.phone_tz(text), public.phone_time(text), public.phone_status(), public.phone_link_start(text, text, text),
  public.phone_code_check(uuid, text, text, text), public.phone_link_confirm(text), public.phone_link_remove(),
  public.phone_prefs(boolean, boolean, text, text, text, text), public.phone_code_set(uuid, text), public.phone_code_issue(uuid, text, text, text, int)
  from public, anon, authenticated;
grant execute on function public.phone_status(), public.phone_link_start(text, text, text), public.phone_link_confirm(text), public.phone_link_remove(),
  public.phone_prefs(boolean, boolean, text, text, text, text) to authenticated;
grant execute on function public.phone_code_check(uuid, text, text, text), public.phone_code_set(uuid, text), public.phone_code_issue(uuid, text, text, text, int) to service_role;

/* ------------------------------ the outbox sweep ------------------------------ */

-- Every 10 minutes, while anything is waiting: odelia-sms sends what's outside each person's quiet hours.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; the Odelia outbox is not scheduled.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-odelia-outbox';
  perform cron.schedule('placetta-odelia-outbox', '*/10 * * * *', $job$
    select net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/odelia-sms',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)),
      body := '{"action":"flush"}'::jsonb,
      timeout_milliseconds := 60000
    )
    where exists (select 1 from public.odelia_outbox where sent_at is null and dropped_at is null);
  $job$);
end $$;
