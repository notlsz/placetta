-- The stores a per-location checkout billed for, so the payment webhook counts exactly those (a store added while the
-- person is on Stripe's page still gets its opening fee on the next invoice). Safe to run twice.
alter table public.billing add column if not exists checkout_store_ids text[];
