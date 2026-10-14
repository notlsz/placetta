-- Odelia's spending: what she may buy for a workspace (spend_policies) and every purchase she asked for or made
-- (purchases). The spend function is the only writer: it checks each purchase against the policy and the budgets
-- (src/spend.ts) before anything is bought, and records who approved it. Members read; owners change the policy
-- through the function. Safe to run twice.

create table if not exists public.spend_policies (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  policy jsonb not null,                    -- src/spend.ts SpendPolicy: on, allowed kinds, limits, payees, budgets
  card_holder text,                         -- Stripe Issuing cardholder for single-use cards (when card payments are on)
  updated_by uuid,
  updated_at timestamptz not null default now()
);
comment on table public.spend_policies is 'What Odelia may buy for a workspace, from whom, how much, and the budgets. Written only by the spend function (owners).';
alter table public.spend_policies enable row level security;
revoke all on public.spend_policies from public, anon, authenticated;
grant select on public.spend_policies to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'spend_policies' and policyname = 'Members read their spending rules') then
    create policy "Members read their spending rules" on public.spend_policies for select to authenticated using (public.is_member(workspace_id));
  end if;
end $$;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category text not null,
  payee text not null,
  payee_url text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  store_id text,
  app_id text,
  filing_id uuid,
  why jsonb not null,                       -- {en, zh}
  status text not null default 'asked' check (status in ('asked', 'approved', 'paid', 'declined', 'blocked', 'failed', 'canceled')),
  by_agent boolean not null default true,
  requested_by uuid,
  approvals jsonb not null default '[]',    -- [{who, at}]
  approvers_needed integer not null default 1,
  reasons jsonb,                            -- why it was blocked or needs approval
  method text check (method in ('card', 'link')),
  charge_id text,                           -- the PaymentIntent that billed the workspace for a card purchase
  card_id text,                             -- the single-use Issuing card
  card_last4 text,
  receipt_path text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  paid_at timestamptz
);
comment on table public.purchases is 'Every purchase Odelia asked for or made, with the rule check, approvals, the card or link it was paid with, and the receipt.';
create index if not exists purchases_workspace on public.purchases(workspace_id, created_at desc);
create index if not exists purchases_card on public.purchases(card_id) where card_id is not null;
alter table public.purchases enable row level security;
revoke all on public.purchases from public, anon, authenticated;
grant select on public.purchases to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'purchases' and policyname = 'Members read their purchases') then
    create policy "Members read their purchases" on public.purchases for select to authenticated using (public.is_member(workspace_id));
  end if;
end $$;

-- A purchase is its own kind of update (every earlier kind kept).
alter table public.updates drop constraint if exists updates_kind_check;
alter table public.updates add constraint updates_kind_check check (kind in ('deadline', 'renewal', 'filing', 'payment', 'team', 'agent', 'mail', 'purchase'));
