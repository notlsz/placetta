-- What Odelia did this month, measured from the records, never invented. The same definitions as src/monthly.ts (the
-- sample workspace's numbers); the end-to-end test checks the two agree on a real workspace.
--   1. agent_runs keeps when Odelia's first words showed (first_text_at) and when the answer was done (done_at),
--      stamped by the database as the run is saved, so no code path can forget or fake them.
--   2. odelia_month_detail(ws, month): one workspace's numbers with the lists behind them (members, the team, the server)
--   3. odelia_month_hq(month): each franchisee that shared its stores with this headquarters email, numbers only
--   4. odelia_month_company(month): every workspace, for the Placetta team to quote (Ops)
-- Hours saved is left out on purpose: nothing documents a time per task to derive it from.
-- Safe to run twice.

/* ------------------------------ 1. the run clock ------------------------------ */

alter table public.agent_runs add column if not exists first_text_at timestamptz;
alter table public.agent_runs add column if not exists done_at timestamptz;
comment on column public.agent_runs.first_text_at is 'When the person first saw Odelia''s words: the first draft saved while the answer streamed (or the answer itself). Set by agent_runs_clock.';
comment on column public.agent_runs.done_at is 'When the answer was done (status became done). Set by agent_runs_clock.';

-- Runs that finished before the clock existed: their finish time is known (the row's last update), their first words aren't.
update public.agent_runs set done_at = updated_at where status = 'done' and done_at is null;

create or replace function public.agent_runs_clock() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- only while the run is live: a later save (a poll marking it seen) never moves either time
  if old.status = 'running' then
    if new.first_text_at is null and (coalesce(new.draft, '') <> '' or new.status = 'done') then new.first_text_at := now(); end if;
    if new.done_at is null and new.status = 'done' then new.done_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists agent_runs_clock on public.agent_runs;
create trigger agent_runs_clock before update on public.agent_runs for each row execute function public.agent_runs_clock();
grant select (first_text_at, done_at) on public.agent_runs to authenticated;
create index if not exists agent_runs_month on public.agent_runs (created_at) where kind = 'task';

/* ------------------------------ 2. one workspace ------------------------------ */

-- The numbers and the lists behind them. No access check: the functions below decide who may call it.
create or replace function public.odelia_month_of(ws uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  mo date := date_trunc('month', coalesce(p_month, current_date))::date;
  st jsonb; apps jsonb; approvals jsonb; deadlines jsonb; res jsonb;
  today text := to_char(current_date, 'YYYY-MM-DD');
begin
  select coalesce(w.state, '{}'::jsonb) into st from public.workspaces w where w.id = ws;
  if st is null then return null; end if;
  apps := case when jsonb_typeof(st->'apps') = 'array' then st->'apps' else '[]'::jsonb end;
  approvals := case when jsonb_typeof(st->'approvals') = 'array' then st->'approvals' else '[]'::jsonb end;
  deadlines := case when jsonb_typeof(st->'deadlines') = 'array' then st->'deadlines' else '[]'::jsonb end;
  with runs as (
    select r.id, left(r.prompt, 120) as prompt, r.created_at,
      case when r.first_text_at is not null then round(extract(epoch from (r.first_text_at - r.created_at)) * 1000)::bigint end as first_ms,
      case when r.status = 'done' and r.done_at is not null then round(extract(epoch from (r.done_at - r.created_at)) * 1000)::bigint end as done_ms
    from public.agent_runs r
    where r.workspace_id = ws and r.kind = 'task' and r.created_at >= mo and r.created_at < mo + interval '1 month'
  )
  select jsonb_build_object(
    'month', to_char(mo, 'YYYY-MM-DD'),
    'plan_ms', case when jsonb_typeof(st->'firstPlan'->'ms') = 'number' then round((st->'firstPlan'->>'ms')::numeric)::bigint end,
    'plan_at', st->'firstPlan'->>'at',
    'plan_apps', case when jsonb_typeof(st->'firstPlan'->'apps') = 'number' then (st->'firstPlan'->>'apps')::numeric::int end,
    'runs_count', (select count(*) from runs),
    'runs', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'prompt', x.prompt, 'created_at', x.created_at, 'first_ms', x.first_ms, 'done_ms', x.done_ms) order by x.created_at desc), '[]'::jsonb)
             from (select * from runs order by created_at desc limit 50) x),
    'median_first_ms', (select round(percentile_cont(0.5) within group (order by first_ms))::bigint from runs where first_ms >= 0),
    'median_done_ms', (select round(percentile_cont(0.5) within group (order by done_ms))::bigint from runs where done_ms >= 0),
    'mapped', (select coalesce(jsonb_agg(jsonb_build_object('id', a->>'id', 'title', a->'name', 'status', a->>'status')), '[]'::jsonb) from jsonb_array_elements(apps) a),
    'filled', (select coalesce(jsonb_agg(jsonb_build_object('id', a->>'id', 'title', a->'name', 'status', a->>'status')), '[]'::jsonb) from jsonb_array_elements(apps) a
               where jsonb_typeof(a->'fields') = 'array' and jsonb_array_length(a->'fields') > 0
                 and not exists (select 1 from jsonb_array_elements(a->'fields') f where public.is_blank_value(f->>'value'))),
    'waiting', (select coalesce(jsonb_agg(jsonb_build_object('id', p->>'id', 'title', p->'title', 'at', p->>'at')), '[]'::jsonb) from jsonb_array_elements(approvals) p
                where coalesce(p->>'kind', '') <> 'pay'),
    'submitted', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'at', f.submitted_at) order by f.submitted_at desc), '[]'::jsonb) from public.filings f
                  where f.workspace_id = ws and f.submitted_at >= mo and f.submitted_at < mo + interval '1 month'),
    'approved', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'at', f.decided_at) order by f.decided_at desc), '[]'::jsonb) from public.filings f
                 where f.workspace_id = ws and f.status = 'accepted' and f.decided_at >= mo and f.decided_at < mo + interval '1 month'),
    'renewals', (select coalesce(jsonb_agg(jsonb_build_object('id', d->>'id', 'title', d->'title', 'date', d->>'date') order by d->>'date'), '[]'::jsonb) from jsonb_array_elements(deadlines) d
                 where d->>'kind' = 'renewal' and d->>'date' >= today)
  ) into res;
  return res;
end $$;

-- One workspace's numbers as counts, for the views across workspaces (never a prompt, a title or a name of a filing).
create or replace function public.odelia_month_row(d jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'plan_ms', d->'plan_ms', 'runs', coalesce((d->>'runs_count')::int, 0), 'median_first_ms', d->'median_first_ms', 'median_done_ms', d->'median_done_ms',
    'mapped', jsonb_array_length(d->'mapped'), 'filled', jsonb_array_length(d->'filled'), 'waiting', jsonb_array_length(d->'waiting'),
    'oldest_waiting_at', (select min(x->>'at') from jsonb_array_elements(d->'waiting') x where x->>'at' is not null),
    'submitted', jsonb_array_length(d->'submitted'), 'approved', jsonb_array_length(d->'approved'), 'renewals', jsonb_array_length(d->'renewals'))
$$;

-- Several workspaces: a row each (busiest first), and the totals, whose medians are over every run, not each workspace's.
create or replace function public.odelia_month_across(ids uuid[], p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  mo date := date_trunc('month', coalesce(p_month, current_date))::date;
  out_rows jsonb; tot jsonb;
begin
  with d as (select w.id, w.name, public.odelia_month_of(w.id, mo) as m from public.workspaces w where w.id = any(ids)),
  r as (select jsonb_build_object('workspace_id', d.id, 'name', d.name) || public.odelia_month_row(d.m) as row from d where d.m is not null)
  select coalesce(jsonb_agg(r.row order by (r.row->>'submitted')::int + (r.row->>'approved')::int + (r.row->>'runs')::int desc, r.row->>'name'), '[]'::jsonb) into out_rows from r;
  with runs as (
    select case when x.first_text_at is not null then extract(epoch from (x.first_text_at - x.created_at)) * 1000 end as first_ms,
           case when x.status = 'done' and x.done_at is not null then extract(epoch from (x.done_at - x.created_at)) * 1000 end as done_ms
      from public.agent_runs x where x.workspace_id = any(ids) and x.kind = 'task' and x.created_at >= mo and x.created_at < mo + interval '1 month'
  )
  select jsonb_build_object(
    'median_plan_ms', (select round(percentile_cont(0.5) within group (order by (e->>'plan_ms')::numeric))::bigint from jsonb_array_elements(out_rows) e where jsonb_typeof(e->'plan_ms') = 'number'),
    'runs', (select count(*) from runs),
    'median_first_ms', (select round(percentile_cont(0.5) within group (order by first_ms))::bigint from runs where first_ms >= 0),
    'median_done_ms', (select round(percentile_cont(0.5) within group (order by done_ms))::bigint from runs where done_ms >= 0),
    'mapped', (select coalesce(sum((e->>'mapped')::int), 0) from jsonb_array_elements(out_rows) e),
    'filled', (select coalesce(sum((e->>'filled')::int), 0) from jsonb_array_elements(out_rows) e),
    'waiting', (select coalesce(sum((e->>'waiting')::int), 0) from jsonb_array_elements(out_rows) e),
    'oldest_waiting_at', (select min(e->>'oldest_waiting_at') from jsonb_array_elements(out_rows) e where e->>'oldest_waiting_at' is not null),
    'submitted', (select coalesce(sum((e->>'submitted')::int), 0) from jsonb_array_elements(out_rows) e),
    'approved', (select coalesce(sum((e->>'approved')::int), 0) from jsonb_array_elements(out_rows) e),
    'renewals', (select coalesce(sum((e->>'renewals')::int), 0) from jsonb_array_elements(out_rows) e)
  ) into tot;
  return jsonb_build_object('month', to_char(mo, 'YYYY-MM-DD'), 'workspaces', jsonb_array_length(out_rows), 'totals', tot, 'rows', out_rows);
end $$;

/* ------------------------------ 2-4. who may see what ------------------------------ */

create or replace function public.odelia_month_detail(ws uuid, p_month date default current_date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_service() or public.is_member(ws) or public.is_staff()) then raise exception 'Not your workspace.'; end if;
  return public.odelia_month_of(ws, p_month);
end $$;

-- Headquarters: the franchisees that shared with this email, once the email is proven (as hq_stores). Counts only.
create or replace function public.odelia_month_hq(p_month date default current_date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select u.id, lower(u.email) as email into me from auth.users u where u.id = auth.uid();
  if me.id is null or me.email is null or not public.email_proven(me.id) or not public.mfa_ok() then return null; end if;
  return public.odelia_month_across(array(select l.workspace_id from public.hq_links l where l.hq_email = me.email and l.revoked_at is null), p_month);
end $$;

-- The Placetta team: every workspace, so the founder quotes only what the records show.
create or replace function public.odelia_month_company(p_month date default current_date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_service() or public.is_staff()) then raise exception 'Placetta team only.'; end if;
  return public.odelia_month_across(array(select w.id from public.workspaces w), p_month);
end $$;

revoke execute on function public.odelia_month_of(uuid, date), public.odelia_month_row(jsonb), public.odelia_month_across(uuid[], date) from public, anon, authenticated;
grant execute on function public.odelia_month_of(uuid, date), public.odelia_month_row(jsonb), public.odelia_month_across(uuid[], date) to service_role;
revoke execute on function public.odelia_month_detail(uuid, date), public.odelia_month_hq(date), public.odelia_month_company(date) from public, anon;
grant execute on function public.odelia_month_detail(uuid, date), public.odelia_month_hq(date), public.odelia_month_company(date) to authenticated, service_role;
revoke execute on function public.agent_runs_clock() from public, anon, authenticated;
