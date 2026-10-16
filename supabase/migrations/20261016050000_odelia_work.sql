-- Odelia's background jobs: routines the business schedules, renewals she starts on her own, and filings past the
-- agency's usual time. A run carries its job's title for the update it leaves; routine_runs claims each routine's day
-- so a routine never runs twice in one day.
alter table public.agent_runs add column if not exists title jsonb;
create table if not exists public.routine_runs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  routine_id text not null,
  day date not null,
  run_id uuid,
  created_at timestamptz not null default now(),
  primary key (workspace_id, routine_id, day)
);
alter table public.routine_runs enable row level security;
-- only the server reads and writes it (no policies for signed-in users)
