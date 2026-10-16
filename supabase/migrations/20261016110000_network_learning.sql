-- The network (src/learning.ts): Odelia gets smarter with every business on Placetta. Finished jobs and agency decisions
-- become short, anonymized lessons keyed by place, agency or form; every job after that starts from them. A lesson goes
-- live when a second business confirms it (or one cites the agency's own site), retires when businesses contradict it or
-- it keeps losing, and ranks by its record. One business counts once per lesson. Only the service role writes.

create table if not exists public.odelia_lessons (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('place', 'agency', 'form', 'pitfall')),
  key text not null check (length(key) between 6 and 120),
  text_en text not null check (length(text_en) between 20 and 420),
  text_zh text not null check (length(text_zh) between 1 and 420),
  source_url text check (source_url is null or (source_url ~ '^https://' and length(source_url) < 400)),
  official boolean not null default false,
  status text not null default 'candidate' check (status in ('candidate', 'live', 'retired')),
  pinned text check (pinned in ('live', 'retired')),          -- Placetta's team overrides the vote
  businesses int not null default 0,
  confirms int not null default 0,
  contradicts int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists odelia_lessons_fp on public.odelia_lessons (key, fingerprint);
create index if not exists odelia_lessons_live on public.odelia_lessons (key) where status = 'live';
alter table public.odelia_lessons enable row level security;
drop policy if exists "signed-in people read live lessons" on public.odelia_lessons;
create policy "signed-in people read live lessons" on public.odelia_lessons for select to authenticated using (status = 'live' or public.is_staff());
revoke all on public.odelia_lessons from anon;
revoke insert, update, delete on public.odelia_lessons from authenticated;

create table if not exists public.odelia_lesson_votes (
  lesson_id uuid not null references public.odelia_lessons(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  at timestamptz not null default now(),
  primary key (lesson_id, workspace_id)
);
create index if not exists odelia_lesson_votes_ws on public.odelia_lesson_votes (workspace_id, at);
alter table public.odelia_lesson_votes enable row level security;
revoke all on public.odelia_lesson_votes from anon, authenticated;

-- A lesson's standing, from its votes and its record.
create or replace function public.lesson_recount(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c int; x int;
begin
  select count(*) filter (where vote = 1), count(*) filter (where vote = -1) into c, x from public.odelia_lesson_votes where lesson_id = p_id;
  update public.odelia_lessons l set
    confirms = c, contradicts = x, businesses = c + x, updated_at = now(),
    status = case
      when l.pinned is not null then l.pinned
      when x >= 2 and x > c then 'retired'
      when l.losses >= 4 and l.wins * 3 < l.losses then 'retired'
      when c >= 2 and c > x then 'live'
      when c >= 1 and l.official and x = 0 then 'live'
      else 'candidate' end
  where l.id = p_id;
end $$;

create or replace function public.lesson_vote(p_lesson uuid, p_ws uuid, p_vote smallint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.odelia_lesson_votes (lesson_id, workspace_id, vote) values (p_lesson, p_ws, p_vote)
  on conflict (lesson_id, workspace_id) do update set vote = excluded.vote, at = now();
  perform public.lesson_recount(p_lesson);
end $$;

-- A new lesson (or the same one again, which counts as a confirmation). At most 30 votes a day from one business.
create or replace function public.lesson_add(p_ws uuid, p_kind text, p_key text, p_en text, p_zh text, p_url text, p_official boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; fp text := md5(regexp_replace(lower(p_en), '[^a-z0-9]+', '', 'g'));
begin
  if (select count(*) from public.odelia_lesson_votes where workspace_id = p_ws and at > now() - interval '1 day') >= 30 then
    return null;
  end if;
  insert into public.odelia_lessons (kind, key, text_en, text_zh, source_url, official, fingerprint)
  values (p_kind, p_key, p_en, coalesce(nullif(p_zh, ''), p_en), p_url, coalesce(p_official, false), fp)
  on conflict (key, fingerprint) do update set
    source_url = coalesce(public.odelia_lessons.source_url, excluded.source_url),
    official = public.odelia_lessons.official or excluded.official
  returning id into v_id;
  perform public.lesson_vote(v_id, p_ws, 1::smallint);
  return v_id;
end $$;

-- Lessons that were in play when a job passed (or failed) its independent check.
create or replace function public.lesson_outcome(p_ids uuid[], p_ok boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare i uuid;
begin
  update public.odelia_lessons set wins = wins + case when p_ok then 1 else 0 end, losses = losses + case when p_ok then 0 else 1 end where id = any(p_ids);
  foreach i in array coalesce(p_ids, '{}') loop perform public.lesson_recount(i); end loop;
end $$;

-- When a business leaves (account deletion), its votes go with it and the counts follow.
create or replace function public.lesson_votes_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform public.lesson_recount(old.lesson_id); return null; end $$;
drop trigger if exists lesson_votes_gone on public.odelia_lesson_votes;
create trigger lesson_votes_gone after delete on public.odelia_lesson_votes for each row execute function public.lesson_votes_gone();

-- Agency decisions are the strongest signal there is: each one is queued for the distiller.
create table if not exists public.learning_queue (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  filing_id uuid not null references public.filings(id) on delete cascade,
  status text not null,
  at timestamptz not null default now(),
  done_at timestamptz,
  unique (filing_id, status)
);
create index if not exists learning_queue_open on public.learning_queue (at) where done_at is null;
alter table public.learning_queue enable row level security;
revoke all on public.learning_queue from anon, authenticated;

create or replace function public.filings_learn() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('accepted', 'rejected', 'needs_info') and new.status is distinct from old.status
     and (new.status = 'accepted' or new.note is not null) then
    insert into public.learning_queue (workspace_id, filing_id, status) values (new.workspace_id, new.id, new.status)
    on conflict (filing_id, status) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists filings_learn on public.filings;
create trigger filings_learn after update of status on public.filings for each row execute function public.filings_learn();

-- The learning curve: each job's first independent check. The share that pass the first time is the number the
-- network moves.
create table if not exists public.odelia_job_checks (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid,
  job_id text not null,
  passed int not null,
  of int not null check (of > 0),
  lessons int not null default 0,
  at timestamptz not null default now(),
  unique (workspace_id, job_id)
);
create index if not exists odelia_job_checks_at on public.odelia_job_checks (at);
alter table public.odelia_job_checks enable row level security;
revoke all on public.odelia_job_checks from anon, authenticated;

-- What a member sees: the live lessons for their places, agencies and forms; the network's size; the weekly
-- first-try pass rate; and how long each of their forms takes at the agency across businesses (only with 3 or more,
-- so nobody's filing can be singled out).
create or replace function public.network_view(p_ws uuid, p_keys text[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare forms text[];
begin
  if not (public.is_member(p_ws) or public.is_staff()) then raise exception 'Not a member of this workspace.'; end if;
  select coalesce(array_agg(substr(k, 6)), '{}') into forms from unnest(coalesce(p_keys, '{}')) k where k like 'form:%';
  return jsonb_build_object(
    'lessons', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'key', l.key, 'text', jsonb_build_object('en', l.text_en, 'zh', l.text_zh),
        'source_url', l.source_url, 'businesses', l.businesses, 'confirms', l.confirms, 'contradicts', l.contradicts, 'wins', l.wins, 'losses', l.losses, 'updated', l.updated_at)), '[]'::jsonb)
      from (select * from public.odelia_lessons where status = 'live' and key = any(coalesce(p_keys, '{}')) order by confirms + wins - contradicts - losses desc, updated_at desc limit 40) l),
    'businesses', (select count(distinct workspace_id) from public.odelia_lesson_votes),
    'live', (select count(*) from public.odelia_lessons where status = 'live'),
    'curve', (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'first_try', r, 'jobs', n) order by w), '[]'::jsonb) from (
      select to_char(date_trunc('week', at), 'YYYY-MM-DD') w, round(avg(case when passed = of then 1 else 0 end)::numeric, 3) r, count(*) n
      from public.odelia_job_checks where at > now() - interval '12 weeks' group by 1) c),
    'forms', (select coalesce(jsonb_agg(jsonb_build_object('form', f, 'businesses', b, 'median_days', d, 'approved_rate', a)), '[]'::jsonb) from (
      select payload->>'official' f, count(distinct workspace_id) b,
        round((percentile_cont(0.5) within group (order by extract(epoch from decided_at - submitted_at) / 86400) filter (where status = 'accepted' and decided_at is not null))::numeric, 1) d,
        round((avg(case when status = 'accepted' then 1 else 0 end) filter (where status in ('accepted', 'rejected')))::numeric, 2) a
      from public.filings where payload->>'official' = any(forms) and submitted_at is not null group by 1 having count(distinct workspace_id) >= 3) s)
  );
end $$;

revoke execute on function public.lesson_recount(uuid), public.lesson_vote(uuid, uuid, smallint), public.lesson_add(uuid, text, text, text, text, text, boolean),
  public.lesson_outcome(uuid[], boolean), public.lesson_votes_gone(), public.filings_learn() from public, anon, authenticated;
grant execute on function public.lesson_vote(uuid, uuid, smallint), public.lesson_add(uuid, text, text, text, text, text, boolean), public.lesson_outcome(uuid[], boolean) to service_role;
revoke execute on function public.network_view(uuid, text[]) from public, anon;
grant execute on function public.network_view(uuid, text[]) to authenticated;

-- Every 15 minutes: agency decisions waiting to be learned from go to the distiller.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; agency decisions are learned from only when a run asks.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-learn';
  perform cron.schedule('placetta-learn', '*/15 * * * *', $job$
    select net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/agent-run',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)),
      body := '{"action":"learn"}'::jsonb,
      timeout_milliseconds := 30000
    )
    where exists (select 1 from public.learning_queue where done_at is null);
  $job$);
end $$;
