-- Odelia on iMessage (Linq), next to SMS (Telnyx).
--   phone_links.line        the iMessage line this person texts (replies always go back on it; a code assigns one)
--   odelia_messages.line    which of Odelia's lines a text went over (null: Telnyx SMS), and service: iMessage, RCS or SMS
--   odelia_lines            each iMessage line's reputation as Linq scores it, refreshed by odelia-sms flush every
--                           10 minutes; outbound pauses on a CRITICAL line, and the team gets a task when one slips
alter table public.phone_links add column if not exists line text check (line is null or line ~ '^\+[1-9][0-9]{7,14}$');
alter table public.odelia_messages add column if not exists line text check (line is null or line ~ '^\+[1-9][0-9]{7,14}$');
alter table public.odelia_messages add column if not exists service text check (service is null or service in ('iMessage', 'RCS', 'SMS'));
create index if not exists odelia_messages_line_day on public.odelia_messages(line, kind, created_at) where line is not null;

create table if not exists public.odelia_lines (
  number text primary key check (number ~ '^\+[1-9][0-9]{7,14}$'),
  reputation text not null default 'HEALTHY' check (reputation in ('HEALTHY', 'AT_RISK', 'CRITICAL')),
  doc_url text check (doc_url is null or length(doc_url) <= 500),
  checked_at timestamptz not null default now(),
  changed_at timestamptz not null default now()
);
comment on table public.odelia_lines is 'Odelia''s iMessage lines (Linq) and their reputation. Service role only.';
alter table public.odelia_lines enable row level security;
revoke all on public.odelia_lines from public, anon, authenticated;

alter table public.team_tasks drop constraint if exists team_tasks_kind_check;
alter table public.team_tasks add constraint team_tasks_kind_check
  check (kind in ('handoff', 'check_agency', 'skill_broken', 'destination_stale', 'review', 'quote', 'line_health'));

-- Sent and received per line over the last 7 days: a line that mostly sends and rarely hears back is the pattern that
-- got Lindy's own iMessage line banned. For the team (service role).
create or replace function public.odelia_line_traffic(p_days int default 7)
returns table(line text, sent bigint, received bigint, new_chats bigint, ratio numeric)
language sql stable security definer set search_path = '' as $$
  select m.line,
         count(*) filter (where m.direction = 'out'),
         count(*) filter (where m.direction = 'in'),
         count(*) filter (where m.direction = 'out' and m.kind = 'code'),
         round(count(*) filter (where m.direction = 'out')::numeric / greatest(count(*) filter (where m.direction = 'in'), 1), 2)
  from public.odelia_messages m
  where m.line is not null and m.created_at > now() - make_interval(days => greatest(1, least(p_days, 90)))
  group by m.line order by 2 desc;
$$;
revoke execute on function public.odelia_line_traffic(int) from public, anon, authenticated;
grant execute on function public.odelia_line_traffic(int) to service_role;

-- phone_status, as before, plus the person's own iMessage line and how each text went.
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
      'tz', r.tz, 'lang', r.lang, 'opted_out', r.opted_out_at is not null, 'last_error', r.last_error, 'line', r.line,
      'code_pending', exists (select 1 from public.phone_codes c where c.user_id = uid and c.purpose = 'link' and c.number = r.number
                                and c.used_at is null and c.expires_at > now())) end,
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'direction', m.direction, 'channel', m.channel, 'kind', m.kind,
                                                         'body', m.body, 'service', m.service, 'created_at', m.created_at) order by m.created_at desc)
                       from (select * from public.odelia_messages where user_id = uid order by created_at desc limit 30) m), '[]'::jsonb));
end $$;

