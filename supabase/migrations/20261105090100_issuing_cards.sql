-- Odelia pays agency fees herself (supabase/functions/_shared/issuing.ts, spend's filer actions, the portal worker's
-- fill_card, stripe-webhook's issuing events, file's Lob checks). Off until STRIPE_ISSUING_ON=1 and
-- app_settings.issuing_on; with them off nothing here is used and every fee goes to a person as before.
--
-- 1. purchases: what reconciling a single-use card needs (the registry's fee, the authorization and the settled
--    transaction, what was refunded, the agency's receipt amount and confirmation, flags for the team, when the card
--    lapses), and a check mailed by Lob as a method (check_id).
-- 2. One live card or check per filing, whatever races.
-- 3. filer_run_live: the spend function asks whether a portal run's token is live for the filing it names, so the worker
--    gets a card only for the one filing it is running, while it runs. Service role only.
-- No card number, security code or expiry is ever stored: Stripe keeps them, and the worker gets them in memory only.
-- No new table. Safe to run twice.

alter table public.purchases add column if not exists fee_cents integer check (fee_cents is null or fee_cents > 0);
alter table public.purchases add column if not exists authorization_id text;
alter table public.purchases add column if not exists authorized_cents integer;
alter table public.purchases add column if not exists settled_cents integer;
alter table public.purchases add column if not exists refunded_cents integer not null default 0;
alter table public.purchases add column if not exists transaction_id text;
alter table public.purchases add column if not exists merchant jsonb;            -- {name, category} from Stripe
alter table public.purchases add column if not exists receipt_cents integer;     -- the amount on the agency's own confirmation
alter table public.purchases add column if not exists confirmation text;         -- the agency's confirmation or receipt number
alter table public.purchases add column if not exists flags jsonb;               -- what didn't reconcile, for the team
alter table public.purchases add column if not exists expires_at timestamptz;    -- a single-use card lapses (24 hours)
alter table public.purchases add column if not exists check_id text;             -- a Lob check mailed with the form
comment on column public.purchases.card_last4 is 'The single-use card''s last four digits. The full number, security code and expiry are never stored.';

alter table public.purchases drop constraint if exists purchases_method_check;
alter table public.purchases add constraint purchases_method_check check (method in ('card', 'link', 'check'));

create unique index if not exists purchases_one_live_per_filing on public.purchases (filing_id)
  where filing_id is not null and method in ('card', 'check') and status in ('approved', 'paid');
create index if not exists purchases_lapsing on public.purchases (expires_at) where method = 'card' and status = 'approved';
create index if not exists purchases_authorization on public.purchases (authorization_id) where authorization_id is not null;

/** Is this portal run's token live for this filing? (20261022190000_agent_security.sql: only its hash is kept.) For the
    spend function, which hands the run a card for that filing alone. */
create or replace function public.filer_run_live(p_token text, p_filing uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(char_length(p_token) >= 32, false) and exists (
    select 1 from public.filer_runs r
    where r.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
      and r.filing_id = p_filing and r.ended_at is null and r.expires_at > now())
$$;
revoke execute on function public.filer_run_live(text, uuid) from public, anon, authenticated;
grant execute on function public.filer_run_live(text, uuid) to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'revoke execute on function public.filer_run_live(text, uuid) from placetta_filer';
  end if;
end $$;
