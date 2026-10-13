-- Odelia's AI bill can never outrun what a customer pays. Every model call passes one gate:
--   1. a ceiling on the whole company's AI spend per day (set by the functions from AI_DAILY_LIMIT_USD)
--   2. rate limits: tasks per person per hour and per day, calls per workspace per minute and per hour
--   3. a dollar budget per workspace, sized to its plan, with packs (credits) on top
-- Over 80% of the budget Odelia moves to a cheaper model; at 100% open-ended work pauses until the next period or a
-- pack, while deadlines, reminders and filings already in motion carry on (they don't use the AI).
-- The numbers live in ai_rules() so they can change without touching the logic. Safe to run twice.

alter table public.billing add column if not exists paid_locations int not null default 0 check (paid_locations >= 0);
alter table public.billing add column if not exists ai_credit_usd numeric(10, 4) not null default 0 check (ai_credit_usd >= 0);
alter table public.agent_usage add column if not exists cost_usd numeric(12, 6) not null default 0;

create table if not exists public.ai_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('task', 'call')),
  model text,
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  from_credit numeric(12, 6) not null default 0 check (from_credit >= 0),
  at timestamptz not null default now()
);
create index if not exists ai_events_ws_at on public.ai_events (workspace_id, at);
create index if not exists ai_events_user_at on public.ai_events (user_id, at) where user_id is not null;
create index if not exists ai_events_at on public.ai_events (at);
alter table public.ai_events enable row level security;
revoke all on public.ai_events from public, anon, authenticated;

/* The numbers. AI budgets are a share of what each plan pays (about 17% at most); limits stop scripts and bursts. */
create or replace function public.ai_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'per_location_month', 25,      -- $149 a location a month: up to $25 of AI
    'opening_store_month', 50,     -- each store still opening (its $3,500 paid): $50 more a month while it opens
    'entry_per_market', 15,        -- $299 a market, once: $15 of AI for 30 days
    'entry_days', 30,
    'trial_per_person', 2,         -- before payments are on, or a comped look around: $2 per person, once
    'comped_month', 200,
    'reduced_at', 0.8,             -- from 80% of the budget, cheaper models
    'tasks_per_hour', 15, 'tasks_per_day', 80,         -- per person
    'calls_per_minute', 30, 'calls_per_hour', 300      -- per workspace (a task is up to 16 calls)
  )
$$;

/* A workspace's plan, budget and spend for the current period. */
create or replace function public.ai_budget(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb := public.ai_rules();
  b public.billing;
  owner uuid;
  plan text; budget numeric := 0; p_start timestamptz; p_end timestamptz;
  used numeric := 0; credited numeric := 0; credit numeric := 0; opening int := 0;
begin
  select * into b from public.billing where workspace_id = ws;
  select created_by into owner from public.workspaces where id = ws;
  credit := coalesce(b.ai_credit_usd, 0);
  if coalesce(b.comped, false) then
    plan := 'comped'; budget := (r->>'comped_month')::numeric;
    p_start := date_trunc('month', now()); p_end := p_start + interval '1 month';
  elsif b.subscription_status in ('active', 'trialing') then
    plan := 'monthly';
    select count(*) into opening
      from public.workspaces w, jsonb_array_elements(case when jsonb_typeof(w.state->'stores') = 'array' then w.state->'stores' else '[]'::jsonb end) s
      where w.id = ws and s->>'stage' = 'opening' and s->>'id' = any (coalesce(b.charged_store_ids, '{}'));
    budget := (r->>'per_location_month')::numeric * greatest(1, coalesce(b.paid_locations, 0)) + (r->>'opening_store_month')::numeric * opening;
    p_start := date_trunc('month', now()); p_end := p_start + interval '1 month';
  elsif coalesce(b.entry_markets, 0) > 0 and b.entry_paid_at is not null then
    p_start := b.entry_paid_at; p_end := b.entry_paid_at + make_interval(days => (r->>'entry_days')::int);
    if now() < p_end then plan := 'entry'; budget := (r->>'entry_per_market')::numeric * b.entry_markets;
    else plan := 'entry_ended'; budget := 0; end if;
  else
    -- a trial is per person, across every workspace they make, so new workspaces don't reset it
    plan := 'trial'; budget := (r->>'trial_per_person')::numeric; p_start := '-infinity'; p_end := 'infinity';
    select coalesce(sum(e.cost_usd), 0), coalesce(sum(e.from_credit), 0) into used, credited
      from public.ai_events e join public.workspaces w on w.id = e.workspace_id where w.created_by = owner;
  end if;
  if plan <> 'trial' then
    select coalesce(sum(cost_usd), 0), coalesce(sum(from_credit), 0) into used, credited
      from public.ai_events where workspace_id = ws and at >= p_start and at < p_end;
  end if;
  return jsonb_build_object(
    'plan', plan, 'budget_usd', budget, 'credit_usd', credit,
    -- what can be spent this period: the plan's budget, the credit still there, and the credit already spent this period
    'limit_usd', budget + credit + credited, 'used_usd', round(used, 4),
    'period_start', case when p_start = '-infinity' then null else p_start end,
    'period_end', case when p_end = 'infinity' then null else p_end end);
end $$;

/*
 * Before a task or a model call. Returns {ok, tier, event} or {ok: false, code, retry_after?}.
 * tier: 'full' or 'reduced' (cheaper models). A call's event is priced afterwards with ai_record.
 */
create or replace function public.ai_gate(ws uuid, uid uuid, p_kind text, p_daily_limit numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := public.ai_rules();
  b jsonb; n int; oldest timestamptz; ev bigint; today numeric;
begin
  if p_kind not in ('task', 'call') then raise exception 'kind must be task or call'; end if;
  -- the whole company's spend today
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
  b := public.ai_budget(ws);
  if b->>'plan' = 'entry_ended' then return jsonb_build_object('ok', false, 'code', 'entry_ended', 'budget', b); end if;
  if (b->>'used_usd')::numeric >= (b->>'limit_usd')::numeric then
    return jsonb_build_object('ok', false, 'code', case when b->>'plan' = 'trial' then 'trial_used' else 'over_budget' end, 'budget', b);
  end if;
  insert into public.ai_events (workspace_id, user_id, kind) values (ws, uid, p_kind) returning id into ev;
  return jsonb_build_object('ok', true, 'event', ev, 'budget', b,
    'tier', case when (b->>'used_usd')::numeric >= (r->>'reduced_at')::numeric * (b->>'limit_usd')::numeric then 'reduced' else 'full' end);
end $$;

/* After a call: its price. Spend past the plan's budget is taken from the workspace's credit. */
create or replace function public.ai_record(p_event bigint, p_cost numeric, p_model text, p_in bigint, p_out bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.ai_events; b jsonb; need numeric; take numeric := 0; credit numeric;
begin
  select * into e from public.ai_events where id = p_event for update;
  if not found then return; end if;
  update public.ai_events set cost_usd = greatest(0, coalesce(p_cost, 0)), model = left(p_model, 120) where id = p_event;
  b := public.ai_budget(e.workspace_id);
  -- the part of this period's spend past the plan's budget that credit hasn't covered yet
  need := (b->>'used_usd')::numeric - (b->>'budget_usd')::numeric
    - (select coalesce(sum(from_credit), 0) from public.ai_events where workspace_id = e.workspace_id and at >= coalesce((b->>'period_start')::timestamptz, '-infinity'));
  if need > 0 and b->>'plan' <> 'trial' then
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

/* What the app shows a member: plan, how much of this period's allowance is used, when it resets. */
create or replace function public.ai_status(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b jsonb;
begin
  if not (public.is_member(ws) or public.is_staff()) then raise exception 'Not your workspace.'; end if;
  b := public.ai_budget(ws);
  return jsonb_build_object('plan', b->'plan', 'used_pct', case when (b->>'limit_usd')::numeric > 0 then least(100, round(100 * (b->>'used_usd')::numeric / (b->>'limit_usd')::numeric)) else 100 end,
    'resets_at', b->'period_end', 'has_credit', (b->>'credit_usd')::numeric > 0);
end $$;

/* A pack bought: credit that carries over until it's used. */
create or replace function public.ai_add_credit(ws uuid, p_usd numeric) returns void
language sql security definer set search_path = '' as $$
  insert into public.billing (workspace_id, ai_credit_usd) values (ws, greatest(0, p_usd))
  on conflict (workspace_id) do update set ai_credit_usd = public.billing.ai_credit_usd + greatest(0, excluded.ai_credit_usd), updated_at = now();
$$;

revoke execute on function public.ai_budget(uuid), public.ai_gate(uuid, uuid, text, numeric), public.ai_record(bigint, numeric, text, bigint, bigint), public.ai_add_credit(uuid, numeric) from public, anon, authenticated;
grant execute on function public.ai_budget(uuid), public.ai_gate(uuid, uuid, text, numeric), public.ai_record(bigint, numeric, text, bigint, bigint), public.ai_add_credit(uuid, numeric) to service_role;
revoke execute on function public.ai_status(uuid) from public, anon;
grant execute on function public.ai_status(uuid) to authenticated, service_role;
