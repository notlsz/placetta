-- Part 5: change roles, cancel invites, who am I, my workspaces. Safe to run twice.
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

create or replace function public.revoke_invite(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid; e text;
begin
  select workspace_id, email into ws, e from public.workspace_invites where id = p_id and accepted_at is null and revoked_at is null;
  if ws is null then raise exception 'That invite is gone.'; end if;
  if not public.is_owner(ws) then raise exception 'Only an owner can cancel invites.'; end if;
  update public.workspace_invites set revoked_at = now() where id = p_id;
  perform public.audit_team(ws, 'Canceled an invite', '取消了邀请', e);
end $$;

create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', u.id, 'email', u.email,
    'staff', public.is_staff(),
    'staff_email', public.is_staff_email(),
    'two_step', exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'))
  from auth.users u where u.id = auth.uid();
$$;

create or replace function public.my_workspaces() returns table (id uuid, name text, state jsonb, authorized_at timestamptz, created_at timestamptz, role text)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, w.state, w.authorized_at, w.created_at, m.role
    from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
   where m.user_id = auth.uid() and public.mfa_ok()
   order by w.created_at;
$$;

revoke execute on function public.set_member_role(uuid, uuid, text), public.revoke_invite(uuid), public.my_workspaces() from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text), public.revoke_invite(uuid), public.my_workspaces() to authenticated;
