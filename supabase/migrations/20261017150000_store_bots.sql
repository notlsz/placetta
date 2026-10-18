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
