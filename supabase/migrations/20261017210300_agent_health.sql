-- Running Odelia at scale, in the open for the team: an Agent health page (runs per day, first-try pass rate, tool
-- errors, time to first reply and to done, AI cost per run and by vendor and model, saver mode, throttles, and the
-- slowest and most expensive runs with a replay of each), a weekly governance summary, and an incident log the team
-- keeps (what happened, the impact, the fix). Safe to run twice.
--
-- The run's times come from the run clock (20261017200000_odelia_metrics: first_text_at, the first words shown, and
-- done_at, when the answer was done); a run that failed or was stopped finishes at its last save (updated_at).
-- What's measured from here on (nothing is backfilled):
--   agent_runs.tool_calls/errors  the tools it called and how many returned an error (agent-run writes them)
--   ai_events.saver             whether the workspace was in saver mode when the call was made

alter table public.agent_runs add column if not exists tool_calls int check (tool_calls is null or tool_calls >= 0);
alter table public.agent_runs add column if not exists tool_errors int check (tool_errors is null or tool_errors >= 0);
create index if not exists agent_runs_created on public.agent_runs (created_at);

-- When a run stopped running: the run clock's done time, or its last save for one that failed or was stopped.
create or replace function public.agent_run_end(r public.agent_runs) returns timestamptz
language sql stable set search_path = '' as $$
  select coalesce(r.done_at, case when r.status in ('done', 'failed', 'stopped') then r.updated_at end);
$$;
revoke execute on function public.agent_run_end(public.agent_runs) from public, anon, authenticated;

-- agent-run reports a run's tool counts when it ends.
create or replace function public.agent_run_tools(p_id uuid, p_calls int, p_errors int) returns void
language sql security definer set search_path = '' as $$
  update public.agent_runs set tool_calls = greatest(coalesce(p_calls, 0), 0), tool_errors = least(greatest(coalesce(p_errors, 0), 0), greatest(coalesce(p_calls, 0), 0))
   where id = p_id;
$$;
revoke execute on function public.agent_run_tools(uuid, int, int) from public, anon, authenticated;
grant execute on function public.agent_run_tools(uuid, int, int) to service_role;

-- Saver mode on each AI event, the same rule the gate uses (a throttle holds, or 60% of the allowance is used).
alter table public.ai_events add column if not exists saver boolean;
create or replace function public.ai_events_saver() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := public.ai_rules(); b jsonb;
begin
  if new.saver is not null then return new; end if;
  b := public.ai_budget(new.workspace_id);
  new.saver := exists (select 1 from public.ai_throttles t where t.workspace_id = new.workspace_id and t.until > now())
    or (coalesce((b->>'limit_usd')::numeric, 0) > 0 and coalesce((b->>'used_usd')::numeric, 0) >= (r->>'reduced_at')::numeric * (b->>'limit_usd')::numeric);
  return new;
exception when others then
  return new;   -- never let the measurement stop a call
end $$;
revoke execute on function public.ai_events_saver() from public, anon, authenticated;
drop trigger if exists ai_events_saver on public.ai_events;
create trigger ai_events_saver before insert on public.ai_events for each row execute function public.ai_events_saver();

/* ------------------------------ the numbers ------------------------------ */

-- A run's AI cost, as the AI events of its workspace while it ran (a run can share a workspace with another at the
-- same moment, so this is an estimate).
create or replace function public.agent_run_cost(p_ws uuid, p_from timestamptz, p_to timestamptz) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(sum(e.cost_usd), 0) from public.ai_events e
   where e.workspace_id = p_ws and e.at >= p_from and e.at <= coalesce(p_to, p_from + interval '15 minutes') + interval '5 seconds';
$$;
revoke execute on function public.agent_run_cost(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Everything the Agent health page and the weekly summary show, for the last p_days days (UTC). Server and staff only.
create or replace function public.agent_health_data(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n int := least(greatest(coalesce(p_days, 14), 1), 60); since date := current_date - (least(greatest(coalesce(p_days, 14), 1), 60) - 1);
begin
  return (
    with days as (select generate_series(since, current_date, interval '1 day')::date as d),
    runs as (
      select r.id, r.workspace_id, r.created_at, r.status, r.kind, r.channel, r.title, r.prompt, r.tool_calls, r.tool_errors, r.first_text_at as first_reply_at,
             public.agent_run_end(r) as done_at
        from public.agent_runs r where r.created_at >= since
    ),
    timed as (
      select r.*, extract(epoch from r.first_reply_at - r.created_at) as reply_s, extract(epoch from r.done_at - r.created_at) as done_s from runs r
    ),
    run_days as (
      select d.d, count(t.id) as runs,
        count(t.id) filter (where t.status = 'done') as done, count(t.id) filter (where t.status = 'failed') as failed,
        coalesce(sum(t.tool_calls), 0) as tool_calls, coalesce(sum(t.tool_errors), 0) as tool_errors,
        percentile_cont(0.5) within group (order by t.reply_s) filter (where t.reply_s is not null) as reply_p50,
        percentile_cont(0.95) within group (order by t.reply_s) filter (where t.reply_s is not null) as reply_p95,
        percentile_cont(0.5) within group (order by t.done_s) filter (where t.done_s is not null and t.status = 'done') as done_p50,
        percentile_cont(0.95) within group (order by t.done_s) filter (where t.done_s is not null and t.status = 'done') as done_p95
      from days d left join timed t on t.created_at::date = d.d group by d.d
    ),
    check_days as (
      select at::date as d, count(*) as checked, count(*) filter (where passed = of) as first_try from public.odelia_job_checks where at >= since group by 1
    ),
    ai_days as (
      select at::date as d, coalesce(sum(cost_usd), 0) as cost, count(*) filter (where kind = 'call') as calls,
        count(*) filter (where kind = 'call' and saver) as saver_calls, count(*) filter (where kind = 'call' and saver is not null) as saver_known
      from public.ai_events where at >= since group by 1
    ),
    thr_days as (select at::date as d, count(*) as throttles from public.ai_throttles where at >= since group by 1),
    joined as (
      select r.d, r.runs, r.done, r.failed, r.tool_calls, r.tool_errors, r.reply_p50, r.reply_p95, r.done_p50, r.done_p95,
        coalesce(c.checked, 0) as checked, coalesce(c.first_try, 0) as first_try,
        coalesce(a.cost, 0) as cost, coalesce(a.calls, 0) as calls, coalesce(a.saver_calls, 0) as saver_calls, coalesce(a.saver_known, 0) as saver_known,
        coalesce(th.throttles, 0) as throttles
      from run_days r left join check_days c on c.d = r.d left join ai_days a on a.d = r.d left join thr_days th on th.d = r.d
    ),
    whole as (
      select count(*) as runs, count(*) filter (where status = 'done') as done, count(*) filter (where status = 'failed') as failed,
        coalesce(sum(tool_calls), 0) as tool_calls, coalesce(sum(tool_errors), 0) as tool_errors,
        percentile_cont(0.5) within group (order by reply_s) filter (where reply_s is not null) as reply_p50,
        percentile_cont(0.95) within group (order by reply_s) filter (where reply_s is not null) as reply_p95,
        percentile_cont(0.5) within group (order by done_s) filter (where done_s is not null and status = 'done') as done_p50,
        percentile_cont(0.95) within group (order by done_s) filter (where done_s is not null and status = 'done') as done_p95
      from timed
    ),
    costed as (
      select t.*, public.agent_run_cost(t.workspace_id, t.created_at, t.done_at) as cost_usd from timed t
    ),
    pick as (
      select c.*, w.name as business from costed c left join public.workspaces w on w.id = c.workspace_id
    )
    select jsonb_build_object(
      'days', n, 'since', since,
      'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', j.d, 'runs', j.runs, 'done', j.done, 'failed', j.failed,
          'first_try_pct', case when j.checked > 0 then round(100.0 * j.first_try / j.checked, 1) end, 'checked', j.checked,
          'tool_calls', j.tool_calls, 'tool_error_pct', case when j.tool_calls > 0 then round(100.0 * j.tool_errors / j.tool_calls, 1) end,
          'reply_p50_s', round(j.reply_p50::numeric, 1), 'reply_p95_s', round(j.reply_p95::numeric, 1),
          'done_p50_s', round(j.done_p50::numeric, 1), 'done_p95_s', round(j.done_p95::numeric, 1),
          'ai_cost_usd', round(j.cost, 4), 'cost_per_run_usd', case when j.runs > 0 then round(j.cost / j.runs, 4) end,
          'saver_pct', case when j.saver_known > 0 then round(100.0 * j.saver_calls / j.saver_known, 1) end, 'throttles', j.throttles) order by j.d), '[]'::jsonb) from joined j),
      'totals', (select jsonb_build_object('runs', w.runs, 'done', w.done, 'failed', w.failed, 'tool_calls', w.tool_calls,
          'tool_error_pct', case when w.tool_calls > 0 then round(100.0 * w.tool_errors / w.tool_calls, 1) end,
          'first_try_pct', (select case when sum(checked) > 0 then round(100.0 * sum(first_try) / sum(checked), 1) end from joined),
          'checked', (select sum(checked) from joined),
          'reply_p50_s', round(w.reply_p50::numeric, 1), 'reply_p95_s', round(w.reply_p95::numeric, 1),
          'done_p50_s', round(w.done_p50::numeric, 1), 'done_p95_s', round(w.done_p95::numeric, 1),
          'ai_cost_usd', (select round(sum(cost), 4) from joined),
          'cost_per_run_usd', case when w.runs > 0 then (select round(sum(cost) / w.runs, 4) from joined) end,
          'saver_pct', (select case when sum(saver_known) > 0 then round(100.0 * sum(saver_calls) / sum(saver_known), 1) end from joined),
          'throttles', (select sum(throttles) from joined)) from whole w),
      'by_vendor', (select coalesce(jsonb_agg(jsonb_build_object('provider', v.provider, 'model', v.model, 'calls', v.calls, 'cost_usd', round(v.cost, 4)) order by v.cost desc), '[]'::jsonb)
        from (select coalesce(provider, 'unknown') as provider, coalesce(model, 'unknown') as model, count(*) as calls, sum(cost_usd) as cost
                from public.ai_events where at >= since and kind = 'call' group by 1, 2) v),
      'slowest', (select coalesce(jsonb_agg(x.o order by x.s desc), '[]'::jsonb) from (
        select p.done_s as s, jsonb_build_object('id', p.id, 'business', p.business, 'kind', p.kind, 'channel', p.channel, 'status', p.status,
          'title', coalesce(p.title->>'en', left(p.prompt, 80)), 'created_at', p.created_at, 'reply_s', round(p.reply_s::numeric, 1), 'done_s', round(p.done_s::numeric, 1),
          'cost_usd', round(p.cost_usd, 4), 'tool_calls', p.tool_calls, 'tool_errors', p.tool_errors) as o
        from pick p where p.done_s is not null order by p.done_s desc limit 10) x),
      'costliest', (select coalesce(jsonb_agg(x.o order by x.c desc), '[]'::jsonb) from (
        select p.cost_usd as c, jsonb_build_object('id', p.id, 'business', p.business, 'kind', p.kind, 'channel', p.channel, 'status', p.status,
          'title', coalesce(p.title->>'en', left(p.prompt, 80)), 'created_at', p.created_at, 'reply_s', round(p.reply_s::numeric, 1), 'done_s', round(p.done_s::numeric, 1),
          'cost_usd', round(p.cost_usd, 4), 'tool_calls', p.tool_calls, 'tool_errors', p.tool_errors) as o
        from pick p where p.cost_usd > 0 order by p.cost_usd desc limit 10) x),
      'measured_since', jsonb_build_object(
        'first_reply', (select min(created_at) from public.agent_runs where first_text_at is not null),
        'tools', (select min(created_at) from public.agent_runs where tool_calls is not null),
        'saver', (select min(at) from public.ai_events where saver is not null)))
  );
end $$;
revoke execute on function public.agent_health_data(int) from public, anon, authenticated;
grant execute on function public.agent_health_data(int) to service_role;

create or replace function public.agent_health(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return public.agent_health_data(p_days);
end $$;

-- One run, step by step, for the team: what was asked, each step it showed, its timing and tools, and every AI call
-- its workspace made while it ran (model, vendor, role, cost, saver mode), with the reviewer's checks of its jobs.
create or replace function public.agent_run_replay(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.agent_runs; done_at timestamptz;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  select * into r from public.agent_runs where id = p_id;
  if r.id is null then raise exception 'No such run.'; end if;
  done_at := public.agent_run_end(r);
  return jsonb_build_object(
    'id', r.id, 'workspace_id', r.workspace_id, 'business', (select name from public.workspaces where id = r.workspace_id),
    'kind', r.kind, 'channel', r.channel, 'status', r.status, 'title', r.title, 'prompt', left(r.prompt, 600), 'error', r.error,
    'created_at', r.created_at, 'first_reply_at', r.first_text_at, 'done_at', done_at,
    'tool_calls', r.tool_calls, 'tool_errors', r.tool_errors, 'steps', r.steps,
    'reply', case when jsonb_typeof(r.reply->'text') = 'array' then r.reply->'text' end,
    'calls', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'role', e.role, 'provider', e.provider, 'model', e.model, 'cost_usd', e.cost_usd, 'saver', e.saver) order by e.at), '[]'::jsonb)
      from public.ai_events e where e.workspace_id = r.workspace_id and e.at >= r.created_at and e.at <= coalesce(done_at, r.created_at + interval '15 minutes') + interval '5 seconds'),
    'cost_usd', public.agent_run_cost(r.workspace_id, r.created_at, done_at),
    'checks', (select coalesce(jsonb_agg(jsonb_build_object('job_id', c.job_id, 'passed', c.passed, 'of', c.of, 'at', c.at) order by c.at), '[]'::jsonb)
      from public.odelia_job_checks c where c.run_id = r.id));
end $$;

/* ------------------------------ the incident log ------------------------------ */

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  happened_at timestamptz not null,
  title text not null check (length(title) between 1 and 300),
  impact text not null check (length(impact) between 1 and 1000),
  fix text check (fix is null or length(fix) <= 1000),
  public boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.incidents is 'What went wrong, the impact, and the fix, kept by the team. Entries marked public show on the trust page.';
create index if not exists incidents_happened on public.incidents(happened_at desc);
alter table public.incidents enable row level security;
revoke all on public.incidents from public, anon, authenticated;
drop trigger if exists incidents_touch on public.incidents;
create trigger incidents_touch before update on public.incidents for each row execute function public.touch();

-- The day the log was started: the trust page says "kept since" this day.
alter table public.app_settings add column if not exists incident_log_since date;
update public.app_settings set incident_log_since = coalesce(incident_log_since, current_date) where id;

create or replace function public.incident_add(p_happened_at timestamptz, p_title text, p_impact text, p_fix text default null, p_public boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare iid uuid;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Say what happened.'; end if;
  if length(trim(coalesce(p_impact, ''))) = 0 then raise exception 'Say what the impact was.'; end if;
  if p_happened_at is null or p_happened_at > now() + interval '1 hour' then raise exception 'Enter when it happened.'; end if;
  insert into public.incidents(happened_at, title, impact, fix, public, created_by)
  values (p_happened_at, left(trim(p_title), 300), left(trim(p_impact), 1000), nullif(left(trim(coalesce(p_fix, '')), 1000), ''), coalesce(p_public, false), auth.uid())
  returning id into iid;
  return iid;
end $$;

create or replace function public.incident_update(p_id uuid, p_fix text, p_public boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  update public.incidents set fix = nullif(left(trim(coalesce(p_fix, '')), 1000), ''), public = coalesce(p_public, public) where id = p_id;
  if not found then raise exception 'No such incident.'; end if;
end $$;

create or replace function public.incidents_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return jsonb_build_object('since', (select incident_log_since from public.app_settings where id),
    'incidents', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'happened_at', i.happened_at, 'title', i.title, 'impact', i.impact, 'fix', i.fix,
      'public', i.public, 'by', u.email, 'created_at', i.created_at) order by i.happened_at desc), '[]'::jsonb)
      from public.incidents i left join auth.users u on u.id = i.created_by));
end $$;

-- For the trust page, signed out: the day the log began and the entries the team made public.
create or replace function public.incident_log_public() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('since', (select incident_log_since from public.app_settings where id),
    'incidents', (select coalesce(jsonb_agg(jsonb_build_object('happened_at', i.happened_at::date, 'title', i.title, 'impact', i.impact, 'fix', i.fix) order by i.happened_at desc), '[]'::jsonb)
      from (select * from public.incidents where public order by happened_at desc limit 50) i));
$$;

/* ------------------------------ the weekly governance summary ------------------------------ */

create table if not exists public.governance_reports (
  week date primary key,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  emailed_to int not null default 0,
  updates int not null default 0
);
comment on table public.governance_reports is 'The weekly agent health summary sent to the team on Mondays: one row per week, so it goes out once.';
alter table public.governance_reports enable row level security;
revoke all on public.governance_reports from public, anon, authenticated;

-- The monitor's claim on a week: true the first time, with the summary kept.
create or replace function public.governance_claim(p_week date, p_summary jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.governance_reports(week, summary) values (p_week, coalesce(p_summary, '{}'::jsonb)) on conflict (week) do nothing;
  return found;
end $$;

-- The summary as an Update in the team's own workspaces: those where every member is on the staff list.
create or replace function public.governance_post(p_week date, p_title jsonb, p_body jsonb, p_emailed int default 0) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.updates(workspace_id, kind, title, body, dedupe)
  select w.id, 'team', p_title, p_body, 'governance:' || p_week
    from public.workspaces w
   where exists (select 1 from public.workspace_members m where m.workspace_id = w.id)
     and not exists (select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
                      where m.workspace_id = w.id and not exists (select 1 from public.staff_emails s where s.email = lower(u.email)))
  on conflict (workspace_id, dedupe) do nothing;
  get diagnostics n = row_count;
  update public.governance_reports set updates = n, emailed_to = coalesce(p_emailed, 0) where week = p_week;
  return n;
end $$;

create or replace function public.governance_reports_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('week', g.week, 'summary', g.summary, 'emailed_to', g.emailed_to, 'updates', g.updates) order by g.week desc), '[]'::jsonb)
    from (select * from public.governance_reports order by week desc limit 12) g);
end $$;

revoke execute on function public.agent_health(int), public.agent_run_replay(uuid), public.incident_add(timestamptz, text, text, text, boolean),
  public.incident_update(uuid, text, boolean), public.incidents_list(), public.governance_reports_list() from public, anon;
grant execute on function public.agent_health(int), public.agent_run_replay(uuid), public.incident_add(timestamptz, text, text, text, boolean),
  public.incident_update(uuid, text, boolean), public.incidents_list(), public.governance_reports_list() to authenticated;
revoke execute on function public.incident_log_public() from public;
grant execute on function public.incident_log_public() to anon, authenticated;
revoke execute on function public.governance_claim(date, jsonb), public.governance_post(date, jsonb, jsonb, int) from public, anon, authenticated;
grant execute on function public.governance_claim(date, jsonb), public.governance_post(date, jsonb, jsonb, int) to service_role;
