-- Voice: talking with Odelia, Odelia calling agencies for a filing's status, Odelia interpreting, and listening back.
--   voice_calls           every conversation: who, which filing, which voice brain, the consent to record, the recording's
--                         path in the private call-recordings bucket, the transcript (both languages for an interpreter
--                         session), the summary, the actions it caused, and what it cost. Members read their own
--                         workspace's; only the server writes.
--   filing_events         takes source 'phone_call' and links the call it came from (call_id), so the timeline plays it.
--   agency_phone_numbers  numbers the team verified on an agency's own government page, beside the registry in code
--                         (supabase/functions/_shared/agency_phones.ts). Staff add them; nothing else is ever dialed.
--   voice_gate            before any conversation: a plan, the AI allowance, voice's share of it (half), and the rate
--                         limits (agency calls a day per workspace and per filing, sessions an hour per person, calls at
--                         once). voice_finish prices a call into ai_events, so voice counts against the same allowance.
--   retention             a workspace's retention period (workspace_retention) clears its calls' transcripts, summaries
--                         and recordings too; with no period set, recordings go after 365 days. Recording files are
--                         queued in voice_purge for odelia-voice to delete from storage.
-- Safe to run twice. Written 2026-10-23, not applied to the live database. Tests: supabase/tests/voice_calls.sql.

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  filing_id uuid references public.filings(id) on delete set null,
  kind text not null check (kind in ('owner_phone', 'app_talk', 'agency_phone', 'interpreter_phone', 'app_interpreter', 'rehearse')),
  direction text not null default 'app' check (direction in ('in', 'out', 'app')),
  brain text not null check (length(brain) between 1 and 40),
  agency_key text check (agency_key is null or length(agency_key) <= 60),
  number text check (number is null or number ~ '^\+[1-9][0-9]{7,14}$'),
  lang text not null default 'en' check (lang in ('en', 'zh')),
  status text not null default 'queued' check (status in ('queued', 'dialing', 'live', 'ended', 'failed', 'refused')),
  call_control_id text unique check (call_control_id is null or length(call_control_id) <= 200),
  provider_call_id text check (provider_call_id is null or length(provider_call_id) <= 200),
  consent text not null default 'none' check (consent in ('none', 'announced', 'refused')),
  recording_path text check (recording_path is null or recording_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(wav|mp3)$'),
  transcript jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript) = 'array'),
  summary jsonb check (summary is null or (jsonb_typeof(summary) = 'object' and summary ? 'en')),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  flags jsonb not null default '[]'::jsonb check (jsonb_typeof(flags) = 'array'),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  seconds int not null default 0 check (seconds between 0 and 86400),
  cost_usd numeric(10, 4) not null default 0 check (cost_usd >= 0),
  priced_at timestamptz
);
create index if not exists voice_calls_ws on public.voice_calls(workspace_id, started_at desc);
create index if not exists voice_calls_filing on public.voice_calls(filing_id, started_at desc) where filing_id is not null;
create index if not exists voice_calls_live on public.voice_calls(workspace_id) where status in ('dialing', 'live');
comment on table public.voice_calls is 'Every voice conversation with Odelia: phone, app, agency status calls and interpreting. Server writes; members read their own.';

alter table public.voice_calls enable row level security;
revoke all on public.voice_calls from public, anon, authenticated;
grant select on public.voice_calls to authenticated;
drop policy if exists "members and team read calls" on public.voice_calls;
create policy "members and team read calls" on public.voice_calls for select to authenticated using (public.is_member(workspace_id) or public.is_staff());

-- the timeline takes phone calls, and links each such event to its call
alter table public.filing_events add column if not exists call_id uuid references public.voice_calls(id) on delete set null;
alter table public.filing_events drop constraint if exists filing_events_source_check;
alter table public.filing_events add constraint filing_events_source_check
  check (source in ('team', 'owner', 'placetta', 'open_data', 'agency_page', 'odelia', 'phone_call'));

create or replace function public.filing_timeline(p_filing uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid;
begin
  select workspace_id into ws from public.filings where id = p_filing;
  if ws is null or not (public.is_member(ws) or public.is_staff()) then raise exception 'No such filing.'; end if;
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'status', e.status, 'title', e.title, 'source', e.source,
      'confidence', e.confidence, 'url', e.url, 'call_id', e.call_id) order by e.at desc) from (select * from public.filing_events where filing_id = p_filing order by at desc limit 50) e), '[]'::jsonb),
    'tracking', (select jsonb_build_object('last_checked_at', t.last_checked_at, 'next_check_at', t.next_check_at, 'agency_status', t.agency_status,
      'agency_norm', t.agency_norm, 'last_movement_at', t.last_movement_at, 'escalated_at', t.escalated_at) from public.filing_tracking t where t.filing_id = p_filing));
end $$;
revoke execute on function public.filing_timeline(uuid) from public, anon;
grant execute on function public.filing_timeline(uuid) to authenticated;

-- the private bucket for recordings: no policy for people, so only the server reads it and hands out short signed links
insert into storage.buckets (id, name, public, file_size_limit) values ('call-recordings', 'call-recordings', false, 104857600)
on conflict (id) do update set public = false;

/* ------------------------------ numbers the team verified ------------------------------ */

create table if not exists public.agency_phone_numbers (
  agency_key text not null check (agency_key ~ '^[a-z0-9-]{2,60}$'),
  number text not null check (number ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  source_url text not null check (length(source_url) <= 500
    and source_url ~* '^https://([a-z0-9-]+\.)*([a-z0-9-]+\.(gov|mil)|[a-z0-9-]+\.[a-z]{2}\.us|sanjoseca\.gov|sfgov\.org|sccgov\.org|acgov\.org)(/|$)'),
  tz text not null default 'America/Los_Angeles' check (length(tz) <= 64),
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (agency_key, number)
);
alter table public.agency_phone_numbers enable row level security;
revoke all on public.agency_phone_numbers from public, anon, authenticated;
comment on table public.agency_phone_numbers is 'Agency lines the Placetta team verified on a government page. Read by odelia-voice; added through agency_phone_add.';

create or replace function public.agency_phone_add(p_key text, p_number text, p_source text, p_tz text default 'America/Los_Angeles') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  insert into public.agency_phone_numbers (agency_key, number, source_url, tz, added_by) values (p_key, p_number, p_source, coalesce(p_tz, 'America/Los_Angeles'), auth.uid())
  on conflict (agency_key, number) do update set source_url = excluded.source_url, tz = excluded.tz, added_by = excluded.added_by, added_at = now();
end $$;
revoke execute on function public.agency_phone_add(text, text, text, text) from public, anon;
grant execute on function public.agency_phone_add(text, text, text, text) to authenticated;

/* ------------------------------ caps, tied to the AI allowance ------------------------------ */

-- p_kind: the voice_calls kind. p_usd_per_min: what a minute of it costs all in (voice_brain.ts perMinute), so the gate can
-- say how many minutes the allowance still covers (at most 30 for a call, 20 for an app session).
create or replace function public.voice_gate(ws uuid, uid uuid, p_kind text, p_filing uuid default null, p_usd_per_min numeric default 0.1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b jsonb; spent numeric; lim numeric; n int; oldest timestamptz; left_usd numeric; mins int;
begin
  if p_kind not in ('owner_phone', 'app_talk', 'agency_phone', 'interpreter_phone', 'app_interpreter', 'rehearse') then raise exception 'unknown kind'; end if;
  b := public.ai_budget(ws);
  if b->>'plan' = 'none' then return jsonb_build_object('ok', false, 'code', 'plan_required'); end if;
  if b->>'plan' = 'entry_ended' then return jsonb_build_object('ok', false, 'code', 'entry_ended'); end if;
  lim := coalesce((b->>'limit_usd')::numeric, 0);
  if coalesce((b->>'used_usd')::numeric, 0) >= lim then return jsonb_build_object('ok', false, 'code', 'over_budget'); end if;
  -- voice may use at most half of the period's AI allowance, so talking never crowds out the filings
  select coalesce(sum(cost_usd), 0) into spent from public.voice_calls where workspace_id = ws
    and started_at >= coalesce((b->>'period_start')::timestamptz, date_trunc('month', now()));
  if spent >= 0.5 * lim then return jsonb_build_object('ok', false, 'code', 'voice_budget', 'spent_usd', spent, 'limit_usd', 0.5 * lim); end if;
  select count(*) into n from public.voice_calls where workspace_id = ws and status in ('dialing', 'live') and started_at > now() - interval '2 hours';
  if n >= 3 then return jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', 300); end if;
  if p_kind = 'agency_phone' then
    select count(*), min(started_at) into n, oldest from public.voice_calls where workspace_id = ws and kind = 'agency_phone' and started_at > now() - interval '1 day';
    if n >= 10 then return jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', greatest(300, extract(epoch from oldest + interval '1 day' - now())::int)); end if;
    if p_filing is not null then
      select count(*), min(started_at) into n, oldest from public.voice_calls where filing_id = p_filing and kind = 'agency_phone' and started_at > now() - interval '1 day';
      if n >= 2 then return jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', greatest(300, extract(epoch from oldest + interval '1 day' - now())::int)); end if;
    end if;
  elsif uid is not null then
    select count(*), min(started_at) into n, oldest from public.voice_calls where user_id = uid and started_at > now() - interval '1 hour';
    if n >= 20 then return jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', greatest(60, extract(epoch from oldest + interval '1 hour' - now())::int)); end if;
  end if;
  left_usd := least(lim - coalesce((b->>'used_usd')::numeric, 0), 0.5 * lim - spent);
  mins := floor(left_usd / greatest(p_usd_per_min, 0.001))::int;
  mins := least(mins, case when p_kind like 'app_%' or p_kind = 'rehearse' then 20 else 30 end);
  if mins < 1 then return jsonb_build_object('ok', false, 'code', 'voice_budget', 'spent_usd', spent, 'limit_usd', 0.5 * lim); end if;
  return jsonb_build_object('ok', true, 'max_minutes', mins);
end $$;
revoke execute on function public.voice_gate(uuid, uuid, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.voice_gate(uuid, uuid, text, uuid, numeric) to service_role;

-- A call ended: its length and price, once, and the price into ai_events so the allowance counts it.
create or replace function public.voice_finish(p_call uuid, p_seconds int, p_cost numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.voice_calls;
begin
  select * into c from public.voice_calls where id = p_call for update;
  if c.id is null or c.priced_at is not null then return; end if;
  update public.voice_calls set seconds = greatest(0, least(coalesce(p_seconds, 0), 86400)), cost_usd = greatest(0, coalesce(p_cost, 0)),
    priced_at = now(), ended_at = coalesce(ended_at, now()), status = case when status in ('failed', 'refused') then status else 'ended' end
   where id = p_call;
  if coalesce(p_cost, 0) > 0 then
    insert into public.ai_events (workspace_id, user_id, kind, model, cost_usd, provider) values (c.workspace_id, c.user_id, 'call', left('voice:' || c.brain, 60), p_cost, left(split_part(c.brain, '_', 1), 40));
  end if;
end $$;
revoke execute on function public.voice_finish(uuid, int, numeric) from public, anon, authenticated;
grant execute on function public.voice_finish(uuid, int, numeric) to service_role;

/* ------------------------------ retention ------------------------------ */

create table if not exists public.voice_purge (
  path text primary key check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(wav|mp3)$'),
  queued_at timestamptz not null default now()
);
alter table public.voice_purge enable row level security;
revoke all on public.voice_purge from public, anon, authenticated;

-- Clears one workspace's calls older than p_days: transcript, summary and recording (queued for deletion from storage).
create or replace function public.voice_retention(ws uuid, p_days int) returns int
language plpgsql security definer set search_path = '' as $$
declare k int;
begin
  insert into public.voice_purge (path) select recording_path from public.voice_calls
   where workspace_id = ws and recording_path is not null and started_at < now() - make_interval(days => p_days) on conflict do nothing;
  update public.voice_calls set transcript = '[]'::jsonb, summary = null, recording_path = null
   where workspace_id = ws and started_at < now() - make_interval(days => p_days)
     and (transcript <> '[]'::jsonb or summary is not null or recording_path is not null);
  get diagnostics k = row_count;
  return k;
end $$;
revoke execute on function public.voice_retention(uuid, int) from public, anon, authenticated;

-- retention_purge as in 20261028110000_workspace_retention.sql, plus the calls: a workspace's own period, else 365 days for recordings
create or replace function public.retention_purge() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_runs int := 0; n_msgs int := 0; n_calls int := 0; k int; r record;
begin
  for r in select workspace_id, run_days from public.workspace_retention loop
    update public.agent_runs set prompt = '(removed under this workspace''s retention setting)', reply = null, steps = '[]'::jsonb, draft = null,
      state = null, trace = null, title = null, error = null, chat_to = null, reply_to = null
     where workspace_id = r.workspace_id and status in ('done', 'failed', 'stopped') and updated_at < now() - make_interval(days => r.run_days)
       and prompt <> '(removed under this workspace''s retention setting)';
    get diagnostics k = row_count; n_runs := n_runs + k;
    delete from public.odelia_messages where workspace_id = r.workspace_id and created_at < now() - make_interval(days => r.run_days);
    get diagnostics k = row_count; n_msgs := n_msgs + k;
    n_calls := n_calls + public.voice_retention(r.workspace_id, r.run_days);
  end loop;
  -- no period set: recordings go after 365 days (the transcript and summary stay, like a finished conversation's answer)
  insert into public.voice_purge (path) select v.recording_path from public.voice_calls v
   where v.recording_path is not null and v.started_at < now() - interval '365 days'
     and not exists (select 1 from public.workspace_retention w where w.workspace_id = v.workspace_id) on conflict do nothing;
  update public.voice_calls v set recording_path = null where v.recording_path is not null and v.started_at < now() - interval '365 days'
     and not exists (select 1 from public.workspace_retention w where w.workspace_id = v.workspace_id);
  get diagnostics k = row_count; n_calls := n_calls + k;
  return jsonb_build_object('conversations', n_runs, 'texts_and_calls', n_msgs, 'voice_calls', n_calls);
end $$;
revoke execute on function public.retention_purge() from public, anon, authenticated;
grant execute on function public.retention_purge() to service_role;
