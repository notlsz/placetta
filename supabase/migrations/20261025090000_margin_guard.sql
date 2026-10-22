-- Margin guardrails (docs/UNIT-ECONOMICS.md): what keeps Placetta from losing money on a workspace or a filing, without
-- ever stopping a customer's work part way.
--   1. margin_rules(): the numbers, FOUNDER TO CONFIRM, the same as src/economics.ts (a test checks they agree)
--   2. ai_gate_in_task(): a call inside a task that already started is never refused for the allowance. It runs in saver
--      mode instead, bounded by the task's own $1.50 and 500,000-token caps. The company's daily ceiling and the rate
--      limits still apply. Before this, a run that crossed 100% part way through preparing a filing stopped mid-filing.
--   3. Team minutes on a filing, recorded by staff, with a staff alert when a filing runs past its budget
--   4. margin_watch(): a staff alert when a workspace's AI cost this month passes a share of its revenue (or, with no
--      revenue, a dollar line: comped and free workspaces), once a workspace a month, daily by pg_cron
-- Safe to run twice.

/* ------------------------------ 1. the numbers ------------------------------ */

create or replace function public.margin_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'ai_share_alert', 0.10,          -- FOUNDER TO CONFIRM: AI cost past 10% of the month's revenue alerts staff
    'ai_no_revenue_alert_usd', 5,    -- FOUNDER TO CONFIRM: no revenue this month (comped, free): alert past $5 of AI
    'team_over_budget_factor', 1.5,  -- FOUNDER TO CONFIRM: a filing past 1.5x its team-minute budget alerts staff
    -- FOUNDER TO CONFIRM: team minutes a filing is budgeted, by what was charged for it (docs/PRICING.md estimates)
    'team_minutes', jsonb_build_object('license', 45, 'complex', 300, 'renewal', 30, 'included', 30, 'free', 15)
  )
$$;
revoke execute on function public.margin_rules() from public, anon;
grant execute on function public.margin_rules() to authenticated, service_role;

/* ------------------------------ 1b. the $50 store ceiling ------------------------------ */

-- The founder's ceiling (2026-10-22): a store on the $149 store plan may cost at most $50 a month in AI and running
-- cost, saver mode from about $35. Running cost that isn't AI is about $5.48 a store a month (Stripe on the yearly
-- invoice, texts, the renewals Odelia sends: src/economics.ts runningCostPerStoreMonth), so the AI allowance a store is
-- $44 hard and saver mode starts at $29 of AI. Legacy plans (Essentials, Pro, entry) keep their numbers unchanged.
create or replace function public.ai_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'per_location_month', 25,      -- Essentials (legacy), $149 a location a month: up to $25 of AI
    'per_location_month_pro', 50,  -- Pro (legacy), $299 a location a month: up to $50 of AI
    'store_plan_month', 44,        -- the store plan (simple model), a store: $50 ceiling less $5.48 running cost. FOUNDER TO CONFIRM
    'store_plan_soft', 29,         -- and saver mode from $29 of AI a store ($35 all in). FOUNDER TO CONFIRM
    'opening_store_month', 50,     -- each store still opening (its opening fee paid): $50 more a month while it opens
    'entry_per_market', 15,        -- $299 a market, once (legacy): $15 of AI for 30 days
    'entry_days', 30,
    'comped_month', 200,
    'simple_month', 5,             -- the simple model without the plan: the plan preview and a little chat, $5 of AI a month
    'simple_per_license', 5,       -- and $5 more for each license or renewal paid in the last 30 days
    'reduced_at', 0.6,             -- from 60% of the budget, saver mode: cheaper models, no web research (the store plan: store_plan_soft)
    'alert_at', jsonb_build_array(0.5, 0.8),   -- the owner hears at 50% and 80%
    'tasks_per_hour', 15, 'tasks_per_day', 80,         -- per person
    'calls_per_minute', 30, 'calls_per_hour', 300      -- per workspace (a task is up to 16 calls)
  )
$$;

/* The allowance, as 20261024090000_failed_runs_free.sql defines it, with the store plan at its own numbers and the
   point where saver mode starts (soft_usd) returned with it. */
create or replace function public.ai_budget(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb := public.ai_rules();
  b public.billing;
  plan text; budget numeric := 0; soft numeric; p_start timestamptz; p_end timestamptz;
  used numeric := 0; credited numeric := 0; credit numeric := 0; opening int := 0; paid int := 0; stores int;
begin
  select * into b from public.billing where workspace_id = ws;
  credit := coalesce(b.ai_credit_usd, 0);
  p_start := date_trunc('month', now()); p_end := p_start + interval '1 month';
  if coalesce(b.comped, false) then
    plan := 'comped'; budget := (r->>'comped_month')::numeric;
  elsif b.subscription_status in ('active', 'trialing') then
    plan := 'monthly';
    select count(*) into opening
      from public.workspaces w, jsonb_array_elements(case when jsonb_typeof(w.state->'stores') = 'array' then w.state->'stores' else '[]'::jsonb end) s
      where w.id = ws and s->>'stage' = 'opening' and s->>'id' = any (coalesce(b.charged_store_ids, '{}'));
    stores := greatest(1, coalesce(b.paid_locations, 0));
    if b.price_model = 'simple' then
      budget := (r->>'store_plan_month')::numeric * stores;
      soft := (r->>'store_plan_soft')::numeric * stores;
    else
      budget := (r->>(case when b.subscription_plan = 'pro' then 'per_location_month_pro' else 'per_location_month' end))::numeric * stores
        + (r->>'opening_store_month')::numeric * opening;
    end if;
  elsif b.price_model = 'simple' then
    plan := 'simple';
    select count(*) into paid from public.license_charges c
      where c.workspace_id = ws and c.status in ('paid', 'used') and c.cents > 0 and c.paid_at >= now() - interval '30 days';
    budget := (r->>'simple_month')::numeric + (r->>'simple_per_license')::numeric * paid;
  elsif coalesce(b.entry_markets, 0) > 0 and b.entry_paid_at is not null then
    p_start := b.entry_paid_at; p_end := b.entry_paid_at + make_interval(days => (r->>'entry_days')::int);
    if now() < p_end then plan := 'entry'; budget := (r->>'entry_per_market')::numeric * b.entry_markets;
    else plan := 'entry_ended'; budget := 0; end if;
  else
    -- no paid plan: no allowance, and packs don't apply either
    plan := 'none'; budget := 0; credit := 0;
  end if;
  select coalesce(sum(cost_usd), 0), coalesce(sum(from_credit), 0) into used, credited
    from public.ai_events where workspace_id = ws and at >= p_start and at < p_end and refunded_at is null;
  return jsonb_build_object(
    'plan', plan, 'budget_usd', budget, 'credit_usd', credit,
    'limit_usd', case when plan = 'none' then 0 else budget + credit + credited end, 'used_usd', round(used, 4),
    -- saver mode from here: the store plan's own line (a pack's credit moves it up as much), else 60% of the limit
    'soft_usd', case when plan = 'none' then 0 when soft is not null then soft + credit + credited
                     else (r->>'reduced_at')::numeric * (budget + credit + credited) end,
    'period_start', p_start, 'period_end', p_end);
end $$;
revoke execute on function public.ai_budget(uuid) from public, anon, authenticated;
grant execute on function public.ai_budget(uuid) to service_role;

/* The gate, as 20261016160000_ai_routing_margin.sql defines it, with saver mode from the budget's soft_usd. */
create or replace function public.ai_gate(ws uuid, uid uuid, p_kind text, p_daily_limit numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := public.ai_rules();
  b jsonb; n int; oldest timestamptz; ev bigint; today numeric; throttled boolean; soft numeric;
begin
  if p_kind not in ('task', 'call') then raise exception 'kind must be task or call'; end if;
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
  soft := coalesce((b->>'soft_usd')::numeric, (r->>'reduced_at')::numeric * (b->>'limit_usd')::numeric);
  insert into public.ai_events (workspace_id, user_id, kind) values (ws, uid, p_kind) returning id into ev;
  return jsonb_build_object('ok', true, 'event', ev, 'budget', b,
    'tier', case when throttled or (b->>'used_usd')::numeric >= soft then 'reduced' else 'full' end,
    'reason', case when throttled then 'throttle' when (b->>'used_usd')::numeric >= soft then 'allowance' else null end);
end $$;
revoke execute on function public.ai_gate(uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.ai_gate(uuid, uuid, text, numeric) to service_role;

/* The owner's 50% and 80% notices, as 20261016160000_ai_routing_margin.sql defines them, naming the workspace's own
   saver line (66% on the store plan, 60% elsewhere) instead of always 60%. */
create or replace function public.ai_allowance_alerts()
returns table (workspace_id uuid, threshold int, used_pct int, left_usd numeric, period_end timestamptz, dedupe text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare r jsonb := public.ai_rules(); w record; b jsonb; th numeric; pct int; lim numeric; used numeric; saver int; p_end timestamptz; d text; txt_en text; txt_zh text; ttl_en text; ttl_zh text; left_ numeric; ins int;
begin
  for w in select e.workspace_id as ws from public.ai_events e where e.at >= date_trunc('month', now()) - interval '31 days' group by e.workspace_id loop
    b := public.ai_budget(w.ws);
    if (b->>'plan') in ('none', 'entry_ended') then continue; end if;
    lim := (b->>'limit_usd')::numeric; used := (b->>'used_usd')::numeric;
    if lim <= 0 then continue; end if;
    saver := round(100 * coalesce((b->>'soft_usd')::numeric, (r->>'reduced_at')::numeric * lim) / lim);
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
      exit;
    end loop;
  end loop;
end $$;
revoke execute on function public.ai_allowance_alerts() from public, anon, authenticated;
grant execute on function public.ai_allowance_alerts() to service_role;

/* ------------------------------ 2. never refused mid-task ------------------------------ */

create or replace function public.ai_gate_in_task(ws uuid, uid uuid, p_daily_limit numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g jsonb; ev bigint;
begin
  g := public.ai_gate(ws, uid, 'call', p_daily_limit);
  if coalesce(g->>'code', '') <> 'over_budget' then return g; end if;
  -- the allowance ran out part way through a task: the task finishes in saver mode, its calls still priced and counted
  insert into public.ai_events (workspace_id, user_id, kind) values (ws, uid, 'call') returning id into ev;
  return jsonb_build_object('ok', true, 'event', ev, 'budget', g->'budget', 'tier', 'reduced', 'reason', 'allowance', 'finishing', true);
end $$;
revoke execute on function public.ai_gate_in_task(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.ai_gate_in_task(uuid, uuid, numeric) to service_role;

/* ------------------------------ 3. team minutes on a filing ------------------------------ */

alter table public.filings add column if not exists team_minutes int not null default 0;
do $$ begin
  alter table public.filings add constraint filings_team_minutes_check check (team_minutes between 0 and 100000);
exception when duplicate_object then null; end $$;
comment on column public.filings.team_minutes is 'Minutes Placetta''s team spent on this filing, as staff record them. Read by the margin guardrails.';

alter table public.team_tasks drop constraint if exists team_tasks_kind_check;
alter table public.team_tasks add constraint team_tasks_kind_check
  check (kind in ('handoff', 'check_agency', 'skill_broken', 'destination_stale', 'review', 'quote', 'line_health', 'ai_spend', 'ask_person', 'margin', 'team_time'));

/* What a filing was charged as: the tier of its license charge, else a license. */
create or replace function public.filing_tier(p_filing uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.tier from public.license_charges c where c.filing_id = p_filing order by c.created_at desc limit 1), 'license');
$$;
revoke execute on function public.filing_tier(uuid) from public, anon, authenticated;

/* Staff add the minutes they spent on a filing. Past its budget by the factor, a staff alert opens (once a filing). */
create or replace function public.filing_add_team_minutes(p_id uuid, p_minutes int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb := public.margin_rules(); total int; tier text; budget int; f public.filings; over boolean;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then raise exception 'Minutes must be between 1 and 1440.'; end if;
  update public.filings set team_minutes = team_minutes + p_minutes where id = p_id returning * into f;
  if not found then raise exception 'No such filing.'; end if;
  total := f.team_minutes;
  tier := public.filing_tier(p_id);
  budget := coalesce((r->'team_minutes'->>tier)::int, (r->'team_minutes'->>'license')::int);
  over := total > budget * (r->>'team_over_budget_factor')::numeric;
  if over then
    insert into public.team_tasks (kind, filing_id, workspace_id, title, detail, dedupe)
      values ('team_time', p_id, f.workspace_id, format('Team time: %s minutes on %s (budget %s)', total, coalesce(f.title->>'en', 'a filing'), budget),
        jsonb_build_object('minutes', total, 'budget', budget, 'tier', tier, 'factor', r->>'team_over_budget_factor'),
        format('team_time:%s', p_id))
      on conflict (dedupe) do update set detail = excluded.detail, title = excluded.title;
  end if;
  return jsonb_build_object('minutes', total, 'budget', budget, 'tier', tier, 'over', over);
end $$;
revoke execute on function public.filing_add_team_minutes(uuid, int) from public, anon;
grant execute on function public.filing_add_team_minutes(uuid, int) to authenticated;

/* ------------------------------ 4. the margin watch ------------------------------ */

/* A month's revenue from a workspace: its plan (ai_plan_revenue), plus the license charges it paid that month. */
create or replace function public.margin_revenue(ws uuid, p_month date) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.ai_plan_revenue(b, p_month) from public.billing b where b.workspace_id = ws), 0)
    + coalesce((select sum(c.cents) / 100.0 from public.license_charges c
                 where c.workspace_id = ws and c.status in ('paid', 'used') and c.cents > 0
                   and date_trunc('month', c.paid_at) = date_trunc('month', p_month::timestamptz)), 0);
$$;
revoke execute on function public.margin_revenue(uuid, date) from public, anon, authenticated;

/* Each workspace whose AI cost this month is past the share of its revenue (or the no-revenue line) gets one staff
   alert a month. Returns the alerts just opened. Service role only: pg_cron runs it daily. */
create or replace function public.margin_watch(p_month date default current_date)
returns table (workspace_id uuid, ai_cost_usd numeric, revenue_usd numeric, share numeric)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare r jsonb := public.margin_rules(); x record; rev numeric; ins int; d text;
begin
  for x in select e.workspace_id as ws, sum(e.cost_usd) as cost from public.ai_events e
            where e.at >= date_trunc('month', p_month::timestamptz) and e.at < date_trunc('month', p_month::timestamptz) + interval '1 month'
              and e.refunded_at is null
            group by e.workspace_id having sum(e.cost_usd) > 0 loop
    rev := public.margin_revenue(x.ws, p_month);
    if rev > 0 and x.cost <= rev * (r->>'ai_share_alert')::numeric then continue; end if;
    if rev <= 0 and x.cost <= (r->>'ai_no_revenue_alert_usd')::numeric then continue; end if;
    d := format('margin:%s:%s', x.ws, to_char(p_month, 'YYYYMM'));
    insert into public.team_tasks (kind, workspace_id, title, detail, dedupe)
      values ('margin', x.ws,
        case when rev > 0 then format('AI cost: $%s this month, %s%% of $%s revenue', round(x.cost, 2), round(100 * x.cost / rev, 1), round(rev, 2))
             else format('AI cost: $%s this month with no revenue', round(x.cost, 2)) end,
        jsonb_build_object('ai_cost_usd', round(x.cost, 4), 'revenue_usd', round(rev, 2), 'share', case when rev > 0 then round(x.cost / rev, 4) else null end,
          'alert_share', r->>'ai_share_alert', 'month', to_char(p_month, 'YYYY-MM')),
        d)
      on conflict (dedupe) do nothing;
    get diagnostics ins = row_count;
    if ins > 0 then
      workspace_id := x.ws; ai_cost_usd := round(x.cost, 4); revenue_usd := round(rev, 2); share := case when rev > 0 then round(x.cost / rev, 4) else null end;
      return next;
    end if;
  end loop;
end $$;
revoke execute on function public.margin_watch(date) from public, anon, authenticated;
grant execute on function public.margin_watch(date) to service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; run select * from public.margin_watch() from the monitor instead.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-margin-watch';
  perform cron.schedule('placetta-margin-watch', '17 6 * * *', 'select count(*) from public.margin_watch(current_date)');
end $$;
