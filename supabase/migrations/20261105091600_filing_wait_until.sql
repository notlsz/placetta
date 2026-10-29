-- A filing that waits for a day, not minutes: the agency refuses a future business start date (destinations.ts
-- startNotFuture), so the approved filing is held until the start date and the sweep files it then, like any held
-- send. The owner is told why and when; nothing is asked. At most a year ahead; the customer can still undo it.
-- Safe to run twice.
create or replace function public.filing_wait_until(p_id uuid, p_at timestamptz, p_en text, p_zh text)
returns public.filings
language plpgsql security definer set search_path = '' as $$
declare
  f public.filings;
  t timestamptz := least(greatest(p_at, now() + interval '1 minute'), now() + interval '366 days');
begin
  select * into f from public.filings where id = p_id for update;
  if f.id is null then raise exception 'No such filing.'; end if;
  if f.status = 'canceled' then raise exception 'filing_stopped: the customer stopped this filing'; end if;
  if f.agent_state is distinct from 'running' or f.submit_clicked_at is not null then
    raise exception 'filing_changed: the filing moved on (agent_state)';
  end if;
  update public.filings set agent_state = 'held', send_after = t,
    agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'held', 'ref', 'wait_start',
      'en', left(coalesce(p_en, ''), 400), 'zh', left(coalesce(p_zh, ''), 400)))
  where id = p_id returning * into f;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (f.workspace_id, 'agent', null, jsonb_build_object('en', left(coalesce(p_en, ''), 400), 'zh', left(coalesce(p_zh, ''), 400)), f.title, null);
  return f;
end $$;
revoke execute on function public.filing_wait_until(uuid, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.filing_wait_until(uuid, timestamptz, text, text) to service_role;
