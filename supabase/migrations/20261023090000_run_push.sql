-- Live run updates (supabase/functions/agent-run/push.ts): agent-run broadcasts each run's progress on the private
-- Realtime channel "run:<run id>". Only members of the run's workspace may listen; nobody may send from the app (the
-- server sends with its own key, which Realtime authorization doesn't apply to).
-- Safe to run twice. Skipped where the realtime schema doesn't exist (a plain Postgres for tests).

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not found: run updates stay on polling';
    return;
  end if;
  drop policy if exists "members hear their runs" on realtime.messages;
  create policy "members hear their runs" on realtime.messages
    for select to authenticated
    using (
      realtime.messages.extension = 'broadcast'
      and realtime.topic() like 'run:%'
      and exists (
        select 1 from public.agent_runs r
        where r.id::text = substr(realtime.topic(), 5)
          and public.is_member(r.workspace_id)
      )
    );
end $$;
