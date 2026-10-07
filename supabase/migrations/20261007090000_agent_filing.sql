-- Agent self-filing: the agent's state on each filing, the queue the portal worker claims from, portal skills
-- that replay, and team tasks. Nothing is dropped. Safe to run twice.
--
-- Ground rules the database enforces:
--   * The approved payload stays frozen (unchanged from before): one approval, one submission.
--   * Customers can't touch any agent column, except "I've done my part, carry on" (needs_you -> queued).
--   * A run that may have pressed submit (submit_clicked_at set) is never put back in the queue.

alter table public.filings
  add column if not exists channel text check (channel in ('email','fax','mail','portal','team')),
  add column if not exists agent_state text check (agent_state in ('queued','running','needs_you','done','failed','handoff')),
  add column if not exists agent_log jsonb not null default '[]'::jsonb,
  add column if not exists handoff_url text,
  add column if not exists provider_ref text,
  add column if not exists submit_clicked_at timestamptz,
  add column if not exists agent_started_at timestamptz,
  add column if not exists agent_finished_at timestamptz,
  add column if not exists attempts int not null default 0;
comment on column public.filings.provider_ref is 'Fax id, letter id, email message id or portal session id.';
comment on column public.filings.submit_clicked_at is 'Written before the final submit. A retry that finds it set checks the agency instead of submitting again.';
create index if not exists filings_agent_queue on public.filings(agent_state, updated_at)
  where agent_state in ('queued','running');

create or replace function public.filings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  customer boolean := auth.uid() is not null and not public.is_staff();
  carry_on boolean;
begin
  if tg_op = 'INSERT' then
    if customer then
      new.status := 'requested'; new.approved_by := auth.uid(); new.approved_at := now();
      new.assigned_to := null; new.requirements_checked := false; new.confirmation_number := null;
      new.fee_paid := null; new.receipt_path := null; new.note := null; new.submitted_at := null; new.decided_at := null;
      new.payment_url := null; new.customer_paid_at := null;
      new.channel := null; new.agent_state := null; new.agent_log := '[]'::jsonb; new.handoff_url := null;
      new.provider_ref := null; new.submit_clicked_at := null; new.agent_started_at := null; new.agent_finished_at := null;
      new.attempts := 0;
    end if;
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;

  if new.workspace_id <> old.workspace_id or new.app_id <> old.app_id or new.payload is distinct from old.payload
     or new.approved_by <> old.approved_by or new.approved_at <> old.approved_at or new.created_at <> old.created_at then
    raise exception 'What the customer approved can''t be changed. Ask them to approve a new filing.';
  end if;

  if customer then
    carry_on := old.agent_state = 'needs_you' and new.agent_state = 'queued' and new.status = old.status;
    if carry_on then
      null;
    elsif old.status = 'requested' and new.status = 'canceled' and (old.agent_state is null or old.agent_state in ('handoff', 'needs_you')) then
      null;
    elsif old.status = 'needs_info' and old.payment_url is not null and new.status = 'in_progress' then
      new.customer_paid_at := now();
    else
      raise exception 'Only the Placetta team can change a filing at this stage.';
    end if;
    if not carry_on and new.agent_state is distinct from old.agent_state then
      raise exception 'Only Placetta can change a filing.';
    end if;
    if (new.assigned_to, new.requirements_checked, new.confirmation_number, new.fee_paid, new.receipt_path, new.note,
        new.title, new.agency, new.portal_url, new.fee_estimate, new.submitted_at, new.decided_at, new.payment_url,
        new.channel, new.agent_log, new.handoff_url, new.provider_ref, new.submit_clicked_at,
        new.agent_started_at, new.agent_finished_at, new.attempts)
       is distinct from
       (old.assigned_to, old.requirements_checked, old.confirmation_number, old.fee_paid, old.receipt_path, old.note,
        old.title, old.agency, old.portal_url, old.fee_estimate, old.submitted_at, old.decided_at, old.payment_url,
        old.channel, old.agent_log, old.handoff_url, old.provider_ref, old.submit_clicked_at,
        old.agent_started_at, old.agent_finished_at, old.attempts) then
      raise exception 'Only the Placetta team can change a filing.';
    end if;
  end if;

  if new.payment_url is not null and new.payment_url !~ '^https://' then
    raise exception 'The agency payment link must start with https://';
  end if;
  if new.handoff_url is not null and new.handoff_url !~ '^https://' then
    raise exception 'The hand-back link must start with https://';
  end if;
  if old.submit_clicked_at is not null and new.submit_clicked_at is distinct from old.submit_clicked_at then
    raise exception 'The submit time is recorded once and never changed.';
  end if;
  if new.status = 'submitted' and old.status <> 'submitted' then
    if not new.requirements_checked then
      raise exception 'Check the application against the agency''s current requirements before marking it submitted.';
    end if;
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  if new.status in ('accepted', 'rejected') and old.status not in ('accepted', 'rejected') then
    new.decided_at := now();
  end if;
  if new.agent_state in ('done', 'failed', 'handoff') and old.agent_state is distinct from new.agent_state then
    new.agent_finished_at := coalesce(new.agent_finished_at, now());
  end if;
  new.updated_at := now();
  return new;
end $$;

-- The audit trail: the agent's own changes (made by the service role, no signed-in user, with an agent state set)
-- read as Placetta's, and submissions by the agent read "Submitted by Placetta".
create or replace function public.filings_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  by_agent boolean;
  channel_said jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (new.workspace_id, 'you', new.approved_by,
            '{"en": "Approved for filing", "zh": "批准提交"}'::jsonb, new.title,
            case when new.fee_estimate > 0 then jsonb_build_object('en', 'Estimated agency fee $' || new.fee_estimate || ', paid by you to the agency', 'zh', '预估机构费用 $' || new.fee_estimate || '，由您直接支付给机构') end);
  elsif new.status is distinct from old.status then
    by_agent := auth.uid() is null and new.agent_state is not null;
    channel_said := case new.channel
      when 'email' then '{"en": "by email", "zh": "通过邮件"}'::jsonb
      when 'fax' then '{"en": "by fax", "zh": "通过传真"}'::jsonb
      when 'mail' then '{"en": "by certified mail", "zh": "通过挂号信"}'::jsonb
      when 'portal' then '{"en": "on the agency''s site", "zh": "在机构网站上"}'::jsonb
      else null end;
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (new.workspace_id,
      case when new.status = 'canceled' or new.customer_paid_at is distinct from old.customer_paid_at then 'you'
           when by_agent then 'agent' else 'team' end, auth.uid(),
      case
        when new.customer_paid_at is distinct from old.customer_paid_at then '{"en": "Paid the agency fee", "zh": "已支付机构费用"}'::jsonb
        when new.status = 'in_progress' and by_agent then '{"en": "Placetta started the filing", "zh": "快哉开始办理"}'::jsonb
        when new.status = 'in_progress' then '{"en": "Started the filing", "zh": "开始办理"}'::jsonb
        when new.status = 'needs_info' and new.payment_url is not null then '{"en": "Asked you to pay the agency fee", "zh": "请您支付机构费用"}'::jsonb
        when new.status = 'submitted' and by_agent and channel_said is not null
          then jsonb_build_object('en', 'Submitted by Placetta ' || (channel_said->>'en'), 'zh', '快哉已' || (channel_said->>'zh') || '提交')
        when new.status = 'submitted' and by_agent then '{"en": "Submitted by Placetta", "zh": "快哉已提交"}'::jsonb
        when new.status = 'submitted' then '{"en": "Submitted to the agency by the Placetta team", "zh": "快哉团队已提交至机构"}'::jsonb
        when new.status = 'accepted' then '{"en": "Approved by the agency", "zh": "机构已批准"}'::jsonb
        when new.status = 'needs_info' then '{"en": "Needs information from you", "zh": "需要您补充信息"}'::jsonb
        when new.status = 'rejected' then '{"en": "Returned by the agency", "zh": "被机构退回"}'::jsonb
        when new.status = 'canceled' then '{"en": "Canceled the filing request", "zh": "取消提交请求"}'::jsonb
        else '{"en": "Updated the filing", "zh": "更新申请"}'::jsonb end,
      new.title,
      case
        when new.status = 'submitted' and new.confirmation_number is not null
          then jsonb_build_object('en', 'Confirmation ' || new.confirmation_number, 'zh', '确认号 ' || new.confirmation_number)
        when new.status = 'needs_info' and new.payment_url is not null and new.fee_paid is not null
          then jsonb_build_object('en', '$' || new.fee_paid || ' to the agency', 'zh', '应付机构 $' || new.fee_paid)
        when new.status in ('needs_info', 'rejected') and new.note is not null
          then jsonb_build_object('en', new.note, 'zh', new.note)
      end);
  end if;
  return null;
end $$;

-- One agent step: append { at, en, zh, kind, ref? } to agent_log, apply a patch of agent columns, and write the
-- audit row with actor agent. Service role only (the file function and the portal worker).
create or replace function public.filing_agent_step(p_id uuid, p_entry jsonb, p_patch jsonb default '{}'::jsonb, p_audit boolean default true)
returns public.filings
language plpgsql security definer set search_path = '' as $$
declare
  f public.filings;
  e jsonb := jsonb_build_object('at', now()) || coalesce(p_entry, '{}'::jsonb);
begin
  if p_patch - array['status','channel','agent_state','handoff_url','provider_ref','submit_clicked_at','confirmation_number',
                     'receipt_path','requirements_checked','note','payment_url','fee_paid','attempts'] <> '{}'::jsonb then
    raise exception 'filing_agent_step: unknown field in patch';
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
            case when p_entry ? 'ref' then jsonb_build_object('en', p_entry->>'ref', 'zh', p_entry->>'ref') end);
  end if;
  return f;
end $$;

-- The worker takes the oldest queued portal filing; skip locked so two workers never share one.
create or replace function public.claim_agent_filing() returns setof public.filings
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.filings f set agent_state = 'running',
    agent_started_at = coalesce(f.agent_started_at, now()), attempts = f.attempts + 1
  where f.id = (select id from public.filings
    where agent_state = 'queued' and channel = 'portal' and status not in ('canceled','accepted','rejected')
    order by updated_at limit 1 for update skip locked)
  returning f.*;
end $$;

-- Team tasks: what the agent hands to people (stuck runs, failed replays, stale destinations, two-key reviews).
create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('handoff', 'check_agency', 'skill_broken', 'destination_stale', 'review')),
  filing_id uuid references public.filings(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  title text not null,
  detail jsonb,
  dedupe text unique,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references auth.users(id)
);
create index if not exists team_tasks_open on public.team_tasks(created_at) where done_at is null;
alter table public.team_tasks enable row level security;
drop policy if exists "team reads tasks" on public.team_tasks;
create policy "team reads tasks" on public.team_tasks for select to authenticated using (public.is_staff());
revoke all on public.team_tasks from anon, authenticated;
grant select on public.team_tasks to authenticated;

create or replace function public.finish_team_task(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  update public.team_tasks set done_at = now(), done_by = auth.uid() where id = p_id and done_at is null;
end $$;

-- A run lost to a crash goes back in the queue after 15 minutes; after 3 tries the team takes it. A stuck run that
-- may have submitted (submit_clicked_at set) goes to the team to check the agency, never back to the queue.
create or replace function public.requeue_stuck_filings() returns int
language plpgsql security definer set search_path = '' as $$
declare n int; m int; r record;
begin
  for r in
    update public.filings set agent_state = 'handoff', channel = 'team',
      agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'handoff',
        'en', 'Placetta lost track of the run after pressing submit. The team is checking with the agency.',
        'zh', '快哉在点击提交后中断，团队正在向机构核实。'))
    where agent_state = 'running' and channel = 'portal' and updated_at < now() - interval '15 minutes' and submit_clicked_at is not null
    returning id, workspace_id
  loop
    insert into public.team_tasks(kind, filing_id, workspace_id, title, dedupe)
    values ('check_agency', r.id, r.workspace_id, 'Run stopped after submit was pressed. Check the agency for the submission before doing anything else.', 'check_agency:' || r.id)
    on conflict (dedupe) do nothing;
  end loop;
  get diagnostics m = row_count;

  update public.filings set
    agent_state = case when attempts >= 3 then 'handoff' else 'queued' end,
    channel = case when attempts >= 3 then 'team' else channel end,
    agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'retry',
      'en', case when attempts >= 3 then 'Handed to the Placetta team after 3 tries' else 'Trying again' end,
      'zh', case when attempts >= 3 then '已尝试 3 次，交由快哉团队处理' else '重新尝试' end))
  where agent_state = 'running' and updated_at < now() - interval '15 minutes'
    and submit_clicked_at is null and channel = 'portal';
  get diagnostics n = row_count;

  insert into public.team_tasks(kind, filing_id, workspace_id, title, dedupe)
  select 'handoff', f.id, f.workspace_id, 'Self-filing handed over after 3 tries. The run log is on the filing.', 'handoff:' || f.id
  from public.filings f where f.agent_state = 'handoff' and f.channel = 'team'
  on conflict (dedupe) do nothing;
  return n + coalesce(m, 0);
end $$;

-- The team queue, with the agent's state.
create or replace function public.filing_queue_v3() returns table (
  id uuid, workspace_id uuid, business text, approver_email text, app_id text, title jsonb, agency jsonb, portal_url text,
  fee_estimate numeric, payload jsonb, status text, approved_at timestamptz, assigned_to uuid, assignee_email text,
  requirements_checked boolean, confirmation_number text, fee_paid numeric, receipt_path text, note text,
  payment_url text, customer_paid_at timestamptz, submitted_at timestamptz, decided_at timestamptz, updated_at timestamptz,
  channel text, agent_state text, agent_log jsonb, handoff_url text, provider_ref text, attempts int, submit_clicked_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return query
    select f.id, f.workspace_id, w.name, ua.email::text, f.app_id, f.title, f.agency, f.portal_url, f.fee_estimate, f.payload,
           f.status, f.approved_at, f.assigned_to, us.email::text, f.requirements_checked, f.confirmation_number, f.fee_paid,
           f.receipt_path, f.note, f.payment_url, f.customer_paid_at, f.submitted_at, f.decided_at, f.updated_at,
           f.channel, f.agent_state, f.agent_log, f.handoff_url, f.provider_ref, f.attempts, f.submit_clicked_at
    from public.filings f
    join public.workspaces w on w.id = f.workspace_id
    left join auth.users ua on ua.id = f.approved_by
    left join auth.users us on us.id = f.assigned_to
    order by case when f.agent_state in ('handoff', 'failed') then 0 else 1 end,
             case f.status when 'requested' then 0 when 'in_progress' then 1 when 'needs_info' then 2 when 'submitted' then 3 else 4 end,
             f.approved_at;
end $$;

-- Portal skills: the recorded steps of a submitted portal run, replayed on the next filing of that form.
create table if not exists public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  key text not null check (length(key) between 3 and 200),
  kind text not null default 'portal' check (kind in ('portal', 'learned')),
  name text not null,
  description text,
  body jsonb not null default '{}'::jsonb check (pg_column_size(body) < 500000),
  source text not null default 'agent' check (source in ('agent', 'team', 'customer')),
  enabled boolean not null default true,
  uses int not null default 0,
  fails_in_a_row int not null default 0,
  last_seconds int,
  best_seconds int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agent_skills_key on public.agent_skills (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
alter table public.agent_skills enable row level security;
drop policy if exists "members read their skills and shared ones" on public.agent_skills;
create policy "members read their skills and shared ones" on public.agent_skills for select to authenticated
  using (workspace_id is null or public.is_member(workspace_id) or public.is_staff());
revoke all on public.agent_skills from anon;
revoke insert, update, delete on public.agent_skills from authenticated;
-- Only the service role writes skills (the worker records them, the team switches them through Ops).

revoke execute on function public.claim_agent_filing(), public.requeue_stuck_filings(),
  public.filing_agent_step(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.claim_agent_filing(), public.requeue_stuck_filings(),
  public.filing_agent_step(uuid, jsonb, jsonb, boolean) to service_role;
revoke execute on function public.filing_queue_v3(), public.finish_team_task(uuid) from public, anon;
grant execute on function public.filing_queue_v3(), public.finish_team_task(uuid) to authenticated;
revoke execute on function public.filings_guard(), public.filings_audit() from public, anon, authenticated;

-- Requeue stuck runs every 5 minutes (the daily monitor also calls it).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; stuck filings are requeued only by the daily monitor.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-requeue-filings';
  perform cron.schedule('placetta-requeue-filings', '*/5 * * * *', 'select public.requeue_stuck_filings()');
end $$;
