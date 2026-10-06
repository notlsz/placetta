create table if not exists public.updates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('deadline', 'renewal', 'filing', 'payment', 'team')),
  title jsonb not null,
  body jsonb,
  app_id text,
  dedupe text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (workspace_id, dedupe)
);
create index if not exists updates_workspace_created on public.updates (workspace_id, created_at desc);
alter table public.updates enable row level security;
create policy "Members read their workspace's updates" on public.updates for select to authenticated using (public.is_member(workspace_id));
revoke all on public.updates from anon, authenticated;
grant select on public.updates to authenticated;
create or replace function public.read_updates(ws uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_member(ws) then raise exception 'Not your workspace.'; end if;
  update public.updates set read_at = now() where workspace_id = ws and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.read_updates(uuid) from public, anon;
grant execute on function public.read_updates(uuid) to authenticated;
alter table public.app_settings add column if not exists monitor_last_run timestamptz;
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'monitor_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'monitor_key');
  end if;
end $$;
create or replace function public.monitor_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_key) >= 32 and p_key = (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1), false);
$$;
revoke execute on function public.monitor_key_ok(text) from public, anon, authenticated;
grant execute on function public.monitor_key_ok(text) to service_role;
