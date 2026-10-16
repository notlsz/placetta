-- Odelia runs on a mix of models, and the bill has to stay under what each plan pays. This migration adds:
--   1. the role each call served and the vendor that answered, on every AI event (the subprocessor list can be proven)
--   2. saver mode from 60% of a workspace's allowance (was 80%): cheaper models, no web research, shorter answers.
--      The person is told once per period (ai_saver_told).
--   3. alerts at 50% and 80% of the allowance, as Updates to the workspace (ai_allowance_alerts, run by the monitor)
--   4. automatic throttles: a workspace that spends more than AI_WS_DAILY_LIMIT_USD in a day, or more than 5x the median
--      workspace that day, runs in saver mode for the rest of the day, and the team gets a task (ai_throttle_sweep)
--   5. margin accounting: AI cost against plan revenue, per workspace per month and for the whole company
--      (ai_margin_month, ai_margin, ai_margin_company), for the service role and staff only
-- Safe to run twice.

/* ------------------------------ 1. who served what ------------------------------ */

alter table public.ai_events add column if not exists role text check (role is null or role in ('plan', 'review', 'extract', 'translate', 'draft', 'short', 'watch', 'deep'));
alter table public.ai_events add column if not exists provider text check (provider is null or length(provider) <= 40);
comment on column public.ai_events.role is 'What the call was for: plan, review, extract, translate, draft, short, watch or deep.';
comment on column public.ai_events.provider is 'The vendor that answered: anthropic, gemini, openai, deepseek, openrouter or groq.';
create index if not exists ai_events_at_role on public.ai_events (at, role);

/* The same request twice within ten minutes (a double tap, a retry, a script) gets the earlier run instead of a second
   bill: agent-run keys each task by a hash of its prompt and history, and looks the key up before starting another. */
alter table public.agent_runs add column if not exists dedupe text check (dedupe is null or length(dedupe) <= 64);
create index if not exists agent_runs_dedupe on public.agent_runs (workspace_id, dedupe, created_at desc) where dedupe is not null;

/* A request from the server (the Edge Functions' service key), as opposed to a signed-in person. */
create or replace function public.is_service() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;
revoke execute on function public.is_service() from public, anon;
grant execute on function public.is_service() to authenticated, service_role;

/* ------------------------------ 2. the numbers ------------------------------ */

create or replace function public.ai_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'per_location_month', 25,      -- Essentials, $149 a location a month: up to $25 of AI
    'per_location_month_pro', 50,  -- Pro, $299 a location a month: up to $50 of AI
    'opening_store_month', 50,     -- each store still opening (its opening fee paid): $50 more a month while it opens
    'entry_per_market', 15,        -- $299 a market, once: $15 of AI for 30 days
    'entry_days', 30,
    'comped_month', 200,
    'reduced_at', 0.6,             -- from 60% of the budget, saver mode: cheaper models, no web research
    'alert_at', jsonb_build_array(0.5, 0.8),   -- the owner hears at 50% and 80%
    'tasks_per_hour', 15, 'tasks_per_day', 80,         -- per person
    'calls_per_minute', 30, 'calls_per_hour', 300      -- per workspace (a task is up to 16 calls)
  )
$$;

/* ------------------------------ 4. throttles (the table; the gate reads it) ------------------------------ */

create table if not exists public.ai_throttles (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reason text not null check (reason in ('daily_limit', 'outlier')),
  spent_usd numeric(12, 4) not null default 0,
  until timestamptz not null,
  at timestamptz not null default now()
);
comment on table public.ai_throttles is 'Workspaces in saver mode for the rest of the day because of what they spent. Server only.';
create index if not exists ai_throttles_ws_until on public.ai_throttles (workspace_id, until desc);
alter table public.ai_throttles enable row level security;
revoke all on public.ai_throttles from public, anon, authenticated;

/* The gate: as before, plus saver mode from 60% or while a throttle holds, with the reason. */
create or replace function public.ai_gate(ws uuid, uid uuid, p_kind text, p_daily_limit numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := public.ai_rules();
  b jsonb; n int; oldest timestamptz; ev bigint; today numeric; throttled boolean;
begin
  if p_kind not in ('task', 'call') then raise exception 'kind must be task or call'; end if;
  -- no plan, no AI: checked first, so an unpaid workspace never adds to anything
  b := public.ai_budget(ws);
  if b->>'plan' = 'none' then return jsonb_build_object('ok', false, 'code', 'plan_required', 'budget', b); end if;
  if b->>'plan' = 'entry_ended' then return jsonb_build_object('ok', false, 'code', 'entry_ended', 'budget', b); end if;
  select coalesce(sum(cost_usd), 0) into today from public.ai_events where at >= date_trunc('day', now());
  if p_daily_limit is not null and today >= p_daily_limit then
    return jsonb_build_object('ok', false, 'code', 'paused', 'retry_after', extract(epoch from date_trunc('day', now()) + interval '1 day' - now())::int);
  end if;
  if p_kind = 'task' and uid is not null then
    select count(*), min(at) into n, oldest from public.ai_events where user_id = uid and kind = 'task' and at > now() - interval '1 hour';
    if n >= (r->>'tasks_per_hour')::int then
      return jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', greatest(60, extract(epoch from oldest + interval '1 hour' - now())::int));
    end if;
    select count(*), min(at) into n, oldest from public.ai_events where user_id = uid and kind = 'task' and at > now() - interval '1 day';
    if n >= (r->>'tasks_per_day')::int then
      return jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', greatest(60, extract(epoch from oldest + interval '1 day' - now())::int));
    end if;
  end if;
  if p_kind = 'call' then
    select count(*) into n from public.ai_events where workspace_id = ws and kind = 'call' and at > now() - interval '1 minute';
    if n >= (r->>'calls_per_minute')::int then return jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', 60); end if;
    select count(*), min(at) into n, oldest from public.ai_events where workspace_id = ws and kind = 'call' and at > now() - interval '1 hour';
    if n >= (r->>'calls_per_hour')::int then
      return jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after', greatest(60, extract(epoch from oldest + interval '1 hour' - now())::int));
    end if;
  end if;
  if (b->>'used_usd')::numeric >= (b->>'limit_usd')::numeric then
    return jsonb_build_object('ok', false, 'code', 'over_budget', 'budget', b);
  end if;
  throttled := exists (select 1 from public.ai_throttles t where t.workspace_id = ws and t.until > now());
  insert into public.ai_events (workspace_id, user_id, kind) values (ws, uid, p_kind) returning id into ev;
  return jsonb_build_object('ok', true, 'event', ev, 'budget', b,
    'tier', case when throttled or (b->>'used_usd')::numeric >= (r->>'reduced_at')::numeric * (b->>'limit_usd')::numeric then 'reduced' else 'full' end,
    'reason', case when throttled then 'throttle' when (b->>'used_usd')::numeric >= (r->>'reduced_at')::numeric * (b->>'limit_usd')::numeric then 'allowance' else null end);
end $$;

/* After a call: its price, its role and its vendor. The old five-argument form is replaced (role and provider default to null). */
drop function if exists public.ai_record(bigint, numeric, text, bigint, bigint);
create or replace function public.ai_record(p_event bigint, p_cost numeric, p_model text, p_in bigint, p_out bigint, p_role text default null, p_provider text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.ai_events; b jsonb; need numeric; take numeric := 0; credit numeric;
begin
  select * into e from public.ai_events where id = p_event for update;
  if not found then return; end if;
  update public.ai_events set cost_usd = greatest(0, coalesce(p_cost, 0)), model = left(p_model, 120),
    role = case when p_role in ('plan', 'review', 'extract', 'translate', 'draft', 'short', 'watch', 'deep') then p_role else null end,
    provider = left(nullif(p_provider, ''), 40)
    where id = p_event;
  b := public.ai_budget(e.workspace_id);
  need := (b->>'used_usd')::numeric - (b->>'budget_usd')::numeric
    - (select coalesce(sum(from_credit), 0) from public.ai_events where workspace_id = e.workspace_id and at >= (b->>'period_start')::timestamptz);
  if need > 0 and b->>'plan' <> 'none' then
    select ai_credit_usd into credit from public.billing where workspace_id = e.workspace_id for update;
    take := least(need, coalesce(credit, 0));
    if take > 0 then
      update public.billing set ai_credit_usd = ai_credit_usd - take, updated_at = now() where workspace_id = e.workspace_id;
      update public.ai_events set from_credit = take where id = p_event;
    end if;
  end if;
  insert into public.agent_usage as u (workspace_id, day, calls, input_tokens, output_tokens, cost_usd)
  values (e.workspace_id, current_date, 1, coalesce(p_in, 0), coalesce(p_out, 0), greatest(0, coalesce(p_cost, 0)))
  on conflict (workspace_id, day) do update set calls = u.calls + 1, input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens, cost_usd = u.cost_usd + excluded.cost_usd;
end $$;
revoke execute on function public.ai_gate(uuid, uuid, text, numeric), public.ai_record(bigint, numeric, text, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.ai_gate(uuid, uuid, text, numeric), public.ai_record(bigint, numeric, text, bigint, bigint, text, text) to service_role;

/* Saver mode is announced once per period: true the first time this is asked in a period, false after. */
alter table public.billing add column if not exists ai_saver_told_at timestamptz;
create or replace function public.ai_saver_told(ws uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare b jsonb := public.ai_budget(ws); told timestamptz;
begin
  select ai_saver_told_at into told from public.billing where workspace_id = ws for update;
  if not found then return false; end if;
  if told is not null and told >= (b->>'period_start')::timestamptz then return false; end if;
  update public.billing set ai_saver_told_at = now() where workspace_id = ws;
  return true;
end $$;
revoke execute on function public.ai_saver_told(uuid) from public, anon, authenticated;
grant execute on function public.ai_saver_told(uuid) to service_role;

/* What the app shows a member: as before, plus whether saver mode is on. */
create or replace function public.ai_status(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b jsonb; r jsonb := public.ai_rules(); pct numeric;
begin
  if not (public.is_member(ws) or public.is_staff()) then raise exception 'Not your workspace.'; end if;
  b := public.ai_budget(ws);
  pct := case when (b->>'limit_usd')::numeric > 0 then least(100, round(100 * (b->>'used_usd')::numeric / (b->>'limit_usd')::numeric)) else 100 end;
  return jsonb_build_object('plan', b->'plan', 'used_pct', pct, 'resets_at', b->'period_end', 'has_credit', (b->>'credit_usd')::numeric > 0,
    'saver', (b->>'plan') not in ('none', 'entry_ended') and (b->>'limit_usd')::numeric > 0 and (
      (b->>'used_usd')::numeric >= (r->>'reduced_at')::numeric * (b->>'limit_usd')::numeric
      or exists (select 1 from public.ai_throttles t where t.workspace_id = ws and t.until > now())),
    'saver_at_pct', round(100 * (r->>'reduced_at')::numeric));
end $$;

/* ------------------------------ 3. allowance alerts ------------------------------ */

/*
 * Workspaces that crossed 50% or 80% of this period's allowance and haven't been told: one Update each (the unique
 * (workspace, dedupe) key makes it once per threshold per period). Returns what was just written, so the monitor can
 * email and post it like any other update. Service role only (the monitor).
 */
create or replace function public.ai_allowance_alerts()
returns table (workspace_id uuid, threshold int, used_pct int, left_usd numeric, period_end timestamptz, dedupe text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare r jsonb := public.ai_rules(); w record; b jsonb; th numeric; pct int; lim numeric; used numeric; saver int; p_end timestamptz; d text; txt_en text; txt_zh text; ttl_en text; ttl_zh text; left_ numeric; ins int;
begin
  saver := round(100 * (r->>'reduced_at')::numeric);
  for w in select e.workspace_id as ws from public.ai_events e where e.at >= date_trunc('month', now()) - interval '31 days' group by e.workspace_id loop
    b := public.ai_budget(w.ws);
    if (b->>'plan') in ('none', 'entry_ended') then continue; end if;
    lim := (b->>'limit_usd')::numeric; used := (b->>'used_usd')::numeric;
    if lim <= 0 then continue; end if;
    pct := least(100, floor(100 * used / lim))::int;
    p_end := (b->>'period_end')::timestamptz;
    left_ := greatest(0, round(lim - used, 2));
    for th in select x.value::numeric from jsonb_array_elements_text(r->'alert_at') x order by 1 desc loop
      if used < th * lim then continue; end if;
      d := format('ai:%s:%s', round(100 * th)::int, to_char((b->>'period_start')::timestamptz, 'YYYYMMDD'));
      ttl_en := format('Odelia allowance: %s%% used', round(100 * th)::int);
      ttl_zh := format('Odelia 额度已用 %s%%', round(100 * th)::int);
      txt_en := format('$%s of this period''s $%s is left; it renews on %s. From %s%% Odelia runs in saver mode (cheaper models, no web research) until then. Add a pack to keep full mode.',
        left_, round(lim, 2), to_char(p_end at time zone 'UTC', 'FMMonth FMDD'), saver);
      txt_zh := format('本期 $%s 额度还剩 $%s，将于 %s 月 %s 日重置。用到 %s%% 后，Odelia 会进入节省模式（更省的模型，不做网页调研）直到重置。购买加量包可保持完整模式。',
        round(lim, 2), left_, extract(month from p_end at time zone 'UTC')::int, extract(day from p_end at time zone 'UTC')::int, saver);
      insert into public.updates (workspace_id, kind, title, body, dedupe)
        values (w.ws, 'agent', jsonb_build_object('en', ttl_en, 'zh', ttl_zh), jsonb_build_object('en', txt_en, 'zh', txt_zh), d)
        on conflict (workspace_id, dedupe) do nothing;
      get diagnostics ins = row_count;
      if ins > 0 then
        workspace_id := w.ws; threshold := round(100 * th)::int; used_pct := pct; left_usd := left_; period_end := p_end; dedupe := d;
        return next;
      end if;
      exit;   -- the highest threshold crossed is the one that matters; lower ones were sent earlier or are implied
    end loop;
  end loop;
end $$;
revoke execute on function public.ai_allowance_alerts() from public, anon, authenticated;
grant execute on function public.ai_allowance_alerts() to service_role;

/* ------------------------------ 4. automatic throttles ------------------------------ */

alter table public.team_tasks drop constraint if exists team_tasks_kind_check;
alter table public.team_tasks add constraint team_tasks_kind_check
  check (kind in ('handoff', 'check_agency', 'skill_broken', 'destination_stale', 'review', 'quote', 'line_health', 'ai_spend'));

/* One workspace's AI spend per day before saver mode, kept here so the scheduled sweep can read it (the monitor copies
   AI_WS_DAILY_LIMIT_USD into it when that secret is set). */
alter table public.app_settings add column if not exists ai_ws_daily_limit_usd numeric(10, 2) not null default 10 check (ai_ws_daily_limit_usd > 0);

/*
 * Today's outliers: a workspace that spent at least p_ws_daily_limit today (null: the limit in app_settings), or (with
 * 5 or more workspaces spending today) more than 5x the median spender and at least $1, goes into saver mode until
 * midnight UTC, once per day, and the team gets a task. Returns the workspaces just throttled. Service role only: the
 * monitor runs it daily with the secret's value, and pg_cron every 15 minutes in between.
 */
create or replace function public.ai_throttle_sweep(p_ws_daily_limit numeric default null)
returns table (workspace_id uuid, spent_usd numeric, reason text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare lim numeric := greatest(coalesce(p_ws_daily_limit, (select s.ai_ws_daily_limit_usd from public.app_settings s limit 1), 10), 0.01); med numeric; n int; x record; why text; midnight timestamptz := date_trunc('day', now()) + interval '1 day'; nm text;
begin
  select count(*), percentile_cont(0.5) within group (order by s.spent) into n, med
    from (select sum(e.cost_usd) as spent from public.ai_events e where e.at >= date_trunc('day', now()) group by e.workspace_id having sum(e.cost_usd) > 0) s;
  for x in select e.workspace_id as ws, sum(e.cost_usd) as spent from public.ai_events e where e.at >= date_trunc('day', now()) group by e.workspace_id having sum(e.cost_usd) > 0 loop
    why := case when x.spent >= lim then 'daily_limit' when n >= 5 and med > 0 and x.spent > 5 * med and x.spent >= 1 then 'outlier' else null end;
    if why is null then continue; end if;
    if exists (select 1 from public.ai_throttles t where t.workspace_id = x.ws and t.until > now()) then continue; end if;
    insert into public.ai_throttles (workspace_id, reason, spent_usd, until) values (x.ws, why, round(x.spent, 4), midnight);
    select w.name into nm from public.workspaces w where w.id = x.ws;
    insert into public.team_tasks (kind, workspace_id, title, detail, dedupe)
      values ('ai_spend', x.ws, format('AI spend: %s used $%s today (%s)', coalesce(nm, 'a workspace'), round(x.spent, 2), case when why = 'daily_limit' then 'over the daily limit' else 'far above the median' end),
        jsonb_build_object('spent_usd', round(x.spent, 4), 'reason', why, 'median_usd', round(coalesce(med, 0), 4), 'limit_usd', lim, 'until', midnight),
        format('ai_spend:%s:%s', x.ws, to_char(now(), 'YYYYMMDD')))
      on conflict (dedupe) do nothing;
    workspace_id := x.ws; spent_usd := round(x.spent, 4); reason := why;
    return next;
  end loop;
end $$;
revoke execute on function public.ai_throttle_sweep(numeric) from public, anon, authenticated;
grant execute on function public.ai_throttle_sweep(numeric) to service_role;

/* The sweep every 15 minutes, so a runaway workspace is slowed within the quarter hour, not at the next daily monitor. */
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; AI spend outliers are throttled only by the daily monitor.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-ai-throttle';
  perform cron.schedule('placetta-ai-throttle', '*/15 * * * *', 'select count(*) from public.ai_throttle_sweep(null)');
end $$;

/* ------------------------------ 5. margin ------------------------------ */

/*
 * Plan revenue a workspace brings in a month, from billing as it stands now: the subscription's monthly equivalent
 * (Essentials $149 or Pro $299 a location; the older Starter $750 and Growth $2,000), plus a $299 entry plan in the
 * month it was paid. Comped workspaces bring nothing. Billing keeps only the current state, so past months are read
 * with today's plan: an estimate, not an invoice total.
 */
create or replace function public.ai_plan_revenue(b public.billing, p_month date) returns numeric
language sql immutable set search_path = '' as $$
  select coalesce(
    case when b.comped then 0
         when b.subscription_status in ('active', 'trialing') then
           case b.subscription_plan when 'pro' then 299 * greatest(1, coalesce(b.paid_locations, 0))
                                    when 'starter' then 750 when 'growth' then 2000
                                    else 149 * greatest(1, coalesce(b.paid_locations, 0)) end
         else 0 end, 0)
    + case when b.entry_paid_at is not null and date_trunc('month', b.entry_paid_at) = date_trunc('month', p_month::timestamptz) then 299 * greatest(1, coalesce(b.entry_markets, 0)) else 0 end;
$$;
revoke execute on function public.ai_plan_revenue(public.billing, date) from public, anon, authenticated;

/* A workspace's AI allowance for a month, from the same rules the gate uses (today's plan). */
create or replace function public.ai_plan_allowance(b public.billing) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(case when b.workspace_id is null then 0 else (public.ai_budget(b.workspace_id)->>'budget_usd')::numeric end, 0);
$$;
revoke execute on function public.ai_plan_allowance(public.billing) from public, anon, authenticated;

/* Per workspace per month: what the AI cost, what the plan paid, and the share. Service role only; staff read it through ai_margin. */
create or replace view public.ai_margin_month as
with months as (
  select e.workspace_id, date_trunc('month', e.at)::date as month from public.ai_events e group by 1, 2
  union
  select b.workspace_id, date_trunc('month', now())::date from public.billing b
   where b.comped or b.subscription_status in ('active', 'trialing') or b.entry_paid_at >= date_trunc('month', now())
), cost as (
  select e.workspace_id, date_trunc('month', e.at)::date as month, sum(e.cost_usd) as ai_cost_usd, count(*) filter (where e.kind = 'call') as calls,
         count(*) filter (where e.kind = 'task') as tasks, sum(e.from_credit) as from_credit_usd
    from public.ai_events e group by 1, 2
), roles as (
  -- the five roles that cost the most, per workspace per month
  select ranked.workspace_id, ranked.month, jsonb_agg(jsonb_build_object('role', ranked.role, 'cost_usd', ranked.cost, 'calls', ranked.calls) order by ranked.cost desc) as top_roles
    from (
      select s.workspace_id, s.month, s.role, s.cost, s.calls, row_number() over (partition by s.workspace_id, s.month order by s.cost desc) as rn
        from (select e.workspace_id, date_trunc('month', e.at)::date as month, coalesce(e.role, 'unknown') as role, round(sum(e.cost_usd), 4) as cost, count(*) as calls
                from public.ai_events e where e.kind = 'call' group by 1, 2, 3) s
    ) ranked
   where ranked.rn <= 5
   group by 1, 2
)
select m.workspace_id, w.name, m.month,
       round(coalesce(c.ai_cost_usd, 0), 4) as ai_cost_usd,
       coalesce(c.calls, 0) as calls, coalesce(c.tasks, 0) as tasks,
       round(coalesce(c.from_credit_usd, 0), 4) as from_credit_usd,
       round(public.ai_plan_revenue(b, m.month), 2) as revenue_usd,
       round(public.ai_plan_allowance(b), 2) as allowance_usd,
       case when public.ai_plan_revenue(b, m.month) > 0 then round(100 * coalesce(c.ai_cost_usd, 0) / public.ai_plan_revenue(b, m.month), 1) else null end as cost_pct,
       coalesce(r.top_roles, '[]'::jsonb) as top_roles
  from months m
  join public.workspaces w on w.id = m.workspace_id
  left join public.billing b on b.workspace_id = m.workspace_id
  left join cost c on c.workspace_id = m.workspace_id and c.month = m.month
  left join roles r on r.workspace_id = m.workspace_id and r.month = m.month;
revoke all on public.ai_margin_month from public, anon, authenticated;
grant select on public.ai_margin_month to service_role;

/* One workspace, one month. Staff (two-step signed in) or the server. */
create or replace function public.ai_margin(ws uuid, p_month date default current_date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare row_ record; b public.billing;
begin
  if not (public.is_service() or public.is_staff()) then raise exception 'Placetta team only.'; end if;
  select * into row_ from public.ai_margin_month m where m.workspace_id = ws and m.month = date_trunc('month', p_month)::date;
  if not found then
    select * into b from public.billing where workspace_id = ws;
    return jsonb_build_object('workspace_id', ws, 'month', to_char(date_trunc('month', p_month), 'YYYY-MM-DD'), 'ai_cost_usd', 0, 'calls', 0, 'tasks', 0,
      'revenue_usd', round(coalesce(public.ai_plan_revenue(b, date_trunc('month', p_month)::date), 0), 2), 'allowance_usd', round(coalesce(public.ai_plan_allowance(b), 0), 2), 'cost_pct', null, 'top_roles', '[]'::jsonb);
  end if;
  return jsonb_build_object('workspace_id', row_.workspace_id, 'name', row_.name, 'month', to_char(row_.month, 'YYYY-MM-DD'), 'ai_cost_usd', row_.ai_cost_usd, 'calls', row_.calls, 'tasks', row_.tasks,
    'from_credit_usd', row_.from_credit_usd, 'revenue_usd', row_.revenue_usd, 'allowance_usd', row_.allowance_usd, 'cost_pct', row_.cost_pct, 'top_roles', row_.top_roles);
end $$;

/* The whole company for a month: AI cost, MRR, gross margin on AI, the 10 dearest workspaces, cost by role and by vendor. */
create or replace function public.ai_margin_company(p_month date default current_date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare mo date := date_trunc('month', p_month)::date; cost numeric; rev numeric; top jsonb; by_role jsonb; by_vendor jsonb; n_ws int; n_calls bigint;
begin
  if not (public.is_service() or public.is_staff()) then raise exception 'Placetta team only.'; end if;
  select coalesce(sum(m.ai_cost_usd), 0), coalesce(sum(m.revenue_usd), 0), count(*) filter (where m.ai_cost_usd > 0), coalesce(sum(m.calls), 0)
    into cost, rev, n_ws, n_calls from public.ai_margin_month m where m.month = mo;
  select coalesce(jsonb_agg(jsonb_build_object('workspace_id', t.workspace_id, 'name', t.name, 'ai_cost_usd', t.ai_cost_usd, 'revenue_usd', t.revenue_usd, 'allowance_usd', t.allowance_usd, 'cost_pct', t.cost_pct, 'calls', t.calls, 'top_roles', t.top_roles) order by t.ai_cost_usd desc), '[]'::jsonb)
    into top from (select * from public.ai_margin_month m where m.month = mo order by m.ai_cost_usd desc limit 10) t;
  select coalesce(jsonb_agg(jsonb_build_object('role', r.role, 'cost_usd', r.cost, 'calls', r.calls) order by r.cost desc), '[]'::jsonb) into by_role
    from (select coalesce(e.role, 'unknown') as role, round(sum(e.cost_usd), 4) as cost, count(*) as calls from public.ai_events e
           where e.kind = 'call' and e.at >= mo and e.at < mo + interval '1 month' group by 1) r;
  select coalesce(jsonb_agg(jsonb_build_object('provider', v.provider, 'cost_usd', v.cost, 'calls', v.calls) order by v.cost desc), '[]'::jsonb) into by_vendor
    from (select coalesce(e.provider, 'unknown') as provider, round(sum(e.cost_usd), 4) as cost, count(*) as calls from public.ai_events e
           where e.kind = 'call' and e.at >= mo and e.at < mo + interval '1 month' group by 1) v;
  return jsonb_build_object('month', to_char(mo, 'YYYY-MM-DD'), 'ai_cost_usd', round(cost, 4), 'mrr_usd', round(rev, 2),
    'cost_pct', case when rev > 0 then round(100 * cost / rev, 1) else null end,
    'gross_margin_pct', case when rev > 0 then round(100 * (rev - cost) / rev, 1) else null end,
    'workspaces_using_ai', n_ws, 'calls', n_calls, 'top', top, 'by_role', by_role, 'by_vendor', by_vendor);
end $$;
revoke execute on function public.ai_margin(uuid, date), public.ai_margin_company(date) from public, anon;
grant execute on function public.ai_margin(uuid, date), public.ai_margin_company(date) to authenticated, service_role;
