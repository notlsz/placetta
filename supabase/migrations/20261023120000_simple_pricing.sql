-- The simple pricing model (src/pricing.ts SIMPLE, docs/PRICING.md): the store plan, $149 a store a month billed
-- yearly (tracking, renewal monitoring, alerts, the document vault, Odelia's chat, and renewals Odelia files on her
-- own); each new license $299, a complex one $999; a renewal the plan doesn't include $99; with 10 or more stores on
-- the plan every new license is included too; the plan preview free; government fees at cost.
--
-- Grandfathering: every workspace that was already a customer when this runs (it has a Stripe customer, a
-- subscription, an entry plan, or is comped) is marked 'legacy' once and keeps its plan. Every other workspace, and
-- every new one, is 'simple'. Nothing here charges anyone: the billing function does, after an owner approves the exact
-- price shown, through the service-role helpers below. Safe to run twice.

/* ------------------------------ which model a workspace is on ------------------------------ */

alter table public.billing add column if not exists price_model text;
-- set once: rows already marked (by an earlier run) are left as they are
update public.billing set price_model = case
    when stripe_customer_id is not null or subscription_id is not null or coalesce(entry_markets, 0) > 0 or coalesce(comped, false) then 'legacy'
    else 'simple' end
  where price_model is null;
alter table public.billing alter column price_model set default 'simple';
alter table public.billing alter column price_model set not null;
alter table public.billing drop constraint if exists billing_price_model_check;
alter table public.billing add constraint billing_price_model_check check (price_model in ('legacy', 'simple'));
comment on column public.billing.price_model is 'legacy: a customer before the simple model shipped, kept on its old plan. simple: per license, per renewal, or the chain plan.';

/* ------------------------------ per-license charges ------------------------------ */

create table if not exists public.license_charges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ref text not null check (length(ref) between 1 and 120),
  -- included: $0, a renewal Odelia files on her own for a store on the plan; free: $0, what staff complete themselves
  tier text not null check (tier in ('license', 'complex', 'renewal', 'free', 'included')),
  cents int not null check (cents between 0 and 100000),
  -- pending: Stripe Checkout is open; paid: paid (or free), waiting for its filing; used: its filing went in; void: let go
  status text not null default 'pending' check (status in ('pending', 'paid', 'used', 'void')),
  approved_by uuid references auth.users(id) on delete set null,
  stripe_ref text,
  filing_id uuid,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  used_at timestamptz
);
comment on table public.license_charges is 'Simple-model charges, one per filing: the price an owner approved before it was charged. Written by the billing function and the filings trigger only.';
-- one open charge per filing at a time
create unique index if not exists license_charges_open on public.license_charges(workspace_id, ref) where status in ('pending', 'paid');
create index if not exists license_charges_ws on public.license_charges(workspace_id, created_at desc);
create index if not exists license_charges_approved_by on public.license_charges(approved_by);
alter table public.license_charges enable row level security;
revoke all on public.license_charges from public, anon, authenticated;
grant select on public.license_charges to authenticated;
grant select, insert, update, delete on public.license_charges to service_role;
drop policy if exists "the workspace reads its license charges" on public.license_charges;
create policy "the workspace reads its license charges" on public.license_charges for select to authenticated using (public.can_view(workspace_id));

-- Whether a filing would be a renewal (the license was filed and paid for, or approved by the agency, before) and
-- whether it's already paid for. For the billing function's quote.
create or replace function public.license_state(p_ws uuid, p_ref text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'renewal', exists (select 1 from public.license_charges c where c.workspace_id = p_ws and c.ref = p_ref and c.status = 'used')
            or exists (select 1 from public.filings f where f.workspace_id = p_ws and f.app_id = p_ref and f.status = 'accepted'),
    'paid', (select jsonb_build_object('id', c.id, 'tier', c.tier, 'cents', c.cents) from public.license_charges c
              where c.workspace_id = p_ws and c.ref = p_ref and c.status = 'paid' limit 1),
    'model', coalesce((select b.price_model from public.billing b where b.workspace_id = p_ws), 'simple'));
$$;

-- Open a charge for a filing at the price the owner approved: an unpaid one left open earlier is let go first; one
-- already paid is returned as it is (never charged twice). Free items are paid at once, at $0.
create or replace function public.license_charge_open(p_ws uuid, p_ref text, p_tier text, p_cents int, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare had public.license_charges; nid uuid;
begin
  if p_tier not in ('license', 'complex', 'renewal', 'free', 'included') then return jsonb_build_object('ok', false, 'code', 'bad_tier'); end if;
  if p_cents is null or p_cents < 0 or p_cents > 100000 or (p_tier in ('free', 'included')) <> (p_cents = 0) then return jsonb_build_object('ok', false, 'code', 'bad_price'); end if;
  perform 1 from public.billing where workspace_id = p_ws for update;
  select * into had from public.license_charges where workspace_id = p_ws and ref = p_ref and status = 'paid';
  if had.id is not null then return jsonb_build_object('ok', true, 'id', had.id, 'paid', true, 'again', true); end if;
  update public.license_charges set status = 'void' where workspace_id = p_ws and ref = p_ref and status = 'pending';
  insert into public.license_charges (workspace_id, ref, tier, cents, status, approved_by, paid_at)
    values (p_ws, p_ref, p_tier, p_cents, case when p_cents = 0 then 'paid' else 'pending' end, p_user, case when p_cents = 0 then now() end)
    returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid, 'paid', p_cents = 0, 'again', false);
end $$;

-- Stripe said it's paid (the webhook, or the billing function after an off-session charge), or refused (void).
-- Idempotent: a charge already paid or used stays as it is.
create or replace function public.license_charge_settle(p_id uuid, p_ok boolean, p_stripe text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_ok then
    update public.license_charges set status = 'paid', paid_at = now(), stripe_ref = coalesce(p_stripe, stripe_ref) where id = p_id and status = 'pending';
  else
    update public.license_charges set status = 'void', stripe_ref = coalesce(p_stripe, stripe_ref) where id = p_id and status = 'pending';
  end if;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function public.license_state(uuid, text), public.license_charge_open(uuid, text, text, int, uuid), public.license_charge_settle(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.license_state(uuid, text), public.license_charge_open(uuid, text, text, int, uuid), public.license_charge_settle(uuid, boolean, text) to service_role;

/* ------------------------------ who may file ------------------------------ */

-- plan_of gains 'simple': a simple-model workspace without the store plan. The store plan is a subscription, so
-- 'monthly' (Odelia's allowance a store), but on the simple model a subscription alone doesn't file a new license.
-- A workspace without a billing row (every workspace gets one when it's made) stays 'none': fail closed.
create or replace function public.plan_of(ws uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when not public.payments_on() then 'monthly' else coalesce((
    select case
      when b.comped or b.subscription_status in ('active', 'trialing') then 'monthly'
      when b.price_model = 'simple' then 'simple'
      when b.entry_markets > 0 then 'entry'
      else 'none' end
    from public.billing b where b.workspace_id = ws
  ), 'none') end;
$$;

-- A filing may go in: for a customer from before, on a paid plan (as before). On the simple model: comped, or with 10
-- or more stores paid for on the plan (every license included), or once its own charge is paid (or recorded as
-- included, $0). While payments are off, everything is open, as before.
create or replace function public.can_file_app(ws uuid, p_app text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when not public.payments_on() or coalesce((select b.price_model from public.billing b where b.workspace_id = ws), 'legacy') <> 'simple' then public.can_file(ws)
    else exists (select 1 from public.workspaces w where w.id = ws and w.authorized_at is not null) and (
      exists (select 1 from public.billing b where b.workspace_id = ws and (b.comped
        or (b.subscription_status in ('active', 'trialing') and coalesce(b.paid_locations, 0) >= 10)))
      or exists (select 1 from public.license_charges c where c.workspace_id = ws and c.ref = p_app and c.status = 'paid'))
  end;
$$;
revoke execute on function public.can_file_app(uuid, text) from public, anon;
grant execute on function public.can_file_app(uuid, text) to authenticated, service_role;

alter policy "members request filings they can file" on public.filings
  with check (public.is_owner(workspace_id) and public.can_file_app(workspace_id, app_id));

-- The filing uses its charge: the next one for the same license is a renewal.
create or replace function public.license_charge_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.license_charges set status = 'used', used_at = now(), filing_id = new.id
    where workspace_id = new.workspace_id and ref = new.app_id and status = 'paid';
  return new;
end $$;
drop trigger if exists license_charge_use on public.filings;
create trigger license_charge_use after insert on public.filings for each row execute function public.license_charge_use();

/* ------------------------------ Odelia's allowance on the simple model ------------------------------ */

create or replace function public.ai_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'per_location_month', 25,      -- Essentials (legacy) and the store plan, $149 a store a month: up to $25 of AI
    'per_location_month_pro', 50,  -- Pro (legacy), $299 a location a month: up to $50 of AI
    'opening_store_month', 50,     -- each store still opening (its opening fee paid): $50 more a month while it opens
    'entry_per_market', 15,        -- $299 a market, once (legacy): $15 of AI for 30 days
    'entry_days', 30,
    'comped_month', 200,
    'simple_month', 5,             -- the simple model without the plan: the plan preview and a little chat, $5 of AI a month
    'simple_per_license', 5,       -- and $5 more for each license or renewal paid in the last 30 days
    'reduced_at', 0.6,             -- from 60% of the budget, saver mode: cheaper models, no web research
    'alert_at', jsonb_build_array(0.5, 0.8),   -- the owner hears at 50% and 80%
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
    from public.ai_events where workspace_id = ws and at >= p_start and at < p_end;
  return jsonb_build_object(
    'plan', plan, 'budget_usd', budget, 'credit_usd', credit,
    'limit_usd', case when plan = 'none' then 0 else budget + credit + credited end, 'used_usd', round(used, 4),
    'period_start', p_start, 'period_end', p_end);
end $$;

revoke execute on function public.ai_budget(uuid) from public, anon, authenticated;
grant execute on function public.ai_budget(uuid) to service_role;
