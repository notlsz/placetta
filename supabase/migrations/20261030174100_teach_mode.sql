-- Teach Odelia once (worker/filer/src/teach.ts, docs/COMPETITIVE.md "Teach Odelia once"). The first time a customer or
-- the team files on an agency portal Placetta has no steps for, the run is recorded and turned into a draft playbook.
-- This holds those playbooks, one per portal and form, shared by every workspace:
--   structure only     the body names placeholders ({fact:legal_name}, {vault:login}, {person:ssn}), never a value; the
--                      save refuses a body that carries any of the teaching filing's approved values, file names or signer
--   review gate        a draft runs only in assist mode (Odelia fills, a person presses submit); staff with two-step
--                      sign-in approve it before it runs unattended for anyone
--   success tracking   each run counts for or against it; three failures in a row, or under 60% after five runs, send an
--                      approved one back to review; a healed selector goes to the Quality tab as drift
-- Only staff read the table. The filer reaches it through three functions, like everything else it touches
-- (20261022120000_filer_least_privilege.sql). Safe to run twice. Tests: supabase/tests/teach_mode.sql.

create table if not exists public.portal_playbooks (
  id uuid primary key default gen_random_uuid(),
  host text not null check (length(host) between 3 and 253 and host ~ '^[a-z0-9.-]+$'),
  official text not null check (length(official) between 1 and 120),
  name text not null check (length(name) between 1 and 300),
  body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) < 200000),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  flags text[] not null default '{}',
  version int not null default 1,
  -- which filing taught it: for staff audit only, never returned to the filer or another workspace
  taught_from uuid references public.filings(id) on delete set null,
  taught_at timestamptz not null default now(),
  runs int not null default 0,
  successes int not null default 0,
  failures int not null default 0,
  fails_in_a_row int not null default 0,
  last_run_at timestamptz,
  demoted_at timestamptz,
  demoted_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (host, official)
);
comment on table public.portal_playbooks is 'Taught portal playbooks, shared by every workspace: structure only, never a customer''s values. Staff only.';
alter table public.portal_playbooks enable row level security;
revoke all on public.portal_playbooks from public, anon, authenticated;
grant select on public.portal_playbooks to authenticated;
drop policy if exists "staff read taught playbooks" on public.portal_playbooks;
create policy "staff read taught playbooks" on public.portal_playbooks for select to authenticated using (public.is_staff());
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'revoke all on public.portal_playbooks from placetta_filer';
  end if;
end $$;

-- The team's queue gets a kind for a draft to review (and a playbook sent back to review).
alter table public.team_tasks drop constraint if exists team_tasks_kind_check;
alter table public.team_tasks add constraint team_tasks_kind_check
  check (kind in ('handoff', 'check_agency', 'skill_broken', 'destination_stale', 'review', 'quote', 'line_health', 'ai_spend', 'ask_person', 'margin', 'team_time', 'selector_drift', 'playbook_review'));

/* Any of this filing's own data in a body: its approved values (three characters or more), its file names, its signer.
   Lower-cased substring search over the body's text, the same rule as worker/filer/src/teach.ts customerData. */
create or replace function public.taught_body_leaks(p_filing uuid, p_body jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  with f as (select payload from public.filings where id = p_filing), t as (select lower(p_body::text) as body)
  select exists (
    select 1 from f, t, jsonb_array_elements(coalesce(f.payload -> 'fields', '[]'::jsonb)) x
    where length(trim(x ->> 'value')) >= 3 and position(lower(trim(x ->> 'value')) in t.body) > 0
  ) or exists (
    select 1 from f, t, jsonb_array_elements(coalesce(f.payload -> 'attachments', '[]'::jsonb)) a
    where length(a ->> 'name') >= 3 and position(lower(a ->> 'name') in t.body) > 0
  ) or exists (
    select 1 from f, t where length(trim(coalesce(f.payload -> 'signature' ->> 'name', ''))) >= 3
      and position(lower(trim(f.payload -> 'signature' ->> 'name')) in t.body) > 0
  )
$$;
revoke execute on function public.taught_body_leaks(uuid, jsonb) from public, anon, authenticated;

/* The filer saves a draft from a recorded run. Only a filing the agent was given, that asked to be taught ("Show Odelia
   how", a log entry of kind teach), for its own form. A reviewed playbook is never overwritten by a new recording: the
   call answers with it, and the team compares. Returns the playbook's id and status. */
create or replace function public.filer_save_taught(p_filing uuid, p_host text, p_official text, p_name text, p_body jsonb, p_flags text[])
returns table (id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare f public.filings; cur public.portal_playbooks; pid uuid;
begin
  select * into f from public.filings where public.filings.id = p_filing;
  if f.id is null or f.agent_state is null then raise exception 'filing_not_given_to_agent'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(f.agent_log, '[]'::jsonb)) e where e ->> 'kind' = 'teach') then raise exception 'not_a_teach_run'; end if;
  if coalesce(f.payload ->> 'official', '') <> p_official then raise exception 'not_this_form'; end if;
  if jsonb_typeof(p_body) is distinct from 'object' or lower(p_body ->> 'host') is distinct from lower(p_host) or p_body ->> 'official' is distinct from p_official then raise exception 'body_mismatch'; end if;
  if public.taught_body_leaks(p_filing, p_body) then raise exception 'carries_customer_data'; end if;
  select * into cur from public.portal_playbooks p where p.host = lower(p_host) and p.official = p_official;
  if cur.id is not null and cur.status = 'approved' then
    return query select cur.id, cur.status;
    return;
  end if;
  insert into public.portal_playbooks as p (host, official, name, body, status, flags, taught_from, taught_at)
    values (lower(p_host), p_official, left(p_name, 300), p_body, 'draft', coalesce(p_flags, '{}'), p_filing, now())
  on conflict (host, official) do update set name = excluded.name, body = excluded.body, status = 'draft', flags = excluded.flags,
    taught_from = excluded.taught_from, taught_at = now(), version = p.version + 1, fails_in_a_row = 0, updated_at = now(),
    reviewed_by = null, reviewed_at = null
  returning p.id into pid;
  insert into public.team_tasks (kind, filing_id, workspace_id, title, detail, dedupe)
    values ('playbook_review', p_filing, f.workspace_id, left(format('Review the steps taught on %s for %s before they run on their own', lower(p_host), p_official), 300),
      jsonb_build_object('playbook', pid, 'flags', coalesce(p_flags, '{}')), format('playbook:%s:%s', pid, (select version from public.portal_playbooks where public.portal_playbooks.id = pid)))
    on conflict (dedupe) do nothing;
  return query select pid, 'draft'::text;
end $$;

/* The portal's taught playbook for a run: a draft (assist mode) or an approved one. Never who taught it. */
create or replace function public.filer_taught_playbook(p_host text, p_official text)
returns table (id uuid, status text, body jsonb, runs int, successes int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.status, p.body, p.runs, p.successes from public.portal_playbooks p
  where p.host = lower(p_host) and p.official = p_official and p.status in ('draft', 'approved')
$$;

/* One run's result. Only a filing the agent was given, for the playbook's own form. Three failures in a row, or a
   success rate under 60% after five runs, send an approved playbook back to review, with a task for the team. Healed
   selectors go to the Quality tab's queue as drift. Returns the playbook's status after this run. */
create or replace function public.filer_taught_result(p_playbook uuid, p_filing uuid, p_ok boolean, p_drift jsonb default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare f public.filings; p public.portal_playbooks; d jsonb;
begin
  select * into f from public.filings where public.filings.id = p_filing;
  if f.id is null or f.agent_state is null then raise exception 'filing_not_given_to_agent'; end if;
  select * into p from public.portal_playbooks where public.portal_playbooks.id = p_playbook for update;
  if p.id is null then raise exception 'no_such_playbook'; end if;
  if coalesce(f.payload ->> 'official', '') <> p.official then raise exception 'not_this_form'; end if;
  update public.portal_playbooks set runs = runs + 1, successes = successes + case when p_ok then 1 else 0 end,
    failures = failures + case when p_ok then 0 else 1 end, fails_in_a_row = case when p_ok then 0 else fails_in_a_row + 1 end,
    last_run_at = now(), updated_at = now()
  where public.portal_playbooks.id = p.id returning * into p;
  if p.status = 'approved' and (p.fails_in_a_row >= 3 or (p.runs >= 5 and p.successes::numeric / p.runs < 0.6)) then
    update public.portal_playbooks set status = 'draft', demoted_at = now(),
      demoted_reason = case when p.fails_in_a_row >= 3 then format('%s failed runs in a row', p.fails_in_a_row) else format('%s of %s runs succeeded', p.successes, p.runs) end
    where public.portal_playbooks.id = p.id returning * into p;
    insert into public.team_tasks (kind, filing_id, workspace_id, title, detail, dedupe)
      values ('playbook_review', p_filing, f.workspace_id, left(format('The taught steps for %s on %s went back to review: %s', p.official, p.host, p.demoted_reason), 300),
        jsonb_build_object('playbook', p.id, 'demoted', true), format('playbook-demoted:%s:%s', p.id, p.runs))
      on conflict (dedupe) do nothing;
  end if;
  if jsonb_typeof(p_drift) = 'array' and jsonb_array_length(p_drift) > 0 then
    select jsonb_agg(left(x, 200)) into d from (select jsonb_array_elements_text(p_drift) x limit 20) s;
    perform public.qa_report(jsonb_build_array(jsonb_build_object(
      'kind', 'drift', 'severity', 'medium', 'source', 'https://' || p.host || '/', 'subject', left(format('Taught steps for %s on %s', p.official, p.host), 300),
      'repro', left('A run found these recorded steps again by their words: ' || array_to_string(array(select jsonb_array_elements_text(d)), '; '), 4000),
      'fix', 'Check the page in the Quality tab''s taught steps and approve the new selectors, or send the playbook back for a new recording.')));
  end if;
  return p.status;
end $$;

revoke execute on function public.filer_save_taught(uuid, text, text, text, jsonb, text[]), public.filer_taught_playbook(text, text),
  public.filer_taught_result(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.filer_save_taught(uuid, text, text, text, jsonb, text[]), public.filer_taught_playbook(text, text),
  public.filer_taught_result(uuid, uuid, boolean, jsonb) to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'grant execute on function public.filer_save_taught(uuid, text, text, text, jsonb, text[]), public.filer_taught_playbook(text, text), public.filer_taught_result(uuid, uuid, boolean, jsonb) to placetta_filer';
  end if;
end $$;

/* The staff queue (the Quality tab): drafts first, then approved playbooks with their record. Staff with two-step only. */
create or replace function public.playbook_queue()
returns table (id uuid, host text, official text, name text, status text, flags text[], body jsonb, version int, runs int, successes int,
  failures int, fails_in_a_row int, taught_at timestamptz, last_run_at timestamptz, demoted_at timestamptz, demoted_reason text, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return query select p.id, p.host, p.official, p.name, p.status, p.flags, p.body, p.version, p.runs, p.successes, p.failures, p.fails_in_a_row,
    p.taught_at, p.last_run_at, p.demoted_at, p.demoted_reason, p.reviewed_at
  from public.portal_playbooks p where p.status in ('draft', 'approved')
  order by case p.status when 'draft' then 0 else 1 end, p.taught_at desc limit 200;
end $$;

/* A staff decision on a taught playbook: approve it (it then runs unattended, still under every guard), reject it, or
   send it back to draft. Approval needs a complete body (a send step, the confirmation page, steps to replay), and a
   draft a page talked to the AI on needs a note saying the steps were checked. */
create or replace function public.playbook_decide(p_id uuid, p_status text, p_note text default null)
returns table (id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare p public.portal_playbooks; note text := left(nullif(trim(coalesce(p_note, '')), ''), 2000);
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if p_status not in ('approved', 'rejected', 'draft') then raise exception 'status must be approved, rejected or draft'; end if;
  select * into p from public.portal_playbooks where public.portal_playbooks.id = p_id for update;
  if p.id is null then raise exception 'No such playbook.'; end if;
  if p_status = 'approved' then
    if jsonb_array_length(coalesce(p.body -> 'playbook' -> 'final', '[]'::jsonb)) = 0 or jsonb_array_length(coalesce(p.body -> 'playbook' -> 'receipt', '[]'::jsonb)) = 0
       or jsonb_array_length(coalesce(p.body -> 'trace', '[]'::jsonb)) = 0 then
      raise exception 'not_complete: it needs the send step, the confirmation page and the steps to replay';
    end if;
    if 'page_injection' = any(p.flags) and note is null then raise exception 'note_needed: a page in this recording talked to the AI; say what you checked'; end if;
  end if;
  if p_status = 'rejected' and note is null then raise exception 'note_needed: say why it''s rejected'; end if;
  update public.portal_playbooks set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = note, updated_at = now(),
    fails_in_a_row = case when p_status = 'approved' then 0 else fails_in_a_row end
  where public.portal_playbooks.id = p.id;
  update public.team_tasks set done_at = now(), done_by = auth.uid()
    where kind = 'playbook_review' and done_at is null and detail ->> 'playbook' = p.id::text;
  return query select p.id, p_status;
end $$;
revoke execute on function public.playbook_queue(), public.playbook_decide(uuid, text, text) from public, anon;
grant execute on function public.playbook_queue(), public.playbook_decide(uuid, text, text) to authenticated;
