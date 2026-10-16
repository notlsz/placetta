-- Send once. A filing leaves for the agency at most one time, whoever asks (two taps on Approve, a resume, a signed
-- copy, the team's two-key approval, a fax webhook, the monitor's sweep), and each workspace self-files only so many
-- faxes and letters a day. Safe to run twice.
--
--   filing_agent_step         as before, plus: it raises when asked to write submit_clicked_at a second time, and it
--                             takes expect_agent_state / expect_provider_ref in the patch, a compare-and-set: the step
--                             is refused (filing_changed) when the row has moved on since the caller read it
--   filing_claim_submit       the claim the file function makes right before anything leaves: one conditional
--                             UPDATE ... RETURNING under the row lock, plus the workspace's daily cap on fax and mail
--   filings.payload_hash      what the customer approved, without the parts that change on every approval (the PDF's
--                             path, the signature time), so the same form with the same answers can be recognized
--   filing_duplicate_of       an earlier filing in the same workspace, same form and same answers, in the last 30 days
--   webhook_events            provider event ids already handled (Telnyx fax webhooks), so a redelivery does nothing

/* ------------------------------ the step, with compare-and-set ------------------------------ */

create or replace function public.filing_agent_step(p_id uuid, p_entry jsonb, p_patch jsonb default '{}'::jsonb, p_audit boolean default true)
returns public.filings
language plpgsql security definer set search_path = '' as $$
declare
  f public.filings;
  cur public.filings;
  e jsonb := jsonb_build_object('at', now()) || coalesce(p_entry, '{}'::jsonb);
  patch jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if patch - array['status','channel','agent_state','handoff_url','provider_ref','submit_clicked_at','confirmation_number',
                   'receipt_path','requirements_checked','note','payment_url','fee_paid','attempts',
                   'expect_agent_state','expect_provider_ref'] <> '{}'::jsonb then
    raise exception 'filing_agent_step: unknown field in patch';
  end if;
  select * into cur from public.filings where id = p_id for update;
  if cur.id is null then raise exception 'No such filing.'; end if;
  if cur.status = 'canceled' and (patch ? 'submit_clicked_at' or coalesce(patch->>'status', '') in ('submitted', 'accepted')) then
    raise exception 'filing_stopped: the customer stopped this filing';
  end if;
  -- Compare-and-set: the caller read the row with this agent_state or provider_ref; anything else means someone else
  -- has already acted on it, and this step must not run.
  if patch ? 'expect_agent_state' and cur.agent_state is distinct from (patch->>'expect_agent_state') then
    raise exception 'filing_changed: the filing moved on (agent_state)';
  end if;
  if patch ? 'expect_provider_ref' and cur.provider_ref is distinct from (patch->>'expect_provider_ref') then
    raise exception 'filing_changed: the filing moved on (provider_ref)';
  end if;
  if patch ? 'submit_clicked_at' and cur.submit_clicked_at is not null then
    raise exception 'already_submitted: this filing was already sent';
  end if;
  update public.filings set
    agent_log = case when p_entry is null then agent_log else agent_log || jsonb_build_array(e) end,
    status = coalesce(patch->>'status', status),
    channel = case when patch ? 'channel' then patch->>'channel' else channel end,
    agent_state = case when patch ? 'agent_state' then patch->>'agent_state' else agent_state end,
    handoff_url = case when patch ? 'handoff_url' then patch->>'handoff_url' else handoff_url end,
    provider_ref = case when patch ? 'provider_ref' then patch->>'provider_ref' else provider_ref end,
    submit_clicked_at = case when patch ? 'submit_clicked_at' then (patch->>'submit_clicked_at')::timestamptz else submit_clicked_at end,
    confirmation_number = case when patch ? 'confirmation_number' then patch->>'confirmation_number' else confirmation_number end,
    receipt_path = case when patch ? 'receipt_path' then patch->>'receipt_path' else receipt_path end,
    requirements_checked = coalesce((patch->>'requirements_checked')::boolean, requirements_checked),
    note = case when patch ? 'note' then patch->>'note' else note end,
    payment_url = case when patch ? 'payment_url' then patch->>'payment_url' else payment_url end,
    fee_paid = case when patch ? 'fee_paid' then (patch->>'fee_paid')::numeric else fee_paid end,
    attempts = coalesce((patch->>'attempts')::int, attempts),
    agent_started_at = case when coalesce(patch->>'agent_state', '') in ('running', 'queued') then coalesce(agent_started_at, now()) else agent_started_at end
  where id = p_id and (not (patch ? 'submit_clicked_at') or submit_clicked_at is null)
  returning * into f;
  if f.id is null then raise exception 'already_submitted: this filing was already sent'; end if;
  if p_audit and p_entry ? 'en' and coalesce(p_entry->>'kind', '') <> 'quiet' then
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (f.workspace_id, 'agent', null, jsonb_build_object('en', p_entry->>'en', 'zh', coalesce(p_entry->>'zh', p_entry->>'en')), f.title,
            case when p_entry ? 'ref' and coalesce(p_entry->>'kind', '') not in ('page', 'review_page', 'submit') then jsonb_build_object('en', p_entry->>'ref', 'zh', p_entry->>'ref') end);
  end if;
  return f;
end $$;
revoke execute on function public.filing_agent_step(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.filing_agent_step(uuid, jsonb, jsonb, boolean) to service_role;

/* ------------------------------ the claim before a send ------------------------------ */

-- The file function calls this right before an email, fax or letter leaves. Exactly one caller gets the row back;
-- every other one gets an exception: filing_stopped (the customer stopped it), already_submitted (someone else claimed
-- it first) or daily_cap (this workspace has self-filed p_cap faxes and letters in the last 24 hours).
create or replace function public.filing_claim_submit(p_id uuid, p_entry jsonb, p_cap int default 10)
returns public.filings
language plpgsql security definer set search_path = '' as $$
declare
  f public.filings;
  n int;
  e jsonb := jsonb_build_object('at', now()) || coalesce(p_entry, '{}'::jsonb);
begin
  select * into f from public.filings where id = p_id for update;
  if f.id is null then raise exception 'No such filing.'; end if;
  if f.status = 'canceled' then raise exception 'filing_stopped: the customer stopped this filing'; end if;
  if f.submit_clicked_at is not null or f.status in ('submitted', 'accepted', 'rejected') then
    raise exception 'already_submitted: this filing was already sent';
  end if;
  if f.channel in ('fax', 'mail') then
    -- One claim per workspace at a time, so two filings can't both take the last send of the day.
    perform pg_advisory_xact_lock(hashtextextended('filing_cap:' || f.workspace_id::text, 0));
    select count(*) into n from public.filings
     where workspace_id = f.workspace_id and channel in ('fax', 'mail') and submit_clicked_at > now() - interval '24 hours';
    if n >= greatest(coalesce(p_cap, 10), 0) then
      raise exception 'daily_cap: % faxes and letters in the last 24 hours', n;
    end if;
  end if;
  update public.filings set submit_clicked_at = now(), agent_log = agent_log || jsonb_build_array(e)
   where id = p_id and submit_clicked_at is null
  returning * into f;
  if f.id is null then raise exception 'already_submitted: this filing was already sent'; end if;
  if e ? 'en' then
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (f.workspace_id, 'agent', null, jsonb_build_object('en', e->>'en', 'zh', coalesce(e->>'zh', e->>'en')), f.title, null);
  end if;
  return f;
end $$;
revoke execute on function public.filing_claim_submit(uuid, jsonb, int) from public, anon, authenticated;
grant execute on function public.filing_claim_submit(uuid, jsonb, int) to service_role;

/* ------------------------------ duplicates ------------------------------ */

-- What makes two approvals "the same filing": the form, each line's answer, and the attached files' names. Left out:
-- the filled PDF's storage path and the signature time, which are new on every approval.
create or replace function public.filing_payload_hash(p jsonb) returns text
language sql immutable set search_path = '' as $$
  select md5(jsonb_build_object(
    'official', coalesce(p->>'official', ''),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_array(k, v) order by k, v)
        from (select coalesce(x->>'id', x->'label'->>'en', '') as k, btrim(coalesce(x->>'value', '')) as v
                from jsonb_array_elements(case when jsonb_typeof(p->'fields') = 'array' then p->'fields' else '[]'::jsonb end) x) q
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(n order by n)
        from (select coalesce(a->>'name', '') as n
                from jsonb_array_elements(case when jsonb_typeof(p->'attachments') = 'array' then p->'attachments' else '[]'::jsonb end) a) q
    ), '[]'::jsonb)
  )::text);
$$;
revoke execute on function public.filing_payload_hash(jsonb) from public, anon;
grant execute on function public.filing_payload_hash(jsonb) to authenticated, service_role;

alter table public.filings add column if not exists payload_hash text generated always as (public.filing_payload_hash(payload)) stored;
create index if not exists filings_payload_hash on public.filings(workspace_id, payload_hash, approved_at desc);

-- An earlier filing in the same workspace with the same form and the same answers, approved in the last p_days days
-- and not canceled: {id, approved_at, status}, or null.
create or replace function public.filing_duplicate_of(p_id uuid, p_days int default 30) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', o.id, 'approved_at', o.approved_at, 'status', o.status)
    from public.filings f
    join public.filings o on o.workspace_id = f.workspace_id and o.id <> f.id and o.payload_hash = f.payload_hash
                         and coalesce(o.payload->>'official', '') = coalesce(f.payload->>'official', '')
                         and o.status <> 'canceled' and o.approved_at < f.approved_at
                         and o.approved_at > now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
   where f.id = p_id
   order by o.approved_at desc
   limit 1;
$$;
revoke execute on function public.filing_duplicate_of(uuid, int) from public, anon, authenticated;
grant execute on function public.filing_duplicate_of(uuid, int) to service_role;

/* ------------------------------ webhook events ------------------------------ */

create table if not exists public.webhook_events (
  provider text not null,
  id text not null check (length(id) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (provider, id)
);
comment on table public.webhook_events is 'Provider webhook event ids already handled, so a redelivery is ignored. Server only.';
create index if not exists webhook_events_created on public.webhook_events(created_at);
alter table public.webhook_events enable row level security;
revoke all on public.webhook_events from public, anon, authenticated;
grant select, insert, delete on public.webhook_events to service_role;
