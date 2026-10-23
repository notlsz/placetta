-- A retention setting per workspace for Odelia's conversations, copied from Harvey's enterprise controls (customers set
-- how long their workspace keeps conversation history) and Claude's and ChatGPT's enterprise retention settings.
--   workspace_retention: one row per workspace that chose a period: 30, 90, 180 or 365 days. No row is Placetta's
--     default (docs/soc2/policies/data-classification-retention.md): the request and the answer are kept while the
--     workspace exists, and the working notes of a finished task go after 365 days.
--   With a period set, the daily purge (purge_expired) clears every finished conversation older than it: the request, the
--     answer, the steps, the working notes and the trace, and the texts and calls with Odelia for that workspace. What a
--     run cost and how long it took stay, without words, for billing and the spending limits. Records the business keeps
--     on purpose stay: applications, filings, documents, deadlines, approved memories, and the audit trail (whose own
--     period is the founder's decision, CONTROLS.md C1.2b).
--   retention_set: owners only (with two-step sign-in when it's on for them); it goes in the audit trail.
-- Safe to run twice.

create table if not exists public.workspace_retention (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  run_days int not null check (run_days in (30, 90, 180, 365)),
  set_by uuid references auth.users(id) on delete set null,
  set_at timestamptz not null default now()
);
comment on table public.workspace_retention is 'How long a workspace keeps Odelia''s conversations, when it chose a period. Read and set through retention_get and retention_set.';
alter table public.workspace_retention enable row level security;
revoke all on public.workspace_retention from public, anon, authenticated;

create or replace function public.retention_get(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.workspace_retention;
begin
  if not public.can_view(ws) then raise exception 'Not your workspace.'; end if;
  select * into r from public.workspace_retention where workspace_id = ws;
  return jsonb_build_object('run_days', r.run_days, 'set_at', r.set_at);
end $$;

create or replace function public.retention_set(ws uuid, p_days int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare before int;
begin
  if not public.is_owner(ws) or not public.mfa_ok() then raise exception 'Only an owner can change how long conversations are kept.'; end if;
  if p_days is not null and p_days not in (30, 90, 180, 365) then raise exception 'Choose 30, 90, 180 or 365 days.'; end if;
  select run_days into before from public.workspace_retention where workspace_id = ws;
  if p_days is null then
    delete from public.workspace_retention where workspace_id = ws;
  else
    insert into public.workspace_retention(workspace_id, run_days, set_by) values (ws, p_days, auth.uid())
    on conflict (workspace_id) do update set run_days = excluded.run_days, set_by = excluded.set_by, set_at = now();
  end if;
  if before is distinct from p_days then
    insert into public.audit_log(workspace_id, actor, actor_id, action, object)
    values (ws, 'you', auth.uid(), jsonb_build_object('en', 'Changed how long conversations are kept', 'zh', '更改了对话保留期限'),
      jsonb_build_object('en', coalesce(before::text || ' days', 'Placetta''s default') || ' to ' || coalesce(p_days::text || ' days', 'Placetta''s default'),
                         'zh', coalesce(before::text || ' 天', '快哉默认') || ' 改为 ' || coalesce(p_days::text || ' 天', '快哉默认')));
  end if;
  return public.retention_get(ws);
end $$;

-- What the period removes, for every workspace that set one (the daily purge, service role).
create or replace function public.retention_purge() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_runs int := 0; n_msgs int := 0; k int; r record;
begin
  for r in select workspace_id, run_days from public.workspace_retention loop
    update public.agent_runs set prompt = '(removed under this workspace''s retention setting)', reply = null, steps = '[]'::jsonb, draft = null,
      state = null, trace = null, title = null, error = null, chat_to = null, reply_to = null
     where workspace_id = r.workspace_id and status in ('done', 'failed', 'stopped') and updated_at < now() - make_interval(days => r.run_days)
       and prompt <> '(removed under this workspace''s retention setting)';
    get diagnostics k = row_count; n_runs := n_runs + k;
    delete from public.odelia_messages where workspace_id = r.workspace_id and created_at < now() - make_interval(days => r.run_days);
    get diagnostics k = row_count; n_msgs := n_msgs + k;
  end loop;
  return jsonb_build_object('conversations', n_runs, 'texts_and_calls', n_msgs);
end $$;

-- The daily tidy-up, as in 20261017140000_mcp_connectors.sql, and each workspace's own retention period.
create or replace function public.purge_expired() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_chat int; n_pages int; n_runs int; n_routines int; n_pending int := 0; n_calls int; r record; kept jsonb;
begin
  delete from public.chat_events where at < now() - interval '30 days';
  get diagnostics n_chat = row_count;
  delete from public.page_stats where updated_at < now() - interval '400 days';
  get diagnostics n_pages = row_count;
  update public.agent_runs set state = null, steps = '[]'::jsonb, draft = null
   where status in ('done', 'failed', 'stopped') and updated_at < now() - interval '365 days'
     and (state is not null or steps <> '[]'::jsonb or draft is not null);
  get diagnostics n_runs = row_count;
  delete from public.routine_runs where created_at < now() - interval '180 days';
  get diagnostics n_routines = row_count;
  for r in delete from public.oauth_pending where created_at < now() - interval '1 day' returning secret_id loop
    n_pending := n_pending + 1;
    if not exists (select 1 from public.integrations where secret_id = r.secret_id)
       and not exists (select 1 from public.agency_logins where secret_id = r.secret_id)
       and not exists (select 1 from public.mcp_servers where secret_id = r.secret_id) then
      perform public.vault_drop(r.secret_id);
    end if;
  end loop;
  update public.mcp_calls set status = 'expired' where status = 'waiting' and expires_at <= now();
  delete from public.mcp_calls where status <> 'waiting' and created_at < now() - interval '90 days';
  get diagnostics n_calls = row_count;
  kept := public.retention_purge();
  return jsonb_build_object('chat_events', n_chat, 'page_stats', n_pages, 'agent_run_transcripts', n_runs,
                            'routine_runs', n_routines, 'oauth_pending', n_pending, 'mcp_calls', n_calls, 'retention', kept);
end $$;

revoke execute on function public.retention_get(uuid), public.retention_set(uuid, int), public.retention_purge(), public.purge_expired() from public, anon, authenticated;
grant execute on function public.retention_get(uuid), public.retention_set(uuid, int) to authenticated;
grant execute on function public.retention_purge(), public.purge_expired() to service_role;
