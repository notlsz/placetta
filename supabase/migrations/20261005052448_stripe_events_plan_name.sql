-- Stripe retries webhooks; each event is applied once.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- Which monthly plan the workspace is on (starter, growth, scale), for Settings.
alter table public.billing add column if not exists subscription_plan text;
