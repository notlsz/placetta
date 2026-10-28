-- Outcome pricing (src/pricing.ts SIMPLE.licenseOnApprovalUsd, docs/PRICING.md), the founder's decision of 2026-10-28,
-- after Sierra and Decagon (pay per resolution), as he corrected it the same day. A new license is charged when the
-- agency decides it, never when the owner approves the filing:
--   approved by the agency               charged
--   rejected through Placetta's fault    not charged, and anything paid for that filing is refunded
--   rejected, not Placetta's fault       charged, at the moment the team marks the reason: a zoning denial, a business
--                                        the law makes ineligible, wrong or incomplete information from the owner, or
--                                        the owner withdrew it
--   $149 a new license, $999 a complex one (liquor, building plan review, import permits). The store plan, renewals
--   ($99) and everything a legacy workspace bought stay as they are.
--
-- The money path (supabase/functions/_shared/outcome.ts, billing {action: "outcome_sweep"}):
--   1. The owner approves the filing at the price shown. Stripe saves the card (a SetupIntent through Stripe Checkout in
--      setup mode, or the card the customer already saved). Placetta never sees or types a card number. Nothing is
--      charged: the charge is 'authorized' (collect = 'on_approval') and the filing may go in on it.
--   2. Accepted with the agency's confirmation, license number, license PDF or approval upload: 'due'. Rejected with a
--      reason that isn't Placetta's fault: 'due' too. Rejected through Placetta's fault: 'waived'.
--   3. The sweep charges a due charge off session, once: 'charging', then 'used' (paid). Every Stripe call carries the
--      charge id in its idempotency key and the invoice id is kept on the charge, so a retry never charges twice, and an
--      approval and a rejection can never both charge (one charge row, one invoice). Authentication required (SCA):
--      'action', and the owner gets Stripe's pay link. A refused card: 'failed', and the existing dunning runs
--      (billing_payment_apply, the owner's notice, Stripe's own retries); invoice.paid settles it.
--   4. The team picks the reason from a fixed list with a note (the Team view). The owner sees it and can dispute it
--      with one tap (filing_dispute_rejection), which goes to the team. If the team changes the reason to Placetta's
--      fault, anything paid is refunded ('refund_due', then 'refunded'); an invoice not yet paid is voided.
--   Agency fees are passed through as before and never refunded by Placetta.
--
-- Also: the terms version for the new rule (src/legal.ts UPDATED).
-- Safe to run twice. Written 2026-10-28, not applied to the live database.

/* ------------------------------ license charges: collected on the agency's decision ------------------------------ */

alter table public.license_charges add column if not exists collect text not null default 'upfront';
alter table public.license_charges drop constraint if exists license_charges_collect_check;
alter table public.license_charges add constraint license_charges_collect_check check (collect in ('upfront', 'on_approval'));
alter table public.license_charges add column if not exists payment_method text check (payment_method is null or payment_method ~ '^(pm|card|src)_[A-Za-z0-9]{4,250}$');
alter table public.license_charges add column if not exists stripe_customer text check (stripe_customer is null or stripe_customer ~ '^cus_[A-Za-z0-9]{4,250}$');
alter table public.license_charges add column if not exists pay_url text check (pay_url is null or (pay_url ~ '^https://' and length(pay_url) <= 2000));
alter table public.license_charges add column if not exists due_at timestamptz;
alter table public.license_charges add column if not exists claimed_at timestamptz;
alter table public.license_charges add column if not exists attempts int not null default 0 check (attempts between 0 and 1000);
alter table public.license_charges add column if not exists last_error text check (last_error is null or length(last_error) <= 300);
-- why it was charged: the agency approved it, or rejected it for a reason that isn't Placetta's fault
alter table public.license_charges add column if not exists outcome text check (outcome is null or outcome in ('approved', 'rejected'));
alter table public.license_charges add column if not exists fault text check (fault is null or fault in ('placetta', 'not_placetta'));
alter table public.license_charges add column if not exists closed_reason text check (closed_reason is null or length(closed_reason) <= 40);
alter table public.license_charges add column if not exists closed_at timestamptz;
alter table public.license_charges add column if not exists refunded_at timestamptz;

alter table public.license_charges drop constraint if exists license_charges_status_check;
alter table public.license_charges add constraint license_charges_status_check check (status in (
  'pending',     -- Stripe Checkout is open (paying now, or saving the card for an on-approval charge)
  'paid',        -- paid up front, waiting for its filing
  'used',        -- its filing went in on it, paid (up front, or on the agency's decision)
  'void',        -- let go, nothing owed
  'authorized',  -- on approval: card saved, nothing charged; the filing may go in on it
  'due',         -- the agency decided (approved, or rejected not through Placetta's fault); the sweep charges it
  'charging',    -- the sweep is charging it now
  'action',      -- the bank asked the owner to confirm (SCA); the owner has Stripe's pay link
  'failed',      -- the card was refused; the dunning runs and invoice.paid settles it
  'waived',      -- rejected through Placetta's fault: nothing charged
  'refund_due',  -- something at Stripe to undo: a refund of what was paid, or an unpaid invoice to void
  'refunding',   -- the sweep is undoing it now
  'refunded'));  -- paid, then refunded in full

-- one charge in flight per filing at a time
drop index if exists public.license_charges_open;
create unique index if not exists license_charges_open on public.license_charges(workspace_id, ref) where status in ('pending', 'paid', 'authorized');
create index if not exists license_charges_filing on public.license_charges(filing_id) where filing_id is not null;
create index if not exists license_charges_sweep on public.license_charges(status, claimed_at) where status in ('due', 'charging', 'refund_due', 'refunding');
comment on column public.license_charges.collect is 'upfront: paid when the owner approved the filing (renewals, and new licenses before 2026-10-28). on_approval: a new license, charged on the agency''s decision (outcome pricing): approved, or rejected not through Placetta''s fault.';

/* ------------------------------ why a filing was rejected ------------------------------ */

-- Set by the Placetta team on a rejection (the Team view, src/cloud/Ops.tsx), with a note. Placetta's fault: a wrong
-- value in the filing, the wrong form, or a missed document Placetta should have flagged. Not Placetta's fault: a
-- business the law makes ineligible, a zoning denial, wrong or incomplete information from the owner, or the owner
-- withdrew it.
alter table public.filings add column if not exists rejection_reason text;
alter table public.filings drop constraint if exists filings_rejection_reason_check;
alter table public.filings add constraint filings_rejection_reason_check check (rejection_reason is null or rejection_reason in (
  'placetta_wrong_value', 'placetta_wrong_form', 'placetta_missed_document',
  'ineligible', 'zoning', 'owner_info', 'owner_withdrew'));
alter table public.filings add column if not exists rejection_fault text generated always as (
  case when rejection_reason like 'placetta\_%' then 'placetta' when rejection_reason is not null then 'not_placetta' end) stored;
alter table public.filings add column if not exists rejection_note text check (rejection_note is null or length(rejection_note) <= 1000);
alter table public.filings add column if not exists rejection_marked_at timestamptz;

-- The owner's dispute of a reason, one a filing (filing_dispute_rejection). Members read it; only the function writes.
create table if not exists public.rejection_disputes (
  filing_id uuid primary key references public.filings(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reason text not null,
  note text check (note is null or length(note) <= 1000),
  by_user uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists rejection_disputes_ws on public.rejection_disputes(workspace_id);
create index if not exists rejection_disputes_by on public.rejection_disputes(by_user);
alter table public.rejection_disputes enable row level security;
revoke all on public.rejection_disputes from public, anon, authenticated;
grant select on public.rejection_disputes to authenticated;
grant select, insert, update, delete on public.rejection_disputes to service_role;
drop policy if exists "the workspace and the team read disputes" on public.rejection_disputes;
create policy "the workspace and the team read disputes" on public.rejection_disputes for select to authenticated
  using (public.can_view(workspace_id) or public.is_staff());
comment on column public.filings.rejection_reason is 'Why the agency rejected it, as the Placetta team marks it. placetta_*: Placetta''s fault (no charge, and a refund of anything paid). Others: not Placetta''s fault (the license price is charged when it is marked).';

/* ------------------------------ the quote and who may file ------------------------------ */

create or replace function public.license_state(p_ws uuid, p_ref text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'renewal', exists (select 1 from public.license_charges c where c.workspace_id = p_ws and c.ref = p_ref and c.status = 'used')
            or exists (select 1 from public.filings f where f.workspace_id = p_ws and f.app_id = p_ref and f.status = 'accepted'),
    'paid', (select jsonb_build_object('id', c.id, 'tier', c.tier, 'cents', c.cents) from public.license_charges c
              where c.workspace_id = p_ws and c.ref = p_ref and c.status = 'paid' limit 1),
    -- approved with a saved card, charged on the agency's decision
    'authorized', (select jsonb_build_object('id', c.id, 'tier', c.tier, 'cents', c.cents, 'status', c.status) from public.license_charges c
              where c.workspace_id = p_ws and c.ref = p_ref and c.collect = 'on_approval' and c.status = 'authorized' limit 1),
    'model', coalesce((select b.price_model from public.billing b where b.workspace_id = p_ws), 'simple'));
$$;

-- A filing may go in on the simple model as before, or on an on-approval charge whose card is saved (once per charge).
create or replace function public.can_file_app(ws uuid, p_app text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when not public.payments_on() or coalesce((select b.price_model from public.billing b where b.workspace_id = ws), 'legacy') <> 'simple' then public.can_file(ws)
    else exists (select 1 from public.workspaces w where w.id = ws and w.authorized_at is not null) and (
      exists (select 1 from public.billing b where b.workspace_id = ws and (b.comped
        or (b.subscription_status in ('active', 'trialing') and coalesce(b.paid_locations, 0) >= 10)))
      or exists (select 1 from public.license_charges c where c.workspace_id = ws and c.ref = p_app and c.status = 'paid')
      or exists (select 1 from public.license_charges c where c.workspace_id = ws and c.ref = p_app and c.collect = 'on_approval'
                   and c.status = 'authorized' and c.filing_id is null))
  end;
$$;
revoke execute on function public.can_file_app(uuid, text) from public, anon;
grant execute on function public.can_file_app(uuid, text) to authenticated, service_role;

-- The filing uses its charge: a paid one becomes used; an on-approval one is tied to the filing, still uncharged.
create or replace function public.license_charge_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.license_charges set status = 'used', used_at = now(), filing_id = new.id
    where workspace_id = new.workspace_id and ref = new.app_id and status = 'paid';
  update public.license_charges set used_at = now(), filing_id = new.id
    where workspace_id = new.workspace_id and ref = new.app_id and status = 'authorized' and collect = 'on_approval' and filing_id is null;
  return new;
end $$;

/* ------------------------------ the owner approves: save the card, charge nothing ------------------------------ */

-- Open an on-approval charge at the price the owner approved. One already paid is returned as it is (never charged
-- twice), one already authorized too; an unpaid Checkout left open earlier is let go first.
create or replace function public.license_outcome_open(p_ws uuid, p_ref text, p_tier text, p_cents int, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare had public.license_charges; nid uuid;
begin
  if p_tier not in ('license', 'complex') then return jsonb_build_object('ok', false, 'code', 'bad_tier'); end if;
  if p_cents is null or p_cents < 100 or p_cents > 100000 then return jsonb_build_object('ok', false, 'code', 'bad_price'); end if;
  perform 1 from public.billing where workspace_id = p_ws for update;
  select * into had from public.license_charges where workspace_id = p_ws and ref = p_ref and status in ('paid', 'authorized') limit 1;
  if had.id is not null then return jsonb_build_object('ok', true, 'id', had.id, 'paid', had.status = 'paid', 'authorized', had.status = 'authorized', 'again', true); end if;
  update public.license_charges set status = 'void', closed_reason = 'replaced', closed_at = now() where workspace_id = p_ws and ref = p_ref and status = 'pending';
  insert into public.license_charges (workspace_id, ref, tier, cents, status, approved_by, collect)
    values (p_ws, p_ref, p_tier, p_cents, 'pending', p_user, 'on_approval') returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid, 'paid', false, 'authorized', false, 'again', false);
end $$;

-- Stripe saved the card (the customer's saved card, or a completed setup Checkout): authorized, nothing charged.
-- Idempotent: an authorized charge stays as it is.
create or replace function public.license_outcome_authorize(p_id uuid, p_pm text, p_customer text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.license_charges set status = 'authorized', payment_method = p_pm, stripe_customer = coalesce(p_customer, stripe_customer)
    where id = p_id and collect = 'on_approval' and status = 'pending';
  get diagnostics n = row_count;
  return n > 0;
end $$;

/* ------------------------------ the agency decides ------------------------------ */

create or replace function public.license_outcome_filing() returns trigger
language plpgsql security definer set search_path = '' as $$
declare proof boolean := coalesce(new.confirmation_number, new.license_number, new.license_path, new.receipt_path) is not null;
begin
  if new.status = 'accepted' then
    if proof then
      -- approved, with the agency's confirmation or the license itself: due, charged by the sweep
      update public.license_charges set status = 'due', due_at = now(), outcome = 'approved'
        where filing_id = new.id and collect = 'on_approval' and status = 'authorized';
    elsif old.status is distinct from 'accepted' and exists (select 1 from public.license_charges c where c.filing_id = new.id and c.collect = 'on_approval' and c.status = 'authorized') then
      insert into public.team_tasks (kind, filing_id, workspace_id, title, detail, dedupe)
        values ('billing', new.id, new.workspace_id, format('Approved: add the agency''s confirmation or the license for %s so its charge can run', coalesce(new.title->>'en', 'a filing')),
          jsonb_build_object('why', 'outcome_proof'), format('outcome_proof:%s', new.id))
        on conflict (dedupe) do nothing;
    end if;
  elsif new.status = 'rejected' and (old.status is distinct from 'rejected' or new.rejection_reason is distinct from old.rejection_reason) then
    if new.rejection_reason is null then
      -- nothing moves until the team marks why
      if exists (select 1 from public.license_charges c where c.filing_id = new.id and c.cents > 0 and c.status not in ('void', 'refunded', 'waived')) then
        insert into public.team_tasks (kind, filing_id, workspace_id, title, detail, dedupe)
          values ('review', new.id, new.workspace_id, format('Rejected: mark why %s was rejected, Placetta''s fault or not', coalesce(new.title->>'en', 'a filing')),
            jsonb_build_object('why', 'rejection_reason'), format('rejection_reason:%s', new.id))
          on conflict (dedupe) do nothing;
      end if;
    elsif new.rejection_fault = 'placetta' then
      -- our fault: nothing charged, anything paid for it refunded, an invoice not yet paid voided
      update public.license_charges set status = 'waived', fault = 'placetta', closed_reason = 'rejected', closed_at = now()
        where filing_id = new.id and collect = 'on_approval' and status in ('authorized', 'due');
      update public.license_charges set status = 'refund_due', fault = 'placetta', closed_reason = 'rejected'
        where filing_id = new.id and (status in ('action', 'failed') or (status = 'used' and cents > 0 and paid_at is not null));
    else
      -- not our fault: the license price is charged now, by the same sweep and the same charge id as an approval
      update public.license_charges set status = 'due', due_at = now(), outcome = 'rejected', fault = 'not_placetta', closed_reason = null, closed_at = null
        where filing_id = new.id and collect = 'on_approval' and payment_method is not null
          and (status = 'authorized' or (status = 'waived' and closed_reason = 'rejected' and paid_at is null));
      update public.license_charges set fault = 'not_placetta'
        where filing_id = new.id and status in ('used', 'action', 'failed', 'charging', 'due');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists license_outcome_filing on public.filings;
create trigger license_outcome_filing after update of status, confirmation_number, license_number, license_path, receipt_path, rejection_reason
  on public.filings for each row execute function public.license_outcome_filing();

/* ------------------------------ the owner disputes the reason ------------------------------ */

-- One tap from the owner: the reason marked isn't right. The team gets a task; changing the reason to Placetta's fault
-- refunds the charge (the trigger above). Owners only, on their own rejected filing, once a reason is marked.
create or replace function public.filing_dispute_rejection(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.filings; note text := left(nullif(trim(coalesce(p_note, '')), ''), 1000);
begin
  select * into f from public.filings where id = p_id;
  if f.id is null or not public.is_owner(f.workspace_id) then raise exception 'Only an owner of this workspace can dispute it.'; end if;
  if f.status <> 'rejected' or f.rejection_reason is null then raise exception 'There is no rejection reason to dispute yet.'; end if;
  insert into public.rejection_disputes (filing_id, workspace_id, reason, note, by_user)
    values (p_id, f.workspace_id, f.rejection_reason, note, auth.uid())
    on conflict (filing_id) do update set reason = excluded.reason, note = coalesce(excluded.note, rejection_disputes.note), by_user = excluded.by_user, created_at = now(), resolved_at = null;
  insert into public.team_tasks (kind, filing_id, workspace_id, title, detail, dedupe)
    values ('review', p_id, f.workspace_id, format('Disputed: the owner says %s wasn''t rejected for "%s"', coalesce(f.title->>'en', 'a filing'), f.rejection_reason),
      jsonb_build_object('why', 'rejection_dispute', 'reason', f.rejection_reason, 'note', note, 'by', auth.uid()), format('rejection_dispute:%s', p_id))
    on conflict (dedupe) do update set done_at = null, detail = excluded.detail;
  return jsonb_build_object('ok', true, 'disputed', true);
end $$;
revoke execute on function public.filing_dispute_rejection(uuid, text) from public, anon;
grant execute on function public.filing_dispute_rejection(uuid, text) to authenticated;

-- Only the Placetta team (or the server) marks why, and only on a rejected filing. A new reason resolves an open
-- dispute (the team answered it).
create or replace function public.filings_rejection_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare customer boolean := auth.uid() is not null and not public.is_staff();
begin
  if customer and (new.rejection_reason, new.rejection_note, new.rejection_marked_at) is distinct from (old.rejection_reason, old.rejection_note, old.rejection_marked_at) then
    raise exception 'Only the Placetta team marks why a filing was rejected. To dispute it, tap Dispute.';
  end if;
  if new.rejection_reason is distinct from old.rejection_reason then
    if new.status <> 'rejected' and new.rejection_reason is not null then raise exception 'Mark why only on a rejected filing.'; end if;
    new.rejection_marked_at := case when new.rejection_reason is null then null else now() end;
    update public.rejection_disputes set resolved_at = now() where filing_id = new.id and resolved_at is null;
  end if;
  if new.status <> 'rejected' and old.status = 'rejected' then new.rejection_reason := null; new.rejection_marked_at := null; end if;
  return new;
end $$;
drop trigger if exists filings_rejection_guard on public.filings;
create trigger filings_rejection_guard before update on public.filings for each row execute function public.filings_rejection_guard();

/* ------------------------------ the sweep ------------------------------ */

create or replace function public.license_outcome_due() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.license_charges c
    where (c.status in ('due', 'refund_due') and c.attempts < 8)
       or (c.status in ('charging', 'refunding') and c.claimed_at < now() - interval '10 minutes' and c.attempts < 8));
$$;

-- Up to p_limit charges to collect or undo, claimed so a second sweep leaves them alone. One left mid-way for ten
-- minutes (a sweep that crashed) is claimed again; the idempotency keys and the saved invoice id make that safe.
create or replace function public.license_outcome_claim(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb := '[]'::jsonb; r record;
begin
  for r in
    select c.* from public.license_charges c
     where (c.status in ('due', 'refund_due') or (c.status in ('charging', 'refunding') and c.claimed_at < now() - interval '10 minutes')) and c.attempts < 8
     order by coalesce(c.due_at, c.created_at) limit greatest(1, least(coalesce(p_limit, 20), 100))
     for update skip locked
  loop
    update public.license_charges set status = case when r.status in ('due', 'charging') then 'charging' else 'refunding' end,
        claimed_at = now(), attempts = attempts + 1 where id = r.id;
    out := out || jsonb_build_object('id', r.id, 'workspace_id', r.workspace_id, 'ref', r.ref, 'tier', r.tier, 'cents', r.cents,
      'job', case when r.status in ('due', 'charging') then 'charge' else 'undo' end, 'collect', r.collect, 'stripe_ref', r.stripe_ref,
      'payment_method', r.payment_method, 'fault', r.fault, 'outcome', r.outcome, 'attempts', r.attempts + 1, 'filing_id', r.filing_id,
      'customer', coalesce(r.stripe_customer, (select b.stripe_customer_id from public.billing b where b.workspace_id = r.workspace_id)),
      'title', (select f.title from public.filings f where f.id = r.filing_id));
  end loop;
  return out;
end $$;

-- Keep the invoice made for a charge before anything is added to it, so a retry finds it instead of making another.
create or replace function public.license_outcome_invoice(p_id uuid, p_invoice text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_invoice is null or p_invoice !~ '^in_[A-Za-z0-9]{4,250}$' then raise exception 'bad invoice'; end if;
  update public.license_charges set stripe_ref = p_invoice where id = p_id and status in ('charging', 'refunding') and (stripe_ref is null or stripe_ref = p_invoice);
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- What the sweep did. paid: used (or refund_due, when its filing was rejected through Placetta's fault meanwhile).
-- action: the pay link. failed: the card was refused. retry: back to due. refunded. undone: nothing was paid, so waived
-- (Placetta's fault) or void.
create or replace function public.license_outcome_result(p_id uuid, p_result text, p_stripe text default null, p_url text default null, p_error text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare c public.license_charges; ours boolean; st text;
begin
  select * into c from public.license_charges where id = p_id for update;
  if c.id is null then return 'none'; end if;
  ours := exists (select 1 from public.filings f where f.id = c.filing_id and f.status = 'rejected' and f.rejection_fault = 'placetta');
  if p_result = 'paid' and c.status in ('charging', 'due', 'action', 'failed') then
    st := case when ours then 'refund_due' else 'used' end;
    update public.license_charges set status = st, paid_at = coalesce(paid_at, now()), stripe_ref = coalesce(p_stripe, stripe_ref), pay_url = null, last_error = null, claimed_at = null
      where id = p_id;
    return st;
  elsif p_result = 'action' and c.status = 'charging' then
    update public.license_charges set status = 'action', pay_url = p_url, stripe_ref = coalesce(p_stripe, stripe_ref), last_error = left(p_error, 300), claimed_at = null where id = p_id;
    return 'action';
  elsif p_result = 'failed' and c.status = 'charging' then
    update public.license_charges set status = 'failed', pay_url = p_url, stripe_ref = coalesce(p_stripe, stripe_ref), last_error = left(p_error, 300), claimed_at = null where id = p_id;
    return 'failed';
  elsif p_result = 'retry' and c.status in ('charging', 'refunding') then
    update public.license_charges set status = case when c.status = 'charging' then 'due' else 'refund_due' end, last_error = left(p_error, 300), claimed_at = null where id = p_id;
    return 'retry';
  elsif p_result = 'refunded' and c.status = 'refunding' then
    update public.license_charges set status = 'refunded', refunded_at = now(), closed_at = now(), last_error = null, claimed_at = null where id = p_id;
    return 'refunded';
  elsif p_result = 'undone' and c.status = 'refunding' then
    st := case when c.fault = 'placetta' then 'waived' else 'void' end;
    update public.license_charges set status = st, closed_at = now(), last_error = null, claimed_at = null where id = p_id;
    return st;
  end if;
  return 'unchanged';
end $$;

-- invoice.paid for an on-approval charge (Stripe's retry after a refused card, or the owner paid the SCA link).
create or replace function public.license_outcome_paid(p_id uuid, p_invoice text) returns text
language sql security definer set search_path = '' as $$
  select public.license_outcome_result(p_id, 'paid', p_invoice, null, null);
$$;

revoke execute on function public.license_outcome_open(uuid, text, text, int, uuid), public.license_outcome_authorize(uuid, text, text),
  public.license_outcome_due(), public.license_outcome_claim(int), public.license_outcome_invoice(uuid, text),
  public.license_outcome_result(uuid, text, text, text, text), public.license_outcome_paid(uuid, text),
  public.license_outcome_filing(), public.filings_rejection_guard() from public, anon, authenticated;
grant execute on function public.license_outcome_open(uuid, text, text, int, uuid), public.license_outcome_authorize(uuid, text, text),
  public.license_outcome_due(), public.license_outcome_claim(int), public.license_outcome_invoice(uuid, text),
  public.license_outcome_result(uuid, text, text, text, text), public.license_outcome_paid(uuid, text) to service_role;
revoke execute on function public.license_state(uuid, text), public.license_charge_use() from public, anon, authenticated;
grant execute on function public.license_state(uuid, text) to service_role;

-- The per-minute sweep, only while something is due (the same pattern as placetta-voice-hold).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; the monitor''s daily run collects charges on the agency''s decision.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-license-outcome';
  perform cron.schedule('placetta-license-outcome', '* * * * *', $job$
    select net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/billing',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)),
      body := '{"action": "outcome_sweep"}'::jsonb,
      timeout_milliseconds := 60000
    )
    where public.license_outcome_due();
  $job$);
end $$;

/* ------------------------------ the terms ------------------------------ */

-- The terms add the outcome pricing rule and the list of reasons (src/legal.ts UPDATED): everyone accepts them again.
create or replace function public.current_terms_version() returns text
language sql immutable set search_path = '' as $$ select '2026-10-29'::text $$;
