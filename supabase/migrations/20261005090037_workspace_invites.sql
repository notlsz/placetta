-- Part 3: invites by email, and two helpers for team changes. Safe to run twice.
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz
);
create unique index if not exists workspace_invites_open on public.workspace_invites(workspace_id, email) where accepted_at is null and revoked_at is null;
create index if not exists workspace_invites_email on public.workspace_invites(email) where accepted_at is null and revoked_at is null;
create index if not exists workspace_invites_invited_by on public.workspace_invites(invited_by);
create index if not exists workspace_invites_accepted_by on public.workspace_invites(accepted_by);
alter table public.workspace_invites enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workspace_invites' and policyname = 'owners and team see invites') then
    create policy "owners and team see invites" on public.workspace_invites for select to authenticated
      using (public.is_owner(workspace_id) or public.is_staff());
  end if;
end $$;
revoke all on public.workspace_invites from anon;
revoke insert, update on public.workspace_invites from authenticated;
grant select on public.workspace_invites to authenticated;

create or replace function public.audit_team(ws uuid, en text, zh text, who text) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (ws, 'you', auth.uid(), jsonb_build_object('en', en, 'zh', zh), jsonb_build_object('en', who, 'zh', who));
$$;
create or replace function public.owner_count(ws uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.workspace_members where workspace_id = ws and role = 'owner';
$$;
revoke execute on function public.audit_team(uuid, text, text, text), public.owner_count(uuid) from public, anon, authenticated;
revoke execute on function public.track_usage(uuid, int, bigint, bigint, bigint) from authenticated;
