-- The pricing tiers. Essentials ($149 a location a month) and Pro ($299) are both billed yearly per location; Pro's
-- Odelia allowance is twice Essentials'. Opening fees depend on the store (retail $3,500, food $6,500); liquor and complex
-- build-outs are quoted by the team, so team tasks get a 'quote' kind. Safe to run twice.

alter table public.team_tasks drop constraint if exists team_tasks_kind_check;
alter table public.team_tasks add constraint team_tasks_kind_check check (kind in ('handoff', 'check_agency', 'skill_broken', 'destination_stale', 'review', 'quote'));

create or replace function public.ai_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'per_location_month', 25,      -- Essentials, $149 a location a month: up to $25 of AI
    'per_location_month_pro', 50,  -- Pro, $299 a location a month: up to $50 of AI
    'opening_store_month', 50,     -- each store still opening (its opening fee paid): $50 more a month while it opens
    'entry_per_market', 15,        -- $299 a market, once: $15 of AI for 30 days
    'entry_days', 30,
    'comped_month', 200,
    'reduced_at', 0.8,             -- from 80% of the budget, cheaper models
    'tasks_per_hour', 15, 'tasks_per_day', 80,         -- per person
    'calls_per_minute', 30, 'calls_per_hour', 300      -- per workspace (a task is up to 16 calls)
  )
$$;

create or replace function public.ai_budget(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb := public.ai_rules();
  b public.billing;
  plan text; budget numeric := 0; p_start timestamptz; p_end timestamptz;
  used numeric := 0; credited numeric := 0; credit numeric := 0; opening int := 0;
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
    budget := (r->>(case when b.subscription_plan = 'pro' then 'per_location_month_pro' else 'per_location_month' end))::numeric * greatest(1, coalesce(b.paid_locations, 0))
      + (r->>'opening_store_month')::numeric * opening;
  elsif coalesce(b.entry_markets, 0) > 0 and b.entry_paid_at is not null then
    p_start := b.entry_paid_at; p_end := b.entry_paid_at + make_interval(days => (r->>'entry_days')::int);
    if now() < p_end then plan := 'entry'; budget := (r->>'entry_per_market')::numeric * b.entry_markets;
    else plan := 'entry_ended'; budget := 0; end if;
  else
    -- no paid plan: no allowance, and packs don't apply either
    plan := 'none'; budget := 0; credit := 0;
  end if;
  select coalesce(sum(cost_usd), 0), coalesce(sum(from_credit), 0) into used, credited
    from public.ai_events where workspace_id = ws and at >= p_start and at < p_end;
  return jsonb_build_object(
    'plan', plan, 'budget_usd', budget, 'credit_usd', credit,
    'limit_usd', case when plan = 'none' then 0 else budget + credit + credited end, 'used_usd', round(used, 4),
    'period_start', p_start, 'period_end', p_end);
end $$;

revoke execute on function public.ai_budget(uuid) from public, anon, authenticated;
grant execute on function public.ai_budget(uuid) to service_role;

-- Stripe settings Placetta makes for itself (the webhook's signing secret). Service role only: RLS on, no policies.
create table if not exists public.stripe_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.stripe_config enable row level security;
revoke all on public.stripe_config from public, anon, authenticated;
grant select, insert, update, delete on public.stripe_config to service_role;
