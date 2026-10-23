-- Synthetic workspaces: the production probe (scripts/probe, .github/workflows/probe.yml) runs real licenses through the
-- live stack, from the request to Odelia to the agency's decision, without anything reaching an agency or a person.
--
-- A workspace with synthetic = true:
--   * never sends a filing: the file function checks it and picks its channel and destination exactly as for a
--     customer, then records "Test run: nothing was sent" instead of emailing, faxing, mailing or queuing a portal run
--     (supabase/functions/file/index.ts, start)
--   * never creates a task for the Placetta team (teamTask)
--   * teaches the network nothing: no lessons from its runs or its agency decisions (filings_learn below, and
--     learnFromRun / gradeOnline in agent-run)
-- Only the service role sets it; a member can't make their own workspace synthetic (or turn it off), so it can't be
-- used to dodge anything or to fake a test. The probe deletes its workspaces when it finishes.
-- Safe to run twice.

alter table public.workspaces add column if not exists synthetic boolean not null default false;
comment on column public.workspaces.synthetic is 'A production probe workspace (scripts/probe): filings are checked but never sent, no team tasks, no learning. Set only by the service role.';

create or replace function public.workspaces_synthetic_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then return new; end if;
  if tg_op = 'INSERT' and new.synthetic then raise exception 'synthetic is set by the service role only' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and new.synthetic is distinct from old.synthetic then raise exception 'synthetic is set by the service role only' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function public.workspaces_synthetic_guard() from public, anon, authenticated;
drop trigger if exists workspaces_synthetic_guard on public.workspaces;
create trigger workspaces_synthetic_guard before insert or update of synthetic on public.workspaces
  for each row execute function public.workspaces_synthetic_guard();

-- the network learns from real agency decisions only
create or replace function public.filings_learn() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('accepted', 'rejected', 'needs_info') and new.status is distinct from old.status
     and (new.status = 'accepted' or new.note is not null)
     and not exists (select 1 from public.workspaces w where w.id = new.workspace_id and w.synthetic) then
    insert into public.learning_queue (workspace_id, filing_id, status) values (new.workspace_id, new.id, new.status)
    on conflict (filing_id, status) do nothing;
  end if;
  return null;
end $$;
