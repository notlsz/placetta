-- Headquarters: a franchisee (or a company's store team) shares its stores' live status with a headquarters email.
-- HQ sees one read-only line per store across every franchisee that shared with it: stage, licenses current, due in
-- 30 days, overdue, applications pending, and the next item due. Never documents, logins, files, chats, memory or staff.
-- Clients never touch hq_links directly; everything goes through the functions below. Safe to run twice.

create table if not exists public.hq_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  hq_email text not null check (hq_email = lower(hq_email) and hq_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  brand text check (brand is null or length(brand) between 1 and 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
comment on table public.hq_links is 'A workspace shares its stores'' status with a headquarters email. One active link per workspace and email. Read only through hq_stores().';
create unique index if not exists hq_links_active on public.hq_links(workspace_id, hq_email) where revoked_at is null;
create index if not exists hq_links_email on public.hq_links(hq_email) where revoked_at is null;
create index if not exists hq_links_created_by on public.hq_links(created_by);
alter table public.hq_links enable row level security;
revoke all on public.hq_links from public, anon, authenticated;

-- The weekly HQ report: one row per HQ email per week (the Monday it went out), so it sends once.
create table if not exists public.hq_reports (
  hq_email text not null check (hq_email = lower(hq_email)),
  week date not null,
  sent_at timestamptz not null default now(),
  primary key (hq_email, week)
);
comment on table public.hq_reports is 'Weekly headquarters emails already sent, written by the monitor function only.';
alter table public.hq_reports enable row level security;
revoke all on public.hq_reports from public, anon, authenticated;

/* ---------------------------- reading a workspace's state, safely ---------------------------- */

-- A YYYY-MM-DD date from the saved state, or null for anything else (never an error).
create or replace function public.hq_date(v text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if v is null or v !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return left(v, 10)::date;
exception when others then return null;
end $$;

-- An English and Chinese label ({en, zh}) from the saved state, cut to 200 characters.
create or replace function public.hq_bi(v jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case jsonb_typeof(v)
    when 'object' then jsonb_build_object('en', left(coalesce(v->>'en', v->>'zh', ''), 200), 'zh', left(coalesce(v->>'zh', v->>'en', ''), 200))
    when 'string' then jsonb_build_object('en', left(v #>> '{}', 200), 'zh', left(v #>> '{}', 200))
    else jsonb_build_object('en', '', 'zh', '') end;
$$;

-- The read-only HQ summary of one workspace's state: per store, its stage and address, and the counts HQ needs.
--   items: each permit on file (by its expiry) and each due date or renewal of the store's applications. An
--          application belongs to a store when the store lists it, or to the only store when there's one.
--          A due date of an application already approved is done and doesn't count.
--   overdue: an item dated before today. due_30: today to 30 days out. current: permits more than 30 days out,
--          plus approved licenses for a store still opening. pending: the store's applications not yet approved.
--   next: the earliest item (an overdue one first).
-- Only names, dates, counts and statuses leave this function: no documents, fields, logins, chats, memory or staff.
create or replace function public.hq_summary(st jsonb) returns jsonb
language sql stable set search_path = '' as $$
  with stores as (
    select s.value as s, s.ordinality as n
      from jsonb_array_elements(case when jsonb_typeof(st->'stores') = 'array' then st->'stores' else '[]'::jsonb end) with ordinality s
     where jsonb_typeof(s.value) = 'object'
  ),
  single as (select count(*) = 1 as one from stores),
  apps as (
    select a.value->>'id' as id, coalesce(a.value->>'status', '') as status
      from jsonb_array_elements(case when jsonb_typeof(st->'apps') = 'array' then st->'apps' else '[]'::jsonb end) a
     where jsonb_typeof(a.value) = 'object' and coalesce(a.value->>'id', '') <> ''
  ),
  store_apps as (
    select s.n, a.id, a.status
      from stores s join apps a
        on (select one from single) or (jsonb_typeof(s.s->'apps') = 'array' and s.s->'apps' ? a.id)
  ),
  deadlines as (
    select d.value as d
      from jsonb_array_elements(case when jsonb_typeof(st->'deadlines') = 'array' then st->'deadlines' else '[]'::jsonb end) d
     where jsonb_typeof(d.value) = 'object' and d.value->>'kind' in ('due', 'renewal')
  ),
  items as (
    select s.n, 'permit'::text as kind, public.hq_bi(p.value->'name') as title, public.hq_date(p.value->>'expires') as d
      from stores s
      cross join lateral jsonb_array_elements(case when jsonb_typeof(s.s->'permits') = 'array' then s.s->'permits' else '[]'::jsonb end) p
     where jsonb_typeof(p.value) = 'object'
    union all
    select sa.n, dl.d->>'kind', public.hq_bi(dl.d->'title'), public.hq_date(dl.d->>'date')
      from deadlines dl join store_apps sa on sa.id = dl.d->>'app'
     where not (dl.d->>'kind' = 'due' and sa.status = 'approved')
    union all
    -- a date not tied to an application belongs to the only store
    select s.n, dl.d->>'kind', public.hq_bi(dl.d->'title'), public.hq_date(dl.d->>'date')
      from deadlines dl cross join stores s
     where (select one from single) and coalesce(dl.d->>'app', '') = ''
  ),
  counted as (
    select s.n, s.s,
      (select count(*) from items i where i.n = s.n and i.d < current_date) as overdue,
      (select count(*) from items i where i.n = s.n and i.d between current_date and current_date + 30) as due_30,
      (select count(*) from items i where i.n = s.n and i.kind = 'permit' and i.d > current_date + 30) as permits_ok,
      (select count(*) from store_apps sa where sa.n = s.n and sa.status = 'approved') as approved,
      (select count(*) from store_apps sa where sa.n = s.n and sa.status <> 'approved') as pending,
      (select jsonb_build_object('kind', i.kind, 'title', i.title, 'date', i.d)
         from items i where i.n = s.n and i.d is not null order by i.d limit 1) as next
      from stores s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(left(c.s->>'id', 80), 'store-' || c.n),
      'name', public.hq_bi(c.s->'name'),
      'stage', case when c.s->>'stage' = 'open' then 'open' else 'opening' end,
      'address', left(coalesce(c.s->>'address', ''), 200),
      'planned_open', public.hq_date(c.s->>'plannedOpen'),
      'projected_open', public.hq_date(c.s->>'projectedOpen'),
      'opened', public.hq_date(c.s->>'opened'),
      'grade', case when c.s->'grade'->>'letter' in ('A', 'B', 'C', 'P') then c.s->'grade'->>'letter' end,
      'current', c.permits_ok + case when c.s->>'stage' = 'open' then 0 else c.approved end,
      'due_30', c.due_30,
      'overdue', c.overdue,
      'pending', c.pending,
      'status', case when c.overdue > 0 then 'overdue' when c.due_30 > 0 then 'due' else 'current' end,
      'next', c.next)
    order by c.n), '[]'::jsonb)
  from counted c;
$$;

revoke execute on function public.hq_date(text), public.hq_bi(jsonb), public.hq_summary(jsonb) from public, anon, authenticated;

/* ---------------------------- the franchisee's side: share, unshare, list ---------------------------- */

create or replace function public.hq_share(ws uuid, p_email text, p_brand text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(coalesce(p_email, ''))); b text := nullif(left(trim(coalesce(p_brand, '')), 120), ''); lid uuid;
begin
  if not public.is_owner(ws) then raise exception 'Only an owner can share with headquarters.'; end if;
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
  perform 1 from public.workspaces where id = ws for update;
  update public.hq_links set brand = b where workspace_id = ws and hq_email = e and revoked_at is null returning id into lid;
  if lid is not null then return lid; end if;
  if (select count(*) from public.hq_links where workspace_id = ws and revoked_at is null) >= 10 then
    raise exception 'Up to 10 headquarters emails per workspace. Remove one first.';
  end if;
  insert into public.hq_links(workspace_id, hq_email, brand, created_by) values (ws, e, b, auth.uid()) returning id into lid;
  perform public.audit_team(ws, 'Shared store status with headquarters', '与总部共享门店状态', e);
  return lid;
end $$;

create or replace function public.hq_unshare(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid; e text;
begin
  select workspace_id, hq_email into ws, e from public.hq_links where id = p_id and revoked_at is null;
  if ws is null then raise exception 'That link is gone.'; end if;
  if not public.is_owner(ws) then raise exception 'Only an owner can stop sharing with headquarters.'; end if;
  update public.hq_links set revoked_at = now() where id = p_id;
  perform public.audit_team(ws, 'Stopped sharing store status with headquarters', '停止与总部共享门店状态', e);
end $$;

create or replace function public.hq_links_for(ws uuid) returns table (id uuid, hq_email text, brand text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(ws) then raise exception 'Not your workspace.'; end if;
  return query
    select l.id, l.hq_email, l.brand, l.created_at
      from public.hq_links l
     where l.workspace_id = ws and l.revoked_at is null
     order by l.created_at;
end $$;

/* ---------------------------- headquarters' side ---------------------------- */

-- Every workspace shared with the signed-in person's email, once that email is proven (as for team invites).
create or replace function public.hq_stores() returns table (workspace_id uuid, name text, brand text, stores jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select u.id, lower(u.email) as email into me from auth.users u where u.id = auth.uid();
  if me.id is null or me.email is null or not public.email_proven(me.id) or not public.mfa_ok() then return; end if;
  return query
    select w.id, w.name, l.brand, public.hq_summary(w.state)
      from public.hq_links l join public.workspaces w on w.id = l.workspace_id
     where l.hq_email = me.email and l.revoked_at is null
     order by coalesce(l.brand, ''), w.name;
end $$;

-- The monitor's weekly report: every active link with its workspace's summary. Server only.
create or replace function public.hq_weekly() returns table (hq_email text, workspace_id uuid, name text, brand text, stores jsonb)
language sql stable security definer set search_path = '' as $$
  select l.hq_email, w.id, w.name, l.brand, public.hq_summary(w.state)
    from public.hq_links l join public.workspaces w on w.id = l.workspace_id
   where l.revoked_at is null
   order by l.hq_email, coalesce(l.brand, ''), w.name;
$$;

revoke execute on function public.hq_share(uuid, text, text), public.hq_unshare(uuid), public.hq_links_for(uuid), public.hq_stores() from public, anon;
grant execute on function public.hq_share(uuid, text, text), public.hq_unshare(uuid), public.hq_links_for(uuid), public.hq_stores() to authenticated;
revoke execute on function public.hq_weekly() from public, anon, authenticated;
grant execute on function public.hq_weekly() to service_role;
