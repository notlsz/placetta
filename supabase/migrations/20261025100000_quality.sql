-- The quality system's triage queue (docs/QUALITY.md): every finding from the nightly sweeper, the mutation generator
-- and the online grader lands here once, with its severity, a repro and a proposed fix. Staff approve, dismiss or mark
-- it fixed; nothing here changes what a customer sees or files anything. Copied from Vanta's tests (each failing test
-- has an owner, remediation and a due date) and LangSmith's annotation queues. Safe to run twice.

create table if not exists public.qa_findings (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('drift', 'unreachable', 'stale', 'fee', 'grader', 'edge')),
  severity text not null check (severity in ('high', 'medium', 'low')),
  source text not null check (length(source) between 1 and 500),
  subject text not null check (length(subject) between 1 and 300),
  repro text not null check (length(repro) between 1 and 4000),
  fix text not null check (length(fix) between 1 and 4000),
  -- a fix safe to propose as a code change on its own (a fee from the form's own cited page): never applied here
  safe jsonb,
  status text not null default 'open' check (status in ('open', 'approved', 'dismissed', 'fixed')),
  dedupe text not null unique,
  seen int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '7 days',
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  note text check (note is null or length(note) <= 2000)
);
comment on table public.qa_findings is 'Quality findings for staff triage: the sweeper, the mutation generator and the online grader. Staff only.';
create index if not exists qa_findings_open on public.qa_findings (severity, last_seen desc) where status in ('open', 'approved');
alter table public.qa_findings enable row level security;
revoke all on public.qa_findings from public, anon, authenticated;
grant select on public.qa_findings to authenticated;
drop policy if exists "staff read findings" on public.qa_findings;
create policy "staff read findings" on public.qa_findings for select to authenticated using (public.is_staff());

/* Findings in, from the sweeper (GitHub Action, service key), the grader (agent-run) and the generator. One row per
   kind, source and subject: seen again, it's counted and its repro refreshed; a fixed one seen again reopens. A high
   finding is due in a day, medium in three, low in seven (Vanta's per-category deadlines). Returns how many were new. */
create or replace function public.qa_report(p_findings jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare f jsonb; n int := 0; d text; ins boolean;
begin
  if jsonb_typeof(p_findings) <> 'array' then raise exception 'findings must be an array'; end if;
  for f in select * from jsonb_array_elements(p_findings) limit 500 loop
    d := left(format('%s:%s:%s', f->>'kind', f->>'source', f->>'subject'), 900);
    insert into public.qa_findings (kind, severity, source, subject, repro, fix, safe, dedupe, due_at)
      values (f->>'kind', f->>'severity', left(f->>'source', 500), left(f->>'subject', 300), left(f->>'repro', 4000), left(f->>'fix', 4000),
        case when jsonb_typeof(f->'safe') = 'object' then f->'safe' else null end, d,
        now() + case f->>'severity' when 'high' then interval '1 day' when 'medium' then interval '3 days' else interval '7 days' end)
      on conflict (dedupe) do update set seen = public.qa_findings.seen + 1, last_seen = now(), repro = excluded.repro, fix = excluded.fix, safe = excluded.safe,
        severity = excluded.severity, status = case when public.qa_findings.status = 'fixed' then 'open' else public.qa_findings.status end
      returning (xmax = 0) into ins;
    if ins then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.qa_report(jsonb) from public, anon, authenticated;
grant execute on function public.qa_report(jsonb) to service_role;

/* The staff queue: open and approved findings, the most severe and most often seen first. */
create or replace function public.qa_queue() returns setof public.qa_findings
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return query select * from public.qa_findings q where q.status in ('open', 'approved')
    order by case q.severity when 'high' then 0 when 'medium' then 1 else 2 end, q.seen desc, q.last_seen desc limit 300;
end $$;
revoke execute on function public.qa_queue() from public, anon;
grant execute on function public.qa_queue() to authenticated;

/* A staff decision: approve the proposed fix, dismiss it, or mark it fixed. */
create or replace function public.qa_decide(p_id uuid, p_status text, p_note text default null) returns public.qa_findings
language plpgsql security definer set search_path = '' as $$
declare r public.qa_findings;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if p_status not in ('approved', 'dismissed', 'fixed', 'open') then raise exception 'status must be approved, dismissed, fixed or open'; end if;
  update public.qa_findings set status = p_status, decided_by = auth.uid(), decided_at = now(), note = left(nullif(trim(p_note), ''), 2000)
    where id = p_id returning * into r;
  if not found then raise exception 'No such finding.'; end if;
  return r;
end $$;
revoke execute on function public.qa_decide(uuid, text, text) from public, anon;
grant execute on function public.qa_decide(uuid, text, text) to authenticated;
