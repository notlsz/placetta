-- A person checks the work: every filing card says it was checked by Odelia, and where a Placetta specialist reviewed
-- it, who (first name) and when. That review comes from two places: the team's two-key approval before Placetta sends
-- an agency's first filings (the file function's team_approve, logged on the filing as two_key_ok), and a review the
-- owner asks for on any application. Asking opens a team task; the team's review queue shows each request with its
-- one-business-day target. An owner can ask up to 5 times a day, once at a time per application. Safe to run twice.

-- The name customers see on a review. Staff without one show as "a Placetta specialist", with no name.
alter table public.staff_emails add column if not exists first_name text check (first_name is null or length(first_name) between 1 and 40);
comment on column public.staff_emails.first_name is 'Shown to customers on reviews ("Reviewed by Mei, a Placetta specialist"). Set with: update staff_emails set first_name = ''Mei'' where email = ''mei@placetta.com'';';

create table if not exists public.specialist_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_id text not null check (length(app_id) between 1 and 120),
  title jsonb not null check (jsonb_typeof(title) = 'object'),
  note text check (note is null or length(note) <= 500),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  due_at timestamptz not null,
  status text not null default 'requested' check (status in ('requested', 'done', 'canceled')),
  reviewer uuid references auth.users(id) on delete set null,
  reviewer_name text check (reviewer_name is null or length(reviewer_name) <= 40),
  reviewed_at timestamptz,
  outcome text check (outcome is null or outcome in ('looks_right', 'changes_needed')),
  comment text check (comment is null or length(comment) <= 1000),
  task_id uuid references public.team_tasks(id) on delete set null
);
comment on table public.specialist_reviews is 'Reviews owners ask a Placetta specialist for, one open at a time per application. Read through specialist_reviews_for and review_queue.';
create unique index if not exists specialist_reviews_one_open on public.specialist_reviews(workspace_id, app_id) where status = 'requested';
create index if not exists specialist_reviews_ws on public.specialist_reviews(workspace_id, requested_at desc);
create index if not exists specialist_reviews_open on public.specialist_reviews(due_at) where status = 'requested';
alter table public.specialist_reviews enable row level security;
revoke all on public.specialist_reviews from public, anon, authenticated;

-- One business day after a moment, in New York time: Friday afternoon is due Monday afternoon; a request on a weekend
-- is due by the end of Monday.
create or replace function public.one_business_day(t timestamptz) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare l timestamp := t at time zone 'America/New_York'; d int;
begin
  d := extract(isodow from l);
  if d = 6 then l := date_trunc('day', l) + interval '2 days 18 hours';         -- Saturday: Monday 6pm
  elsif d = 7 then l := date_trunc('day', l) + interval '1 day 18 hours';       -- Sunday: Monday 6pm
  else
    l := l + interval '1 day';
    if extract(isodow from l) = 6 then l := l + interval '2 days'; end if;    -- Friday: Monday
  end if;
  return l at time zone 'America/New_York';
end $$;
revoke execute on function public.one_business_day(timestamptz) from public, anon;
grant execute on function public.one_business_day(timestamptz) to authenticated, service_role;

-- The first name a staff email shows as, or null.
create or replace function public.staff_first_name(p_email text) returns text
language sql stable security definer set search_path = '' as $$
  select s.first_name from public.staff_emails s where s.email = lower(trim(coalesce(p_email, '')));
$$;
revoke execute on function public.staff_first_name(text) from public, anon, authenticated;

-- An owner asks a specialist to review one application.
create or replace function public.request_specialist_review(ws uuid, p_app_id text, p_title jsonb, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.specialist_reviews; t uuid; biz text; en text;
begin
  if not public.is_owner(ws) then raise exception 'Only an owner can ask for a specialist review.'; end if;
  if length(coalesce(p_app_id, '')) not between 1 and 120 then raise exception 'Pick an application.'; end if;
  perform 1 from public.workspaces where id = ws for update;
  select * into r from public.specialist_reviews where workspace_id = ws and app_id = p_app_id and status = 'requested';
  if r.id is not null then return to_jsonb(r) - 'requested_by' - 'reviewer' - 'task_id'; end if;
  if (select count(*) from public.specialist_reviews where workspace_id = ws and requested_at > now() - interval '1 day') >= 5 then
    raise exception 'rate_limited' using hint = 'Up to 5 specialist reviews a day. The ones you asked for are with the team.';
  end if;
  en := left(coalesce(p_title->>'en', p_title->>'zh', p_app_id), 200);
  insert into public.specialist_reviews(workspace_id, app_id, title, note, requested_by, due_at)
  values (ws, p_app_id, jsonb_build_object('en', en, 'zh', left(coalesce(p_title->>'zh', en), 200)), nullif(left(trim(coalesce(p_note, '')), 500), ''), auth.uid(), public.one_business_day(now()))
  returning * into r;
  select name into biz from public.workspaces where id = ws;
  insert into public.team_tasks(kind, workspace_id, title, detail, dedupe)
  values ('review', ws, 'Specialist review asked for: ' || en, jsonb_build_object('specialist_review_id', r.id, 'app_id', p_app_id, 'note', r.note, 'due_at', r.due_at), 'specialist:' || r.id)
  returning id into t;
  update public.specialist_reviews set task_id = t where id = r.id;
  perform public.audit_team(ws, 'Asked a Placetta specialist to review it', '请快哉专员审核', en);
  return to_jsonb(r) - 'requested_by' - 'reviewer' - 'task_id';
end $$;

-- What a member sees, per application: the reviews done (two-key approvals and requested reviews), with the
-- reviewer's first name when the team has set one, and any review still waiting with its due time.
create or replace function public.specialist_reviews_for(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(ws) and not public.is_staff() then raise exception 'Not your workspace.'; end if;
  return (
    with two_key as (
      select f.app_id, e.value->>'ref' as who, (e.value->>'at')::timestamptz as at
        from public.filings f cross join lateral jsonb_array_elements(case when jsonb_typeof(f.agent_log) = 'array' then f.agent_log else '[]'::jsonb end) e
       where f.workspace_id = ws and e.value->>'kind' = 'two_key_ok' and e.value->>'at' ~ '^\d{4}-\d{2}-\d{2}'
    ),
    rows as (
      select app_id, 'two_key'::text as kind, 'done'::text as status, public.staff_first_name(who) as reviewer_name, at as reviewed_at,
             null::text as outcome, null::text as comment, null::timestamptz as requested_at, null::timestamptz as due_at
        from two_key
      union all
      select app_id, 'requested', status, reviewer_name, reviewed_at, outcome, comment, requested_at, due_at
        from public.specialist_reviews where workspace_id = ws and status in ('requested', 'done')
    )
    select coalesce(jsonb_agg(jsonb_build_object('app_id', app_id, 'kind', kind, 'status', status, 'reviewer_name', reviewer_name,
      'reviewed_at', reviewed_at, 'outcome', outcome, 'comment', comment, 'requested_at', requested_at, 'due_at', due_at)
      order by coalesce(reviewed_at, requested_at) desc), '[]'::jsonb) from rows);
end $$;

-- The team's review queue: what's waiting (oldest due first) and what was done in the last 7 days.
create or replace function public.review_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'workspace_id', r.workspace_id, 'business', w.name, 'app_id', r.app_id, 'title', r.title,
      'note', r.note, 'requested_by', u.email, 'requested_at', r.requested_at, 'due_at', r.due_at, 'status', r.status,
      'reviewer_name', r.reviewer_name, 'reviewed_at', r.reviewed_at, 'outcome', r.outcome, 'comment', r.comment)
    order by case r.status when 'requested' then 0 else 1 end, case when r.status = 'requested' then r.due_at end, r.reviewed_at desc), '[]'::jsonb)
    from public.specialist_reviews r
    join public.workspaces w on w.id = r.workspace_id
    left join auth.users u on u.id = r.requested_by
    where r.status = 'requested' or (r.status = 'done' and r.reviewed_at > now() - interval '7 days'));
end $$;

-- A specialist finishes a review: the outcome and a note for the owner. The task closes, the owner gets an Update,
-- and the audit trail says who reviewed it.
create or replace function public.review_finish(p_id uuid, p_outcome text, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.specialist_reviews; me text; nm text; en text; zh text;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if p_outcome not in ('looks_right', 'changes_needed') then raise exception 'Say whether it looks right or needs changes.'; end if;
  if p_outcome = 'changes_needed' and length(trim(coalesce(p_comment, ''))) = 0 then raise exception 'Say what needs to change.'; end if;
  select lower(email) into me from auth.users where id = auth.uid();
  nm := public.staff_first_name(me);
  update public.specialist_reviews set status = 'done', reviewer = auth.uid(), reviewer_name = nm, reviewed_at = now(),
    outcome = p_outcome, comment = nullif(left(trim(coalesce(p_comment, '')), 1000), '')
  where id = p_id and status = 'requested' returning * into r;
  if r.id is null then raise exception 'This review is already done.'; end if;
  update public.team_tasks set done_at = now(), done_by = auth.uid() where id = r.task_id and done_at is null;
  en := case when p_outcome = 'looks_right' then 'A Placetta specialist reviewed it: it looks right' else 'A Placetta specialist reviewed it: changes needed' end;
  zh := case when p_outcome = 'looks_right' then '快哉专员已审核：内容无误' else '快哉专员已审核：需要修改' end;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
  values (r.workspace_id, 'team', auth.uid(), jsonb_build_object('en', en, 'zh', zh), r.title,
          case when r.comment is not null then jsonb_build_object('en', r.comment, 'zh', r.comment) end);
  insert into public.updates(workspace_id, kind, title, body, app_id, dedupe)
  values (r.workspace_id, 'team',
    jsonb_build_object('en', (r.title->>'en') || ': reviewed by ' || coalesce(nm || ', a Placetta specialist', 'a Placetta specialist'),
                       'zh', (r.title->>'zh') || '：' || coalesce('快哉专员 ' || nm, '快哉专员') || '已审核'),
    jsonb_build_object('en', case when p_outcome = 'looks_right' then 'It looks right.' else 'Changes needed: ' end || coalesce(r.comment, ''),
                       'zh', case when p_outcome = 'looks_right' then '内容无误。' else '需要修改：' end || coalesce(r.comment, '')),
    r.app_id, 'specialist:' || r.id)
  on conflict (workspace_id, dedupe) do nothing;
  return to_jsonb(r) - 'requested_by' - 'reviewer' - 'task_id';
end $$;

revoke execute on function public.request_specialist_review(uuid, text, jsonb, text), public.specialist_reviews_for(uuid), public.review_queue(), public.review_finish(uuid, text, text) from public, anon;
grant execute on function public.request_specialist_review(uuid, text, jsonb, text), public.specialist_reviews_for(uuid), public.review_queue(), public.review_finish(uuid, text, text) to authenticated;
