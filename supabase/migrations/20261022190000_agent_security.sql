-- Odelia's protections in the database: the tool-call log, the requesting person's role for a run, lessons that need
-- more than one business, and short-lived run tokens that limit the portal filer to the one filing it's working.
--
-- 1. agent_tool_calls: every tool call a run makes, with who asked, their role, a SHA-256 of the call's input and what
--    was decided (allow, deny, error). Written by agent-run (service role) only; owners, admins and staff read their
--    workspace's rows; nobody updates or deletes one. Kept after a workspace is deleted, like the audit trail.
-- 2. agent_actor_role(ws, uid): the person's role in the workspace (owner, admin, member, viewer), 'staff' for
--    Placetta staff with a proven email, or 'none'. agent-run looks it up on every chunk of a run, so a run acts with the
--    role the person has now, never with the service role's.
-- 3. Lessons: a lesson goes live only when two or more businesses confirm it (an official source alone no longer
--    does), and lesson_add refuses text that reads like instructions to an AI or carries a link or an address.
-- 4. Filer run tokens: the filer's role key can claim a filing and start a run for it, which returns a random token
--    (only its SHA-256 is kept) good for that one filing for at most 60 minutes and ended when the run ends. Every
--    filer function that touches a filing (read it, list or open its saved logins, step it, list a receipt, post an
--    update or a team task) and every update to the filing itself needs that token, sent as the x-filer-run header.
--    The service role (the team, the server) is unaffected.
--
-- Safe to run twice. Not applied to the live project by this commit. Tests: supabase/tests/agent_security.sql,
-- supabase/tests/filer_role.sql, supabase/tests/network.sql.

-- ---------------------------------------------------------------- 1. the tool-call log
create table if not exists public.agent_tool_calls (
  id bigserial primary key,
  workspace_id uuid not null,
  run_id uuid,
  actor_id uuid,
  actor_role text not null check (actor_role in ('owner', 'admin', 'member', 'viewer', 'staff', 'system')),
  tool text not null check (char_length(tool) between 1 and 120),
  scope text check (scope is null or char_length(scope) <= 20),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('allow', 'deny', 'error')),
  code text check (code is null or char_length(code) <= 40),
  reason text check (reason is null or char_length(reason) <= 400),
  at timestamptz not null default now()
);
comment on table public.agent_tool_calls is 'Every tool call an Odelia run made: who asked, their role, a SHA-256 of the input and the decision. Append-only.';
create index if not exists agent_tool_calls_ws on public.agent_tool_calls (workspace_id, at desc);
create index if not exists agent_tool_calls_run on public.agent_tool_calls (run_id);
alter table public.agent_tool_calls enable row level security;
revoke all on public.agent_tool_calls from public, anon, authenticated;
grant select on public.agent_tool_calls to authenticated;
grant select, insert on public.agent_tool_calls to service_role;
do $$ begin
  if exists (select 1 from pg_class where relname = 'agent_tool_calls_id_seq') then
    execute 'grant usage on sequence public.agent_tool_calls_id_seq to service_role';
  end if;
end $$;
drop policy if exists "owners and admins read their tool calls" on public.agent_tool_calls;
create policy "owners and admins read their tool calls" on public.agent_tool_calls for select to authenticated
  using (public.is_admin(workspace_id) or public.is_staff());

create or replace function public.agent_tool_calls_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'agent_tool_calls is append-only';
end $$;
drop trigger if exists agent_tool_calls_append_only on public.agent_tool_calls;
create trigger agent_tool_calls_append_only before update or delete on public.agent_tool_calls
  for each row execute function public.agent_tool_calls_append_only();
drop trigger if exists agent_tool_calls_no_truncate on public.agent_tool_calls;
create trigger agent_tool_calls_no_truncate before truncate on public.agent_tool_calls
  for each statement execute function public.agent_tool_calls_append_only();

-- ---------------------------------------------------------------- 2. who a run acts for
create or replace function public.agent_actor_role(p_ws uuid, p_uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.role from public.workspace_members m where m.workspace_id = p_ws and m.user_id = p_uid),
    case when exists (select 1 from public.staff_emails s join auth.users u on lower(u.email) = s.email where u.id = p_uid)
              and public.email_proven(p_uid) then 'staff' end,
    'none')
$$;
revoke execute on function public.agent_actor_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.agent_actor_role(uuid, uuid) to service_role;

-- ---------------------------------------------------------------- 3. lessons need more than one business
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
      -- two or more different businesses, and more confirm it than contradict it; an official link alone isn't enough
      when c >= 2 and c > x then 'live'
      else 'candidate' end
  where l.id = p_id;
end $$;

-- What a lesson may never say: instructions to an AI, a link, an email address.
create or replace function public.lesson_text_ok(p_text text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_text, '') !~* '(ignore|disregard|forget|override)[^.]{0,40}(instruction|rule|prompt|guideline)|system prompt|you are now|developer message|<\|?im_(start|end)|\[/?inst\]|assistant\s*:|(do not|don''t|never)[^.]{0,20}(tell|inform|notify)[^.]{0,20}(user|owner|person|customer)|(call|use|run|invoke)[^.]{0,20}(request_|send_email|draft_message|remove_|change_setting)|https?://|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     and coalesce(p_text, '') !~ '(忽略|无视)[^。]{0,12}(指令|指示|规则)'
$$;

create or replace function public.lesson_add(p_ws uuid, p_kind text, p_key text, p_en text, p_zh text, p_url text, p_official boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; fp text := md5(regexp_replace(lower(p_en), '[^a-z0-9]+', '', 'g'));
begin
  if (select count(*) from public.odelia_lesson_votes where workspace_id = p_ws and at > now() - interval '1 day') >= 30 then
    return null;
  end if;
  -- a lesson that reads like instructions, or carries a link or an address, never enters the network
  if not public.lesson_text_ok(p_en) or not public.lesson_text_ok(p_zh) then
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
revoke execute on function public.lesson_add(uuid, text, text, text, text, text, boolean), public.lesson_recount(uuid) from public, anon, authenticated;

-- Lessons already live on one business and an official link go back to candidate until a second business confirms.
do $$
declare l record;
begin
  for l in select id from public.odelia_lessons where status = 'live' and pinned is null and confirms < 2 loop
    perform public.lesson_recount(l.id);
  end loop;
end $$;

-- ---------------------------------------------------------------- 4. the filer's run tokens
create table if not exists public.filer_runs (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  filing_id uuid not null references public.filings(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);
comment on table public.filer_runs is 'One portal filer run: the SHA-256 of its token, the one filing it may touch, and until when. Server only.';
create index if not exists filer_runs_filing on public.filer_runs (filing_id);
alter table public.filer_runs enable row level security;
revoke all on public.filer_runs from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then execute 'revoke all on public.filer_runs from placetta_filer'; end if;
end $$;

-- The caller is the filer's own role: PostgREST names it in the request's claims; SET ROLE (tests) in the role setting.
create or replace function public.filer_caller() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'placetta_filer'
      or coalesce(current_setting('role', true), '') = 'placetta_filer'
$$;

-- The token this request carries (the x-filer-run header).
create or replace function public.filer_run_token() returns text
language sql stable set search_path = '' as $$
  select nullif(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-filer-run', ''), '')
$$;

-- May this request touch this filing? Always for the service role; for the filer only with a live token for it.
create or replace function public.filer_run_ok(p_filing uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not public.filer_caller() or exists (
    select 1 from public.filer_runs r
    where r.token_hash = encode(sha256(convert_to(coalesce(public.filer_run_token(), ''), 'UTF8')), 'hex')
      and r.filing_id = p_filing and r.ended_at is null and r.expires_at > now())
$$;

-- A run starts on a filing the agent is running: earlier tokens for it end, a new one is made, good for p_minutes
-- (5 to 60). Only its hash is kept.
create or replace function public.filer_begin_run(p_filing uuid, p_minutes int default 45) returns text
language plpgsql security definer set search_path = '' as $$
declare t text; f public.filings;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is distinct from 'running' then raise exception 'filing_not_running'; end if;
  update public.filer_runs set ended_at = now() where filing_id = p_filing and ended_at is null;
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.filer_runs (token_hash, filing_id, expires_at)
    values (encode(sha256(convert_to(t, 'UTF8')), 'hex'), p_filing, now() + make_interval(mins => least(greatest(coalesce(p_minutes, 45), 5), 60)));
  return t;
end $$;

-- The run is over: its token stops working.
create or replace function public.filer_end_run() returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.filer_runs set ended_at = now()
  where token_hash = encode(sha256(convert_to(coalesce(public.filer_run_token(), ''), 'UTF8')), 'hex') and ended_at is null;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- The filer's functions, with the token check (the same bodies as 20261022120000_filer_least_privilege.sql otherwise).
create or replace function public.filer_filing(p_id uuid)
returns table (id uuid, workspace_id uuid, app_id text, title jsonb, status text, payload jsonb, channel text, agent_state text,
  agent_log jsonb, handoff_url text, submit_clicked_at timestamptz, attempts int, confirmation_number text)
language sql stable security definer set search_path = '' as $$
  select f.id, f.workspace_id, f.app_id, f.title, f.status, f.payload, f.channel, f.agent_state, f.agent_log, f.handoff_url,
         f.submit_clicked_at, f.attempts, f.confirmation_number
  from public.filings f where f.id = p_id and f.agent_state is not null and public.filer_run_ok(p_id)
$$;

create or replace function public.filer_logins(p_filing uuid)
returns table (id uuid, agency text, url text, username text)
language sql stable security definer set search_path = '' as $$
  select l.id, l.agency, l.url, l.username
  from public.agency_logins l join public.filings f on f.workspace_id = l.workspace_id
  where f.id = p_filing and f.agent_state = 'running' and public.filer_run_ok(p_filing)
  order by l.created_at
$$;

create or replace function public.filer_open_login(p_filing uuid, p_login uuid)
returns table (username text, password text)
language plpgsql security definer set search_path = '' as $$
declare f public.filings; l public.agency_logins; pw text;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is distinct from 'running' then raise exception 'filing_not_running'; end if;
  select * into l from public.agency_logins where id = p_login and workspace_id = f.workspace_id;
  if l.id is null then raise exception 'login_not_in_workspace'; end if;
  if not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object)
    values (f.workspace_id, 'agent', null,
            jsonb_build_object('en', 'Placetta opened the saved login for ' || l.agency, 'zh', '快哉打开了 ' || l.agency || ' 的已保存登录'),
            f.title);
  update public.agency_logins set last_opened_at = now(), last_opened_by = null where id = l.id;
  pw := public.vault_get(l.secret_id);
  if pw is null then raise exception 'login_unreadable'; end if;
  return query select l.username, pw;
end $$;

create or replace function public.filer_save_doc(p_filing uuid, p_name text, p_path text, p_size bigint, p_mime text) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.filings;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is null then raise exception 'filing_not_given_to_agent'; end if;
  if p_path not like f.workspace_id::text || '/receipts/' || f.id::text || '-%' then raise exception 'path_outside_filing'; end if;
  if not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  insert into public.documents (workspace_id, app_id, filing_id, name, path, size, mime, source, uploaded_by)
  values (f.workspace_id, f.app_id, f.id, p_name, p_path, p_size, p_mime, 'agent', null);
end $$;

create or replace function public.filer_team_task(p_filing uuid, p_kind text, p_title text, p_detail jsonb, p_dedupe text) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if p_filing is not null then
    select workspace_id into ws from public.filings where id = p_filing and agent_state is not null;
    if ws is null then raise exception 'filing_not_given_to_agent'; end if;
    if not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  end if;
  insert into public.team_tasks (kind, filing_id, workspace_id, title, detail, dedupe)
  values (p_kind, p_filing, ws, p_title, p_detail, p_dedupe) on conflict (dedupe) do nothing;
end $$;

create or replace function public.filer_notify(p_filing uuid, p_title jsonb, p_body jsonb, p_dedupe text) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.filings;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is null then raise exception 'filing_not_given_to_agent'; end if;
  if not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  insert into public.updates (workspace_id, kind, app_id, title, body, dedupe)
  values (f.workspace_id, 'filing', f.app_id, p_title, p_body, p_dedupe) on conflict (workspace_id, dedupe) do nothing;
end $$;

-- Any change to a filing made as the filer (filing_agent_step, take_held_filing) needs the token for that filing. The
-- one change it makes without one is the claim: queued to running.
create or replace function public.filer_filing_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.filer_caller() then return new; end if;
  if old.agent_state = 'queued' and new.agent_state = 'running' and old.id = new.id then return new; end if;
  if not public.filer_run_ok(new.id) then raise exception 'run_token_invalid'; end if;
  return new;
end $$;
drop trigger if exists filings_filer_guard on public.filings;
create trigger filings_filer_guard before update on public.filings for each row execute function public.filer_filing_guard();

revoke execute on function public.filer_caller(), public.filer_run_token(), public.filer_run_ok(uuid), public.filer_begin_run(uuid, int),
  public.filer_end_run(), public.filer_filing_guard() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'grant execute on function public.filer_begin_run(uuid, int), public.filer_end_run(), public.filer_caller(), public.filer_run_token(), public.filer_run_ok(uuid) to placetta_filer';
  end if;
end $$;
grant execute on function public.filer_begin_run(uuid, int), public.filer_end_run(), public.filer_caller(), public.filer_run_token(), public.filer_run_ok(uuid) to service_role;
