-- The money path, end to end (supabase/functions/stripe-webhook/handler.ts, _shared/stripe_apply.ts). Safe to run twice.
--   stripe_event_claim / _done   each Stripe event applied once; one whose handling crashed (claimed, never done) is
--                                claimed again by Stripe's retry after five minutes instead of being lost as a duplicate
--   ai_credit_once               a pack's credit added once per Checkout session (the webhook and the return from
--                                Checkout may both see it), and taken back once per refund
--   billing_payment_apply        a failed invoice marks the workspace for the dunning notice; a paid one clears it
--   license_charge_refund        a license charge refunded in full is let go, unless its filing already went in

/* ------------------------------ each event once ------------------------------ */

alter table public.stripe_events add column if not exists processed_at timestamptz;
-- events from before this column were applied (or forgotten on failure), so they count as done
update public.stripe_events set processed_at = received_at where processed_at is null and received_at < now() - interval '1 hour';

create or replace function public.stripe_event_claim(p_id text, p_type text) returns text
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_id is null or length(p_id) not between 1 and 255 then raise exception 'bad event id'; end if;
  insert into public.stripe_events (id, type) values (p_id, coalesce(p_type, '')) on conflict (id) do nothing;
  get diagnostics n = row_count;
  if n > 0 then return 'new'; end if;
  -- claimed before but never finished: the earlier delivery crashed mid-way, so this retry takes it
  update public.stripe_events set received_at = now()
   where id = p_id and processed_at is null and received_at < now() - interval '5 minutes';
  get diagnostics n = row_count;
  return case when n > 0 then 'retry' else 'duplicate' end;
end $$;

create or replace function public.stripe_event_done(p_id text) returns void
language sql security definer set search_path = '' as $$
  update public.stripe_events set processed_at = coalesce(processed_at, now()) where id = p_id;
$$;

/* ------------------------------ a pack's credit, once ------------------------------ */

create or replace function public.ai_credit_once(p_ws uuid, p_usd numeric, p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_key is null or length(p_key) not between 1 and 255 or p_usd is null or abs(p_usd) > 1000 then raise exception 'bad credit'; end if;
  insert into public.stripe_events (id, type, processed_at) values (p_key, 'credit', now()) on conflict (id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  update public.billing set ai_credit_usd = greatest(0, coalesce(ai_credit_usd, 0) + p_usd) where workspace_id = p_ws;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no billing row for %', p_ws; end if;
  return true;
end $$;

/* ------------------------------ failed payments ------------------------------ */

alter table public.billing add column if not exists payment_issue_at timestamptz;
alter table public.billing add column if not exists payment_issue_invoice text;
alter table public.billing add column if not exists payment_ok_at timestamptz;
comment on column public.billing.payment_issue_at is 'When Stripe last failed to collect an invoice that is still unpaid (the dunning notice in Settings). Cleared by invoice.paid.';

create or replace function public.billing_payment_apply(p_ws uuid, p_failed boolean, p_at timestamptz, p_invoice text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_failed then
    -- a failure older than the last payment that went through is stale
    update public.billing set payment_issue_at = p_at, payment_issue_invoice = left(p_invoice, 255)
     where workspace_id = p_ws and (payment_ok_at is null or payment_ok_at <= p_at);
  else
    update public.billing set payment_ok_at = greatest(coalesce(payment_ok_at, p_at), p_at),
        payment_issue_at = case when payment_issue_at is not null and payment_issue_at <= p_at then null else payment_issue_at end,
        payment_issue_invoice = case when payment_issue_at is not null and payment_issue_at <= p_at then null else payment_issue_invoice end
     where workspace_id = p_ws and payment_issue_at is not null and payment_issue_at <= p_at;
    get diagnostics n = row_count;
    if n = 0 then update public.billing set payment_ok_at = greatest(coalesce(payment_ok_at, p_at), p_at) where workspace_id = p_ws; return false; end if;
    return true;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end $$;

/* ------------------------------ refunds ------------------------------ */

create or replace function public.license_charge_refund(p_id uuid, p_stripe text) returns text
language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  select status into st from public.license_charges where id = p_id for update;
  if st is null then return 'none'; end if;
  if st = 'used' then return 'used'; end if;
  update public.license_charges set status = 'void', stripe_ref = coalesce(stripe_ref, p_stripe) where id = p_id and status in ('pending', 'paid');
  return 'void';
end $$;

/* ------------------------------ the team hears about billing ------------------------------ */

-- 'billing': billing health problems (the monitor's daily check), two live store plans for one workspace, a refund
-- after a filing went in
alter table public.team_tasks drop constraint if exists team_tasks_kind_check;
alter table public.team_tasks add constraint team_tasks_kind_check
  check (kind in ('handoff', 'check_agency', 'skill_broken', 'destination_stale', 'review', 'quote', 'line_health', 'ai_spend', 'ask_person', 'margin', 'team_time', 'selector_drift', 'playbook_review', 'billing'));

revoke execute on function public.stripe_event_claim(text, text), public.stripe_event_done(text), public.ai_credit_once(uuid, numeric, text),
  public.billing_payment_apply(uuid, boolean, timestamptz, text), public.license_charge_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.stripe_event_claim(text, text), public.stripe_event_done(text), public.ai_credit_once(uuid, numeric, text),
  public.billing_payment_apply(uuid, boolean, timestamptz, text), public.license_charge_refund(uuid, text) to service_role;
