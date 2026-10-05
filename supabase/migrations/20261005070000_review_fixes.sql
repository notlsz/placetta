-- Fixes from the security review. Safe to run twice.

-- 1. Usage counters are written only by the server.
revoke execute on function public.track_usage(uuid, int, bigint, bigint, bigint) from authenticated;

-- 2. Only emails proven by an email code or Google count for invites and the team list. (Microsoft can send
--    unverified addresses, so a Microsoft-only account never claims an invite or staff access by email.)
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

create or replace function public.accept_invites() returns int
language plpgsql security definer set search_path = '' as $$
declare me record; r record; n int := 0;
begin
  select id, lower(email) as email into me from auth.users where id = auth.uid();
  if me.id is null or me.email is null or not public.email_proven(me.id) or not public.mfa_ok() then return 0; end if;
  for r in
    select * from public.workspace_invites i
     where i.email = me.email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
     for update
  loop
    insert into public.workspace_members(workspace_id, user_id, role) values (r.workspace_id, me.id, r.role)
      on conflict (workspace_id, user_id) do nothing;
    update public.workspace_invites set accepted_at = now(), accepted_by = me.id where id = r.id;
    insert into public.audit_log(workspace_id, actor, actor_id, action, object)
    values (r.workspace_id, 'you', me.id, '{"en": "Joined the workspace", "zh": "加入了工作区"}'::jsonb, jsonb_build_object('en', me.email, 'zh', me.email));
    n := n + 1;
  end loop;
  return n;
end $$;

-- 3. Invites: expired ones are cleared and don't count, and each person can send at most 30 an hour.
create or replace function public.invite_member(ws uuid, p_email text, p_role text default 'member') returns uuid
language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(coalesce(p_email, ''))); iid uuid;
begin
  if not public.is_owner(ws) then raise exception 'Only an owner can invite people.'; end if;
  if p_role not in ('owner', 'member') then raise exception 'Choose owner or member.'; end if;
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
  if exists (select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
             where m.workspace_id = ws and lower(u.email) = e) then
    raise exception 'They''re already on this workspace.';
  end if;
  if (select count(*) from public.workspace_invites where invited_by = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'That''s a lot of invites at once. Try again in an hour.';
  end if;
  update public.workspace_invites set revoked_at = now()
   where workspace_id = ws and accepted_at is null and revoked_at is null and expires_at <= now();
  if (select count(*) from public.workspace_invites i where i.workspace_id = ws and i.accepted_at is null and i.revoked_at is null) >= 50 then
    raise exception 'Too many open invites. Cancel some first.';
  end if;
  update public.workspace_invites set role = p_role, invited_by = auth.uid(), created_at = now(), expires_at = now() + interval '14 days'
   where workspace_id = ws and email = e and accepted_at is null and revoked_at is null
  returning id into iid;
  if iid is null then
    insert into public.workspace_invites(workspace_id, email, role, invited_by) values (ws, e, p_role, auth.uid()) returning id into iid;
  end if;
  perform public.audit_team(ws, case p_role when 'owner' then 'Invited an owner' else 'Invited a teammate' end,
                                case p_role when 'owner' then '邀请了所有者' else '邀请了成员' end, e);
  return iid;
end $$;

-- 4. Last-owner protection holds under concurrent changes: lock the workspace before counting owners.
create or replace function public.set_member_role(ws uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare cur text; who text;
begin
  if not public.is_owner(ws) then raise exception 'Only an owner can change roles.'; end if;
  if p_role not in ('owner', 'member') then raise exception 'Choose owner or member.'; end if;
  perform 1 from public.workspaces where id = ws for update;
  select m.role, u.email into cur, who from public.workspace_members m join auth.users u on u.id = m.user_id
   where m.workspace_id = ws and m.user_id = p_user;
  if cur is null then raise exception 'They''re not on this workspace.'; end if;
  if cur = p_role then return; end if;
  if cur = 'owner' and public.owner_count(ws) <= 1 then raise exception 'Add another owner first. A workspace needs one.'; end if;
  update public.workspace_members set role = p_role where workspace_id = ws and user_id = p_user;
  perform public.audit_team(ws, case p_role when 'owner' then 'Made an owner' else 'Made a member' end,
                                case p_role when 'owner' then '设为所有者' else '设为成员' end, who);
end $$;

create or replace function public.remove_member(ws uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cur text; who text;
begin
  if not (public.is_owner(ws) or (p_user = auth.uid() and public.is_member(ws))) then raise exception 'Only an owner can remove people.'; end if;
  perform 1 from public.workspaces where id = ws for update;
  select m.role, u.email into cur, who from public.workspace_members m join auth.users u on u.id = m.user_id
   where m.workspace_id = ws and m.user_id = p_user;
  if cur is null then raise exception 'They''re not on this workspace.'; end if;
  if cur = 'owner' and public.owner_count(ws) <= 1 then raise exception 'Add another owner first. A workspace needs one.'; end if;
  perform public.audit_team(ws, case when p_user = auth.uid() then 'Left the workspace' else 'Removed from the workspace' end,
                                case when p_user = auth.uid() then '离开了工作区' else '移出了工作区' end, who);
  delete from public.workspace_members where workspace_id = ws and user_id = p_user;
end $$;
