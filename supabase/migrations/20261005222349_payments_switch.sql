create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  payments_on boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;
alter table public.app_settings enable row level security;
create policy "Anyone signed in can read the settings" on public.app_settings for select to authenticated using (true);
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;
create or replace function public.payments_on() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.payments_on from public.app_settings s where s.id), false);
$$;
revoke execute on function public.payments_on() from public, anon;
grant execute on function public.payments_on() to authenticated, service_role;
create or replace function public.plan_of(ws uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when not public.payments_on() then 'monthly' else coalesce((
    select case
      when b.comped or b.subscription_status in ('active', 'trialing') then 'monthly'
      when b.entry_markets > 0 then 'entry'
      else 'none' end
    from public.billing b where b.workspace_id = ws
  ), 'none') end;
$$;
