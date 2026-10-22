-- Stage alerts: the moment a filing reaches a new stage, the people in charge of it hear right away.
--
-- Before this, a filing moving to submitted, approved by the agency, returned or "action needed" was only noticed by the
-- monitor's once-a-day run, so an owner could learn of it up to a day late. Now:
--   1. filings_stage_alert (after update) asks the monitor function to announce the new stage ({action: "stage"}),
--      through pg_net, so the update itself never waits on it and never fails because of it. The monitor writes the
--      Update, then texts or emails each person in charge (the owners and the member who approved it) the way they
--      chose, and posts to the workspace's linked team chats (supabase/functions/monitor/stage.ts).
--   2. updates and filings join the supabase_realtime publication, so an open app sees the new stage on screen at
--      once (row level security still decides who receives each row: members of that workspace, and the team).
-- Safe to run twice.

create or replace function public.filings_stage_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if not (new.status is distinct from old.status and new.status in ('in_progress', 'submitted', 'needs_info', 'accepted', 'rejected'))
     and not (new.agent_state is distinct from old.agent_state and new.agent_state = 'needs_you') then
    return null;
  end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'monitor_key' limit 1;
  if k is null then return null; end if;
  begin
    perform net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/monitor',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', k),
      body := jsonb_build_object('action', 'stage', 'filing_id', new.id),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'stage alert for filing % not queued: %', new.id, sqlerrm;   -- the morning run still announces it
  end;
  return null;
end $$;
revoke all on function public.filings_stage_alert() from public, anon, authenticated;

drop trigger if exists filings_stage_alert on public.filings;
create trigger filings_stage_alert after update of status, agent_state on public.filings
  for each row execute function public.filings_stage_alert();

-- live on screen: the app listens for its workspace's new updates and filing changes
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'updates') then
      alter publication supabase_realtime add table public.updates;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'filings') then
      alter publication supabase_realtime add table public.filings;
    end if;
  end if;
end $$;
