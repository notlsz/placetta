-- No free AI. A workspace without a paid plan (entry, per location, or comped by Placetta) gets no Odelia allowance at
-- all: the gate answers plan_required and the app opens the plans. This holds even while payments are switched off,
-- so nobody reaches the model for free. Safe to run twice.

create or replace function public.ai_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'per_location_month', 25,      -- $149 a location a month: up to $25 of AI
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
    budget := (r->>'per_location_month')::numeric * greatest(1, coalesce(b.paid_locations, 0)) + (r->>'opening_store_month')::numeric * opening;
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

create or replace function public.ai_gate(ws uuid, uid uuid, p_kind text, p_daily_limit numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := public.ai_rules();
  b jsonb; n int; oldest timestamptz; ev bigint; today numeric;
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
  insert into public.ai_events (workspace_id, user_id, kind) values (ws, uid, p_kind) returning id into ev;
  return jsonb_build_object('ok', true, 'event', ev, 'budget', b,
    'tier', case when (b->>'used_usd')::numeric >= (r->>'reduced_at')::numeric * (b->>'limit_usd')::numeric then 'reduced' else 'full' end);
end $$;

create or replace function public.ai_record(p_event bigint, p_cost numeric, p_model text, p_in bigint, p_out bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.ai_events; b jsonb; need numeric; take numeric := 0; credit numeric;
begin
  select * into e from public.ai_events where id = p_event for update;
  if not found then return; end if;
  update public.ai_events set cost_usd = greatest(0, coalesce(p_cost, 0)), model = left(p_model, 120) where id = p_event;
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

revoke execute on function public.ai_budget(uuid), public.ai_gate(uuid, uuid, text, numeric), public.ai_record(bigint, numeric, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.ai_budget(uuid), public.ai_gate(uuid, uuid, text, numeric), public.ai_record(bigint, numeric, text, bigint, bigint) to service_role;
