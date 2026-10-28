-- Human checks go to the Placetta team first (worker/filer/src/run.ts staffFirst). When an agency's page shows a visible
-- CAPTCHA, the portal worker hands its live browser to the team's queue, not to the owner. Placetta never solves or
-- bypasses a CAPTCHA by itself: no solver service, no auto-solve, no evasion. A person on the team solves it in the live
-- browser and Odelia carries on by herself, as she does after an owner's step.
--
--   one page, nothing secret   staff get the worker's own live view of that one page (the URL must be one), with every
--                              SSN, card, account and saved-login line covered and closed to their typing
--                              (worker/filer/src/live.ts, page.ts staffGuard); a page that also asks for the owner's
--                              number, code, ID, fee or account stays with the owner from the start (guards.ts staffMay)
--   escalation                 in the team's hours (weekdays, 9 am Eastern to 6 pm Pacific) the team has 15 minutes to
--                              open it; outside them, or when nobody opens it in time, or when staff pass it on, it goes
--                              to the owner as before, with one tap
--   only CAPTCHAs              codes sent to the owner, payments, signatures, ID checks and SSN lines stay the owner's
--   audit                      every opening is in the owner's audit trail (who, when, which filing), and a solve reads
--                              "Solved a human check for you"
--
-- human_checks: one row per CAPTCHA the worker gives the team. Nobody reads the live address from the table: staff get it
-- only through human_check_take, which writes the audit row first. The filer reaches it only through its functions, with
-- the run's token for that filing. Safe to run twice. Not applied to the live database by this commit.
-- Tests: supabase/tests/human_checks.sql, worker/filer/test/staff.test.ts, scripts/tenancy/run.ts, npm run test:redteam.

create table if not exists public.human_checks (
  id uuid primary key default gen_random_uuid(),
  filing_id uuid not null references public.filings(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  live_url text not null check (live_url ~ '^https://[^\s?#]+/live/[A-Za-z0-9_-]{32}$'),
  state text not null default 'waiting' check (state in ('waiting', 'solved', 'to_owner', 'ended')),
  created_at timestamptz not null default now(),
  escalate_at timestamptz not null,
  hold_until timestamptz not null,
  opened_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz,
  closed_at timestamptz
);
comment on table public.human_checks is 'A visible CAPTCHA the portal worker gave the Placetta team to solve in its live browser. The live address is read only through human_check_take, which audits it.';
create index if not exists human_checks_filing on public.human_checks (filing_id);
create index if not exists human_checks_open on public.human_checks (created_at) where closed_at is null;
alter table public.human_checks enable row level security;
revoke all on public.human_checks from public, anon, authenticated;
-- staff may list them (two-step sign-in, is_staff); the live address is not among the columns anyone may select
grant select (id, filing_id, workspace_id, state, created_at, escalate_at, hold_until, opened_by, opened_at, closed_at) on public.human_checks to authenticated;
drop policy if exists "staff read human checks" on public.human_checks;
create policy "staff read human checks" on public.human_checks for select to authenticated using (public.is_staff());
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then execute 'revoke all on public.human_checks from placetta_filer'; end if;
end $$;

alter table public.team_tasks drop constraint if exists team_tasks_kind_check;
alter table public.team_tasks add constraint team_tasks_kind_check
  check (kind in ('handoff', 'check_agency', 'skill_broken', 'destination_stale', 'review', 'quote', 'line_health', 'ai_spend', 'ask_person', 'margin', 'team_time', 'selector_drift', 'playbook_review', 'billing', 'human_check'));

-- The team's hours: weekdays from 9 am in New York to 6 pm in Los Angeles.
create or replace function public.human_check_team_hours(p_at timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select extract(isodow from (p_at at time zone 'America/New_York')) between 1 and 5
     and (p_at at time zone 'America/New_York')::time >= time '09:00'
     and extract(isodow from (p_at at time zone 'America/Los_Angeles')) between 1 and 5
     and (p_at at time zone 'America/Los_Angeles')::time < time '18:00'
$$;

-- When an unopened check goes to the owner: 15 minutes from now in the team's hours, at once outside them.
create or replace function public.human_check_escalate_at(p_at timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select case when public.human_check_team_hours(p_at) then p_at + interval '15 minutes' else p_at end
$$;

-- Ends a check and its team task (the one place either is closed).
create or replace function public.human_check_end(p_check uuid, p_state text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare c public.human_checks; f public.filings; n int;
begin
  if p_state not in ('solved', 'to_owner', 'ended') then raise exception 'bad_state'; end if;
  update public.human_checks h set state = p_state, closed_at = now()
  where h.id = p_check and h.closed_at is null
    and (h.state = 'waiting' or (h.state = 'to_owner' and p_state in ('to_owner', 'ended')))
  returning h.* into c;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  update public.team_tasks set done_at = now(), done_by = c.opened_by where dedupe = 'human_check:' || c.id::text and done_at is null;
  -- only a check someone on the team opened is theirs to have solved
  if p_state = 'solved' and c.opened_by is not null then
    select * into f from public.filings where id = c.filing_id;
    insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
    values (c.workspace_id, 'team', c.opened_by,
            jsonb_build_object('en', 'Solved a human check for you', 'zh', '为您完成了一次真人验证'), f.title,
            jsonb_build_object('kind', 'human_check', 'filing_id', c.filing_id, 'human_check_id', c.id, 'opened_at', c.opened_at, 'solved_at', now()));
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------- the filer (with the run's token for the filing)

-- A visible CAPTCHA on a running portal filing: a new check for the team, with its task, and when it goes to the owner.
-- Any earlier open check on the filing ends. The address must be the worker's own live view of the page.
create or replace function public.filer_human_check_open(p_filing uuid, p_live_url text, p_hold_until timestamptz)
returns table (check_id uuid, escalates_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare f public.filings; c public.human_checks; old uuid; biz text; host text;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is distinct from 'running' or f.channel is distinct from 'portal' then raise exception 'filing_not_running'; end if;
  if not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  if coalesce(p_live_url, '') !~ '^https://[^\s?#]+/live/[A-Za-z0-9_-]{32}$' then raise exception 'live_url_invalid'; end if;
  for old in select h.id from public.human_checks h where h.filing_id = p_filing and h.closed_at is null loop
    perform public.human_check_end(old, 'ended');
  end loop;
  insert into public.human_checks (filing_id, workspace_id, live_url, escalate_at, hold_until)
  values (f.id, f.workspace_id, p_live_url, public.human_check_escalate_at(now()),
          least(greatest(coalesce(p_hold_until, now()), now() + interval '1 minute'), now() + interval '30 minutes'))
  returning * into c;
  if c.escalate_at > now() then
    select w.name into biz from public.workspaces w where w.id = f.workspace_id;
    host := coalesce(substring(f.portal_url from '^https?://([^/:?#]+)'), f.payload ->> 'official', 'the agency''s site');
    insert into public.team_tasks (kind, filing_id, workspace_id, title, detail, dedupe)
    values ('human_check', f.id, f.workspace_id,
            left('Solve a human check on ' || host || coalesce(' for ' || biz, ''), 300),
            jsonb_build_object('human_check_id', c.id, 'escalate_at', c.escalate_at, 'hold_until', c.hold_until),
            'human_check:' || c.id::text)
    on conflict (dedupe) do nothing;
  end if;
  return query select c.id, c.escalate_at;
end $$;

-- Where a check stands, for the worker's poll.
create or replace function public.filer_human_check(p_check uuid)
returns table (check_state text, opened timestamptz, escalates_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select h.state, h.opened_at, h.escalate_at from public.human_checks h
  where h.id = p_check and public.filer_run_ok(h.filing_id)
$$;

-- The worker ends a check: solved (the page no longer asks), to_owner (nobody took it in time, or staff passed it), or
-- ended (the filing stopped, or the run is over).
create or replace function public.filer_human_check_close(p_check uuid, p_state text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare fid uuid;
begin
  select h.filing_id into fid from public.human_checks h where h.id = p_check;
  if fid is null then raise exception 'no_such_check'; end if;
  if not public.filer_run_ok(fid) then raise exception 'run_token_invalid'; end if;
  return public.human_check_end(p_check, p_state);
end $$;

-- ---------------------------------------------------------------- staff (two-step sign-in: is_staff)

-- Open the live browser: the audit row first (who, when, which filing), then the address.
create or replace function public.human_check_take(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare c public.human_checks; f public.filings;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  select * into c from public.human_checks where id = p_id for update;
  if c.id is null or c.closed_at is not null or c.state <> 'waiting' or c.hold_until <= now() then raise exception 'human_check_closed'; end if;
  select * into f from public.filings where id = c.filing_id;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (c.workspace_id, 'team', auth.uid(),
          jsonb_build_object('en', 'Opened the live browser to solve a human check for you', 'zh', '打开实时浏览器为您完成真人验证'), f.title,
          jsonb_build_object('kind', 'human_check', 'filing_id', c.filing_id, 'human_check_id', c.id));
  update public.human_checks set opened_by = coalesce(opened_by, auth.uid()), opened_at = coalesce(opened_at, now()) where id = p_id;
  return c.live_url;
end $$;

-- Give it to the owner now (the worker sees this on its next poll and hands the page to the owner, with one tap).
create or replace function public.human_check_pass(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  update public.human_checks set state = 'to_owner' where id = p_id and state = 'waiting' and closed_at is null;
  get diagnostics n = row_count;
  if n = 1 then update public.team_tasks set done_at = now(), done_by = auth.uid() where dedupe = 'human_check:' || p_id::text and done_at is null; end if;
  return n = 1;
end $$;

-- ---------------------------------------------------------------- the stuck-run sweep

-- As 20261101090000_handoffs_to_business.sql, and: a running filing whose browser is held for a person (provider_ref
-- held-until, the team solving a human check) is left to its worker until then, and checks past their hold end.
create or replace function public.requeue_stuck_filings() returns int
language plpgsql security definer set search_path = '' as $$
declare n int; m int := 0; r record; x uuid;
begin
  for x in select h.id from public.human_checks h where h.closed_at is null and h.hold_until < now() loop
    perform public.human_check_end(x, 'ended');
  end loop;

  for r in
    update public.filings set agent_state = 'handoff', channel = 'team',
      agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'handoff', 'ref', 'maybe_submitted',
        'en', 'Placetta stopped partway after pressing submit on the agency''s site.',
        'zh', '快哉在机构网站点击提交后中断。'))
    where agent_state = 'running' and channel = 'portal' and updated_at < now() - interval '15 minutes' and submit_clicked_at is not null
      and not (coalesce(provider_ref, '') like 'held-until:%' and substr(provider_ref, 12)::timestamptz > now())
    returning id, workspace_id
  loop
    insert into public.team_tasks(kind, filing_id, workspace_id, title, dedupe)
    values ('check_agency', r.id, r.workspace_id, 'Run stopped after submit was pressed; the business was asked to check the agency before sending again.', 'check_agency:' || r.id)
    on conflict (dedupe) do nothing;
    m := m + 1;
  end loop;

  with moved as (
    update public.filings set
      agent_state = case when attempts >= 3 then 'handoff' else 'queued' end,
      channel = case when attempts >= 3 then 'team' else channel end,
      agent_log = agent_log || case when attempts >= 3
        then jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'handoff', 'ref', 'portal_failed',
          'en', 'The agency''s site failed 3 times. Odelia tries another way the agency takes, or gives it to you to send.',
          'zh', '机构网站 3 次未能完成。Odelia 会改用机构接受的其他方式，否则交由您自行提交。'))
        else jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'retry', 'en', 'Trying again', 'zh', '重新尝试')) end
    where agent_state = 'running' and updated_at < now() - interval '15 minutes'
      and submit_clicked_at is null and channel = 'portal'
      and not (coalesce(provider_ref, '') like 'held-until:%' and substr(provider_ref, 12)::timestamptz > now())
    returning id
  )
  select count(*) into n from moved;
  return n + m;
end $$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.human_check_team_hours(timestamptz), public.human_check_escalate_at(timestamptz),
  public.human_check_end(uuid, text), public.filer_human_check_open(uuid, text, timestamptz), public.filer_human_check(uuid),
  public.filer_human_check_close(uuid, text), public.human_check_take(uuid), public.human_check_pass(uuid),
  public.requeue_stuck_filings() from public, anon, authenticated;
grant execute on function public.human_check_team_hours(timestamptz), public.human_check_escalate_at(timestamptz),
  public.filer_human_check_open(uuid, text, timestamptz), public.filer_human_check(uuid), public.filer_human_check_close(uuid, text),
  public.requeue_stuck_filings() to service_role;
grant execute on function public.human_check_take(uuid), public.human_check_pass(uuid) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'grant execute on function public.filer_human_check_open(uuid, text, timestamptz), public.filer_human_check(uuid), public.filer_human_check_close(uuid, text) to placetta_filer';
  end if;
end $$;
