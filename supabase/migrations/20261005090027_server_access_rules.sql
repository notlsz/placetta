-- Part 2: what the server functions may do for each user, and proven emails for team access. Safe to run twice.
create or replace function public.email_proven(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null)
     and exists (select 1 from auth.identities i where i.user_id = uid and i.provider in ('email', 'google'));
$$;
revoke execute on function public.email_proven(uuid) from public, anon, authenticated;

create or replace function public.is_staff_email() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_emails s join auth.users u on lower(u.email) = s.email where u.id = auth.uid())
     and public.email_proven(auth.uid());
$$;

create or replace function public.access_for(ws uuid, uid uuid, p_aal text) returns text
language sql stable security definer set search_path = '' as $$
  with u as (select lower(email) as email from auth.users where id = uid),
       m as (select role from public.workspace_members where workspace_id = ws and user_id = uid),
       f as (select exists (select 1 from auth.mfa_factors where user_id = uid and status = 'verified') as on_),
       s as (select exists (select 1 from public.staff_emails se join u on se.email = u.email) and public.email_proven(uid) as on_)
  select case
    when (select on_ from f) and p_aal is distinct from 'aal2' then 'mfa_required'
    when exists (select 1 from m) then (select role from m)
    when (select on_ from s) and p_aal = 'aal2' then 'staff'
    when (select on_ from s) then 'staff_mfa_required'
    else 'none' end;
$$;
revoke execute on function public.access_for(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.access_for(uuid, uuid, text) to service_role;
