-- Two-step sign-in and owner helpers (part 1 of the teams change). Safe to run twice.
create or replace function public.aal2() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.aal2() or not exists (
    select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'
  );
$$;

create or replace function public.is_staff_email() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_emails s join auth.users u on lower(u.email) = s.email
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff_email() and public.aal2();
$$;

create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid())
     and public.mfa_ok();
$$;

create or replace function public.is_owner(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role = 'owner')
     and public.mfa_ok();
$$;

create or replace function public.can_use_folder(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() or (
    exists (select 1 from public.workspace_members m
             where m.user_id = auth.uid() and m.workspace_id::text = (storage.foldername(object_name))[1])
    and public.mfa_ok()
  );
$$;

alter policy "members request filings they can file" on public.filings
  with check (public.is_owner(workspace_id) and public.can_file(workspace_id));
alter policy "members cancel, team works filings" on public.filings
  using (public.is_owner(workspace_id) or public.is_staff())
  with check (public.is_owner(workspace_id) or public.is_staff());

revoke execute on function public.aal2(), public.mfa_ok(), public.is_staff_email(), public.is_owner(uuid) from public, anon;
grant execute on function public.aal2(), public.mfa_ok(), public.is_staff_email(), public.is_owner(uuid) to authenticated;
