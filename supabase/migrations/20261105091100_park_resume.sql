-- A parked run (worker/filer/src/run.ts ParkLot): a run waiting on a person frees its worker slot and keeps its browser.
-- The filing is in needs_you with provider_ref 'parked:<key>', the key known only to the worker that parked it. When the
-- person taps Done in the worker's live view, or the page shows the step is done, the worker queues the filing again
-- with that key, and whichever slot claims it carries on on the kept browser. "I've done it" in the app queues it as
-- before. Nothing else changes: submit_clicked_at and the two-key rules stay on the filing.
create or replace function public.filer_resume_parked(p_id uuid, p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if coalesce(length(p_key), 0) < 32 then return false; end if;
  -- the filer's change without a run token: only this one, only from here (filer_filing_guard)
  perform set_config('placetta.parked_resume', p_id::text, true);
  update public.filings set agent_state = 'queued', handoff_url = null, provider_ref = null,
    agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'resume',
      'en', 'You finished your step. Odelia carries on.', 'zh', '您已完成这一步，Odelia 继续办理。'))
  where id = p_id and agent_state = 'needs_you' and provider_ref = 'parked:' || p_key
    and status not in ('canceled', 'submitted', 'accepted', 'rejected');
  get diagnostics n = row_count;
  perform set_config('placetta.parked_resume', '', true);
  return n = 1;
end $$;

create or replace function public.filer_filing_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.filer_caller() then return new; end if;
  if old.agent_state = 'queued' and new.agent_state = 'running' and old.id = new.id then return new; end if;
  -- filer_resume_parked: a parked filing back to the queue, nothing else
  if coalesce(current_setting('placetta.parked_resume', true), '') = new.id::text and old.agent_state = 'needs_you'
    and new.agent_state = 'queued' and old.provider_ref like 'parked:%' and new.provider_ref is null
    and new.submit_clicked_at is not distinct from old.submit_clicked_at and new.status = old.status then return new; end if;
  if not public.filer_run_ok(new.id) then raise exception 'run_token_invalid'; end if;
  return new;
end $$;

revoke execute on function public.filer_resume_parked(uuid, text) from public, anon, authenticated;
grant execute on function public.filer_resume_parked(uuid, text) to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'grant execute on function public.filer_resume_parked(uuid, text) to placetta_filer';
  end if;
end $$;
