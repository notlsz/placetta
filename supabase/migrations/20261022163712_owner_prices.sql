-- The owner prices the founder approved on 2026-10-22 (src/pricing.ts, docs/PRICING.md). Safe to run twice.
--   * filings past the plan carry who does the work: automated (Odelia on her own, inside the monthly allowance and then
--     $49) or assisted (Placetta's team, $199, never inside the allowance). Only automated filings use the allowance.
--   * modules bill by their own unit: billing.module_qty keeps the units each one bills now, and
--     billing.abroad_countries the countries whose one-time fee was charged, so a country is charged once.
-- Nothing here charges anyone: the billing function does, after an owner approved the exact amount shown.

/* ------------------------------ filings: automated or assisted ------------------------------ */

alter table public.filing_charges add column if not exists mode text not null default 'automated';
alter table public.filing_charges drop constraint if exists filing_charges_mode_check;
alter table public.filing_charges add constraint filing_charges_mode_check check (mode in ('automated', 'assisted'));
comment on column public.filing_charges.mode is 'automated: Odelia filed it on her own (counts against the monthly allowance). assisted: Placetta''s team filed it (always charged, never in the allowance).';

-- This month's automated count (what the allowance covers), assisted count, and charges against the cap.
create or replace function public.filing_month(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m date := date_trunc('month', now() at time zone 'utc')::date; b public.billing;
begin
  if not (public.can_view(ws) or public.is_staff() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then raise exception 'Not a member of this workspace.'; end if;
  select * into b from public.billing where workspace_id = ws;
  return jsonb_build_object(
    'month', m,
    'locations', coalesce(b.paid_locations, 0),
    'used', (select count(*) from public.filing_charges c where c.workspace_id = ws and c.month = m and c.status <> 'void' and c.mode = 'automated'),
    'assisted', (select count(*) from public.filing_charges c where c.workspace_id = ws and c.month = m and c.status <> 'void' and c.mode = 'assisted'),
    'charged_cents', (select coalesce(sum(cents), 0) from public.filing_charges c where c.workspace_id = ws and c.month = m and c.status in ('reserved', 'charged')),
    'cap_cents', coalesce(b.filing_cap_cents, 0),
    'paid', coalesce(b.comped, false) or b.subscription_status in ('active', 'trialing'));
end $$;

-- The billing function's one step, now with who does the work. An automated filing is counted within the allowance
-- while automated filings this month are under it; an assisted one never is. Past that, the price the owner was shown
-- is reserved under the cap, atomically (the billing row is locked).
create or replace function public.filing_charge_reserve(p_ws uuid, p_ref text, p_kind text, p_cents int, p_allow int, p_user uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m date := date_trunc('month', now() at time zone 'utc')::date; b public.billing; used int; charged int; had public.filing_charges; nid uuid;
begin
  if p_kind not in ('sales_tax', 'entity', 'amendment', 'other') then return jsonb_build_object('ok', false, 'code', 'bad_kind'); end if;
  if p_mode is null or p_mode not in ('automated', 'assisted') then return jsonb_build_object('ok', false, 'code', 'bad_mode'); end if;
  if p_cents is null or p_cents < 0 or p_cents > 500000 then return jsonb_build_object('ok', false, 'code', 'bad_price'); end if;
  select * into b from public.billing where workspace_id = p_ws for update;
  if b.workspace_id is null then return jsonb_build_object('ok', false, 'code', 'no_billing'); end if;
  select * into had from public.filing_charges where workspace_id = p_ws and ref = p_ref and month = m and status <> 'void';
  if had.id is not null then return jsonb_build_object('ok', true, 'id', had.id, 'kind', case when had.status = 'allowance' then 'allowance' else 'charge' end, 'again', true); end if;
  select count(*) filter (where mode = 'automated'), coalesce(sum(cents) filter (where status in ('reserved', 'charged')), 0) into used, charged
    from public.filing_charges where workspace_id = p_ws and month = m and status <> 'void';
  if p_mode = 'automated' and used < greatest(coalesce(p_allow, 0), 0) then
    insert into public.filing_charges (workspace_id, ref, kind, mode, month, cents, status, approved_by, settled_at) values (p_ws, p_ref, p_kind, p_mode, m, 0, 'allowance', p_user, now()) returning id into nid;
    return jsonb_build_object('ok', true, 'id', nid, 'kind', 'allowance', 'again', false);
  end if;
  -- past the allowance (or assisted) a charge needs its price: the one the owner was shown
  if p_cents = 0 then return jsonb_build_object('ok', false, 'code', 'price_changed'); end if;
  if coalesce(b.filing_cap_cents, 0) <= 0 then return jsonb_build_object('ok', false, 'code', 'no_cap'); end if;
  if charged + p_cents > b.filing_cap_cents then return jsonb_build_object('ok', false, 'code', 'over_cap', 'left_cents', greatest(b.filing_cap_cents - charged, 0)); end if;
  insert into public.filing_charges (workspace_id, ref, kind, mode, month, cents, status, approved_by) values (p_ws, p_ref, p_kind, p_mode, m, p_cents, 'reserved', p_user) returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid, 'kind', 'charge', 'again', false);
end $$;

-- The earlier six-argument call (a billing function deployed before this migration) is an automated filing.
create or replace function public.filing_charge_reserve(p_ws uuid, p_ref text, p_kind text, p_cents int, p_allow int, p_user uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select public.filing_charge_reserve(p_ws, p_ref, p_kind, p_cents, p_allow, p_user, 'automated');
$$;

/* ------------------------------ modules, by unit ------------------------------ */

alter table public.billing add column if not exists module_qty jsonb not null default '{}'::jsonb;
alter table public.billing drop constraint if exists billing_module_qty_check;
alter table public.billing add constraint billing_module_qty_check check (jsonb_typeof(module_qty) = 'object');
comment on column public.billing.module_qty is 'Units each module bills now, by module id (entity: entity-state registrations; sales_tax: states; alcohol: licensed locations; imports, security: 1). Written by the billing function after Stripe agreed.';
alter table public.billing add column if not exists abroad_countries text[] not null default '{}';
comment on column public.billing.abroad_countries is 'Countries whose one-time Europe and Mexico fee was charged, so each is charged once.';

-- After Stripe billed a module at the units the owner approved: it is on, with those units, and for abroad the countries
-- just charged. Returns the module's state.
create or replace function public.module_bill_apply(p_ws uuid, p_module text, p_qty int, p_countries text[], p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not (p_module = any (public.growth_modules())) then raise exception 'Unknown module.'; end if;
  if p_qty is null or p_qty < 0 or p_qty > 100000 then raise exception 'Bad quantity.'; end if;
  perform public.module_apply(p_ws, p_module, true, p_user);
  update public.billing set
    module_qty = case when p_module = 'abroad' then module_qty else module_qty || jsonb_build_object(p_module, p_qty) end,
    abroad_countries = case when p_module = 'abroad' then array(select distinct upper(x) from unnest(abroad_countries || coalesce(p_countries, '{}')) x where x ~* '^[a-z]{2}$' order by 1)
                            else abroad_countries end
   where workspace_id = p_ws;
  return 'on';
end $$;

revoke execute on function public.filing_charge_reserve(uuid, text, text, int, int, uuid, text), public.filing_charge_reserve(uuid, text, text, int, int, uuid),
  public.module_bill_apply(uuid, text, int, text[], uuid) from public, anon, authenticated;
grant execute on function public.filing_charge_reserve(uuid, text, text, int, int, uuid, text), public.filing_charge_reserve(uuid, text, text, int, int, uuid),
  public.module_bill_apply(uuid, text, int, text[], uuid) to service_role;
