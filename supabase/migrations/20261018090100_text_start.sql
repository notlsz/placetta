-- Text to start: a business that isn't on Placetta yet texts Odelia one line ("Milk tea shop in Flushing, NY") by SMS,
-- iMessage, WhatsApp or Placetta's WeChat Official Account, and gets its plan back with a link to claim it
-- (supabase/functions/_shared/text_start.ts). The plan waits here as a pending workspace, built from the registry with
-- the same code the app's first screen uses, tied to the number or WeChat follower it was sent to. The link is signed
-- (HMAC-SHA256 with the monitor key, the server secret odelia-sms and this database already share), works for 7 days
-- and only once. Claiming it after the normal sign-in creates the workspace as the person's own (with the Filing
-- Authorization, as create_workspace always records) and links the phone it was texted to, with the same consent
-- record as linking in Settings. Safe to run twice.
--   text_starts                 the pending workspaces (server only)
--   text_start_parts            half a line read before Odelia's one question was answered (server only)
--   text_start_verify(token)    the start a link names, when it's signed right and not past its expiry
--   text_start_peek(token)      anyone with the link: what the plan is for, and whether it can still be claimed
--   text_start_claim(token, link_phone)   the signed-in person: the workspace, and the phone linked
--   text_start_consent(number, event)     odelia-sms: a number texted in, or asked for the one reminder

create table if not exists public.text_starts (
  id text primary key check (id ~ '^[A-Za-z0-9]{10}$'),
  channel text not null check (channel in ('sms', 'imessage', 'whatsapp', 'wechat')),
  -- the number (E.164) the plan was texted to, or the WeChat follower ("wx:" and their OpenID on Placetta's account)
  handle text not null check (handle ~ '^\+[1-9][0-9]{7,14}$' or handle ~ '^wx:[A-Za-z0-9_-]{6,64}$'),
  line text check (line is null or line ~ '^\+[1-9][0-9]{7,14}$'),   -- the iMessage line they wrote to
  lang text not null default 'en' check (lang in ('en', 'zh')),
  tz text not null default 'America/New_York' check (length(tz) between 1 and 64),
  what text not null check (length(what) between 1 and 80),
  place text not null check (length(place) between 1 and 80),
  place_zh text check (place_zh is null or length(place_zh) <= 40),
  name text not null check (length(name) between 1 and 120),
  state jsonb not null,
  permits int not null default 0 check (permits >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_in_at timestamptz not null default now(),                      -- their last message (WhatsApp's 24 hours, WeChat's 48)
  remind_at timestamptz,                                              -- the one reminder they asked for
  remind_asked_at timestamptz,
  reminded_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  phone_result text check (phone_result is null or phone_result in ('linked', 'kept', 'taken', 'declined', 'pin_required', 'none'))
);
comment on table public.text_starts is 'Plans texted to businesses that are not on Placetta yet, each waiting to be claimed once within 7 days through its signed link. Server only.';
create index if not exists text_starts_handle on public.text_starts(handle, created_at desc);
create index if not exists text_starts_remind on public.text_starts(remind_at) where reminded_at is null and claimed_at is null;
create index if not exists text_starts_claimed_by on public.text_starts(claimed_by);
create index if not exists text_starts_workspace on public.text_starts(workspace_id);
alter table public.text_starts enable row level security;
revoke all on public.text_starts from public, anon, authenticated;

-- Half a line: after Odelia's one question, an answer may name only what was missing ("Flushing" after "I want to
-- open a milk tea shop"). What was read from the first half waits here, never the words themselves, for 7 days.
create table if not exists public.text_start_parts (
  handle text primary key check (handle ~ '^\+[1-9][0-9]{7,14}$' or handle ~ '^wx:[A-Za-z0-9_-]{6,64}$'),
  what text check (what is null or length(what) <= 80),
  place text check (place is null or length(place) <= 80),
  at timestamptz not null default now()
);
comment on table public.text_start_parts is 'The business or the place read from a first text that named only one of them, for 7 days. Server only.';
alter table public.text_start_parts enable row level security;
revoke all on public.text_start_parts from public, anon, authenticated;

/* ------------------------------ consent ------------------------------ */

-- Two more events in the consent ledger, for numbers with no account: one texted Odelia to start (consent to the one
-- reply it asked for), and one asked for the one reminder.
alter table public.phone_consent_log drop constraint if exists phone_consent_log_event_check;
alter table public.phone_consent_log add constraint phone_consent_log_event_check
  check (event in ('linked', 'texts_on', 'texts_off', 'calls_on', 'calls_off', 'stop', 'start', 'unlinked', 'texted_to_start', 'asked_reminder'));

-- The version of what a texted plan tells the person (its "Reply STOP to opt out", supabase/functions/_shared/
-- text_start.ts). Change both together.
create or replace function public.text_start_disclosure_version() returns text
language sql immutable set search_path = '' as $$ select 'text-start-2026-10-18'::text $$;

create or replace function public.text_start_consent(p_number text, p_event text) returns void
language sql security definer set search_path = '' as $$
  insert into public.phone_consent_log(user_id, number, event, disclosure_version)
  select null, p_number, p_event, public.text_start_disclosure_version()
   where p_number ~ '^\+[1-9][0-9]{7,14}$' and p_event in ('texted_to_start', 'asked_reminder');
$$;

/* ------------------------------ the link ------------------------------ */

-- The start a claim link names: "<id>.<expiry in Unix seconds>.<signature>", where the signature is the first 16
-- characters of base64url(HMAC-SHA256(monitor key, 'text-start|<id>|<expiry>')). null when it's malformed, forged or
-- past its expiry. The signatures are compared through their hashes, so the comparison's time says nothing.
create or replace function public.text_start_verify(p_token text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare m text[]; k text; want text;
begin
  m := regexp_match(btrim(coalesce(p_token, '')), '^([A-Za-z0-9]{10})\.([0-9]{9,11})\.([A-Za-z0-9_-]{16})$');
  if m is null or m[2]::bigint < extract(epoch from now()) then return null; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'monitor_key' limit 1;
  if coalesce(k, '') = '' then return null; end if;
  want := left(translate(rtrim(encode(extensions.hmac('text-start|' || m[1] || '|' || m[2], k, 'sha256'), 'base64'), '='), '+/', '-_'), 16);
  if extensions.digest(want, 'sha256') <> extensions.digest(m[3], 'sha256') then return null; end if;
  -- the expiry in the link is the row's own
  if not exists (select 1 from public.text_starts s where s.id = m[1] and floor(extract(epoch from s.expires_at))::bigint = m[2]::bigint) then return null; end if;
  return m[1];
end $$;

-- What a link is for, before signing in: the plan's business and place, how many permits, the channel, the last four
-- digits of the number it was texted to, and whether it can still be claimed (ok, used, expired, invalid).
create or replace function public.text_start_peek(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id text; r public.text_starts;
begin
  v_id := public.text_start_verify(p_token);
  if v_id is null then
    -- a link that was right but has run out says so; anything else is just not a link
    if btrim(coalesce(p_token, '')) ~ '^[A-Za-z0-9]{10}\.[0-9]{9,11}\.' and exists (select 1 from public.text_starts s where s.id = split_part(btrim(p_token), '.', 1) and s.expires_at <= now())
      then return jsonb_build_object('status', 'expired'); end if;
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into r from public.text_starts s where s.id = v_id;
  return jsonb_build_object('status', case when r.claimed_at is not null then 'used' when r.expires_at <= now() then 'expired' else 'ok' end,
    'what', r.what, 'place', r.place, 'place_zh', r.place_zh, 'permits', r.permits, 'lang', r.lang, 'channel', r.channel,
    'phone_last4', case when r.handle like '+%' then right(r.handle, 4) end, 'expires_at', r.expires_at,
    -- the person who already claimed it, opening the link again, goes straight to the workspace it became
    'workspace_id', case when r.claimed_by is not null and r.claimed_by = auth.uid() then r.workspace_id end);
end $$;

-- Claim a texted plan, once, as the signed-in person: the pending workspace becomes theirs (create_workspace, which
-- records the Filing Authorization), and the number it was texted to is linked to them, verified, since the link was
-- texted only to it, when they chose to link it (p_link_phone, beside the same consent words as Settings). The number
-- isn't linked when the settings PIN is locked, when someone else already verified it, or when they have another
-- verified number (kept). A number that texted STOP stays opted out. phone: linked, kept, taken, declined,
-- pin_required or none (WeChat). Errors: start_invalid, start_used, start_expired.
create or replace function public.text_start_claim(p_token text, p_link_phone boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_id text; r public.text_starts; wid uuid; phone text := 'none'; l public.phone_links; stopped boolean;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not public.mfa_ok() then raise exception 'mfa_required'; end if;
  v_id := public.text_start_verify(p_token);
  if v_id is null then
    if exists (select 1 from public.text_starts s where s.id = split_part(btrim(coalesce(p_token, '')), '.', 1) and s.expires_at <= now()) then raise exception 'start_expired'; end if;
    raise exception 'start_invalid';
  end if;
  select * into r from public.text_starts s where s.id = v_id for update;
  if r.claimed_at is not null then raise exception 'start_used'; end if;
  if r.expires_at <= now() then raise exception 'start_expired'; end if;

  wid := public.create_workspace(r.name, r.state, true);

  if r.channel <> 'wechat' then
    select * into l from public.phone_links pl where pl.user_id = uid;
    if not coalesce(p_link_phone, false) then phone := 'declined';
    elsif not public.pin_ok() then phone := 'pin_required';
    elsif exists (select 1 from public.phone_links pl where pl.number = r.handle and pl.verified_at is not null and pl.user_id <> uid) then phone := 'taken';
    elsif l.user_id is not null and l.verified_at is not null and l.number <> r.handle then phone := 'kept';
    else
      stopped := exists (select 1 from public.odelia_strangers s where s.number = r.handle and s.opted_out_at is not null);
      insert into public.phone_links as pl (user_id, number, verified_at, tz, lang, last_workspace_id, line, via, wa_last_in, opted_out_at)
      values (uid, r.handle, now(), coalesce(public.phone_tz(r.tz), 'America/Los_Angeles'), r.lang, wid, r.line,
              case when r.channel = 'whatsapp' then 'whatsapp' end, case when r.channel = 'whatsapp' then r.last_in_at end,
              case when stopped then now() end)
      on conflict (user_id) do update set
        number = excluded.number,
        verified_at = coalesce(pl.verified_at, excluded.verified_at),
        tz = case when pl.verified_at is null then excluded.tz else pl.tz end,
        lang = case when pl.verified_at is null then excluded.lang else pl.lang end,
        last_workspace_id = excluded.last_workspace_id,
        line = coalesce(excluded.line, pl.line),
        via = excluded.via, wa_last_in = coalesce(excluded.wa_last_in, pl.wa_last_in),
        opted_out_at = case when stopped then coalesce(pl.opted_out_at, now()) else pl.opted_out_at end,
        last_error = null, updated_at = now();
      -- any code still out for an earlier, unverified number of theirs is done with
      update public.phone_codes set expires_at = least(expires_at, now()) where user_id = uid and purpose in ('link', 'link_in') and used_at is null;
      phone := 'linked';
    end if;
  end if;

  update public.text_starts set claimed_at = now(), claimed_by = uid, workspace_id = wid, phone_result = phone where id = r.id;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (wid, 'you', uid,
    jsonb_build_object('en', 'Opened the plan Odelia texted' || case when phone = 'linked' then ' and linked the phone it went to' else '' end,
                       'zh', '打开了 Odelia 发来的计划' || case when phone = 'linked' then '，并关联了收到它的手机' else '' end),
    jsonb_build_object('en', r.what || ' in ' || r.place, 'zh', coalesce(r.place_zh, r.place) || r.what));
  return jsonb_build_object('workspace_id', wid, 'phone', phone, 'number', case when phone in ('linked', 'kept', 'taken') then r.handle end);
end $$;

revoke execute on function public.text_start_verify(text), public.text_start_peek(text), public.text_start_claim(text, boolean),
  public.text_start_consent(text, text), public.text_start_disclosure_version() from public, anon, authenticated;
grant execute on function public.text_start_peek(text) to anon, authenticated;
grant execute on function public.text_start_claim(text, boolean) to authenticated;
grant execute on function public.text_start_verify(text), public.text_start_consent(text, text), public.text_start_disclosure_version() to service_role;

/* ------------------------------ the reminder sweep ------------------------------ */

-- The outbox sweep (odelia-sms flush, every 10 minutes) also sends the one reminder someone asked for: it now runs
-- when either is waiting.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; the Odelia outbox and texted-plan reminders are not scheduled.';
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
    where exists (select 1 from public.odelia_outbox where sent_at is null and dropped_at is null)
       or exists (select 1 from public.text_starts where remind_at <= now() and reminded_at is null and claimed_at is null and expires_at > now());
  $job$);
end $$;
