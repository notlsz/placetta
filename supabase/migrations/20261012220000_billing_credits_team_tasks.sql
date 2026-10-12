-- Entry plans are credited once toward the first year: remember when that happened.
alter table public.billing add column if not exists entry_credited_at timestamptz;

-- The team's open tasks (handoffs, agency checks, stale destinations), for the filing queue.
create or replace function public.team_tasks_open()
returns table (id uuid, kind text, filing_id uuid, workspace_id uuid, business text, title text, detail jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return query
    select t.id, t.kind, t.filing_id, t.workspace_id, w.name, t.title, t.detail, t.created_at
    from public.team_tasks t
    left join public.workspaces w on w.id = t.workspace_id
    where t.done_at is null
    order by t.created_at
    limit 200;
end $$;

revoke all on function public.team_tasks_open() from public, anon;
grant execute on function public.team_tasks_open() to authenticated;
