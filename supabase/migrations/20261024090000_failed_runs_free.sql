-- No charge for a failed run: when Odelia stops because of a problem on Placetta's side or the model vendor's (an
-- upstream error, a crash, a run that stopped responding), the model calls that run made are given back. They stop
-- counting against the workspace's allowance this period, and any pack credit they used goes back into the pack.
-- The real cost stays on each event (cost_usd, agent_usage) for the company's own accounting. A run the person stopped,
-- or one stopped by its own limits (the task cap, the allowance, the daily ceiling), isn't refunded: that would let a
-- run past the allowance repeat for free. agent-run calls ai_refund_events with the events its state kept.
-- Safe to run twice.

alter table public.ai_events add column if not exists refunded_at timestamptz;
comment on column public.ai_events.refunded_at is 'Set when the run this call belonged to failed on Placetta''s or the vendor''s side: the call no longer counts against the allowance. cost_usd keeps the real cost.';

/* Give back a failed run's calls: only that workspace's events, only once. Returns what was given back. */
create or replace function public.ai_refund_events(p_ws uuid, p_events bigint[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int := 0; usd numeric := 0; back numeric := 0;
begin
  if p_ws is null or p_events is null or cardinality(p_events) = 0 then return jsonb_build_object('events', 0, 'usd', 0, 'credit', 0); end if;
  with gone as (
    update public.ai_events set refunded_at = now()
      where workspace_id = p_ws and id = any (p_events[1:500]) and refunded_at is null
      returning cost_usd, from_credit
  ) select count(*), coalesce(sum(cost_usd), 0), coalesce(sum(from_credit), 0) into n, usd, back from gone;
  if back > 0 then
    update public.billing set ai_credit_usd = ai_credit_usd + back, updated_at = now() where workspace_id = p_ws;
    update public.ai_events set from_credit = 0 where workspace_id = p_ws and id = any (p_events[1:500]) and from_credit > 0;
  end if;
  return jsonb_build_object('events', n, 'usd', round(usd, 6), 'credit', round(back, 6));
end $$;
revoke execute on function public.ai_refund_events(uuid, bigint[]) from public, anon, authenticated;
grant execute on function public.ai_refund_events(uuid, bigint[]) to service_role;

/* The allowance, as 20261023120000_simple_pricing.sql defines it, with given-back calls left out of what's used. */
create or replace function public.ai_budget(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb := public.ai_rules();
  b public.billing;
  plan text; budget numeric := 0; p_start timestamptz; p_end timestamptz;
  used numeric := 0; credited numeric := 0; credit numeric := 0; opening int := 0; paid int := 0;
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
    'period_start', p_start, 'period_end', p_end);
end $$;
revoke execute on function public.ai_budget(uuid) from public, anon, authenticated;
grant execute on function public.ai_budget(uuid) to service_role;
