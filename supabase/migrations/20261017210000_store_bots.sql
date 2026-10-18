-- Store bots under a chief of staff, and every job's replay (src/jobs.ts, src/replay.ts,
-- supabase/functions/agent-run/family.ts).
--   agent_runs.parent_run: a store's run points at the run that split the work across stores, and goes with it
--   agent_runs.job_id, store_id: the store's job that run works, and its store
--   status 'queued': a store's run waiting for a free hand (the workspace's parallel cap, ODELIA_PARALLEL)
--   status 'waiting': a run that split work, waiting for its stores' runs before it writes the one summary
--   steps already holds every run's moments (when, which bot, which tool, what changed); members already read it, and
--   nothing secret goes into it (src/guard.ts redact)
--   poll_agent_run also returns the run's store runs and where each stands; stop_agent_run stops them with it
--   the watchdog also runs while a store's run waits its turn, or a run waits on stores that have all finished
--   this month's numbers (odelia_month_of and odelia_month_across, from 20261017200000_odelia_metrics) count what
--   people asked for: a store's run is part of the request that split it, not a request of its own
-- Safe to run twice.

alter table public.agent_runs add column if not exists parent_run uuid references public.agent_runs(id) on delete cascade;
alter table public.agent_runs add column if not exists job_id text;
alter table public.agent_runs add column if not exists store_id text;
alter table public.agent_runs drop constraint if exists agent_runs_job_id_check;
alter table public.agent_runs add constraint agent_runs_job_id_check check (job_id is null or length(job_id) between 1 and 80);
alter table public.agent_runs drop constraint if exists agent_runs_store_id_check;
alter table public.agent_runs add constraint agent_runs_store_id_check check (store_id is null or length(store_id) between 1 and 80);
alter table public.agent_runs drop constraint if exists agent_runs_parent_check;
alter table public.agent_runs add constraint agent_runs_parent_check check (parent_run is null or parent_run <> id);
alter table public.agent_runs drop constraint if exists agent_runs_status_check;
alter table public.agent_runs add constraint agent_runs_status_check check (status in ('running', 'queued', 'waiting', 'done', 'failed', 'stopped'));
create index if not exists agent_runs_parent on public.agent_runs (parent_run) where parent_run is not null;
create index if not exists agent_runs_queued on public.agent_runs (workspace_id, created_at) where status = 'queued';
create index if not exists agent_runs_waiting on public.agent_runs (updated_at) where status = 'waiting';
grant select (parent_run, job_id, store_id) on public.agent_runs to authenticated;

create or replace function public.poll_agent_run(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.agent_runs; kids jsonb;
begin
  select * into r from public.agent_runs where id = p_id;
  if r.id is null or not public.is_member(r.workspace_id) then raise exception 'Not your workspace.'; end if;
  update public.agent_runs set seen_at = now() where id = p_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status, 'job_id', c.job_id, 'store_id', c.store_id, 'updated_at', c.updated_at) order by c.created_at), '[]'::jsonb)
    into kids from public.agent_runs c where c.parent_run = r.id;
  return jsonb_build_object('id', r.id, 'kind', r.kind, 'prompt', r.prompt, 'status', r.status, 'steps', r.steps, 'draft', r.draft,
    'reply', r.reply, 'error', r.error, 'created_at', r.created_at, 'updated_at', r.updated_at,
    'parent_run', r.parent_run, 'job_id', r.job_id, 'store_id', r.store_id, 'children', kids);
end $$;
revoke execute on function public.poll_agent_run(uuid) from public, anon;
grant execute on function public.poll_agent_run(uuid) to authenticated;

-- Stopping a run stops the stores' runs it started too: nothing keeps working on a job the person stopped.
create or replace function public.stop_agent_run(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  select workspace_id into ws from public.agent_runs where id = p_id;
  if ws is null or not public.is_member(ws) then raise exception 'Not your workspace.'; end if;
  update public.agent_runs set status = 'stopped', updated_at = now()
   where (id = p_id or parent_run = p_id) and workspace_id = ws and status in ('running', 'queued', 'waiting');
end $$;
revoke execute on function public.stop_agent_run(uuid) from public, anon;
grant execute on function public.stop_agent_run(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; the agent watchdog is not scheduled.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-agent-watchdog';
  perform cron.schedule('placetta-agent-watchdog', '*/2 * * * *', $job$
    select net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/agent-run',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)),
      body := '{"action":"watchdog"}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from public.agent_runs where status = 'running' and heartbeat_at < now() - interval '3 minutes')
       or exists (select 1 from public.agent_runs where status = 'queued' and created_at < now() - interval '2 minutes')
       or exists (select 1 from public.agent_runs p where p.status = 'waiting' and p.updated_at < now() - interval '1 minute'
                    and not exists (select 1 from public.agent_runs c where c.parent_run = p.id and c.status in ('running', 'queued')));
  $job$);
end $$;

/* ------------------------------ this month's numbers: a store's run isn't a request ------------------------------ */

-- The same two as in 20261017200000_odelia_metrics, with store runs left out (src/monthly.ts gets the same runs).
-- create or replace keeps who may call them.
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
    where r.workspace_id = ws and r.kind = 'task' and r.parent_run is null and r.created_at >= mo and r.created_at < mo + interval '1 month'
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

-- across workspaces (headquarters, the Placetta team): the totals count the same requests as each row
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
      from public.agent_runs x where x.workspace_id = any(ids) and x.kind = 'task' and x.parent_run is null and x.created_at >= mo and x.created_at < mo + interval '1 month'
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
