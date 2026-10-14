-- Stop: the customer can stop a filing that's on its way, up to the moment anything leaves for the agency.
-- One row lock decides the race with the submit: whichever comes first wins. Once Placetta has written
-- submit_clicked_at (just before pressing submit, sending the fax or the email, or mailing the letter) a stop is refused;
-- once a filing is stopped, writing submit_clicked_at is refused, so nothing can leave after a stop.

create or replace function public.stop_agent_filing(p_id uuid, p_by text)
returns public.filings
language plpgsql security definer set search_path = '' as $$
declare f public.filings;
begin
  select * into f from public.filings where id = p_id for update;
  if f.id is null then raise exception 'No such filing.'; end if;
  if f.submit_clicked_at is not null or f.status in ('submitted', 'accepted', 'rejected') then
    raise exception 'too_late: it has already been sent to the agency';
  end if;
  if f.status = 'canceled' then return f; end if;
  update public.filings set status = 'canceled', agent_state = 'failed', handoff_url = null, provider_ref = null,
    agent_finished_at = now(),
    agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'stopped',
      'en', 'Stopped before anything was sent to the agency', 'zh', '已在发送给机构之前停止', 'ref', left(coalesce(p_by, ''), 200)))
  where id = p_id returning * into f;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (f.workspace_id, 'you', null, jsonb_build_object('en', 'Stopped the filing before it was sent', 'zh', '在发送前停止了申请'), f.title,
          jsonb_build_object('en', left(coalesce(p_by, ''), 200), 'zh', left(coalesce(p_by, ''), 200)));
  return f;
end $$;
revoke execute on function public.stop_agent_filing(uuid, text) from public, anon, authenticated;
grant execute on function public.stop_agent_filing(uuid, text) to service_role;

-- The agent's step function, as before, plus: a stopped filing never gets a submit.
create or replace function public.filing_agent_step(p_id uuid, p_entry jsonb, p_patch jsonb default '{}'::jsonb, p_audit boolean default true)
returns public.filings
language plpgsql security definer set search_path = '' as $$
declare
  f public.filings;
  st text;
  e jsonb := jsonb_build_object('at', now()) || coalesce(p_entry, '{}'::jsonb);
begin
  if p_patch - array['status','channel','agent_state','handoff_url','provider_ref','submit_clicked_at','confirmation_number',
                     'receipt_path','requirements_checked','note','payment_url','fee_paid','attempts'] <> '{}'::jsonb then
    raise exception 'filing_agent_step: unknown field in patch';
  end if;
  select status into st from public.filings where id = p_id for update;
  if st = 'canceled' and (p_patch ? 'submit_clicked_at' or coalesce(p_patch->>'status', '') in ('submitted', 'accepted')) then
    raise exception 'filing_stopped: the customer stopped this filing';
  end if;
  update public.filings set
    agent_log = case when p_entry is null then agent_log else agent_log || jsonb_build_array(e) end,
    status = coalesce(p_patch->>'status', status),
    channel = case when p_patch ? 'channel' then p_patch->>'channel' else channel end,
    agent_state = case when p_patch ? 'agent_state' then p_patch->>'agent_state' else agent_state end,
    handoff_url = case when p_patch ? 'handoff_url' then p_patch->>'handoff_url' else handoff_url end,
    provider_ref = case when p_patch ? 'provider_ref' then p_patch->>'provider_ref' else provider_ref end,
    submit_clicked_at = case when p_patch ? 'submit_clicked_at' then coalesce(submit_clicked_at, (p_patch->>'submit_clicked_at')::timestamptz) else submit_clicked_at end,
    confirmation_number = case when p_patch ? 'confirmation_number' then p_patch->>'confirmation_number' else confirmation_number end,
    receipt_path = case when p_patch ? 'receipt_path' then p_patch->>'receipt_path' else receipt_path end,
    requirements_checked = coalesce((p_patch->>'requirements_checked')::boolean, requirements_checked),
    note = case when p_patch ? 'note' then p_patch->>'note' else note end,
    payment_url = case when p_patch ? 'payment_url' then p_patch->>'payment_url' else payment_url end,
    fee_paid = case when p_patch ? 'fee_paid' then (p_patch->>'fee_paid')::numeric else fee_paid end,
    attempts = coalesce((p_patch->>'attempts')::int, attempts),
    agent_started_at = case when coalesce(p_patch->>'agent_state', '') in ('running', 'queued') then coalesce(agent_started_at, now()) else agent_started_at end
  where id = p_id
  returning * into f;
  if f.id is null then raise exception 'No such filing.'; end if;
  if p_audit and p_entry ? 'en' and coalesce(p_entry->>'kind', '') <> 'quiet' then
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (f.workspace_id, 'agent', null, jsonb_build_object('en', p_entry->>'en', 'zh', coalesce(p_entry->>'zh', p_entry->>'en')), f.title,
            case when p_entry ? 'ref' and coalesce(p_entry->>'kind', '') not in ('page', 'review_page', 'submit') then jsonb_build_object('en', p_entry->>'ref', 'zh', p_entry->>'ref') end);
  end if;
  return f;
end $$;
revoke execute on function public.filing_agent_step(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.filing_agent_step(uuid, jsonb, jsonb, boolean) to service_role;
