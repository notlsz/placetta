-- Odelia's filing, cheaper and with fewer CAPTCHAs (2026-10-28, founder-approved):
--   1. filer_runs records what each portal run cost: the browser that served it, and each model call's tier, model,
--      tokens and price (worker/filer/src/cascade.ts), through filer_run_usage with the run's own token. Server only;
--      filer_run_costs adds it up per filing so the real AI cost per license can be read.
--   2. portal_challenges: each CAPTCHA or identity check a run met, by host and browser (never the page), so the hosts
--      that still show them are known; portal_captcha_host tells the file function (logic.ts pick, captchaPlan).
--   3. captcha_preferences: the owner's answer for a site's CAPTCHA (me, team, another way, or ask each time), saved per
--      workspace and host so they are asked once (supabase/functions/file/captcha.ts).
--   4. agency_sessions: the business's signed-in state on one portal (worker/filer/src/session.ts): the portal's own
--      cookies and local storage, in Vault like saved logins, keyed to workspace plus host, ended by the portal's session
--      or 30 days, a sign-in failure, the login being changed or removed, or the workspace being deleted.
--   5. ai_batch_jobs: model calls nobody waits on, sent through Anthropic's Message Batches API at half price
--      (supabase/functions/_shared/batch.ts), with a deadline after which the caller asks the normal way. Server only.
-- RLS is on for every new table. Every new security definer function sets search_path = '' and checks the run token
-- (filer_run_ok) or is revoked from anon and authenticated.

-- ---------------------------------------------------------------- 1. the run's AI and browser
alter table public.filer_runs
  add column if not exists provider text check (provider is null or provider in ('local', 'steel', 'browserbase')),
  add column if not exists ai_calls int not null default 0,
  add column if not exists ai_usd numeric(12, 6) not null default 0,
  add column if not exists ai_input bigint not null default 0,
  add column if not exists ai_output bigint not null default 0,
  add column if not exists ai_cache_read bigint not null default 0,
  add column if not exists ai_cache_write bigint not null default 0,
  add column if not exists replayed_steps int not null default 0,
  add column if not exists ai_by_tier jsonb not null default '{}'::jsonb,
  add column if not exists ai_steps jsonb not null default '[]'::jsonb;
comment on column public.filer_runs.ai_steps is 'Each model call of the run: tier (fast, strong), model, tokens, usd, why it went strong, advisor calls. Server only: never shown to a customer.';

-- The run's ledger, onto the row its token names (the run, or a status check), while the token is live.
create or replace function public.filer_run_usage(p_usage jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int; steps jsonb;
  num constant text := '^[0-9]+(\.[0-9]+)?$';
begin
  if p_usage is null or jsonb_typeof(p_usage) <> 'object' then raise exception 'usage_not_an_object'; end if;
  steps := case when jsonb_typeof(p_usage -> 'steps') = 'array' then p_usage -> 'steps' else '[]'::jsonb end;
  if jsonb_array_length(steps) > 200 or length(steps::text) > 200000 then raise exception 'usage_too_large'; end if;
  update public.filer_runs set
    provider = case when p_usage ->> 'provider' in ('local', 'steel', 'browserbase') then p_usage ->> 'provider' else provider end,
    ai_calls = case when coalesce(p_usage ->> 'calls', '') ~ num then (p_usage ->> 'calls')::numeric::int else ai_calls end,
    ai_usd = case when coalesce(p_usage ->> 'usd', '') ~ num then least((p_usage ->> 'usd')::numeric, 1000) else ai_usd end,
    ai_input = case when coalesce(p_usage ->> 'input', '') ~ num then (p_usage ->> 'input')::numeric::bigint else ai_input end,
    ai_output = case when coalesce(p_usage ->> 'output', '') ~ num then (p_usage ->> 'output')::numeric::bigint else ai_output end,
    ai_cache_read = case when coalesce(p_usage ->> 'cache_read', '') ~ num then (p_usage ->> 'cache_read')::numeric::bigint else ai_cache_read end,
    ai_cache_write = case when coalesce(p_usage ->> 'cache_write', '') ~ num then (p_usage ->> 'cache_write')::numeric::bigint else ai_cache_write end,
    replayed_steps = case when coalesce(p_usage ->> 'replayed_steps', '') ~ num then (p_usage ->> 'replayed_steps')::numeric::int else replayed_steps end,
    ai_by_tier = case when jsonb_typeof(p_usage -> 'by_tier') = 'object' then p_usage -> 'by_tier' else ai_by_tier end,
    ai_steps = steps
  where token_hash = encode(sha256(convert_to(coalesce(public.filer_run_token(), ''), 'UTF8')), 'hex')
    and ended_at is null and expires_at > now();
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- What each filing's runs cost, for staff and the margin views: the real AI cost per license.
create or replace view public.filer_run_costs with (security_invoker = true) as
  select r.filing_id, f.workspace_id, f.app_id, count(*) as runs, sum(r.ai_calls) as calls, sum(r.ai_usd) as ai_usd,
         sum(r.replayed_steps) as replayed_steps, sum(r.ai_input) as input_tokens, sum(r.ai_output) as output_tokens,
         sum(r.ai_cache_read) as cache_read_tokens, sum(r.ai_cache_write) as cache_write_tokens,
         array_agg(distinct r.provider) filter (where r.provider is not null) as providers, max(r.issued_at) as last_run
  from public.filer_runs r join public.filings f on f.id = r.filing_id
  group by r.filing_id, f.workspace_id, f.app_id;
revoke all on public.filer_run_costs from public, anon, authenticated;
grant select on public.filer_run_costs to service_role;

-- ---------------------------------------------------------------- 2. the challenges runs still meet
create table if not exists public.portal_challenges (
  id bigint generated always as identity primary key,
  host text not null check (host ~ '^[a-z0-9.-]{1,253}$'),
  kind text not null check (kind in ('captcha', 'identity')),
  provider text check (provider is null or provider in ('local', 'steel', 'browserbase')),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  filing_id uuid references public.filings(id) on delete set null,
  seen_at timestamptz not null default now()
);
comment on table public.portal_challenges is 'Each CAPTCHA or identity check a portal run met: host, kind, browser, when. Nothing of the page. Staff read it to see which agencies still challenge Odelia.';
create index if not exists portal_challenges_host on public.portal_challenges (host, seen_at desc);
alter table public.portal_challenges enable row level security;
revoke all on public.portal_challenges from public, anon, authenticated;
drop policy if exists "staff read challenges" on public.portal_challenges;
create policy "staff read challenges" on public.portal_challenges for select to authenticated using (public.is_staff());
grant select on public.portal_challenges to authenticated;

create or replace function public.filer_challenge_seen(p_filing uuid, p_host text, p_kind text, p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.filings;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is null then raise exception 'filing_not_given_to_agent'; end if;
  if not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  insert into public.portal_challenges (host, kind, provider, workspace_id, filing_id)
  values (lower(left(p_host, 253)), p_kind, case when p_provider in ('local', 'steel', 'browserbase') then p_provider end, f.workspace_id, f.id);
end $$;

-- A portal that showed a CAPTCHA on a run in the last 30 days.
create or replace function public.portal_captcha_host(p_host text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.portal_challenges
                 where host = lower(p_host) and kind = 'captcha' and seen_at > now() - interval '30 days')
$$;

-- ---------------------------------------------------------------- 3. the owner's answer for a site's CAPTCHA
create table if not exists public.captcha_preferences (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  host text not null check (host ~ '^[a-z0-9.-]{1,253}$'),
  choice text not null check (choice in ('ask', 'me', 'team', 'route')),
  set_by uuid references auth.users(id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (workspace_id, host)
);
comment on table public.captcha_preferences is 'How a workspace wants an agency site''s CAPTCHA handled: ask each time, the owner (one tap), the Placetta team, or another way the agency takes. Written by the file function (captcha_choice) after the owner answers.';
alter table public.captcha_preferences enable row level security;
revoke all on public.captcha_preferences from public, anon, authenticated;
drop policy if exists "members see captcha preferences" on public.captcha_preferences;
create policy "members see captcha preferences" on public.captcha_preferences for select to authenticated using (public.is_member(workspace_id));
grant select on public.captcha_preferences to authenticated;

create or replace function public.filer_captcha_choice(p_filing uuid, p_host text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare f public.filings; c text;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is null then raise exception 'filing_not_given_to_agent'; end if;
  if not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  select choice into c from public.captcha_preferences where workspace_id = f.workspace_id and host = lower(p_host);
  return c;
end $$;

-- ---------------------------------------------------------------- 4. the business's signed-in session on a portal
create table if not exists public.agency_sessions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  host text not null check (host ~ '^[a-z0-9.-]{1,253}$'),
  login_id uuid not null references public.agency_logins(id) on delete cascade,
  secret_id uuid not null,
  saved_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at <= saved_at + interval '30 days 1 minute'),
  primary key (workspace_id, host)
);
comment on table public.agency_sessions is 'The business''s signed-in state on one portal (cookies and local storage for its hosts only), in Vault. Never shared across workspaces or hosts. Ends with the portal''s session or 30 days, a sign-in failure, a changed or removed login, or the workspace.';
alter table public.agency_sessions enable row level security;
revoke all on public.agency_sessions from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then execute 'revoke all on public.agency_sessions from placetta_filer'; end if;
end $$;

-- the state's Vault secret goes with its row (deleted, expired, its login removed, its workspace deleted)
create or replace function public.agency_sessions_drop_secret() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.vault_drop(old.secret_id);
  return null;
end $$;
revoke execute on function public.agency_sessions_drop_secret() from public, anon, authenticated;
drop trigger if exists agency_sessions_drop_secret on public.agency_sessions;
create trigger agency_sessions_drop_secret after delete on public.agency_sessions for each row execute function public.agency_sessions_drop_secret();

-- a security event on the login (its password, user name or address changed): its saved sessions end
create or replace function public.agency_logins_end_sessions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.secret_id is distinct from old.secret_id or new.username is distinct from old.username or new.url is distinct from old.url then
    delete from public.agency_sessions where login_id = old.id;
  end if;
  return null;
end $$;
revoke execute on function public.agency_logins_end_sessions() from public, anon, authenticated;
drop trigger if exists agency_logins_end_sessions on public.agency_logins;
create trigger agency_logins_end_sessions after update on public.agency_logins for each row execute function public.agency_logins_end_sessions();

-- The saved login this host signs in with, in the filing's own workspace (the url's host is the portal or under it).
create or replace function public.filer_session_login(p_ws uuid, p_host text) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.id from public.agency_logins l
  where l.workspace_id = p_ws and l.url is not null
    and (lower(substring(l.url from '^[a-zA-Z]+://([^/:?#]+)')) = lower(p_host)
         or lower(substring(l.url from '^[a-zA-Z]+://([^/:?#]+)')) like '%.' || lower(p_host))
  order by l.updated_at desc limit 1
$$;
revoke execute on function public.filer_session_login(uuid, text) from public, anon, authenticated;

create or replace function public.filer_session_get(p_filing uuid, p_host text) returns text
language plpgsql security definer set search_path = '' as $$
declare f public.filings; s public.agency_sessions;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is distinct from 'running' then raise exception 'filing_not_running'; end if;
  if not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  -- the filing's own workspace only: another workspace's state is never found, whatever the host
  select * into s from public.agency_sessions where workspace_id = f.workspace_id and host = lower(p_host);
  if s.workspace_id is null then return null; end if;
  if s.expires_at <= now() then delete from public.agency_sessions where workspace_id = s.workspace_id and host = s.host; return null; end if;
  return public.vault_get(s.secret_id);
end $$;

create or replace function public.filer_session_put(p_filing uuid, p_host text, p_state text, p_expires timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.filings; lid uuid; s public.agency_sessions; h text := lower(p_host);
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is null then raise exception 'filing_not_given_to_agent'; end if;
  if not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  if p_state is null or length(p_state) > 200000 then raise exception 'state_too_large'; end if;
  lid := public.filer_session_login(f.workspace_id, h);
  if lid is null then raise exception 'no_login_for_host'; end if;
  select * into s from public.agency_sessions where workspace_id = f.workspace_id and host = h;
  insert into public.agency_sessions (workspace_id, host, login_id, secret_id, saved_at, expires_at)
  values (f.workspace_id, h, lid, public.vault_put(p_state, 'agency_session', s.secret_id), now(),
          least(coalesce(p_expires, now() + interval '2 hours'), now() + interval '30 days'))
  on conflict (workspace_id, host) do update set login_id = excluded.login_id, secret_id = excluded.secret_id, saved_at = excluded.saved_at, expires_at = excluded.expires_at;
end $$;

create or replace function public.filer_session_drop(p_filing uuid, p_host text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.filings; n int;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is null then raise exception 'filing_not_given_to_agent'; end if;
  if not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  delete from public.agency_sessions where workspace_id = f.workspace_id and host = lower(p_host);
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.audit_log (workspace_id, actor, actor_id, action, object)
    values (f.workspace_id, 'agent', null,
            jsonb_build_object('en', 'Placetta ended the saved sign-in on ' || lower(p_host) || case when p_reason = 'sign_in_failed' then ' after the agency refused the sign-in' else ' after the agency signed it out' end,
                               'zh', '快哉已结束在 ' || lower(p_host) || ' 上保存的登录状态'),
            f.title);
  end if;
end $$;

-- ---------------------------------------------------------------- 5. model calls nobody waits on, at half price
create table if not exists public.ai_batch_jobs (
  custom_id text primary key check (custom_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  kind text not null check (length(kind) between 1 and 40),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  model text not null,
  params jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'done', 'failed', 'fallback', 'taken')),
  batch_id text,
  result jsonb,
  usage jsonb,
  cost_usd numeric(12, 6),
  deadline timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.ai_batch_jobs is 'A model call sent through Anthropic''s Message Batches API (half price) for work nobody waits on. Written once per custom_id (idempotent); past its deadline the caller asks the normal way (fallback). Server only.';
create index if not exists ai_batch_jobs_status on public.ai_batch_jobs (status, deadline);
create index if not exists ai_batch_jobs_batch on public.ai_batch_jobs (batch_id) where batch_id is not null;
alter table public.ai_batch_jobs enable row level security;
revoke all on public.ai_batch_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.ai_batch_jobs to service_role;

-- ---------------------------------------------------------------- who may call what
revoke execute on function public.filer_run_usage(jsonb), public.filer_challenge_seen(uuid, text, text, text), public.portal_captcha_host(text),
  public.filer_captcha_choice(uuid, text), public.filer_session_get(uuid, text), public.filer_session_put(uuid, text, text, timestamptz),
  public.filer_session_drop(uuid, text, text) from public, anon, authenticated;
grant execute on function public.filer_run_usage(jsonb), public.filer_challenge_seen(uuid, text, text, text), public.portal_captcha_host(text),
  public.filer_captcha_choice(uuid, text), public.filer_session_get(uuid, text), public.filer_session_put(uuid, text, text, timestamptz),
  public.filer_session_drop(uuid, text, text) to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'grant execute on function public.filer_run_usage(jsonb), public.filer_challenge_seen(uuid, text, text, text), public.filer_captcha_choice(uuid, text), public.filer_session_get(uuid, text), public.filer_session_put(uuid, text, text, timestamptz), public.filer_session_drop(uuid, text, text) to placetta_filer';
  end if;
end $$;
