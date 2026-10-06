-- Part 4: invite, accept on sign-in, and the team list. Safe to run twice.
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

create or replace function public.team_list(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_member(ws) or public.is_staff()) then raise exception 'Not your workspace.'; end if;
  return jsonb_build_object(
    'me', (select m.role from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', m.user_id, 'email', u.email, 'role', m.role, 'joined_at', m.created_at, 'you', m.user_id = auth.uid(),
               'two_step', exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified'))
             order by m.created_at)
        from public.workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = ws), '[]'::jsonb),
    'invites', case when public.is_owner(ws) or public.is_staff() then coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'created_at', i.created_at, 'expires_at', i.expires_at)
             order by i.created_at)
        from public.workspace_invites i
       where i.workspace_id = ws and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()), '[]'::jsonb)
      else '[]'::jsonb end
  );
end $$;

revoke execute on function public.invite_member(uuid, text, text), public.accept_invites(), public.team_list(uuid) from public, anon;
grant execute on function public.invite_member(uuid, text, text), public.accept_invites(), public.team_list(uuid) to authenticated;
