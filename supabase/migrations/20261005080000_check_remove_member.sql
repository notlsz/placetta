-- Removing someone (owners) or leaving (anyone): the database checks and records it; the team function then removes the
-- membership. (Live projects without remove_member use this; the team function removes the row with the service role.)
create or replace function public.check_remove_member(ws uuid, p_user uuid) returns text
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
  return cur;
end $$;
revoke execute on function public.check_remove_member(uuid, uuid) from public, anon;
grant execute on function public.check_remove_member(uuid, uuid) to authenticated;
