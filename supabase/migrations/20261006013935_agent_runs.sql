create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  kind text not null default 'task' check (kind in ('task', 'watch')),
  prompt text not null check (length(prompt) between 1 and 4000),
  lang text not null default 'en' check (lang in ('en', 'zh')),
  deep boolean not null default false,
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'stopped')),
  steps jsonb not null default '[]'::jsonb,
  draft text,
  reply jsonb,
  error text,
  state jsonb,
  attempts integer not null default 0,
  heartbeat_at timestamptz not null default now(),
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_runs_workspace_created on public.agent_runs (workspace_id, created_at desc);
create index if not exists agent_runs_running on public.agent_runs (heartbeat_at) where status = 'running';
create index if not exists agent_runs_created_by on public.agent_runs (created_by);
alter table public.agent_runs enable row level security;
create policy "Members see their workspace's agent runs" on public.agent_runs for select to authenticated using (public.is_member(workspace_id));
revoke all on public.agent_runs from anon, authenticated;
grant select (id, workspace_id, created_by, kind, prompt, lang, deep, status, steps, draft, reply, error, heartbeat_at, seen_at, created_at, updated_at) on public.agent_runs to authenticated;
create or replace function public.poll_agent_run(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.agent_runs;
begin
  select * into r from public.agent_runs where id = p_id;
  if r.id is null or not public.is_member(r.workspace_id) then raise exception 'Not your workspace.'; end if;
  update public.agent_runs set seen_at = now() where id = p_id;
  return jsonb_build_object('id', r.id, 'kind', r.kind, 'prompt', r.prompt, 'status', r.status, 'steps', r.steps, 'draft', r.draft,
    'reply', r.reply, 'error', r.error, 'created_at', r.created_at, 'updated_at', r.updated_at);
end $$;
revoke execute on function public.poll_agent_run(uuid) from public, anon;
grant execute on function public.poll_agent_run(uuid) to authenticated;
create or replace function public.stop_agent_run(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  select workspace_id into ws from public.agent_runs where id = p_id;
  if ws is null or not public.is_member(ws) then raise exception 'Not your workspace.'; end if;
  update public.agent_runs set status = 'stopped', updated_at = now() where id = p_id and status = 'running';
end $$;
revoke execute on function public.stop_agent_run(uuid) from public, anon;
grant execute on function public.stop_agent_run(uuid) to authenticated;
alter table public.updates drop constraint if exists updates_kind_check;
alter table public.updates add constraint updates_kind_check check (kind in ('deadline', 'renewal', 'filing', 'payment', 'team', 'agent'));
