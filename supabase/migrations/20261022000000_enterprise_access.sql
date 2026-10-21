-- Enterprise access. Safe to run twice.
--   1. Four workspace roles: owner, admin, member, viewer. Row-level security enforces them: viewers read, members and
--      up change the workspace, admins and owners manage people and sign-in, owners alone approve filings, payments and
--      messages (unchanged). Role changes go to the audit trail.
--   2. Single sign-on: an admin claims an email domain (proved by a DNS TXT record the sso function checks) and can
--      require everyone at that domain to sign in through SAML (Supabase Auth SSO) or one OAuth/OIDC provider. The
--      rule is checked by the database on every request (mfa_ok) and by the server functions (access_for).
--   3. SCIM 2.0 provisioning (the scim function): per-workspace bearer tokens kept only as SHA-256, provisioned users
--      and groups, groups mapped to roles. Deprovisioning removes the membership and ends the person's sessions.
--   4. The audit trail: sign-ins, SSO, SCIM, role changes, second-owner approvals and data exports are recorded; owners
--      and admins export it (audit_export).

/* ================================ 1. roles ================================ */

alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check check (role in ('owner', 'admin', 'member', 'viewer'));
alter table public.workspace_invites drop constraint if exists workspace_invites_role_check;
alter table public.workspace_invites add constraint workspace_invites_role_check check (role in ('owner', 'admin', 'member', 'viewer'));
comment on column public.workspace_members.role is 'owner: everything, and alone approves filings, payments and messages. admin: manages people, roles, sign-in and SCIM. member: works in the workspace. viewer: reads only.';

-- The identity provider (SCIM) writes audit entries too.
alter table public.audit_log drop constraint if exists audit_log_actor_check;
alter table public.audit_log add constraint audit_log_actor_check check (actor in ('you', 'agent', 'team', 'agency', 'idp'));

create or replace function public.role_rank(p_role text) returns int
language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 4 when 'admin' then 3 when 'member' then 2 when 'viewer' then 1 else 0 end;
$$;

/* ================================ 2. single sign-on ================================ */

create table if not exists public.workspace_sso (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  domain text not null check (length(domain) <= 253 and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  verify_token text not null check (verify_token ~ '^placetta-verify=[0-9a-f]{32}$'),
  verified_at timestamptz,
  method text not null default 'saml' check (method in ('saml', 'google', 'azure') or method ~ '^custom:[a-z0-9][a-z0-9:-]{0,42}$'),
  enforced boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint workspace_sso_enforce_verified check (not enforced or verified_at is not null)
);
comment on table public.workspace_sso is 'A workspace''s claimed email domain (verified by a DNS TXT record) and whether everyone at that domain must sign in with SSO (method: saml, or an OAuth provider: google, azure, custom:<id>). Read and changed only through security_settings, sso_set_domain, sso_mark_verified and sso_set_enforced.';
create unique index if not exists workspace_sso_verified_domain on public.workspace_sso(domain) where verified_at is not null;
create index if not exists workspace_sso_domain on public.workspace_sso(domain);
alter table public.workspace_sso enable row level security;
revoke all on public.workspace_sso from public, anon, authenticated;
grant all on public.workspace_sso to service_role;

-- Whether a SAML identity provider registered with Supabase Auth (supabase sso add ... --domains) covers this domain.
-- Fails closed: without access to auth.sso_domains no SAML session counts.
create or replace function public.saml_provider_covers(p_provider text, p_domain text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_provider is null or p_provider !~ '^[0-9a-fA-F-]{36}$' or coalesce(p_domain, '') = '' then return false; end if;
  return exists (select 1 from auth.sso_domains d where d.sso_provider_id = p_provider::uuid and lower(d.domain) = lower(p_domain));
exception when undefined_table or insufficient_privilege or invalid_text_representation then
  return false;
end $$;

-- Whether a session (its JWT claims) signed in the way a domain requires. SAML: the amr claim says sso/saml with a
-- provider registered for the domain. OAuth/OIDC: the amr claim says oauth, the account has an identity from the
-- required provider and no identity from any other OAuth provider (the claim doesn't say which provider was used).
create or replace function public.session_satisfies(uid uuid, p_claims jsonb, p_method text, p_domain text) returns boolean
language sql stable security definer set search_path = '' as $$
  with amr as (
    select coalesce(x ->> 'method', x #>> '{}') as method, x ->> 'provider' as provider
      from jsonb_array_elements(case when jsonb_typeof(coalesce(p_claims, '{}'::jsonb) -> 'amr') = 'array' then p_claims -> 'amr' else '[]'::jsonb end) x
  )
  select case
    when uid is null then false
    when p_method = 'saml' then exists (select 1 from amr where amr.method = 'sso/saml' and public.saml_provider_covers(amr.provider, p_domain))
    else exists (select 1 from amr where amr.method = 'oauth')
     and exists (select 1 from auth.identities i where i.user_id = uid and i.provider = p_method)
     and not exists (select 1 from auth.identities i where i.user_id = uid and i.provider not in ('email', 'phone', p_method) and i.provider not like 'sso:%')
  end;
$$;

-- True unless the account's email domain is verified by a workspace that requires SSO and this session didn't use it.
create or replace function public.sso_session_ok(uid uuid, p_claims jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.session_satisfies(uid, p_claims, s.method, s.domain)
      from auth.users u join public.workspace_sso s on s.domain = lower(split_part(u.email, '@', 2))
     where u.id = uid and s.enforced and s.verified_at is not null
     limit 1), true);
$$;

-- Every workspace check (is_member, is_owner, my_workspaces, files, invites) goes through mfa_ok: two-step when it's on,
-- and now the domain's SSO rule too.
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.aal2() or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'))
     and public.sso_session_ok(auth.uid(), auth.jwt());
$$;

-- A SAML identity counts as a proven email when its provider is registered for that email's domain (invites, SCIM).
create or replace function public.email_proven(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null)
     and (exists (select 1 from auth.identities i where i.user_id = uid and i.provider in ('email', 'google'))
       or exists (select 1 from auth.users u join auth.identities i on i.user_id = u.id
                   where u.id = uid and i.provider like 'sso:%'
                     and public.saml_provider_covers(substr(i.provider, 5), split_part(lower(u.email), '@', 2))));
$$;

-- What the server functions may do for a user: the old rules (access_base), then the SSO rule ('sso_required').
create or replace function public.access_base(ws uuid, uid uuid, p_aal text) returns text
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
create or replace function public.access_for(ws uuid, uid uuid, p_aal text, p_claims jsonb) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when x.b = 'none' then 'none'
    when not public.sso_session_ok(uid, coalesce(p_claims, '{}'::jsonb)) then 'sso_required'
    else x.b end
  from (select public.access_base(ws, uid, p_aal) as b) x;
$$;
-- Callers without the session's claims (Odelia by text and phone) never satisfy an SSO rule.
create or replace function public.access_for(ws uuid, uid uuid, p_aal text) returns text
language sql stable security definer set search_path = '' as $$
  select public.access_for(ws, uid, p_aal, '{}'::jsonb);
$$;
revoke execute on function public.access_base(uuid, uuid, text), public.access_for(uuid, uuid, text), public.access_for(uuid, uuid, text, jsonb),
  public.saml_provider_covers(text, text), public.session_satisfies(uuid, jsonb, text, text), public.sso_session_ok(uuid, jsonb), public.email_proven(uuid)
  from public, anon, authenticated;
grant execute on function public.access_for(uuid, uuid, text), public.access_for(uuid, uuid, text, jsonb), public.sso_session_ok(uuid, jsonb) to service_role;
revoke execute on function public.role_rank(text) from public, anon;
grant execute on function public.mfa_ok(), public.role_rank(text) to authenticated;

/* ================================ roles in every check ================================ */

-- The caller's role in this workspace (with two-step and SSO satisfied), or null.
create or replace function public.my_role(ws uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and public.mfa_ok();
$$;
-- Anyone on the workspace, viewers included: what they may read.
create or replace function public.can_view(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.my_role(ws) is not null;
$$;
-- Members, admins and owners: everyone who may change the workspace. Viewers fail every check that uses it.
create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.role_rank(public.my_role(ws)) >= 2;
$$;
-- Admins and owners: people, roles, sign-in, SCIM and the audit export.
create or replace function public.is_admin(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.role_rank(public.my_role(ws)) >= 3;
$$;
-- coalesce: never null, so "if not public.is_owner(ws) then raise" can't be skipped for someone with no role
create or replace function public.is_owner(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role(ws) = 'owner', false);
$$;
revoke execute on function public.my_role(uuid), public.can_view(uuid), public.is_member(uuid), public.is_admin(uuid), public.is_owner(uuid) from public, anon;
grant execute on function public.my_role(uuid), public.can_view(uuid), public.is_member(uuid), public.is_admin(uuid), public.is_owner(uuid) to authenticated;

-- Reading stays open to viewers: every SELECT policy, and every read-only (stable) function, that checked is_member
-- now checks can_view. Write policies and volatile functions keep is_member, so a viewer can't change anything.
do $$
declare p record; f record; def text;
begin
  for p in select schemaname, tablename, policyname, qual from pg_policies
            where schemaname = 'public' and cmd = 'SELECT' and qual ~ 'is_member\(' loop
    execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, replace(p.qual, 'is_member(', 'can_view('));
  end loop;
  for f in select pr.oid from pg_proc pr
            where pr.pronamespace = 'public'::regnamespace and pr.provolatile in ('s', 'i') and pr.prokind = 'f'
              and pr.prosrc ~ 'is_member\(' and pr.proname not in ('is_member', 'can_view', 'my_role', 'is_admin', 'is_owner') loop
    def := replace(pg_get_functiondef(f.oid), 'public.is_member(', 'public.can_view(');
    execute def;
  end loop;
end $$;

-- Files: everyone on the workspace reads them; members and up add them (owners still delete, can_delete_file).
create or replace function public.can_read_folder(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() or (
    exists (select 1 from public.workspace_members m
             where m.user_id = auth.uid() and m.workspace_id::text = (storage.foldername(object_name))[1])
    and public.mfa_ok()
  );
$$;
create or replace function public.can_use_folder(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() or (
    exists (select 1 from public.workspace_members m
             where m.user_id = auth.uid() and m.workspace_id::text = (storage.foldername(object_name))[1]
               and m.role in ('owner', 'admin', 'member'))
    and public.mfa_ok()
  );
$$;
revoke execute on function public.can_read_folder(text), public.can_use_folder(text) from public, anon;
grant execute on function public.can_read_folder(text), public.can_use_folder(text) to authenticated;
alter policy "placetta: read workspace files" on storage.objects using (bucket_id = 'documents' and public.can_read_folder(name));

-- Invites: admins see and send them too.
alter policy "owners and team see invites" on public.workspace_invites using (public.is_admin(workspace_id) or public.is_staff());

/* ================================ audit helpers ================================ */

create or replace function public.role_word(p_role text, p_lang text default 'en') returns text
language sql immutable set search_path = '' as $$
  select case p_lang
    when 'zh' then case p_role when 'owner' then '所有者' when 'admin' then '管理员' when 'member' then '成员' when 'viewer' then '只读成员' else coalesce(p_role, '') end
    else case p_role when 'owner' then 'Owner' when 'admin' then 'Admin' when 'member' then 'Member' when 'viewer' then 'Viewer' else coalesce(p_role, '') end end;
$$;

-- One audit line: by the signed-in person ('you'), or by the identity provider ('idp', SCIM, no person).
create or replace function public.audit_security(ws uuid, p_actor text, en text, zh text, who text, d_en text default null, d_zh text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (ws, p_actor, case when p_actor = 'you' then auth.uid() end, jsonb_build_object('en', en, 'zh', zh),
          jsonb_build_object('en', coalesce(who, ''), 'zh', coalesce(who, '')),
          case when d_en is not null then jsonb_build_object('en', d_en, 'zh', coalesce(d_zh, d_en)) end);
$$;
revoke execute on function public.audit_security(uuid, text, text, text, text, text, text), public.role_word(text, text) from public, anon, authenticated;

/* ================================ team: roles, invites, removal ================================ */

create or replace function public.set_member_role(ws uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare cur text; who text;
begin
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can change roles.'; end if;
  if p_role is null or p_role not in ('owner', 'admin', 'member', 'viewer') then raise exception 'Choose owner, admin, member or viewer.'; end if;
  perform 1 from public.workspaces where id = ws for update;
  select m.role, u.email into cur, who from public.workspace_members m join auth.users u on u.id = m.user_id
   where m.workspace_id = ws and m.user_id = p_user;
  if cur is null then raise exception 'They''re not on this workspace.'; end if;
  if cur = p_role then return; end if;
  if (cur = 'owner' or p_role = 'owner') and not public.is_owner(ws) then raise exception 'Only an owner can make or change an owner.'; end if;
  if cur = 'owner' and public.owner_count(ws) <= 1 then raise exception 'Add another owner first. A workspace needs one.'; end if;
  update public.workspace_members set role = p_role where workspace_id = ws and user_id = p_user;
  perform public.audit_security(ws, 'you', 'Changed a role', '更改了角色', who,
    public.role_word(cur) || ' to ' || public.role_word(p_role), public.role_word(cur, 'zh') || ' 改为 ' || public.role_word(p_role, 'zh'));
end $$;

create or replace function public.invite_member(ws uuid, p_email text, p_role text default 'member') returns uuid
language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(coalesce(p_email, ''))); iid uuid;
begin
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can invite people.'; end if;
  if p_role is null or p_role not in ('owner', 'admin', 'member', 'viewer') then raise exception 'Choose owner, admin, member or viewer.'; end if;
  if p_role = 'owner' and not public.is_owner(ws) then raise exception 'Only an owner can invite an owner.'; end if;
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
  perform public.audit_security(ws, 'you', 'Invited someone', '邀请了成员', e, 'As ' || public.role_word(p_role), '角色：' || public.role_word(p_role, 'zh'));
  return iid;
end $$;

create or replace function public.revoke_invite(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid; e text; r text;
begin
  select workspace_id, email, role into ws, e, r from public.workspace_invites where id = p_id and accepted_at is null and revoked_at is null;
  if ws is null then raise exception 'That invite is gone.'; end if;
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can cancel invites.'; end if;
  if r = 'owner' and not public.is_owner(ws) then raise exception 'Only an owner can cancel an owner''s invite.'; end if;
  update public.workspace_invites set revoked_at = now() where id = p_id;
  perform public.audit_team(ws, 'Canceled an invite', '取消了邀请', e);
end $$;

create or replace function public.check_remove_member(ws uuid, p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare cur text; who text; self boolean := p_user = auth.uid();
begin
  if not (public.is_admin(ws) or (self and public.can_view(ws))) then raise exception 'Only an owner or admin can remove people.'; end if;
  perform 1 from public.workspaces where id = ws for update;
  select m.role, u.email into cur, who from public.workspace_members m join auth.users u on u.id = m.user_id
   where m.workspace_id = ws and m.user_id = p_user;
  if cur is null then raise exception 'They''re not on this workspace.'; end if;
  if cur = 'owner' and not self and not public.is_owner(ws) then raise exception 'Only an owner can remove an owner.'; end if;
  if cur = 'owner' and public.owner_count(ws) <= 1 then raise exception 'Add another owner first. A workspace needs one.'; end if;
  perform public.audit_team(ws, case when self then 'Left the workspace' else 'Removed from the workspace' end,
                                case when self then '离开了工作区' else '移出了工作区' end, who);
  return cur;
end $$;

revoke execute on function public.set_member_role(uuid, uuid, text), public.invite_member(uuid, text, text), public.revoke_invite(uuid), public.check_remove_member(uuid, uuid) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text), public.invite_member(uuid, text, text), public.revoke_invite(uuid), public.check_remove_member(uuid, uuid) to authenticated;

/* ================================ 3. SCIM ================================ */

create table if not exists public.scim_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  prefix text not null check (prefix ~ '^[0-9a-f]{8}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
comment on table public.scim_tokens is 'SCIM bearer tokens, one live per workspace. Only the SHA-256 is kept; the token is shown once, when it is made.';
create unique index if not exists scim_tokens_one_live on public.scim_tokens(workspace_id) where revoked_at is null;

create table if not exists public.scim_users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_name text not null check (length(user_name) between 1 and 256),
  email text check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 254),
  external_id text check (length(external_id) <= 256),
  given_name text check (length(given_name) <= 200),
  family_name text check (length(family_name) <= 200),
  display_name text check (length(display_name) <= 200),
  active boolean not null default true,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.scim_users is 'People the workspace''s identity provider provisioned (SCIM /Users). user_name is the IdP''s userName as sent (unique without regard to case); email (the userName when it is one, else the primary email) is how Placetta knows the person: user_id links that account once it signs in (scim_claim) or is already a member.';
create unique index if not exists scim_users_name on public.scim_users(workspace_id, lower(user_name));
create index if not exists scim_users_email on public.scim_users(email);
create index if not exists scim_users_user on public.scim_users(user_id);

create table if not exists public.scim_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 200),
  external_id text check (length(external_id) <= 256),
  role text check (role is null or role in ('admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, display_name)
);
comment on table public.scim_groups is 'Groups the identity provider pushed (SCIM /Groups). role, set by an owner or admin in Settings, is the role its members get; the highest wins, member when none is mapped. SCIM never makes or changes an owner.';

create table if not exists public.scim_group_members (
  group_id uuid not null references public.scim_groups(id) on delete cascade,
  scim_user_id uuid not null references public.scim_users(id) on delete cascade,
  primary key (group_id, scim_user_id)
);
create index if not exists scim_group_members_user on public.scim_group_members(scim_user_id);

alter table public.scim_tokens enable row level security;
alter table public.scim_users enable row level security;
alter table public.scim_groups enable row level security;
alter table public.scim_group_members enable row level security;
revoke all on public.scim_tokens, public.scim_users, public.scim_groups, public.scim_group_members from public, anon, authenticated;
grant all on public.scim_tokens, public.scim_users, public.scim_groups, public.scim_group_members to service_role;

-- Ends every session of an account: its refresh tokens can't be used again. Access tokens already issued stay valid
-- until they expire (Supabase's JWT expiry, an hour by default), but every database request checks membership, so a
-- removed person reaches nothing in the workspace from the moment they're removed. -1 when auth's tables can't be
-- reached (then only expiry ends the sessions).
create or replace function public.revoke_sessions(uid uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0;
begin
  if uid is null then return 0; end if;
  begin
    delete from auth.refresh_tokens where user_id = uid::text;
    delete from auth.sessions where user_id = uid;
    get diagnostics n = row_count;
    return n;
  exception when undefined_table or insufficient_privilege then
    raise warning 'revoke_sessions: % (%)', sqlerrm, sqlstate;
    return -1;
  end;
end $$;
revoke execute on function public.revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_sessions(uuid) to service_role;

-- The role a provisioned person gets: their mapped groups' highest role, member when none is mapped.
create or replace function public.scim_role_for(sid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select g.role from public.scim_group_members gm join public.scim_groups g on g.id = gm.group_id
     where gm.scim_user_id = sid and g.role is not null
     order by public.role_rank(g.role) desc limit 1), 'member');
$$;

-- Brings one provisioned person's access in line with the identity provider. Active: their linked account is on the
-- workspace with the mapped role (an owner is left as is). Inactive: every account with their email (and the linked
-- one) is taken off the workspace, open invites for the email are canceled and sessions ended. Owners are managed in
-- Placetta: deactivating an owner is refused ('scim_owner'). Returns what happened: added, role, removed, none.
create or replace function public.scim_sync_user(ws uuid, sid uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare su public.scim_users; r text; cur text; acct record; n int; out_ text := 'none'; who text;
begin
  select * into su from public.scim_users where id = sid and workspace_id = ws for update;
  if su.id is null then raise exception 'scim_not_found'; end if;
  perform 1 from public.workspaces where id = ws for update;
  who := coalesce(su.email, su.user_name);
  if su.active then
    if su.user_id is null and su.email is not null then
      -- someone already on the workspace with this email is this person
      select m.user_id into su.user_id from public.workspace_members m join auth.users u on u.id = m.user_id
       where m.workspace_id = ws and lower(u.email) = su.email order by m.created_at limit 1;
      if su.user_id is not null then update public.scim_users set user_id = su.user_id where id = sid; end if;
    end if;
    if su.user_id is null then return 'none'; end if;
    r := public.scim_role_for(sid);
    select role into cur from public.workspace_members where workspace_id = ws and user_id = su.user_id;
    if cur is null then
      insert into public.workspace_members(workspace_id, user_id, role) values (ws, su.user_id, r);
      perform public.audit_security(ws, 'idp', 'Added by your identity provider', '由身份提供商添加', who, 'As ' || public.role_word(r), '角色：' || public.role_word(r, 'zh'));
      out_ := 'added';
    elsif cur <> 'owner' and cur <> r then
      update public.workspace_members set role = r where workspace_id = ws and user_id = su.user_id;
      perform public.audit_security(ws, 'idp', 'Role changed by your identity provider', '身份提供商更改了角色', who,
        public.role_word(cur) || ' to ' || public.role_word(r), public.role_word(cur, 'zh') || ' 改为 ' || public.role_word(r, 'zh'));
      out_ := 'role';
    end if;
    return out_;
  end if;

  -- inactive: off the workspace, every account with this email
  if exists (select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
              where m.workspace_id = ws and m.role = 'owner' and (m.user_id = su.user_id or lower(u.email) = su.email)) then
    -- the scim function records the refusal (a line written here would be rolled back with the error)
    raise exception 'scim_owner';
  end if;
  if su.email is not null then
    update public.workspace_invites set revoked_at = now()
     where workspace_id = ws and email = su.email and accepted_at is null and revoked_at is null;
  end if;
  for acct in
    select m.user_id from public.workspace_members m join auth.users u on u.id = m.user_id
     where m.workspace_id = ws and (m.user_id = su.user_id or lower(u.email) = su.email)
  loop
    delete from public.workspace_members where workspace_id = ws and user_id = acct.user_id;
    n := public.revoke_sessions(acct.user_id);
    perform public.audit_security(ws, 'idp', 'Deactivated by your identity provider', '由身份提供商停用', who,
      case when n >= 0 then 'Removed from the workspace and signed out everywhere' else 'Removed from the workspace; their sign-in ends when it expires' end,
      case when n >= 0 then '已移出工作区，并在所有设备上退出登录' else '已移出工作区；登录将在过期后结束' end);
    out_ := 'removed';
  end loop;
  return out_;
end $$;

create or replace function public.scim_clean(p jsonb, k text, maxlen int) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(trim(p ->> k), maxlen), '');
$$;

-- Create (p_id null) or change a provisioned person. p: user_name, email, external_id, given_name, family_name,
-- display_name, active; a key left out keeps its value (PATCH), PUT sends them all. Errors: scim_conflict,
-- scim_not_found, scim_invalid, scim_owner. Returns the row as JSON.
create or replace function public.scim_user_put(ws uuid, p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare su public.scim_users; before public.scim_users; uname text; mail text; changed text[] := '{}';
begin
  if p ? 'user_name' then
    uname := left(trim(coalesce(p ->> 'user_name', '')), 257);
    if uname = '' or length(uname) > 256 then raise exception 'scim_invalid: userName is required (at most 256 characters)'; end if;
  end if;
  if p ? 'email' then
    mail := lower(trim(coalesce(p ->> 'email', '')));
    if mail = '' then mail := null;
    elsif mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(mail) > 254 then raise exception 'scim_invalid: email is not an email address'; end if;
  end if;
  if p ? 'active' and jsonb_typeof(p -> 'active') <> 'boolean' then raise exception 'scim_invalid: active must be true or false'; end if;
  if p_id is null then
    if uname is null then raise exception 'scim_invalid: userName is required'; end if;
    if exists (select 1 from public.scim_users where workspace_id = ws and lower(user_name) = lower(uname)) then raise exception 'scim_conflict'; end if;
    insert into public.scim_users(workspace_id, user_name, email, external_id, given_name, family_name, display_name, active)
    values (ws, uname, mail, public.scim_clean(p, 'external_id', 256), public.scim_clean(p, 'given_name', 200), public.scim_clean(p, 'family_name', 200),
            public.scim_clean(p, 'display_name', 200), coalesce((p ->> 'active')::boolean, true))
    returning * into su;
    perform public.audit_security(ws, 'idp', 'Provisioned by your identity provider', '由身份提供商开通', coalesce(su.email, su.user_name),
      case when not su.active then 'Inactive' when su.email is null then 'No email: they can''t sign in until one is sent' else 'Gets access when they sign in' end,
      case when not su.active then '未启用' when su.email is null then '没有邮箱：提供邮箱后才能登录' else '登录后即可访问' end);
  else
    select * into before from public.scim_users where id = p_id and workspace_id = ws for update;
    if before.id is null then raise exception 'scim_not_found'; end if;
    if uname is not null and lower(uname) <> lower(before.user_name)
       and exists (select 1 from public.scim_users where workspace_id = ws and lower(user_name) = lower(uname) and id <> p_id) then
      raise exception 'scim_conflict';
    end if;
    if p ? 'email' and mail is distinct from before.email then
      -- a new email is a different person to Placetta: the old one loses access the way a deactivation takes it
      update public.scim_users set active = false where id = p_id;
      perform public.scim_sync_user(ws, p_id);
      update public.scim_users set active = before.active, user_id = null where id = p_id;
      changed := changed || 'email';
    end if;
    update public.scim_users set
      user_name = coalesce(uname, user_name),
      email = case when p ? 'email' then mail else email end,
      external_id = case when p ? 'external_id' then public.scim_clean(p, 'external_id', 256) else external_id end,
      given_name = case when p ? 'given_name' then public.scim_clean(p, 'given_name', 200) else given_name end,
      family_name = case when p ? 'family_name' then public.scim_clean(p, 'family_name', 200) else family_name end,
      display_name = case when p ? 'display_name' then public.scim_clean(p, 'display_name', 200) else display_name end,
      active = case when p ? 'active' then (p ->> 'active')::boolean else active end,
      updated_at = now()
     where id = p_id returning * into su;
    if su.user_name <> before.user_name then changed := changed || 'userName'; end if;
    if su.given_name is distinct from before.given_name or su.family_name is distinct from before.family_name or su.display_name is distinct from before.display_name then changed := changed || 'name'; end if;
    if su.external_id is distinct from before.external_id then changed := changed || 'externalId'; end if;
    if su.active and not before.active then
      perform public.audit_security(ws, 'idp', 'Reactivated by your identity provider', '由身份提供商重新启用', coalesce(su.email, su.user_name));
    end if;
    if cardinality(changed) > 0 then
      perform public.audit_security(ws, 'idp', 'Updated by your identity provider', '身份提供商更新了资料', coalesce(su.email, su.user_name),
        'Changed: ' || array_to_string(changed, ', '), '已更改：' || array_to_string(changed, ', '));
    end if;
  end if;
  perform public.scim_sync_user(ws, su.id);
  select * into su from public.scim_users where id = su.id;
  return to_jsonb(su);
end $$;

create or replace function public.scim_user_delete(ws uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  select coalesce(email, user_name) into who from public.scim_users where id = p_id and workspace_id = ws;
  if who is null then raise exception 'scim_not_found'; end if;
  update public.scim_users set active = false where id = p_id;
  perform public.scim_sync_user(ws, p_id);
  delete from public.scim_users where id = p_id;
  perform public.audit_security(ws, 'idp', 'Deleted by your identity provider', '由身份提供商删除', who);
end $$;

-- Create (p_id null) or change a group. p: display_name, external_id, and members (a list of SCIM user ids that
-- replaces the list), add and remove (lists that change it). Members whose role may have changed are synced.
create or replace function public.scim_group_put(ws uuid, p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.scim_groups; before uuid[]; after uuid[]; ids uuid[]; x uuid; nm text; bad int;
begin
  if p ? 'display_name' then
    nm := left(trim(coalesce(p ->> 'display_name', '')), 200);
    if nm = '' then raise exception 'scim_invalid: displayName is required'; end if;
  end if;
  -- every member id must be a SCIM user of this workspace
  select count(*) into bad from (
    select v from jsonb_array_elements_text(coalesce(p -> 'members', '[]') || coalesce(p -> 'add', '[]') || coalesce(p -> 'remove', '[]')) v) s
   where s.v !~ '^[0-9a-fA-F-]{36}$' or not exists (select 1 from public.scim_users u where u.id = s.v::uuid and u.workspace_id = ws);
  if bad > 0 then raise exception 'scim_invalid: a member is not a user provisioned here'; end if;
  if p_id is null then
    if nm is null then raise exception 'scim_invalid: displayName is required'; end if;
    if exists (select 1 from public.scim_groups where workspace_id = ws and display_name = nm) then raise exception 'scim_conflict'; end if;
    insert into public.scim_groups(workspace_id, display_name, external_id) values (ws, nm, public.scim_clean(p, 'external_id', 256)) returning * into g;
    before := '{}';
    perform public.audit_security(ws, 'idp', 'Group added by your identity provider', '身份提供商添加了群组', g.display_name);
  else
    select * into g from public.scim_groups where id = p_id and workspace_id = ws for update;
    if g.id is null then raise exception 'scim_not_found'; end if;
    if nm is not null and nm <> g.display_name and exists (select 1 from public.scim_groups where workspace_id = ws and display_name = nm) then raise exception 'scim_conflict'; end if;
    select coalesce(array_agg(scim_user_id), '{}') into before from public.scim_group_members where group_id = g.id;
    update public.scim_groups set display_name = coalesce(nm, display_name),
      external_id = case when p ? 'external_id' then public.scim_clean(p, 'external_id', 256) else external_id end, updated_at = now()
     where id = g.id returning * into g;
  end if;
  if p ? 'members' then
    delete from public.scim_group_members where group_id = g.id;
    insert into public.scim_group_members(group_id, scim_user_id)
      select distinct g.id, v::uuid from jsonb_array_elements_text(p -> 'members') v on conflict do nothing;
  end if;
  if p ? 'add' then
    insert into public.scim_group_members(group_id, scim_user_id)
      select distinct g.id, v::uuid from jsonb_array_elements_text(p -> 'add') v on conflict do nothing;
  end if;
  if p ? 'remove' then
    delete from public.scim_group_members where group_id = g.id and scim_user_id in (select v::uuid from jsonb_array_elements_text(p -> 'remove') v);
  end if;
  select coalesce(array_agg(scim_user_id), '{}') into after from public.scim_group_members where group_id = g.id;
  if p_id is not null and (before <> after or nm is not null) then
    perform public.audit_security(ws, 'idp', 'Group updated by your identity provider', '身份提供商更新了群组', g.display_name,
      cardinality(after) || ' members', cardinality(after) || ' 名成员');
  end if;
  -- the role can change only for people who joined or left the group
  select coalesce(array_agg(distinct v), '{}') into ids from (
    (select unnest(after) v except select unnest(before)) union (select unnest(before) except select unnest(after))) s;
  foreach x in array ids loop
    begin perform public.scim_sync_user(ws, x); exception when others then if sqlerrm <> 'scim_owner' then raise; end if; end;
  end loop;
  return to_jsonb(g) || jsonb_build_object('members', to_jsonb(after));
end $$;

create or replace function public.scim_group_delete(ws uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.scim_groups; ids uuid[]; x uuid;
begin
  select * into g from public.scim_groups where id = p_id and workspace_id = ws for update;
  if g.id is null then raise exception 'scim_not_found'; end if;
  select coalesce(array_agg(scim_user_id), '{}') into ids from public.scim_group_members where group_id = g.id;
  delete from public.scim_groups where id = g.id;
  perform public.audit_security(ws, 'idp', 'Group deleted by your identity provider', '身份提供商删除了群组', g.display_name);
  foreach x in array ids loop perform public.scim_sync_user(ws, x); end loop;
end $$;

-- The workspace a SCIM token's SHA-256 belongs to (a live token), noting its use at most once a minute.
create or replace function public.scim_auth(p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  select id, workspace_id, last_used_at into t from public.scim_tokens where token_hash = lower(coalesce(p_hash, '')) and revoked_at is null;
  if t.id is null then return null; end if;
  if t.last_used_at is null or t.last_used_at < now() - interval '1 minute' then
    update public.scim_tokens set last_used_at = now() where id = t.id;
  end if;
  return t.workspace_id;
end $$;

-- SCIM reads: a page of users or groups, optionally filtered (userName case-insensitive, externalId exact, email; for
-- groups displayName case-insensitive, externalId exact) or one by id. {total, rows}.
create or replace function public.scim_users_list(ws uuid, p_attr text, p_value text, p_start int, p_count int, p_id uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with f as (
    select u.* from public.scim_users u
     where u.workspace_id = ws and (p_id is null or u.id = p_id)
       and case p_attr when 'userName' then lower(u.user_name) = lower(p_value)
                       when 'externalId' then u.external_id = p_value
                       when 'email' then u.email = lower(p_value)
                       else true end)
  select jsonb_build_object('total', (select count(*) from f),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
                        from (select * from f order by created_at, id offset greatest(coalesce(p_start, 1) - 1, 0) limit greatest(coalesce(p_count, 100), 0)) x), '[]'::jsonb));
$$;
create or replace function public.scim_groups_list(ws uuid, p_attr text, p_value text, p_start int, p_count int, p_id uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with f as (
    select g.* from public.scim_groups g
     where g.workspace_id = ws and (p_id is null or g.id = p_id)
       and case p_attr when 'displayName' then lower(g.display_name) = lower(p_value)
                       when 'externalId' then g.external_id = p_value
                       else true end)
  select jsonb_build_object('total', (select count(*) from f),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('members', coalesce((
                          select jsonb_agg(jsonb_build_object('id', u.id, 'user_name', u.user_name) order by u.user_name)
                            from public.scim_group_members gm join public.scim_users u on u.id = gm.scim_user_id where gm.group_id = x.id), '[]'::jsonb))
                        order by x.created_at, x.id)
                        from (select * from f order by created_at, id offset greatest(coalesce(p_start, 1) - 1, 0) limit greatest(coalesce(p_count, 100), 0)) x), '[]'::jsonb));
$$;
revoke execute on function public.scim_users_list(uuid, text, text, int, int, uuid), public.scim_groups_list(uuid, text, text, int, int, uuid) from public, anon, authenticated;
grant execute on function public.scim_users_list(uuid, text, text, int, int, uuid), public.scim_groups_list(uuid, text, text, int, int, uuid) to service_role;

revoke execute on function public.scim_role_for(uuid), public.scim_sync_user(uuid, uuid), public.scim_clean(jsonb, text, int),
  public.scim_user_put(uuid, uuid, jsonb), public.scim_user_delete(uuid, uuid), public.scim_group_put(uuid, uuid, jsonb),
  public.scim_group_delete(uuid, uuid), public.scim_auth(text) from public, anon, authenticated;
grant execute on function public.scim_user_put(uuid, uuid, jsonb), public.scim_user_delete(uuid, uuid), public.scim_group_put(uuid, uuid, jsonb),
  public.scim_group_delete(uuid, uuid), public.scim_auth(text) to service_role;

-- Settings: a new SCIM token for the workspace (replacing the live one), shown once.
create or replace function public.scim_token_create(ws uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre text; k text; replaced boolean;
begin
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can manage SCIM.'; end if;
  perform 1 from public.workspaces where id = ws for update;
  update public.scim_tokens set revoked_at = now() where workspace_id = ws and revoked_at is null;
  replaced := found;
  pre := encode(extensions.gen_random_bytes(4), 'hex');
  k := 'scim_' || pre || '_' || encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.scim_tokens(workspace_id, prefix, token_hash, created_by) values (ws, pre, encode(extensions.digest(k, 'sha256'), 'hex'), auth.uid());
  perform public.audit_security(ws, 'you', case when replaced then 'Replaced the SCIM token' else 'Created a SCIM token' end,
    case when replaced then '更换了 SCIM 令牌' else '创建了 SCIM 令牌' end, 'scim_' || pre || '_…',
    case when replaced then 'The old token stopped working' end, case when replaced then '旧令牌已失效' end);
  return jsonb_build_object('prefix', pre, 'token', k);
end $$;

create or replace function public.scim_token_revoke(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pre text;
begin
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can manage SCIM.'; end if;
  update public.scim_tokens set revoked_at = now() where workspace_id = ws and revoked_at is null returning prefix into pre;
  if pre is null then raise exception 'There''s no SCIM token to turn off.'; end if;
  perform public.audit_security(ws, 'you', 'Turned off the SCIM token', '停用了 SCIM 令牌', 'scim_' || pre || '_…');
end $$;

-- Settings: the role a SCIM group's members get (null: no role from this group).
create or replace function public.scim_group_role(ws uuid, p_group uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.scim_groups; x uuid;
begin
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can manage SCIM.'; end if;
  if p_role is not null and p_role not in ('admin', 'member', 'viewer') then raise exception 'A group can give admin, member or viewer. Owners are made in Placetta.'; end if;
  select * into g from public.scim_groups where id = p_group and workspace_id = ws for update;
  if g.id is null then raise exception 'No such group.'; end if;
  if g.role is not distinct from p_role then return; end if;
  update public.scim_groups set role = p_role, updated_at = now() where id = g.id;
  perform public.audit_security(ws, 'you', 'Mapped a SCIM group to a role', '为 SCIM 群组设置了角色', g.display_name,
    coalesce(public.role_word(g.role), 'No role') || ' to ' || coalesce(public.role_word(p_role), 'No role'),
    coalesce(public.role_word(g.role, 'zh'), '无') || ' 改为 ' || coalesce(public.role_word(p_role, 'zh'), '无'));
  for x in select scim_user_id from public.scim_group_members where group_id = g.id loop
    begin perform public.scim_sync_user(ws, x); exception when others then if sqlerrm <> 'scim_owner' then raise; end if; end;
  end loop;
end $$;

-- On sign-in: join every workspace whose identity provider provisioned this email (active), like accept_invites.
-- A provisioned person already linked to another account moves to this one only when this session is the SAML sign-in
-- registered for the email's domain (Supabase keeps SSO accounts separate from password accounts with the same email).
create or replace function public.scim_claim() returns int
language plpgsql security definer set search_path = '' as $$
declare me record; su record; n int := 0; old text;
begin
  select id, lower(email) as email into me from auth.users where id = auth.uid();
  if me.id is null or me.email is null or not public.email_proven(me.id) or not public.mfa_ok() then return 0; end if;
  for su in select * from public.scim_users where email = me.email and active and user_id is distinct from me.id for update loop
    if su.user_id is not null then
      if not public.session_satisfies(me.id, auth.jwt(), 'saml', split_part(me.email, '@', 2)) then continue; end if;
      select role into old from public.workspace_members where workspace_id = su.workspace_id and user_id = su.user_id;
      if old = 'owner' then continue; end if;
      delete from public.workspace_members where workspace_id = su.workspace_id and user_id = su.user_id;
      perform public.audit_security(su.workspace_id, 'idp', 'Moved to their single sign-on account', '已转到其单点登录账户', me.email);
    end if;
    update public.scim_users set user_id = me.id, updated_at = now() where id = su.id;
    if public.scim_sync_user(su.workspace_id, su.id) <> 'none' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.scim_token_create(uuid), public.scim_token_revoke(uuid), public.scim_group_role(uuid, uuid, text), public.scim_claim() from public, anon;
grant execute on function public.scim_token_create(uuid), public.scim_token_revoke(uuid), public.scim_group_role(uuid, uuid, text), public.scim_claim() to authenticated;

/* ================================ SSO settings ================================ */

-- Settings, Security: the domain and its TXT record, whether it's verified and enforced, this session's sign-in, the
-- SCIM token's prefix and use, and the SCIM groups with their roles. Owners and admins.
create or replace function public.security_settings(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.workspace_sso; me text;
begin
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can see sign-in settings.'; end if;
  select * into s from public.workspace_sso where workspace_id = ws;
  select lower(email) into me from auth.users where id = auth.uid();
  return jsonb_build_object(
    'domain', s.domain,
    'txt_name', case when s.domain is not null then '_placetta-verify.' || s.domain end,
    'txt_value', s.verify_token,
    'verified_at', s.verified_at,
    'method', coalesce(s.method, 'saml'),
    'enforced', coalesce(s.enforced, false),
    'my_domain', split_part(coalesce(me, ''), '@', 2),
    'session_ok', case when s.domain is null then null else public.session_satisfies(auth.uid(), auth.jwt(), s.method, s.domain) end,
    'scim', (select jsonb_build_object('prefix', t.prefix, 'created_at', t.created_at, 'last_used_at', t.last_used_at)
               from public.scim_tokens t where t.workspace_id = ws and t.revoked_at is null),
    'scim_users', (select count(*) from public.scim_users u where u.workspace_id = ws and u.active),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.display_name, 'role', g.role,
                          'members', (select count(*) from public.scim_group_members gm where gm.group_id = g.id)) order by g.display_name)
                          from public.scim_groups g where g.workspace_id = ws), '[]'::jsonb));
end $$;

create or replace function public.sso_set_domain(ws uuid, p_domain text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d text := lower(trim(both '.' from trim(coalesce(p_domain, '')))); cur public.workspace_sso;
begin
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can change sign-in settings.'; end if;
  if length(d) > 253 or d !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then raise exception 'Enter a domain like yourcompany.com.'; end if;
  if exists (select 1 from public.workspace_sso where domain = d and verified_at is not null and workspace_id <> ws) then
    raise exception 'Another workspace has verified that domain.';
  end if;
  select * into cur from public.workspace_sso where workspace_id = ws for update;
  if cur.workspace_id is not null and cur.domain = d then return public.security_settings(ws); end if;
  insert into public.workspace_sso(workspace_id, domain, verify_token, updated_by)
  values (ws, d, 'placetta-verify=' || encode(extensions.gen_random_bytes(16), 'hex'), auth.uid())
  on conflict (workspace_id) do update set domain = excluded.domain, verify_token = excluded.verify_token, verified_at = null,
    enforced = false, updated_by = auth.uid(), updated_at = now();
  perform public.audit_security(ws, 'you', 'Set the sign-in domain', '设置了登录域名', d,
    case when cur.enforced then 'SSO enforcement for ' || cur.domain || ' ended' end, case when cur.enforced then cur.domain || ' 的单点登录要求已结束' end);
  return public.security_settings(ws);
end $$;

-- The sso function (service role), after it found the TXT record: the domain is this workspace's.
create or replace function public.sso_mark_verified(ws uuid, p_domain text, p_by uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.workspace_sso set verified_at = now(), updated_by = p_by, updated_at = now()
   where workspace_id = ws and domain = lower(p_domain) and verified_at is null;
  if not found then return false; end if;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (ws, 'you', p_by, '{"en": "Verified the sign-in domain", "zh": "验证了登录域名"}'::jsonb, jsonb_build_object('en', lower(p_domain), 'zh', lower(p_domain)));
  return true;
exception when unique_violation then
  raise exception 'Another workspace has verified that domain.';
end $$;

create or replace function public.sso_method_word(m text) returns text
language sql immutable set search_path = '' as $$
  select case m when 'saml' then 'SAML single sign-on' when 'google' then 'Google Workspace' when 'azure' then 'Microsoft Entra ID' else m end;
$$;

create or replace function public.sso_set_enforced(ws uuid, p_on boolean, p_method text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.workspace_sso; m text; me text;
begin
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can change sign-in settings.'; end if;
  select * into s from public.workspace_sso where workspace_id = ws for update;
  if s.workspace_id is null or s.verified_at is null then raise exception 'Verify the domain first.'; end if;
  m := coalesce(nullif(trim(p_method), ''), s.method);
  if not (m in ('saml', 'google', 'azure') or m ~ '^custom:[a-z0-9][a-z0-9:-]{0,42}$') then raise exception 'Choose SAML, Google, Microsoft or a custom provider (custom:name).'; end if;
  select lower(email) into me from auth.users where id = auth.uid();
  -- whoever turns it on proves it works first, so they can't lock themselves out
  if coalesce(p_on, false) and split_part(coalesce(me, ''), '@', 2) = s.domain and not public.session_satisfies(auth.uid(), auth.jwt(), m, s.domain) then
    raise exception 'Sign in with % first, so you know it works before everyone at % must use it.', public.sso_method_word(m), s.domain;
  end if;
  if s.enforced = coalesce(p_on, false) and s.method = m then return public.security_settings(ws); end if;
  update public.workspace_sso set enforced = coalesce(p_on, false), method = m, updated_by = auth.uid(), updated_at = now() where workspace_id = ws;
  perform public.audit_security(ws, 'you',
    case when coalesce(p_on, false) then 'Required single sign-on' else 'Stopped requiring single sign-on' end,
    case when coalesce(p_on, false) then '要求单点登录' else '不再要求单点登录' end,
    s.domain, 'With ' || public.sso_method_word(m), '方式：' || public.sso_method_word(m));
  return public.security_settings(ws);
end $$;

-- The sign-in screen: whether this email must sign in with SSO, and how. Says nothing about anything else.
create or replace function public.sso_for_email(p_email text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('required', true, 'method', s.method, 'domain', s.domain)
      from public.workspace_sso s
     where s.domain = lower(split_part(trim(coalesce(p_email, '')), '@', 2)) and s.enforced and s.verified_at is not null
     limit 1), jsonb_build_object('required', false));
$$;

revoke execute on function public.security_settings(uuid), public.sso_set_domain(uuid, text), public.sso_mark_verified(uuid, text, uuid),
  public.sso_set_enforced(uuid, boolean, text), public.sso_for_email(text), public.sso_method_word(text) from public, anon, authenticated;
grant execute on function public.security_settings(uuid), public.sso_set_domain(uuid, text), public.sso_set_enforced(uuid, boolean, text) to authenticated;
grant execute on function public.sso_for_email(text) to anon, authenticated;
grant execute on function public.sso_mark_verified(uuid, text, uuid) to service_role;

/* ================================ team list ================================ */

create or replace function public.team_list(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.can_view(ws) or public.is_staff()) then raise exception 'Not your workspace.'; end if;
  return jsonb_build_object(
    'me', (select m.role from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', m.user_id, 'email', u.email, 'role', m.role, 'joined_at', m.created_at, 'you', m.user_id = auth.uid(),
               'two_step', exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified'),
               'scim', exists (select 1 from public.scim_users s where s.workspace_id = ws and s.user_id = m.user_id and s.active))
             order by m.created_at)
        from public.workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = ws), '[]'::jsonb),
    'invites', case when public.is_admin(ws) or public.is_staff() then coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'created_at', i.created_at, 'expires_at', i.expires_at)
             order by i.created_at)
        from public.workspace_invites i
       where i.workspace_id = ws and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()), '[]'::jsonb)
      else '[]'::jsonb end
  );
end $$;
revoke execute on function public.team_list(uuid) from public, anon;
grant execute on function public.team_list(uuid) to authenticated;

/* ================================ 4. the audit trail ================================ */

-- The app calls this once a session starts: a "Signed in" line in each of the person's workspaces, with how (from the
-- session's amr claim), once per session.
create or replace function public.audit_sign_in() returns int
language plpgsql security definer set search_path = '' as $$
declare c jsonb := auth.jwt(); how text; how_zh text; sid text; me text; n int := 0; r record; prov text; two boolean;
begin
  if auth.uid() is null then return 0; end if;
  sid := coalesce(c ->> 'session_id', c ->> 'iat', '');
  if sid = '' then return 0; end if;
  select coalesce(lower(email), phone, '') into me from auth.users where id = auth.uid();
  select coalesce(x ->> 'method', x #>> '{}') into how from jsonb_array_elements(case when jsonb_typeof(c -> 'amr') = 'array' then c -> 'amr' else '[]'::jsonb end) x
   where coalesce(x ->> 'method', x #>> '{}') not in ('totp', 'mfa/totp', 'mfa/phone', 'mfa/webauthn') limit 1;
  two := exists (select 1 from jsonb_array_elements(case when jsonb_typeof(c -> 'amr') = 'array' then c -> 'amr' else '[]'::jsonb end) x
                  where coalesce(x ->> 'method', x #>> '{}') in ('totp', 'mfa/totp', 'mfa/phone', 'mfa/webauthn'));
  select string_agg(i.provider, ', ' order by i.provider) into prov from auth.identities i
   where i.user_id = auth.uid() and i.provider not in ('email', 'phone') and i.provider not like 'sso:%';
  how_zh := case how when 'password' then '密码' when 'otp' then '验证码' when 'magiclink' then '登录链接' when 'sso/saml' then 'SAML 单点登录'
                     when 'oauth' then coalesce(replace(replace(prov, 'azure', 'Microsoft'), 'google', 'Google'), 'OAuth') else coalesce(how, '未知方式') end;
  how := case how when 'password' then 'a password' when 'otp' then 'a one-time code' when 'magiclink' then 'an emailed link' when 'sso/saml' then 'SAML single sign-on'
                  when 'oauth' then coalesce(replace(replace(prov, 'azure', 'Microsoft'), 'google', 'Google'), 'OAuth') else coalesce(how, 'an unknown method') end;
  for r in select m.workspace_id from public.workspace_members m where m.user_id = auth.uid() loop
    if not public.can_view(r.workspace_id) then continue; end if;
    insert into public.audit_log(workspace_id, client_id, actor, actor_id, action, object, detail)
    values (r.workspace_id, 'signin:' || left(sid, 80), 'you', auth.uid(), '{"en": "Signed in", "zh": "登录"}'::jsonb,
            jsonb_build_object('en', me, 'zh', me),
            jsonb_build_object('en', 'With ' || how || case when two then ' and two-step' else '' end, 'zh', '方式：' || how_zh || case when two then '，两步验证' else '' end))
    on conflict (workspace_id, client_id) where client_id is not null do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- A download of the workspace's data, recorded before the app saves it. kind: workspace_data, documents, filings.
create or replace function public.audit_record_export(ws uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare k text := case p_kind when 'workspace_data' then 'workspace_data' when 'documents' then 'documents' when 'filings' then 'filings' end;
begin
  if not public.can_view(ws) then raise exception 'Not your workspace.'; end if;
  if k is null then raise exception 'Unknown export.'; end if;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (ws, 'you', auth.uid(), '{"en": "Exported data", "zh": "导出了数据"}'::jsonb,
          case k when 'workspace_data' then '{"en": "Workspace data (JSON)", "zh": "工作区数据（JSON）"}'::jsonb
                 when 'documents' then '{"en": "Documents", "zh": "文件"}'::jsonb else '{"en": "Filings", "zh": "申报"}'::jsonb end);
end $$;

-- The whole audit trail for an owner or admin, oldest first, with each person's email; the export itself is recorded
-- first. p_from and p_to bound it (either may be null). At most 100,000 rows.
create or replace function public.audit_export(ws uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (id bigint, created_at timestamptz, actor text, actor_email text, action_en text, action_zh text, object_en text, object_zh text, detail_en text, detail_zh text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can export the audit trail.'; end if;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (ws, 'you', auth.uid(), '{"en": "Exported the audit trail", "zh": "导出了审计记录"}'::jsonb, '{"en": "Audit trail (CSV)", "zh": "审计记录（CSV）"}'::jsonb,
          case when p_from is not null or p_to is not null then jsonb_build_object('en', coalesce(p_from::date::text, 'start') || ' to ' || coalesce(p_to::date::text, 'now'),
                                                                                   'zh', coalesce(p_from::date::text, '开始') || ' 至 ' || coalesce(p_to::date::text, '现在')) end);
  return query
    select a.id, a.created_at, a.actor, u.email::text, a.action ->> 'en', a.action ->> 'zh', a.object ->> 'en', a.object ->> 'zh', a.detail ->> 'en', a.detail ->> 'zh'
      from public.audit_log a left join auth.users u on u.id = a.actor_id
     where a.workspace_id = ws and (p_from is null or a.created_at >= p_from) and (p_to is null or a.created_at < p_to)
     order by a.created_at, a.id
     limit 100000;
end $$;

revoke execute on function public.audit_sign_in(), public.audit_record_export(uuid, text), public.audit_export(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.audit_sign_in(), public.audit_record_export(uuid, text), public.audit_export(uuid, timestamptz, timestamptz) to authenticated;

-- A second owner's approval (business rules that want two owners) goes in the trail too.
create or replace function public.owner_approvals_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  select email into who from auth.users where id = new.user_id;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (new.workspace_id, 'you', new.user_id, '{"en": "Approved as an owner", "zh": "以所有者身份批准"}'::jsonb,
          jsonb_build_object('en', new.app_id, 'zh', new.app_id), jsonb_build_object('en', coalesce(who, ''), 'zh', coalesce(who, '')));
  return null;
end $$;
revoke execute on function public.owner_approvals_audit() from public, anon, authenticated;
drop trigger if exists owner_approvals_audit on public.owner_approvals;
create trigger owner_approvals_audit after insert on public.owner_approvals for each row execute function public.owner_approvals_audit();
