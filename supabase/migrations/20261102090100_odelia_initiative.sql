-- Odelia goes first (src/initiative.ts, src/escalate.ts, supabase/functions/monitor/initiative.ts). Safe to run twice.
--
-- 1. odelia_chases: every ask Odelia makes of someone else for a document a filing needs (the landlord's lease, the
--    contractor's stamped plans, the insurer's certificate), one row per ask. Under Hands-off the monitor emails them from
--    Odelia's own address, with a reference in the subject that ties a reply back here (odelia-mail); otherwise the row
--    records that a run was started to draft the ask for an owner's approval. The count and the last day set the
--    follow-up (every three business days, three asks, then the owner hears). Written by the service role only; members
--    read their own workspace's.
-- 2. Specialist reviews Odelia asks for herself when she isn't sure (ask_specialist): the same queue and the same
--    one-business-day answer as an owner's request, marked as hers, with why and the job that waits on it. Only the
--    server's runs may ask (the service role), at most 3 a day per workspace, one open per application. When the
--    specialist answers, the monitor wakes the job with their answer (woke_at).

create table if not exists public.odelia_chases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null check (length(key) between 3 and 300),
  app_id text not null check (length(app_id) between 1 and 120),
  item_id text not null check (length(item_id) between 1 and 120),
  holder text not null check (holder in ('landlord', 'builder', 'insurer', 'staff')),
  n int not null check (n between 1 and 10),
  to_name text check (to_name is null or length(to_name) <= 120),
  to_email text check (to_email is null or length(to_email) <= 320),
  via text not null check (via in ('odelia_email', 'draft')),
  token text unique check (token is null or token ~ '^[A-HJ-NP-Z2-9]{8}$'),
  day date not null,
  sent_at timestamptz not null default now(),
  provider_id text check (provider_id is null or length(provider_id) <= 200),
  run_id uuid,
  replied_at timestamptz,
  reply_from text check (reply_from is null or length(reply_from) <= 320),
  reply_snippet text check (reply_snippet is null or length(reply_snippet) <= 600),
  reply_files int not null default 0 check (reply_files between 0 and 20),
  unique (workspace_id, key, n)
);
comment on table public.odelia_chases is 'Each ask Odelia makes of someone else for a document a filing needs (src/initiative.ts). Service role writes; members read their own.';
create index if not exists odelia_chases_ws on public.odelia_chases(workspace_id, key, n desc);
alter table public.odelia_chases enable row level security;
revoke all on public.odelia_chases from public, anon, authenticated;
grant select on public.odelia_chases to authenticated;
drop policy if exists odelia_chases_read on public.odelia_chases;
create policy odelia_chases_read on public.odelia_chases for select to authenticated using (public.is_member(workspace_id));

-- Specialist reviews Odelia asks for
alter table public.specialist_reviews add column if not exists asked_by_agent boolean not null default false;
alter table public.specialist_reviews add column if not exists reason text check (reason is null or reason in ('no_source', 'sources_disagree', 'judgment', 'deadline', 'agency_unclear'));
alter table public.specialist_reviews add column if not exists job_id text check (job_id is null or length(job_id) between 1 and 120);
alter table public.specialist_reviews add column if not exists woke_at timestamptz;
create index if not exists specialist_reviews_wake on public.specialist_reviews(reviewed_at) where asked_by_agent and status = 'done' and woke_at is null;

create or replace function public.agent_request_specialist_review(ws uuid, p_app_id text, p_title jsonb, p_note text, p_reason text, p_job text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.specialist_reviews; t uuid; en text;
begin
  if not exists (select 1 from public.workspaces where id = ws) then raise exception 'No such workspace.'; end if;
  if length(coalesce(p_app_id, '')) not between 1 and 120 then raise exception 'Name the application, or "workspace".'; end if;
  if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'Say what the specialist should settle.'; end if;
  perform 1 from public.workspaces where id = ws for update;
  select * into r from public.specialist_reviews where workspace_id = ws and app_id = p_app_id and status = 'requested';
  if r.id is not null then return jsonb_build_object('id', r.id, 'due_at', r.due_at, 'open', true); end if;
  if (select count(*) from public.specialist_reviews where workspace_id = ws and asked_by_agent and requested_at > now() - interval '1 day') >= 3 then
    raise exception 'rate_limited' using hint = 'Odelia asks a specialist at most 3 times a day per business. Tell the owner what is unsure instead.';
  end if;
  en := left(coalesce(p_title->>'en', p_title->>'zh', p_app_id), 200);
  insert into public.specialist_reviews(workspace_id, app_id, title, note, requested_by, due_at, asked_by_agent, reason, job_id)
  values (ws, p_app_id, jsonb_build_object('en', en, 'zh', left(coalesce(p_title->>'zh', en), 200)), left(trim(p_note), 500), null, public.one_business_day(now()), true,
          case when p_reason in ('no_source', 'sources_disagree', 'judgment', 'deadline', 'agency_unclear') then p_reason end, nullif(left(coalesce(p_job, ''), 120), ''))
  returning * into r;
  insert into public.team_tasks(kind, workspace_id, title, detail, dedupe)
  values ('review', ws, 'Odelia asked a specialist: ' || en, jsonb_build_object('specialist_review_id', r.id, 'app_id', p_app_id, 'note', r.note, 'reason', r.reason, 'due_at', r.due_at, 'asked_by', 'odelia'), 'specialist:' || r.id)
  returning id into t;
  update public.specialist_reviews set task_id = t where id = r.id;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (ws, 'agent', null, jsonb_build_object('en', 'Asked a Placetta specialist', 'zh', '请快哉专员确认'), jsonb_build_object('en', en, 'zh', left(coalesce(p_title->>'zh', en), 200)));
  return jsonb_build_object('id', r.id, 'due_at', r.due_at, 'open', false);
end $$;
revoke execute on function public.agent_request_specialist_review(uuid, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.agent_request_specialist_review(uuid, text, jsonb, text, text, text) to service_role;
