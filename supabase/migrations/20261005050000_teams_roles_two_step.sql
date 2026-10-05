-- Teams and two-step sign-in.
--
--   owners   run the business on Placetta: approve filings and payments, billing, integrations, agency logins, the team
--   members  day-to-day work: logs, documents, the agent, the workspace; they can't approve, pay, connect or invite
--   two-step anyone who turns on an authenticator app must use it: until they do this session, they reach nothing
--   the team Placetta staff need two-step sign-in for every customer record, the queue and saved logins
--
-- Nothing is dropped. Existing policies are tightened in place and helpers are redefined. Safe to run twice.

-- ---------------------------------------------------------------- assurance helpers

/** This session finished two-step sign-in. */
create or replace function public.aal2() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

/** Two-step is satisfied: either the session is aal2, or the account has no authenticator turned on. */
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.aal2() or not exists (
    select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'
  );
$$;

/** The signed-in email is on the team list (confirmed emails only). Used to ask staff to turn on two-step. */
create or replace function public.is_staff_email() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_emails s join auth.users u on lower(u.email) = s.email
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

/** Placetta staff, signed in with two-step. Every policy, the queue, storage and the filing guard use this. */
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff_email() and public.aal2();
$$;

/** A member of the workspace, with two-step satisfied. */
create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid())
     and public.mfa_ok();
$$;

/** An owner of the workspace, with two-step satisfied. */
create or replace function public.is_owner(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role = 'owner')
     and public.mfa_ok();
$$;

/** For the server functions (service role): what this user may do in this workspace, given the session's assurance level.
    Returns owner, member, staff, mfa_required, staff_mfa_required or none. */
create or replace function public.access_for(ws uuid, uid uuid, p_aal text) returns text
language sql stable security definer set search_path = '' as $$
  with u as (select lower(email) as email, email_confirmed_at from auth.users where id = uid),
       m as (select role from public.workspace_members where workspace_id = ws and user_id = uid),
       f as (select exists (select 1 from auth.mfa_factors where user_id = uid and status = 'verified') as on_),
       s as (select exists (select 1 from public.staff_emails se join u on se.email = u.email where u.email_confirmed_at is not null) as on_)
  select case
    when (select on_ from f) and p_aal is distinct from 'aal2' then 'mfa_required'
    when exists (select 1 from m) then (select role from m)
    when (select on_ from s) and p_aal = 'aal2' then 'staff'
    when (select on_ from s) then 'staff_mfa_required'
    else 'none' end;
$$;

/** Private files: the team, or a member of the workspace the folder belongs to, with two-step satisfied. */
create or replace function public.can_use_folder(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() or (
    exists (select 1 from public.workspace_members m
             where m.user_id = auth.uid() and m.workspace_id::text = (storage.foldername(object_name))[1])
    and public.mfa_ok()
  );
$$;

-- ---------------------------------------------------------------- owners approve, pay and cancel

alter policy "members request filings they can file" on public.filings
  with check (public.is_owner(workspace_id) and public.can_file(workspace_id));
alter policy "members cancel, team works filings" on public.filings
  using (public.is_owner(workspace_id) or public.is_staff())
  with check (public.is_owner(workspace_id) or public.is_staff());

/** Calendar feed: members read the link, owners rotate it. */
create or replace function public.calendar_token(ws uuid, p_rotate boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if not public.is_member(ws) then raise exception 'Not your workspace.'; end if;
  if p_rotate then
    if not public.is_owner(ws) then raise exception 'Only an owner can reset the calendar link.'; end if;
    delete from public.calendar_feeds where workspace_id = ws;
  end if;
  select token into t from public.calendar_feeds where workspace_id = ws;
  if t is null then
    t := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.calendar_feeds(workspace_id, token) values (ws, t);
  end if;
  return t;
end $$;

-- ---------------------------------------------------------------- invites

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
revoke insert, update, delete on public.workspace_invites from authenticated;
grant select on public.workspace_invites to authenticated;   -- rows still filtered by the policy above

create or replace function public.audit_team(ws uuid, en text, zh text, who text) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (ws, 'you', auth.uid(), jsonb_build_object('en', en, 'zh', zh), jsonb_build_object('en', who, 'zh', who));
$$;

/** Invite someone by email. Re-inviting refreshes the invite. Returns the invite id. */
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

/** Join every workspace this confirmed email was invited to. The app calls it after each sign-in. */
create or replace function public.accept_invites() returns int
language plpgsql security definer set search_path = '' as $$
declare me record; r record; n int := 0;
begin
  select id, lower(email) as email, email_confirmed_at into me from auth.users where id = auth.uid();
  if me.id is null or me.email is null or me.email_confirmed_at is null then return 0; end if;
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

/** The team: members (everyone on the workspace sees them) and open invites (owners see them). */
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

create or replace function public.owner_count(ws uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.workspace_members where workspace_id = ws and role = 'owner';
$$;

/** Make someone an owner or a member. A workspace always keeps at least one owner. */
create or replace function public.set_member_role(ws uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare cur text; who text;
begin
  if not public.is_owner(ws) then raise exception 'Only an owner can change roles.'; end if;
  if p_role not in ('owner', 'member') then raise exception 'Choose owner or member.'; end if;
  select m.role, u.email into cur, who from public.workspace_members m join auth.users u on u.id = m.user_id
   where m.workspace_id = ws and m.user_id = p_user for update of m;
  if cur is null then raise exception 'They''re not on this workspace.'; end if;
  if cur = p_role then return; end if;
  if cur = 'owner' and public.owner_count(ws) <= 1 then raise exception 'Add another owner first. A workspace needs one.'; end if;
  update public.workspace_members set role = p_role where workspace_id = ws and user_id = p_user;
  perform public.audit_team(ws, case p_role when 'owner' then 'Made an owner' else 'Made a member' end,
                                case p_role when 'owner' then '设为所有者' else '设为成员' end, who);
end $$;

/** Remove someone (owners), or leave (anyone). A workspace always keeps at least one owner. */
create or replace function public.remove_member(ws uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cur text; who text;
begin
  if not (public.is_owner(ws) or (p_user = auth.uid() and public.is_member(ws))) then raise exception 'Only an owner can remove people.'; end if;
  select m.role, u.email into cur, who from public.workspace_members m join auth.users u on u.id = m.user_id
   where m.workspace_id = ws and m.user_id = p_user for update of m;
  if cur is null then raise exception 'They''re not on this workspace.'; end if;
  if cur = 'owner' and public.owner_count(ws) <= 1 then raise exception 'Add another owner first. A workspace needs one.'; end if;
  perform public.audit_team(ws, case when p_user = auth.uid() then 'Left the workspace' else 'Removed from the workspace' end,
                                case when p_user = auth.uid() then '离开了工作区' else '移出了工作区' end, who);
  delete from public.workspace_members where workspace_id = ws and user_id = p_user;
end $$;

/** Cancel an open invite. */
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

-- ---------------------------------------------------------------- who am I (the app's first call)

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

/** The workspaces I belong to, with my role (staff see customers through the queue, not here). */
create or replace function public.my_workspaces() returns table (id uuid, name text, state jsonb, authorized_at timestamptz, created_at timestamptz, role text)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, w.state, w.authorized_at, w.created_at, m.role
    from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
   where m.user_id = auth.uid() and public.mfa_ok()
   order by w.created_at;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.aal2(), public.mfa_ok(), public.is_staff_email(), public.is_owner(uuid), public.access_for(uuid, uuid, text),
  public.audit_team(uuid, text, text, text), public.invite_member(uuid, text, text), public.accept_invites(), public.team_list(uuid),
  public.owner_count(uuid), public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid), public.revoke_invite(uuid),
  public.my_workspaces()
  from public, anon;
grant execute on function public.aal2(), public.mfa_ok(), public.is_staff_email(), public.is_owner(uuid),
  public.invite_member(uuid, text, text), public.accept_invites(), public.team_list(uuid),
  public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid), public.revoke_invite(uuid), public.my_workspaces()
  to authenticated;
revoke execute on function public.access_for(uuid, uuid, text), public.audit_team(uuid, text, text, text), public.owner_count(uuid) from authenticated;
grant execute on function public.access_for(uuid, uuid, text) to service_role;
