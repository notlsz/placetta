-- Team review for chains and franchises (Legora's tabular review, Harvey's team collaboration):
--   comments          on any application, document or job, with @mentions of teammates, headquarters and Odelia,
--                     resolved and reopened. Clients never write the table: comment_post and comment_resolve do.
--   assignments       "Assigned to" on applications and jobs (assign_item), for the Mine filter.
--   mention_notices   what a mention, an assignment, headquarters' question or a reminder tells one person: it shows in
--                     their Updates (or on Headquarters) and goes out by the channel they chose (team and monitor send it).
--   hq_review()       headquarters' review table: per store, each permit's name, level, status and dates.
--
-- Who sees what (the database holds every line of it):
--   - Members of a workspace read its comments and assignments. Nobody else does, and no franchisee ever reads another
--     franchisee's rows.
--   - Headquarters (an email an owner shared the stores with in Settings, proven, with two-step when it's on) never
--     reads the tables. It reads only the comments on permits that were shared with it, through hq_comments(), without
--     who on the franchisee's team wrote them, and posts only there. hq_review() follows hq_summary's rule: names,
--     dates, counts and statuses. A staff certificate is its kind and expiry, never whose it is.
--   - A notice is read only by the person it's for.
-- Every comment, resolve and assignment writes an audit row. Safe to run twice.

/* ---------------------------- tables ---------------------------- */

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_kind text not null check (item_kind in ('app', 'doc', 'job')),
  item_id text not null check (length(item_id) between 1 and 200),
  author_id uuid references auth.users(id) on delete set null,
  author_email text not null default '',
  from_hq boolean not null default false,
  shared_hq boolean not null default false,
  body text not null check (length(btrim(body)) between 1 and 4000),
  mentions jsonb not null default '[]'::jsonb check (jsonb_typeof(mentions) = 'array'),
  asked_odelia boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  -- headquarters only ever writes on a permit, in the thread shared with it
  constraint comments_hq_on_permits check (not from_hq or (shared_hq and item_kind = 'app')),
  constraint comments_shared_on_permits check (not shared_hq or item_kind = 'app')
);
comment on table public.comments is 'Comments on applications, documents and jobs. Members read their workspace''s; headquarters reads shared permit threads only through hq_comments(). Written by comment_post, hq_ask and comment_resolve.';
create index if not exists comments_item on public.comments(workspace_id, item_kind, item_id, created_at);
create index if not exists comments_author on public.comments(author_id, created_at desc);
alter table public.comments enable row level security;
revoke all on public.comments from public, anon, authenticated;
grant select on public.comments to authenticated;
drop policy if exists "Members read their workspace's comments" on public.comments;
create policy "Members read their workspace's comments" on public.comments for select to authenticated
  using (public.is_member(workspace_id));

create table if not exists public.assignments (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_kind text not null check (item_kind in ('app', 'job')),
  item_id text not null check (length(item_id) between 1 and 200),
  assignee uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (workspace_id, item_kind, item_id)
);
comment on table public.assignments is 'Who an application or job is assigned to. Members read their workspace''s; assign_item writes it.';
create index if not exists assignments_assignee on public.assignments(assignee);
alter table public.assignments enable row level security;
revoke all on public.assignments from public, anon, authenticated;
grant select on public.assignments to authenticated;
drop policy if exists "Members read their workspace's assignments" on public.assignments;
create policy "Members read their workspace's assignments" on public.assignments for select to authenticated
  using (public.is_member(workspace_id));

create table if not exists public.mention_notices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('mention', 'assigned', 'hq', 'reminder')),
  comment_id uuid references public.comments(id) on delete cascade,
  -- one of the two: a member of the workspace, or a headquarters email it shares with
  user_id uuid references auth.users(id) on delete cascade,
  email text check (email is null or email = lower(email)),
  item_kind text check (item_kind is null or item_kind in ('app', 'doc', 'job')),
  item_id text,
  title jsonb not null,
  body jsonb,
  remind_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  sent_at timestamptz,
  sent_via text check (sent_via is null or sent_via in ('email', 'text', 'none')),
  constraint mention_notices_to check (user_id is not null or email is not null)
);
comment on table public.mention_notices is 'Mentions, assignments, headquarters'' questions and reminders, one row per person told. Read only by that person; sent by the team and monitor functions.';
create index if not exists mention_notices_user on public.mention_notices(user_id, created_at desc) where user_id is not null;
create index if not exists mention_notices_email on public.mention_notices(email, created_at desc) where email is not null;
create index if not exists mention_notices_workspace on public.mention_notices(workspace_id);
create index if not exists mention_notices_unsent on public.mention_notices(created_at) where sent_at is null;
alter table public.mention_notices enable row level security;
revoke all on public.mention_notices from public, anon, authenticated;
grant select on public.mention_notices to authenticated;

/* ---------------------------- who is asking ---------------------------- */

-- The signed-in person's email, lowercased, once it's proven (as for team invites and hq_stores).
create or replace function public.my_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and public.email_proven(u.id);
$$;

-- Whether the signed-in person is headquarters for this workspace: an owner shared its stores with their proven email,
-- the link is live, and two-step is satisfied when it's on.
create or replace function public.hq_sees(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.mfa_ok() and exists (
    select 1 from public.hq_links l where l.workspace_id = ws and l.revoked_at is null and l.hq_email = public.my_email());
$$;

drop policy if exists "Each person reads their own notices" on public.mention_notices;
create policy "Each person reads their own notices" on public.mention_notices for select to authenticated
  using ((user_id = (select auth.uid()) and public.is_member(workspace_id))
      or (user_id is null and email = public.my_email() and public.hq_sees(workspace_id)));

-- The name of the item a comment or assignment is about, from the saved workspace (documents also from the stored
-- files, which the app shows as "doc-<id>"). null when there's no such item.
create or replace function public.item_title(ws uuid, p_kind text, p_item text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare st jsonb; t jsonb;
begin
  select w.state into st from public.workspaces w where w.id = ws;
  if st is null then return null; end if;
  if p_kind = 'app' then
    select public.hq_bi(a.value->'name') into t
      from jsonb_array_elements(case when jsonb_typeof(st->'apps') = 'array' then st->'apps' else '[]'::jsonb end) a
     where jsonb_typeof(a.value) = 'object' and a.value->>'id' = p_item limit 1;
  elsif p_kind = 'job' then
    select public.hq_bi(j.value->'title') into t
      from jsonb_array_elements(case when jsonb_typeof(st->'jobs') = 'array' then st->'jobs' else '[]'::jsonb end) j
     where jsonb_typeof(j.value) = 'object' and j.value->>'id' = p_item limit 1;
  elsif p_kind = 'doc' then
    select public.hq_bi(d.value->'name') into t
      from jsonb_array_elements(case when jsonb_typeof(st->'docs') = 'array' then st->'docs' else '[]'::jsonb end) d
     where jsonb_typeof(d.value) = 'object' and d.value->>'id' = p_item limit 1;
    if t is null and p_item like 'doc-%' then
      select jsonb_build_object('en', left(x.name, 200), 'zh', left(x.name, 200)) into t
        from public.documents x where x.workspace_id = ws and 'doc-' || x.id::text = p_item;
    end if;
  end if;
  return t;
end $$;

-- One notice, unless the same person already has an unread one for this comment.
create or replace function public.notice_add(ws uuid, p_kind text, p_comment uuid, p_user uuid, p_email text, p_item_kind text, p_item text,
  p_title jsonb, p_body jsonb, p_remind date default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_comment is not null and exists (select 1 from public.mention_notices n where n.comment_id = p_comment and n.read_at is null
       and n.user_id is not distinct from p_user and n.email is not distinct from p_email) then return; end if;
  insert into public.mention_notices(workspace_id, kind, comment_id, user_id, email, item_kind, item_id, title, body, remind_on, created_by)
  values (ws, p_kind, p_comment, p_user, p_email, p_item_kind, p_item, p_title, p_body, p_remind, auth.uid());
end $$;

/* ---------------------------- comments ---------------------------- */

-- Post a comment. Members comment on any application, document or job in their workspace and may mention:
--   {"kind": "member", "user_id"}  a teammate on this workspace (they get a notice)
--   {"kind": "hq", "email"}        a headquarters email the workspace shares with, on a permit only (the comment is
--                                  then shared with headquarters)
--   {"kind": "odelia"}             Odelia, on a permit only: the app then starts her on it as this member
-- Headquarters comments only on permits, always in the shared thread, and its comment tells the owners. It can't start
-- Odelia: she works for the franchisee's own members. Returns the comment, with "odelia" true when she should start.
create or replace function public.comment_post(ws uuid, p_kind text, p_item text, p_body text, p_mentions jsonb default '[]'::jsonb, p_share boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); mine text; member boolean; hq boolean := false; txt text := btrim(coalesce(p_body, ''));
  title jsonb; m jsonb; clean jsonb := '[]'::jsonb; shared boolean := coalesce(p_share, false); odelia boolean := false;
  who uuid; e text; tos uuid[] := '{}'; hqs text[] := '{}'; n int; c public.comments; wsname text; snippet jsonb;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  member := public.is_member(ws);
  if not member then hq := public.hq_sees(ws); end if;
  if not member and not hq then raise exception 'Not your workspace.'; end if;
  if p_kind is null or p_kind not in ('app', 'doc', 'job') then raise exception 'Comments go on an application, a document or a job.'; end if;
  if hq and p_kind <> 'app' then raise exception 'Headquarters comments on permits only.'; end if;
  if length(txt) < 1 or length(txt) > 4000 then raise exception 'Write a comment of up to 4,000 characters.'; end if;
  title := public.item_title(ws, p_kind, p_item);
  if title is null then raise exception 'That item is gone.'; end if;
  select count(*) into n from public.comments where author_id = me and created_at > now() - interval '1 hour';
  if n >= 120 then raise exception 'That''s a lot of comments in an hour. Try again later.'; end if;
  select lower(u.email) into mine from auth.users u where u.id = me;

  for m in select value from jsonb_array_elements(case when jsonb_typeof(p_mentions) = 'array' then p_mentions else '[]'::jsonb end) loop
    if m->>'kind' = 'odelia' then
      -- only the franchisee's own owners and members put Odelia to work, and only on a permit
      if member and p_kind = 'app' and not odelia then odelia := true; clean := clean || jsonb_build_array(jsonb_build_object('kind', 'odelia')); end if;
    elsif m->>'kind' = 'member' and member then
      begin who := (m->>'user_id')::uuid; exception when others then raise exception 'Mention someone on this workspace.'; end;
      if who is null or not exists (select 1 from public.workspace_members x where x.workspace_id = ws and x.user_id = who) then
        raise exception 'Mention someone on this workspace.';
      end if;
      if not who = any(tos) then
        tos := tos || who;
        clean := clean || jsonb_build_array(jsonb_build_object('kind', 'member', 'user_id', who));
      end if;
    elsif m->>'kind' = 'hq' and member then
      e := lower(btrim(coalesce(m->>'email', '')));
      if not exists (select 1 from public.hq_links l where l.workspace_id = ws and l.hq_email = e and l.revoked_at is null) then
        raise exception 'That headquarters email isn''t one this workspace shares with.';
      end if;
      if p_kind <> 'app' then raise exception 'Headquarters only sees permits. Mention headquarters on a permit.'; end if;
      shared := true;
      if not e = any(hqs) then
        hqs := hqs || e;
        clean := clean || jsonb_build_array(jsonb_build_object('kind', 'hq', 'email', e));
      end if;
    elsif m->>'kind' in ('member', 'hq') then
      raise exception 'Headquarters can''t mention people by name. The franchisee''s owners are told about every comment.';
    else
      raise exception 'Mention a teammate, headquarters or Odelia.';
    end if;
  end loop;
  if hq then shared := true; end if;
  if shared and p_kind <> 'app' then raise exception 'Only comments on permits can be shared with headquarters.'; end if;
  if shared and member and not exists (select 1 from public.hq_links l where l.workspace_id = ws and l.revoked_at is null) then
    raise exception 'This workspace doesn''t share with headquarters. An owner turns it on in Settings, Headquarters.';
  end if;

  insert into public.comments(workspace_id, item_kind, item_id, author_id, author_email, from_hq, shared_hq, body, mentions, asked_odelia)
  values (ws, p_kind, p_item, me, coalesce(mine, ''), hq, shared, txt, clean, odelia)
  returning * into c;

  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (ws, 'you', me,
    case when hq then '{"en": "Headquarters commented", "zh": "总部发表评论"}'::jsonb
         when odelia then '{"en": "Commented and asked Odelia", "zh": "发表评论并请 Odelia 处理"}'::jsonb
         else '{"en": "Commented", "zh": "发表评论"}'::jsonb end,
    title, jsonb_build_object('en', left(txt, 200), 'zh', left(txt, 200)));

  snippet := jsonb_build_object('en', left(txt, 300), 'zh', left(txt, 300));
  foreach who in array tos loop
    if who <> me then
      perform public.notice_add(ws, 'mention', c.id, who, null, p_kind, p_item,
        jsonb_build_object('en', coalesce(mine, 'A teammate') || ' mentioned you: ' || (title->>'en'), 'zh', coalesce(mine, '同事') || ' 提到了您：' || (title->>'zh')), snippet);
    end if;
  end loop;
  if array_length(hqs, 1) > 0 then
    select w.name into wsname from public.workspaces w where w.id = ws;
    foreach e in array hqs loop
      -- headquarters is told which franchisee, never which person on its team
      perform public.notice_add(ws, 'mention', c.id, null, e, p_kind, p_item,
        jsonb_build_object('en', coalesce(wsname, 'A franchisee') || ' mentioned you: ' || (title->>'en'), 'zh', coalesce(wsname, '加盟商') || ' 提到了您：' || (title->>'zh')), snippet);
    end loop;
  end if;
  if hq then
    for who in select x.user_id from public.workspace_members x where x.workspace_id = ws and x.role = 'owner' loop
      perform public.notice_add(ws, 'hq', c.id, who, null, p_kind, p_item,
        jsonb_build_object('en', 'Headquarters commented: ' || (title->>'en'), 'zh', '总部发表了评论：' || (title->>'zh')), snippet);
    end loop;
  end if;
  return to_jsonb(c) || jsonb_build_object('odelia', odelia);
end $$;

-- Resolve or reopen a comment: members of its workspace, or headquarters in a thread shared with it.
create or replace function public.comment_resolve(p_id uuid, p_resolved boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.comments; title jsonb;
begin
  select * into c from public.comments where id = p_id;
  if c.id is null then raise exception 'That comment is gone.'; end if;
  if not (public.is_member(c.workspace_id) or (c.shared_hq and public.hq_sees(c.workspace_id))) then raise exception 'Not your workspace.'; end if;
  if (c.resolved_at is not null) = coalesce(p_resolved, true) then return to_jsonb(c); end if;
  update public.comments set resolved_at = case when coalesce(p_resolved, true) then now() end,
                             resolved_by = case when coalesce(p_resolved, true) then auth.uid() end
   where id = p_id returning * into c;
  title := coalesce(public.item_title(c.workspace_id, c.item_kind, c.item_id), jsonb_build_object('en', c.item_id, 'zh', c.item_id));
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (c.workspace_id, 'you', auth.uid(),
    case when c.resolved_at is not null then '{"en": "Resolved a comment", "zh": "将评论标为已解决"}'::jsonb else '{"en": "Reopened a comment", "zh": "重新打开评论"}'::jsonb end,
    title, jsonb_build_object('en', left(c.body, 200), 'zh', left(c.body, 200)));
  return to_jsonb(c);
end $$;

/* ---------------------------- assignments ---------------------------- */

-- Assign an application or a job to someone on the workspace (null to unassign). Members do it; the person assigned
-- gets a notice unless they assigned themselves.
create or replace function public.assign_item(ws uuid, p_kind text, p_item text, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); title jsonb; cur uuid; who text; mine text;
begin
  if not public.is_member(ws) then raise exception 'Not your workspace.'; end if;
  if p_kind is null or p_kind not in ('app', 'job') then raise exception 'Assign an application or a job.'; end if;
  title := public.item_title(ws, p_kind, p_item);
  if title is null then raise exception 'That item is gone.'; end if;
  select a.assignee into cur from public.assignments a where a.workspace_id = ws and a.item_kind = p_kind and a.item_id = p_item;
  if p_user is null then
    if cur is null then return null; end if;
    delete from public.assignments where workspace_id = ws and item_kind = p_kind and item_id = p_item;
    insert into public.audit_log(workspace_id, actor, actor_id, action, object)
    values (ws, 'you', me, '{"en": "Unassigned", "zh": "取消分配"}'::jsonb, title);
    return null;
  end if;
  if not exists (select 1 from public.workspace_members x where x.workspace_id = ws and x.user_id = p_user) then
    raise exception 'Assign someone on this workspace.';
  end if;
  if cur = p_user then return jsonb_build_object('item_kind', p_kind, 'item_id', p_item, 'assignee', p_user); end if;
  insert into public.assignments(workspace_id, item_kind, item_id, assignee, assigned_by) values (ws, p_kind, p_item, p_user, me)
  on conflict (workspace_id, item_kind, item_id) do update set assignee = excluded.assignee, assigned_by = excluded.assigned_by, assigned_at = now();
  select lower(u.email) into who from auth.users u where u.id = p_user;
  select lower(u.email) into mine from auth.users u where u.id = me;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (ws, 'you', me, '{"en": "Assigned", "zh": "分配"}'::jsonb, title, jsonb_build_object('en', coalesce(who, ''), 'zh', coalesce(who, '')));
  if p_user <> me then
    perform public.notice_add(ws, 'assigned', null, p_user, null, p_kind, p_item,
      jsonb_build_object('en', coalesce(mine, 'A teammate') || ' assigned you: ' || (title->>'en'), 'zh', coalesce(mine, '同事') || ' 把这项分配给了您：' || (title->>'zh')), null);
  end if;
  return jsonb_build_object('item_kind', p_kind, 'item_id', p_item, 'assignee', p_user);
end $$;

-- Someone who leaves a workspace takes their assignments and unread notices there with them.
create or replace function public.member_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.assignments where workspace_id = old.workspace_id and assignee = old.user_id;
  delete from public.mention_notices where workspace_id = old.workspace_id and user_id = old.user_id and read_at is null;
  return null;
end $$;
drop trigger if exists workspace_members_gone on public.workspace_members;
create trigger workspace_members_gone after delete on public.workspace_members for each row execute function public.member_gone();

/* ---------------------------- notices ---------------------------- */

-- Mark the signed-in person's notices read (only their own; anything else is left alone). Returns how many.
create or replace function public.notices_read(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer; mine text := public.my_email();
begin
  update public.mention_notices x set read_at = now()
   where x.id = any(coalesce(p_ids, '{}')) and x.read_at is null
     and ((x.user_id = auth.uid() and public.is_member(x.workspace_id)) or (x.user_id is null and x.email = mine and public.hq_sees(x.workspace_id)));
  get diagnostics n = row_count;
  return n;
end $$;

/* ---------------------------- headquarters ---------------------------- */

-- The review table for one shared workspace: per store, its stage and address, and every permit on its list:
--   apps     each application: name, level, form id, status (the team's latest filing overrides the saved status, as
--            the app shows it), whether a document is still missing, its next date and its renewal, and how many open
--            comments are shared with headquarters
--   permits  permits on file for an open store, by name and expiry
--   certs    staff certificates by kind and expiry, never the person
-- An application belongs to a store when the store lists it, or to the only store when there's one. With two or more
-- stores, what no store lists (the business's own registrations) is a "Whole business" row.
-- Only names, dates, counts and statuses leave this function, as in hq_summary.
create or replace function public.hq_review_of(ws uuid, st jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  with stores as (
    select s.value as s, s.ordinality as n
      from jsonb_array_elements(case when jsonb_typeof(st->'stores') = 'array' then st->'stores' else '[]'::jsonb end) with ordinality s
     where jsonb_typeof(s.value) = 'object'
  ),
  single as (select count(*) = 1 as one, count(*) as many from stores),
  filed as (
    select distinct on (f.app_id) f.app_id, f.status
      from public.filings f where f.workspace_id = ws and f.status <> 'canceled'
     order by f.app_id, f.approved_at desc
  ),
  apps as (
    select a.value->>'id' as id, a.value as a, a.ordinality as k,
      case fl.status when 'requested' then 'filing' when 'in_progress' then 'filing' when 'needs_info' then 'needs'
        when 'submitted' then 'review' when 'accepted' then 'approved' when 'rejected' then 'needs'
        else coalesce(a.value->>'status', 'todo') end as status
      from jsonb_array_elements(case when jsonb_typeof(st->'apps') = 'array' then st->'apps' else '[]'::jsonb end) with ordinality a
      left join filed fl on fl.app_id = a.value->>'id'
     where jsonb_typeof(a.value) = 'object' and coalesce(a.value->>'id', '') <> ''
  ),
  deadlines as (
    select d.value as d
      from jsonb_array_elements(case when jsonb_typeof(st->'deadlines') = 'array' then st->'deadlines' else '[]'::jsonb end) d
     where jsonb_typeof(d.value) = 'object' and coalesce(d.value->>'app', '') <> ''
  ),
  arows as (
    select a.id, a.k, a.status, jsonb_build_object(
      'id', left(a.id, 80),
      'name', public.hq_bi(a.a->'name'),
      'level', case when a.a->>'level' in ('federal', 'state', 'county', 'city') then a.a->>'level' end,
      'official', left(a.a->>'official', 60),
      'status', case when a.status in ('approved', 'review', 'filing', 'ready', 'needs', 'draft', 'waiting', 'todo') then a.status else 'todo' end,
      'missing', exists (select 1 from jsonb_array_elements(case when jsonb_typeof(a.a->'checklist') = 'array' then a.a->'checklist' else '[]'::jsonb end) c
                          where jsonb_typeof(c.value) = 'object' and c.value->>'state' = 'missing' and coalesce(c.value->>'dep', '') = ''),
      'due', (select min(public.hq_date(dl.d->>'date')) from deadlines dl
               where dl.d->>'app' = a.id and dl.d->>'kind' in ('due', 'estimate', 'milestone') and not (dl.d->>'kind' = 'due' and a.status = 'approved')),
      'renews', (select min(public.hq_date(dl.d->>'date')) from deadlines dl where dl.d->>'app' = a.id and dl.d->>'kind' = 'renewal'),
      'comments', (select count(*) from public.comments c where c.workspace_id = ws and c.item_kind = 'app' and c.item_id = a.id
                    and c.shared_hq and c.resolved_at is null)) as j
      from apps a
  ),
  placed as (
    select s.n, r.k, r.j from stores s join arows r
      on (select one from single) or (jsonb_typeof(s.s->'apps') = 'array' and s.s->'apps' ? r.id)
  ),
  loose as (
    select r.k, r.j from arows r
     where (select many from single) >= 2
       and not exists (select 1 from stores s where jsonb_typeof(s.s->'apps') = 'array' and s.s->'apps' ? r.id)
  ),
  per_store as (
    select s.n, jsonb_build_object(
      'id', coalesce(left(s.s->>'id', 80), 'store-' || s.n),
      'name', public.hq_bi(s.s->'name'),
      'stage', case when s.s->>'stage' = 'open' then 'open' else 'opening' end,
      'address', left(coalesce(s.s->>'address', ''), 200),
      'planned_open', public.hq_date(s.s->>'plannedOpen'),
      'projected_open', public.hq_date(s.s->>'projectedOpen'),
      'opened', public.hq_date(s.s->>'opened'),
      'apps', coalesce((select jsonb_agg(p.j order by p.k) from placed p where p.n = s.n), '[]'::jsonb),
      'permits', coalesce((select jsonb_agg(jsonb_build_object('name', public.hq_bi(p.value->'name'), 'expires', public.hq_date(p.value->>'expires')))
                   from jsonb_array_elements(case when jsonb_typeof(s.s->'permits') = 'array' then s.s->'permits' else '[]'::jsonb end) p
                  where jsonb_typeof(p.value) = 'object'), '[]'::jsonb),
      'certs', coalesce((select jsonb_agg(jsonb_build_object('kind', public.hq_bi(c.value->'kind'), 'expires', public.hq_date(c.value->>'expires')))
                   from jsonb_array_elements(case when jsonb_typeof(s.s->'certs') = 'array' then s.s->'certs' else '[]'::jsonb end) c
                  where jsonb_typeof(c.value) = 'object'), '[]'::jsonb)) as j
      from stores s
  )
  select coalesce((select jsonb_agg(p.j order by p.n) from per_store p), '[]'::jsonb)
    || case when exists (select 1 from loose) then jsonb_build_array(jsonb_build_object(
         'id', '_business', 'name', jsonb_build_object('en', 'Whole business', 'zh', '整个企业'), 'stage', 'business', 'address', '',
         'planned_open', null, 'projected_open', null, 'opened', null,
         'apps', (select jsonb_agg(l.j order by l.k) from loose l), 'permits', '[]'::jsonb, 'certs', '[]'::jsonb)) else '[]'::jsonb end;
$$;
revoke execute on function public.hq_review_of(uuid, jsonb) from public, anon, authenticated;

-- Headquarters' review table: every workspace shared with the signed-in person's proven email.
create or replace function public.hq_review() returns table (workspace_id uuid, name text, brand text, stores jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare mine text := public.my_email();
begin
  if mine is null or not public.mfa_ok() then return; end if;
  return query
    select w.id, w.name, l.brand, public.hq_review_of(w.id, w.state)
      from public.hq_links l join public.workspaces w on w.id = l.workspace_id
     where l.hq_email = mine and l.revoked_at is null
     order by coalesce(l.brand, ''), w.name;
end $$;

-- The thread on one permit that's shared with headquarters, as headquarters reads it: what was said and when, and
-- whether headquarters or the franchisee said it. Who on the franchisee's team wrote it stays with the franchisee.
create or replace function public.hq_comments(ws uuid, p_app text) returns table (id uuid, item_id text, body text, from_hq boolean, author text,
  mentions_hq boolean, created_at timestamptz, resolved_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.hq_sees(ws) then raise exception 'Not shared with you.'; end if;
  return query
    select c.id, c.item_id, c.body, c.from_hq, case when c.from_hq then c.author_email end,
           exists (select 1 from jsonb_array_elements(c.mentions) m where m.value->>'kind' = 'hq'), c.created_at, c.resolved_at
      from public.comments c
     where c.workspace_id = ws and c.item_kind = 'app' and c.shared_hq and (p_app is null or c.item_id = p_app)
     order by c.created_at;
end $$;

-- Headquarters asks the franchisee about several permits at once (the review table's bulk action): one shared comment
-- on each, and one notice per owner per franchisee. items: [{"workspace_id", "app_id"}], at most 60. Returns how many.
create or replace function public.hq_ask(p_items jsonb, p_body text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); mine text := public.my_email(); txt text := btrim(coalesce(p_body, '')); it jsonb; ws uuid; app text; title jsonb;
  n int := 0; per jsonb := '{}'::jsonb; who uuid; k text; cid uuid; recent int;
begin
  if me is null or mine is null then raise exception 'Sign in first.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Pick the permits to ask about.'; end if;
  if jsonb_array_length(p_items) > 60 then raise exception 'Up to 60 permits at a time.'; end if;
  if length(txt) < 1 or length(txt) > 2000 then raise exception 'Write a message of up to 2,000 characters.'; end if;
  select count(*) into recent from public.comments where author_id = me and created_at > now() - interval '1 hour';
  if recent + jsonb_array_length(p_items) > 120 then raise exception 'That''s a lot of comments in an hour. Try again later.'; end if;
  for it in select value from jsonb_array_elements(p_items) loop
    begin ws := (it->>'workspace_id')::uuid; exception when others then raise exception 'Pick permits from the review table.'; end;
    app := it->>'app_id';
    if ws is null or not public.hq_sees(ws) then raise exception 'Not shared with you.'; end if;
    title := public.item_title(ws, 'app', app);
    if title is null then raise exception 'That permit is gone.'; end if;
    insert into public.comments(workspace_id, item_kind, item_id, author_id, author_email, from_hq, shared_hq, body)
    values (ws, 'app', app, me, mine, true, true, txt) returning id into cid;
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (ws, 'you', me, '{"en": "Headquarters commented", "zh": "总部发表评论"}'::jsonb, title, jsonb_build_object('en', left(txt, 200), 'zh', left(txt, 200)));
    per := jsonb_set(per, array[ws::text], to_jsonb(coalesce((per->>ws::text)::int, 0) + 1));
    n := n + 1;
  end loop;
  for k in select jsonb_object_keys(per) loop
    for who in select x.user_id from public.workspace_members x where x.workspace_id = k::uuid and x.role = 'owner' loop
      perform public.notice_add(k::uuid, 'hq', null, who, null, null, null,
        jsonb_build_object('en', 'Headquarters asked about ' || (per->>k) || case when (per->>k)::int = 1 then ' permit' else ' permits' end,
                           'zh', '总部询问了 ' || (per->>k) || ' 项许可'),
        jsonb_build_object('en', left(txt, 300), 'zh', left(txt, 300)));
    end loop;
  end loop;
  return n;
end $$;

-- Headquarters sets itself a reminder about permits (the review table's bulk action): a notice to its own email on
-- that day. items: application ids in one workspace, at most 60. Returns how many.
create or replace function public.hq_remind(ws uuid, p_items jsonb, p_on date, p_note text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare mine text := public.my_email(); app text; title jsonb; n int := 0; note jsonb;
begin
  if not public.hq_sees(ws) then raise exception 'Not shared with you.'; end if;
  if p_on is null or p_on < current_date or p_on > current_date + 400 then raise exception 'Pick a day in the next year.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 60 then raise exception 'Pick 1 to 60 permits.'; end if;
  note := case when btrim(coalesce(p_note, '')) <> '' then jsonb_build_object('en', left(btrim(p_note), 300), 'zh', left(btrim(p_note), 300)) end;
  for app in select value #>> '{}' from jsonb_array_elements(p_items) loop
    title := public.item_title(ws, 'app', app);
    if title is null then raise exception 'That permit is gone.'; end if;
    perform public.notice_add(ws, 'reminder', null, null, mine, 'app', app,
      jsonb_build_object('en', 'Reminder: ' || (title->>'en'), 'zh', '提醒：' || (title->>'zh')), note, p_on);
    n := n + 1;
  end loop;
  return n;
end $$;

/* ---------------------------- grants ---------------------------- */

revoke execute on function public.my_email(), public.hq_sees(uuid), public.item_title(uuid, text, text),
  public.notice_add(uuid, text, uuid, uuid, text, text, text, jsonb, jsonb, date), public.member_gone() from public, anon;
revoke execute on function public.item_title(uuid, text, text), public.notice_add(uuid, text, uuid, uuid, text, text, text, jsonb, jsonb, date),
  public.member_gone() from authenticated;
-- the read policies call these as the signed-in person
grant execute on function public.my_email(), public.hq_sees(uuid) to authenticated;
revoke execute on function public.comment_post(uuid, text, text, text, jsonb, boolean), public.comment_resolve(uuid, boolean),
  public.assign_item(uuid, text, text, uuid), public.notices_read(uuid[]), public.hq_review(), public.hq_comments(uuid, text),
  public.hq_ask(jsonb, text), public.hq_remind(uuid, jsonb, date, text) from public, anon;
grant execute on function public.comment_post(uuid, text, text, text, jsonb, boolean), public.comment_resolve(uuid, boolean),
  public.assign_item(uuid, text, text, uuid), public.notices_read(uuid[]), public.hq_review(), public.hq_comments(uuid, text),
  public.hq_ask(jsonb, text), public.hq_remind(uuid, jsonb, date, text) to authenticated;
grant select, update on public.mention_notices to service_role;
grant select on public.comments, public.assignments to service_role;
