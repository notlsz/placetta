-- Odelia's owner controls (src/autonomy.ts, src/businessRules.ts, src/rewind.ts), in the database where it matters.
--
-- 1. Only an owner changes them. They live in the workspace's state under "controls": how much Odelia does on her own,
--    Always allow and Never rules, house rules, business rules, and the plans an owner approved. A save by a member
--    (or staff) keeps them as they were, whatever the app sent. The service role (Odelia's runs, the monitor) keeps its
--    own bookkeeping there: which business rules fired, which rules were used.
-- 2. Two owners for one filing when a business rule asks for it ("when a filing is put up for approval" or "when a fee
--    over $N is requested", then "a second owner approves it too"). Each owner's approval is a row in owner_approvals,
--    written as themselves; the filing goes in only with two different owners' rows, the person filing among them.
--    Once it's in, the rows for that application are cleared, so the next filing of it needs two approvals again.
-- Undo's records stay in the workspace state (the last 20 runs), so they need nothing here. Safe to run twice.

create or replace function public.keep_owner_controls() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;   -- the service role: Odelia's runs and the monitor
  if (old.state -> 'controls') is not distinct from (new.state -> 'controls') then return new; end if;
  if exists (select 1 from public.workspace_members m where m.workspace_id = new.id and m.user_id = auth.uid() and m.role = 'owner') then return new; end if;
  new.state := case when coalesce(old.state, '{}'::jsonb) ? 'controls'
    then jsonb_set(coalesce(new.state, '{}'::jsonb), '{controls}', old.state -> 'controls')
    else coalesce(new.state, '{}'::jsonb) - 'controls' end;
  return new;
end $$;
drop trigger if exists workspaces_owner_controls on public.workspaces;
create trigger workspaces_owner_controls before update of state on public.workspaces for each row execute function public.keep_owner_controls();
revoke execute on function public.keep_owner_controls() from public, anon, authenticated;

create table if not exists public.owner_approvals (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_id text not null check (char_length(app_id) between 1 and 200),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (workspace_id, app_id, user_id)
);
comment on table public.owner_approvals is 'An owner''s approval of one application''s filing, kept when a business rule wants two owners. Members of the workspace read them; an owner writes only their own.';
alter table public.owner_approvals enable row level security;
revoke all on public.owner_approvals from public, anon, authenticated;
grant select, insert on public.owner_approvals to authenticated;
grant all on public.owner_approvals to service_role;
drop policy if exists "members read owner approvals" on public.owner_approvals;
create policy "members read owner approvals" on public.owner_approvals for select to authenticated using (public.is_member(workspace_id));
drop policy if exists "owners record their own approval" on public.owner_approvals;
create policy "owners record their own approval" on public.owner_approvals for insert to authenticated
  with check (user_id = auth.uid() and public.is_owner(workspace_id));

/** Whether a business rule in the workspace's controls wants two owners for a filing with this fee. */
create or replace function public.needs_two_owners(ws uuid, fee numeric) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.workspaces w, jsonb_array_elements(case when jsonb_typeof(w.state -> 'controls' -> 'business') = 'array' then w.state -> 'controls' -> 'business' else '[]'::jsonb end) r
     where w.id = ws
       and coalesce(r -> 'on', 'true'::jsonb) <> 'false'::jsonb
       and r -> 'then' ->> 'action' = 'second_owner'
       and (r -> 'when' ->> 'event' = 'filing_approval'
         or (r -> 'when' ->> 'event' = 'fee_over'
           and coalesce(fee, 0) > case when (r -> 'when' ->> 'amount') ~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then (r -> 'when' ->> 'amount')::numeric else 0 end)))
$$;
revoke execute on function public.needs_two_owners(uuid, numeric) from public, anon, authenticated;

create or replace function public.filings_two_owners() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owners int;
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  if not public.needs_two_owners(new.workspace_id, new.fee_estimate) then return new; end if;
  select count(distinct a.user_id) into owners
    from public.owner_approvals a
    join public.workspace_members m on m.workspace_id = a.workspace_id and m.user_id = a.user_id and m.role = 'owner'
   where a.workspace_id = new.workspace_id and a.app_id = new.app_id and a.at > now() - interval '30 days';
  if owners < 2 or not exists (select 1 from public.owner_approvals a where a.workspace_id = new.workspace_id and a.app_id = new.app_id and a.user_id = auth.uid()) then
    raise exception using errcode = 'P0001', message = 'second_owner: Under your business rule, two different owners approve this filing before it goes in.';
  end if;
  return new;
end $$;
drop trigger if exists filings_two_owners on public.filings;
create trigger filings_two_owners before insert on public.filings for each row execute function public.filings_two_owners();
revoke execute on function public.filings_two_owners() from public, anon, authenticated;

create or replace function public.filings_clear_owner_approvals() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.owner_approvals where workspace_id = new.workspace_id and app_id = new.app_id;
  return new;
end $$;
drop trigger if exists filings_clear_owner_approvals on public.filings;
create trigger filings_clear_owner_approvals after insert on public.filings for each row execute function public.filings_clear_owner_approvals();
revoke execute on function public.filings_clear_owner_approvals() from public, anon, authenticated;
