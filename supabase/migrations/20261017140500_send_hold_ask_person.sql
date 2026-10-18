-- The undo window, and "Ask a person". Safe to run twice.
--
-- 1. The undo window. Anything Placetta sends for a customer after an approval (by email, fax, certified mail, or on an
--    agency's site by the portal worker) waits SEND_HOLD_MINUTES (10 by default, 0 turns it off) before it leaves.
--    While it waits the filing's agent_state is 'held' and send_after says when it goes. Three functions decide it, each
--    under the row lock, so an Undo and the send can never both win:
--      filing_hold(id, minutes)          the file function, right before a send: running -> held, send_after set
--      filing_release_held(id?, now?)    the sweep (every minute while one is due) or "Send now": held -> running
--                                        (queued for the portal worker), only rows that are still held
--      undo_held_filing(id, by)          the customer's Undo: held -> canceled, in the log, the audit trail and Updates;
--                                        refused once the hold was released
--    The portal worker claims only queued filings (claim_agent_filing), so it never sees a held one.
-- 2. Ask a person. A member or owner asks the Placetta team for help: a team task (kind ask_person) with who asked, the
--    question and what they were looking at; at most three a day per workspace. The team's reply goes to the
--    workspace's Updates.

/* ------------------------------ 1. the undo window ------------------------------ */

alter table public.filings add column if not exists send_after timestamptz;
comment on column public.filings.send_after is 'While agent_state is held: when the send goes ahead, unless the customer undoes it first.';
alter table public.filings drop constraint if exists filings_agent_state_check;
alter table public.filings add constraint filings_agent_state_check
  check (agent_state in ('queued', 'running', 'needs_you', 'done', 'failed', 'handoff', 'held'));
create index if not exists filings_held on public.filings(send_after) where agent_state = 'held';

-- Right before a send: the filing waits p_minutes (1 to 1440). Only a filing that is running and not yet sent.
create or replace function public.filing_hold(p_id uuid, p_minutes int)
returns public.filings
language plpgsql security definer set search_path = '' as $$
declare
  f public.filings;
  m int := least(greatest(coalesce(p_minutes, 10), 1), 1440);
  en text := format('Waiting %s minute%s before sending, so you can undo it', m, case when m = 1 then '' else 's' end);
  zh text := format('等待 %s 分钟后发送，在此之前可以撤销', m);
begin
  select * into f from public.filings where id = p_id for update;
  if f.id is null then raise exception 'No such filing.'; end if;
  if f.status = 'canceled' then raise exception 'filing_stopped: the customer stopped this filing'; end if;
  if f.agent_state is distinct from 'running' or f.submit_clicked_at is not null then
    raise exception 'filing_changed: the filing moved on (agent_state)';
  end if;
  update public.filings set agent_state = 'held', send_after = now() + make_interval(mins => m),
    agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'held', 'en', en, 'zh', zh))
  where id = p_id returning * into f;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (f.workspace_id, 'agent', null, jsonb_build_object('en', en, 'zh', zh), f.title, null);
  return f;
end $$;

-- The hold is over (or the owner tapped "Send now"): back to running, or queued for the portal worker. Returns only the
-- rows this call released; a row someone else released or undid first is left out.
create or replace function public.filing_release_held(p_id uuid default null, p_now boolean default false)
returns setof public.filings
language plpgsql security definer set search_path = '' as $$
declare r public.filings;
begin
  for r in
    update public.filings f set
      agent_state = case when f.channel = 'portal' then 'queued' else 'running' end,
      send_after = null,
      agent_log = f.agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'hold_over',
        'en', case when p_now then 'You chose to send it now' else 'The time to undo is over. Sending it now' end,
        'zh', case when p_now then '您选择立即发送' else '撤销时间已过，现在发送' end))
    where f.agent_state = 'held' and f.submit_clicked_at is null and f.status not in ('canceled', 'submitted', 'accepted', 'rejected')
      and (p_id is null or f.id = p_id) and (p_now or f.send_after <= now())
    returning f.*
  loop
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (r.workspace_id, case when p_now then 'you' else 'agent' end, null,
            case when p_now then '{"en": "Sent it without waiting", "zh": "不再等待，立即发送"}'::jsonb
                 else '{"en": "The time to undo ended; sending", "zh": "撤销时间结束，开始发送"}'::jsonb end, r.title, null);
    return next r;
  end loop;
end $$;

-- Undo: only while the filing is still held. Canceled, in the log, the audit trail and Updates; a second Undo (or one
-- after a Stop) changes nothing.
create or replace function public.undo_held_filing(p_id uuid, p_by text)
returns public.filings
language plpgsql security definer set search_path = '' as $$
declare f public.filings;
begin
  select * into f from public.filings where id = p_id for update;
  if f.id is null then raise exception 'No such filing.'; end if;
  if f.status = 'canceled' then return f; end if;
  if f.agent_state is distinct from 'held' or f.submit_clicked_at is not null or f.status in ('submitted', 'accepted', 'rejected') then
    raise exception 'too_late: the time to undo is over';
  end if;
  update public.filings set status = 'canceled', agent_state = 'failed', send_after = null, handoff_url = null, provider_ref = null,
    agent_finished_at = now(),
    agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'undone', 'ref', left(coalesce(p_by, ''), 200),
      'en', 'You undid it before it was sent. Nothing left Placetta.', 'zh', '您在发送前撤销了，没有任何内容发出。'))
  where id = p_id returning * into f;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (f.workspace_id, 'you', null, '{"en": "Undid the send before anything left", "zh": "在发出前撤销了发送"}'::jsonb, f.title,
          jsonb_build_object('en', left(coalesce(p_by, ''), 200), 'zh', left(coalesce(p_by, ''), 200)));
  insert into public.updates (workspace_id, kind, title, body, app_id, dedupe)
  values (f.workspace_id, 'filing',
          jsonb_build_object('en', 'Undone: ' || coalesce(f.title->>'en', 'a filing'), 'zh', '已撤销：' || coalesce(f.title->>'zh', '一份申请')),
          '{"en": "Nothing was sent to the agency. It''s back with you to approve again when you''re ready.", "zh": "没有任何内容发给机构。它已回到您这里，准备好后可以再次批准。"}'::jsonb,
          f.app_id, 'undone:' || f.id::text)
  on conflict (workspace_id, dedupe) do nothing;
  return f;
end $$;

revoke execute on function public.filing_hold(uuid, int), public.filing_release_held(uuid, boolean), public.undo_held_filing(uuid, text)
  from public, anon, authenticated;
grant execute on function public.filing_hold(uuid, int), public.filing_release_held(uuid, boolean), public.undo_held_filing(uuid, text)
  to service_role;

-- Every minute, only while a hold is due: the file function's sweep releases it and sends it.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; held sends go out at the monitor''s daily sweep.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-send-hold';
  perform cron.schedule('placetta-send-hold', '* * * * *', $job$
    select net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/file',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
    where exists (select 1 from public.filings where agent_state = 'held' and send_after <= now());
  $job$);
end $$;

/* ------------------------------ 2. ask a person ------------------------------ */

alter table public.team_tasks drop constraint if exists team_tasks_kind_check;
alter table public.team_tasks add constraint team_tasks_kind_check
  check (kind in ('handoff', 'check_agency', 'skill_broken', 'destination_stale', 'review', 'quote', 'line_health', 'ai_spend', 'ask_person'));
alter table public.team_tasks
  add column if not exists asked_by uuid references auth.users(id) on delete set null,
  add column if not exists lang text check (lang in ('en', 'zh')),
  add column if not exists reply text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references auth.users(id) on delete set null;
create index if not exists team_tasks_asks on public.team_tasks(workspace_id, created_at) where kind = 'ask_person';

-- A member or owner asks a person. At most three a day per workspace. Returns the team task's id.
create or replace function public.ask_person(ws uuid, p_question text, p_context jsonb default '{}'::jsonb, p_lang text default 'en')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  q text := left(btrim(coalesce(p_question, '')), 2000);
  ctx jsonb := case when jsonb_typeof(p_context) = 'object' and octet_length(p_context::text) <= 16000 then p_context else '{}'::jsonb end;
  n int; tid uuid; nm text;
begin
  if not public.is_member(ws) then raise exception 'forbidden: only this workspace''s owners and members can ask'; end if;
  if length(q) < 2 then raise exception 'bad_request: say what you need help with'; end if;
  -- One at a time per workspace, so two quick taps can't both take the last request of the day.
  perform pg_advisory_xact_lock(hashtextextended('ask_person:' || ws::text, 0));
  select count(*) into n from public.team_tasks t where t.workspace_id = ws and t.kind = 'ask_person' and t.created_at > now() - interval '24 hours';
  if n >= 3 then raise exception 'rate_limited: three requests a day per workspace'; end if;
  select w.name into nm from public.workspaces w where w.id = ws;
  insert into public.team_tasks (kind, workspace_id, title, detail, dedupe, asked_by, lang)
  values ('ask_person', ws, left(coalesce(nm, 'A customer') || ' asks: ' || q, 300), jsonb_build_object('question', q, 'context', ctx),
          'ask:' || gen_random_uuid()::text, auth.uid(), case when p_lang = 'zh' then 'zh' else 'en' end)
  returning id into tid;
  insert into public.updates (workspace_id, kind, title, body, dedupe)
  values (ws, 'team', '{"en": "You asked a person at Placetta", "zh": "您已请快哉的工作人员协助"}'::jsonb,
          jsonb_build_object('en', 'A person on the Placetta team replies here, usually within one business day. You asked: ' || left(q, 300),
                             'zh', '快哉团队的工作人员会在这里回复，通常在一个工作日内。您的问题：' || left(q, 300)),
          'ask:' || tid::text);
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (ws, 'you', auth.uid(), '{"en": "Asked a person at Placetta", "zh": "请快哉工作人员协助"}'::jsonb, jsonb_build_object('en', left(q, 200), 'zh', left(q, 200)), null);
  return tid;
end $$;
revoke execute on function public.ask_person(uuid, text, jsonb, text) from public, anon;
grant execute on function public.ask_person(uuid, text, jsonb, text) to authenticated, service_role;

-- The team's answer: on the task, and in the workspace's Updates. Staff with two-step only; once per request.
create or replace function public.answer_person(p_id uuid, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.team_tasks; r text := left(btrim(coalesce(p_reply, '')), 4000);
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if length(r) < 2 then raise exception 'Write the reply first.'; end if;
  select * into t from public.team_tasks where id = p_id and kind = 'ask_person' for update;
  if t.id is null then raise exception 'No such request.'; end if;
  if t.replied_at is not null then raise exception 'Already answered.'; end if;
  update public.team_tasks set reply = r, replied_at = now(), replied_by = auth.uid(), done_at = now(), done_by = auth.uid() where id = p_id;
  insert into public.updates (workspace_id, kind, title, body, dedupe)
  values (t.workspace_id, 'team', '{"en": "A person at Placetta replied", "zh": "快哉工作人员已回复"}'::jsonb, jsonb_build_object('en', r, 'zh', r), 'ask-reply:' || p_id::text)
  on conflict (workspace_id, dedupe) do nothing;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (t.workspace_id, 'team', auth.uid(), '{"en": "Replied to your question", "zh": "回复了您的问题"}'::jsonb,
          jsonb_build_object('en', left(coalesce(t.detail->>'question', ''), 200), 'zh', left(coalesce(t.detail->>'question', ''), 200)), null);
end $$;
revoke execute on function public.answer_person(uuid, text) from public, anon;
grant execute on function public.answer_person(uuid, text) to authenticated;
