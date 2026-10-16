-- What billing charges for, kept where members can't edit it. Safe to run twice.
--
-- Until now the billing function counted locations and opening fees straight from workspaces.state.stores, which any
-- member can rewrite: marking an opening store "open" (or a restaurant "retail") before checkout dropped its opening
-- fee. Now a trigger on workspaces copies each store's stage and kind into store_billing, which only the service role
-- reads and nothing else writes, with two rules the state can't get around:
--   * a store seen as opening stays billed as opening until its opening fee has been charged (its id is in
--     billing.charged_store_ids); after that it may become open
--   * an opening store not yet charged can't move to a cheaper kind (food to retail)
-- A store removed from the workspace is marked removed (not deleted), and comes back if it's added again.
-- Billing counts locations as the stores not removed.
--
-- The Stripe webhook also gets two atomic helpers here, so two deliveries can't read-modify-write the same row:
--   billing_checkout_completed   a paid checkout: customer, entry markets (added in SQL), charged stores, entry credit
--   billing_subscription_apply   a subscription event, applied only when it is not older than the last one applied

create table if not exists public.store_billing (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  store_id text not null check (length(store_id) between 1 and 200),
  name text,
  kind text not null check (kind in ('retail', 'food', 'complex')),
  opening boolean not null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (workspace_id, store_id)
);
comment on table public.store_billing is 'Each store''s billed stage and kind, copied from the workspace by a trigger. Service role only.';
alter table public.store_billing enable row level security;
revoke all on public.store_billing from public, anon, authenticated;
grant select on public.store_billing to service_role;

-- The kind a store without its own kind gets, from what the business sells (the same words billing used before).
create or replace function public.store_kind_fallback(p_state jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when (
    coalesce(p_state->'business'->>'en', '') || ' ' || coalesce((
      select string_agg(coalesce(f->'value'->>'en', ''), ' ')
        from jsonb_array_elements(case when jsonb_typeof(p_state->'facts') = 'array' then p_state->'facts' else '[]'::jsonb end) f
       where coalesce(f->'label'->>'en', '') ~* 'what you sell|business type|cuisine|menu'), '')
  ) ~* 'tea|coffee|caf[eé]|restaurant|food|kitchen|bakery|hot ?pot|noodle|dessert|ice cream|boba|bubble|juice|bar\y|grill|pizza|sushi|dumpling|奶茶|茶|咖啡|餐|火锅|面|甜品|烘焙|食'
  then 'food' else 'retail' end;
$$;

-- Copy a workspace's stores into store_billing under the rules above.
create or replace function public.store_billing_apply(p_ws uuid, p_state jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  fallback text := public.store_kind_fallback(coalesce(p_state, '{}'::jsonb));
  charged text[];
  ids text[];
begin
  select coalesce(b.charged_store_ids, '{}') into charged from public.billing b where b.workspace_id = p_ws;
  charged := coalesce(charged, '{}');
  with incoming as (
    select distinct on (s->>'id') s->>'id' as id, left(coalesce(s->'name'->>'en', s->>'id'), 200) as name,
           case when s->>'kind' in ('retail', 'food', 'complex') then s->>'kind' else fallback end as kind,
           coalesce(s->>'stage', '') = 'opening' as opening
      from (select s from jsonb_array_elements(case when jsonb_typeof(p_state->'stores') = 'array' then p_state->'stores' else '[]'::jsonb end) s limit 2000) x
     where jsonb_typeof(s->'id') = 'string' and length(s->>'id') between 1 and 200
  ), saved as (
    insert into public.store_billing as b (workspace_id, store_id, name, kind, opening)
    select p_ws, id, name, kind, opening from incoming
    on conflict (workspace_id, store_id) do update set
      name = excluded.name,
      opening = case when excluded.opening then true
                     when b.store_id = any (charged) then false
                     else b.opening end,
      kind = case when b.opening and not (b.store_id = any (charged)) and b.kind = 'food' and excluded.kind = 'retail' then b.kind
                  else excluded.kind end,
      removed_at = null,
      updated_at = now()
    returning store_id
  )
  select coalesce(array_agg(store_id), '{}') into ids from saved;
  update public.store_billing set removed_at = now(), updated_at = now()
   where workspace_id = p_ws and removed_at is null and not (store_id = any (ids));
end $$;
revoke execute on function public.store_billing_apply(uuid, jsonb), public.store_kind_fallback(jsonb) from public, anon, authenticated;
grant execute on function public.store_billing_apply(uuid, jsonb) to service_role;

create or replace function public.store_billing_track() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.store_billing_apply(new.id, new.state);
  return null;
end $$;
revoke execute on function public.store_billing_track() from public, anon, authenticated;

drop trigger if exists store_billing_insert on public.workspaces;
create trigger store_billing_insert after insert on public.workspaces
  for each row execute function public.store_billing_track();
drop trigger if exists store_billing_update on public.workspaces;
create trigger store_billing_update after update of state on public.workspaces
  for each row when (old.state->'stores' is distinct from new.state->'stores'
                     or old.state->'business' is distinct from new.state->'business'
                     or old.state->'facts' is distinct from new.state->'facts')
  execute function public.store_billing_track();

-- Every workspace that already exists, as it is now.
do $$ declare w record; begin
  for w in select id, state from public.workspaces loop perform public.store_billing_apply(w.id, w.state); end loop;
end $$;

/* ------------------------------ the Stripe webhook's writes ------------------------------ */

alter table public.billing add column if not exists subscription_event_at timestamptz;
comment on column public.billing.subscription_event_at is 'When Stripe created the last subscription event applied; older events are ignored.';

create or replace function public.billing_checkout_completed(p_ws uuid, p_customer text, p_add_markets int, p_locations boolean, p_entry_credited boolean)
returns void
language sql security definer set search_path = '' as $$
  update public.billing b set
    stripe_customer_id = coalesce(b.stripe_customer_id, nullif(p_customer, '')),
    entry_markets = b.entry_markets + greatest(coalesce(p_add_markets, 0), 0),
    entry_paid_at = case when coalesce(p_add_markets, 0) > 0 then now() else b.entry_paid_at end,
    -- The stores this checkout billed for (or, for an older checkout without the list, every store billing knows).
    charged_store_ids = case when coalesce(p_locations, false) then array(
        select distinct x from unnest(b.charged_store_ids || coalesce(b.checkout_store_ids,
          array(select s.store_id from public.store_billing s where s.workspace_id = p_ws and s.removed_at is null))) x order by x)
      else b.charged_store_ids end,
    entry_credited_at = case when coalesce(p_entry_credited, false) then coalesce(b.entry_credited_at, now()) else b.entry_credited_at end
  where b.workspace_id = p_ws;
$$;

create or replace function public.billing_subscription_apply(p_ws uuid, p_event_at timestamptz, p_customer text, p_subscription text,
  p_status text, p_plan text, p_period_end timestamptz, p_paid_locations int)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.billing set
    stripe_customer_id = p_customer, subscription_id = p_subscription, subscription_status = p_status,
    subscription_plan = p_plan, current_period_end = p_period_end, paid_locations = greatest(coalesce(p_paid_locations, 0), 0),
    subscription_event_at = p_event_at
  where workspace_id = p_ws and (subscription_event_at is null or subscription_event_at <= p_event_at);
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.billing_checkout_completed(uuid, text, int, boolean, boolean),
  public.billing_subscription_apply(uuid, timestamptz, text, text, text, text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.billing_checkout_completed(uuid, text, int, boolean, boolean),
  public.billing_subscription_apply(uuid, timestamptz, text, text, text, text, timestamptz, int) to service_role;
