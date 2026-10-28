-- Privacy: no recording of a person's typing, screen or voice in California without their opt-in, and accounts for
-- people 18 or older only. Safe to run twice. Written 2026-11-05, not applied to the live database.
-- Tests: supabase/tests/privacy_recording_age.sql.
--
-- Recording (California Invasion of Privacy Act, Penal Code 631 and 632: the "wiretap" claims over session replay and
-- call recording):
--   workspace_states   the US states a workspace's business is in, read from what it already holds: meta.region, each
--                      store's address, each location's county and each entity's registrations
--   user_regions       where a person last opened the app from (Vercel's x-vercel-ip-country-region, via
--                      /app/region.json), country and region only, one row per person
--   privacy_states     the two together. Strict ("treat as California") when either names California, or when nothing
--                      is known at all
--   recording_consents a person's explicit opt-in, per workspace and kind (screen: the live browser on a recorded
--                      session; teach: teach mode recording their actions; call: call recordings), with the exact text
--                      they agreed to, its version, the language and the time. Withdrawn by setting withdrawn_at.
--   filer_recording_policy   what the portal worker asks before a run: synthetic, strict, and whether everyone who may
--                      be handed the page (members and up) opted in to screen and teach recording
--   recording_policy_for     the same for one person, for odelia-voice (calls)
--
-- Age (COPPA and the state laws that treat minors specially): Placetta is for people 18 or older.
--   age_confirmations  only that a person confirmed they are 18 or older, and when. Never the date of birth.
--   confirm_age        the date is checked here (and in the app) and thrown away; under 18 the account made at sign-in
--                      is deleted at once (age_refused), so nothing of a minor is kept
--   my_role, access_for   every workspace check (RLS and the server functions) needs a confirmed age, so an account
--                      that skipped the app's question reaches nothing; a new workspace needs one too

/* ================================ age ================================ */

create table if not exists public.age_confirmations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  method text not null default 'birthdate' check (method in ('birthdate', 'attest'))
);
comment on table public.age_confirmations is 'That a person confirmed they are 18 or older, and when. The date of birth is never stored.';
alter table public.age_confirmations enable row level security;
revoke all on public.age_confirmations from public, anon, authenticated;
grant select on public.age_confirmations to authenticated;
drop policy if exists "own age confirmation" on public.age_confirmations;
create policy "own age confirmation" on public.age_confirmations for select to authenticated using (user_id = auth.uid());

create or replace function public.age_ok_for(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid is not null and exists (select 1 from public.age_confirmations a where a.user_id = uid);
$$;
create or replace function public.age_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.age_ok_for(auth.uid());
$$;

create or replace function public.age_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('confirmed', a.user_id is not null, 'at', a.confirmed_at)
  from (select 1) one left join public.age_confirmations a on a.user_id = auth.uid();
$$;

-- Under 18: the account made at sign-in goes, with nothing kept. One that already belongs to a workspace can't be
-- deleted from here (the workspace keeps its records); it stays without access (no confirmation, so my_role is null)
-- and the app asks the person to write to support to close it. Nothing about the person's age is stored either way.
create or replace function public.age_refused() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  delete from public.age_confirmations where user_id = uid;
  if exists (select 1 from public.workspace_members m where m.user_id = uid) then return jsonb_build_object('ok', false, 'code', 'under_18', 'deleted', false); end if;
  begin
    delete from auth.users where id = uid;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'under_18', 'deleted', false);
  end;
  return jsonb_build_object('ok', false, 'code', 'under_18', 'deleted', true);
end $$;

-- The date is checked and thrown away. A day of grace for time zones (the app checks the person's own date first).
create or replace function public.confirm_age(p_birthdate date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if p_birthdate is null or p_birthdate < date '1900-01-01' or p_birthdate > current_date then raise exception 'age_format' using hint = 'Enter your date of birth.'; end if;
  if p_birthdate > ((current_date + 1) - interval '18 years')::date then return public.age_refused(); end if;
  insert into public.age_confirmations (user_id, method) values (uid, 'birthdate')
  on conflict (user_id) do nothing;
  return jsonb_build_object('ok', true, 'at', (select confirmed_at from public.age_confirmations where user_id = uid));
end $$;

revoke execute on function public.age_ok_for(uuid) from public, anon, authenticated;
grant execute on function public.age_ok_for(uuid) to service_role;
revoke execute on function public.age_ok(), public.age_status(), public.age_refused(), public.confirm_age(date) from public, anon;
grant execute on function public.age_ok(), public.age_status(), public.age_refused(), public.confirm_age(date) to authenticated;

-- Every workspace check: the role only with two-step and SSO satisfied, and the age confirmed.
create or replace function public.my_role(ws uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and public.mfa_ok() and public.age_ok();
$$;

-- The server functions' check: the same rule ("age_required" denies like "none").
create or replace function public.access_for(ws uuid, uid uuid, p_aal text, p_claims jsonb) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when x.b = 'none' then 'none'
    when not public.sso_session_ok(uid, coalesce(p_claims, '{}'::jsonb)) then 'sso_required'
    when not public.age_ok_for(uid) then 'age_required'
    else x.b end
  from (select public.access_base(ws, uid, p_aal) as b) x;
$$;

-- A new workspace needs a confirmed age. The service role and the database's own setup (no signed-in person) are not a
-- person. Keyed on the signed-in person, not current_user: create_workspace is security definer, so inside it
-- current_user is the function's owner and would let every request through.
create or replace function public.workspaces_age_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' or auth.uid() is null then return new; end if;
  if not public.age_ok() then raise exception 'age_required' using errcode = '42501', hint = 'Confirm you are 18 or older first.'; end if;
  return new;
end $$;
revoke all on function public.workspaces_age_guard() from public, anon, authenticated;
drop trigger if exists workspaces_age_guard on public.workspaces;
create trigger workspaces_age_guard before insert on public.workspaces for each row execute function public.workspaces_age_guard();

/* ================================ where a business and a person are ================================ */

create table if not exists public.user_regions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  region text check (region is null or region ~ '^[A-Z0-9]{1,3}$'),
  seen_at timestamptz not null default now()
);
comment on table public.user_regions is 'Where a person last opened the app from (country and region from the request), for the recording rules. One row per person.';
alter table public.user_regions enable row level security;
revoke all on public.user_regions from public, anon, authenticated;
grant select on public.user_regions to authenticated;
drop policy if exists "own region" on public.user_regions;
create policy "own region" on public.user_regions for select to authenticated using (user_id = auth.uid());

create or replace function public.note_my_region(p_country text, p_region text) returns void
language plpgsql security definer set search_path = '' as $$
declare c text := nullif(upper(left(trim(coalesce(p_country, '')), 2)), ''); r text := nullif(upper(left(trim(coalesce(p_region, '')), 3)), '');
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if c is not null and c !~ '^[A-Z]{2}$' then c := null; end if;
  if r is not null and r !~ '^[A-Z0-9]{1,3}$' then r := null; end if;
  if c is null then return; end if;
  insert into public.user_regions (user_id, country, region, seen_at) values (auth.uid(), c, case when c = 'US' then r end, now())
  on conflict (user_id) do update set country = excluded.country, region = excluded.region, seen_at = now();
end $$;
revoke execute on function public.note_my_region(text, text) from public, anon;
grant execute on function public.note_my_region(text, text) to authenticated;

-- Two-letter US states the workspace names. California by name too; any other state's full name isn't read, which
-- only ever leaves the workspace unknown (treated as California).
create or replace function public.workspace_states(ws uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  with w as (select state from public.workspaces where id = ws),
  arr as (select w.state, case when jsonb_typeof(w.state->'stores') = 'array' then w.state->'stores' else '[]'::jsonb end stores,
                 case when jsonb_typeof(w.state->'locations') = 'array' then w.state->'locations' else '[]'::jsonb end locs,
                 case when jsonb_typeof(w.state->'entities') = 'array' then w.state->'entities' else '[]'::jsonb end ents from w),
  raw as (
    select arr.state->'meta'->>'region' v from arr
    union all select (regexp_match(s->>'address', '(?:,|\s)\s*([A-Za-z]{2})\.?\s*(?:\d{5}(?:-\d{4})?)?\s*$'))[1] from arr, jsonb_array_elements(arr.stores) s
    union all select (regexp_match(coalesce(l->'county'->>'en', ''), ',\s*([A-Za-z]{2})\s*$'))[1] from arr, jsonb_array_elements(arr.locs) l
    union all select r->>'state' from arr, jsonb_array_elements(arr.ents) e,
      jsonb_array_elements(case when jsonb_typeof(e->'registrations') = 'array' then e->'registrations' else '[]'::jsonb end) r
  )
  select coalesce(array_agg(distinct x order by x) filter (where x is not null), '{}'::text[])
  from (select case when upper(trim(v)) ~ '^[A-Z]{2}$' then upper(trim(v)) when lower(trim(v)) = 'california' then 'CA' end x from raw) y;
$$;

-- The workspace's states and the person's own. A person outside the US adds 'XX'. Empty: nothing known.
create or replace function public.privacy_states(ws uuid, uid uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array(select distinct x from unnest(public.workspace_states(ws) || coalesce((
    select array[case when r.country = 'US' then r.region else 'XX' end] from public.user_regions r where r.user_id = uid and (r.country <> 'US' or r.region is not null)
  ), '{}'::text[])) x where x is not null order by x), '{}'::text[]);
$$;
create or replace function public.recording_strict(states text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(states), 0) = 0 or 'CA' = any(states);
$$;

/* ================================ consent to record ================================ */

-- The words a person agrees to, by kind and language. The app shows the same words (src/recordingConsent.ts, checked
-- by npm run test:agent); what is stored is this text, never what a request sends.
create or replace function public.recording_consent_text(p_kind text, p_lang text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind || ':' || case when p_lang = 'zh' then 'zh' else 'en' end
    when 'screen:en' then 'I agree that when Odelia hands me a step on an agency''s website, the browser I use may be recorded by Placetta''s browser provider, including what I type and click there. I can withdraw this in Settings at any time.'
    when 'screen:zh' then '我同意：当 Odelia 把机构网站上的某一步交给我时，我使用的浏览器可能会被快哉的浏览器服务商录制，包括我在其中的输入和点击。我可以随时在设置中撤回。'
    when 'teach:en' then 'I agree that when I show Odelia how to file on an agency''s website, she records the steps I take there (never my passwords or secret numbers) to learn them. I can withdraw this in Settings at any time.'
    when 'teach:zh' then '我同意：当我教 Odelia 如何在机构网站上申报时，她会记录我在其中的操作步骤（从不记录密码或保密号码）以便学会。我可以随时在设置中撤回。'
    when 'call:en' then 'I agree that my phone calls with Odelia may be recorded and transcribed and kept with my account. Odelia says so at the start of each recorded call. I can withdraw this in Settings at any time.'
    when 'call:zh' then '我同意：我与 Odelia 的通话可能会被录音和转录，并保存在我的账户中。每次录音的通话开始时 Odelia 都会说明。我可以随时在设置中撤回。'
  end;
$$;
create or replace function public.recording_consent_version() returns text
language sql immutable set search_path = '' as $$ select '2026-11-05'::text $$;

create table if not exists public.recording_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('screen', 'teach', 'call')),
  lang text not null default 'en' check (lang in ('en', 'zh')),
  text text not null check (length(text) between 20 and 1000),
  version text not null check (length(version) between 1 and 40),
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create unique index if not exists recording_consents_active on public.recording_consents(user_id, workspace_id, kind) where withdrawn_at is null;
create index if not exists recording_consents_ws on public.recording_consents(workspace_id, kind) where withdrawn_at is null;
comment on table public.recording_consents is 'A person''s explicit opt-in to being recorded (screen, teach, call), with the text, version, language and time. Written only by give_recording_consent.';
alter table public.recording_consents enable row level security;
revoke all on public.recording_consents from public, anon, authenticated;
grant select on public.recording_consents to authenticated;
drop policy if exists "own consents" on public.recording_consents;
create policy "own consents" on public.recording_consents for select to authenticated using (user_id = auth.uid() and public.can_view(workspace_id));

create or replace function public.give_recording_consent(p_ws uuid, p_kind text, p_lang text default 'en') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); l text := case when p_lang = 'zh' then 'zh' else 'en' end; t text; r public.recording_consents;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if not public.can_view(p_ws) then raise exception 'You are not a member of this workspace.'; end if;
  t := public.recording_consent_text(p_kind, l);
  if t is null then raise exception 'bad_kind'; end if;
  select * into r from public.recording_consents where user_id = uid and workspace_id = p_ws and kind = p_kind and withdrawn_at is null;
  if r.id is null then
    insert into public.recording_consents (user_id, workspace_id, kind, lang, text, version) values (uid, p_ws, p_kind, l, t, public.recording_consent_version())
    returning * into r;
    insert into public.audit_log (workspace_id, actor, actor_id, action, object)
    values (p_ws, 'you', uid, jsonb_build_object('en', 'Agreed to be recorded', 'zh', '同意录制'), jsonb_build_object('en', p_kind, 'zh', p_kind));
  end if;
  return jsonb_build_object('kind', r.kind, 'given_at', r.given_at, 'version', r.version);
end $$;

create or replace function public.withdraw_recording_consent(p_ws uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  update public.recording_consents set withdrawn_at = now() where user_id = uid and workspace_id = p_ws and kind = p_kind and withdrawn_at is null;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.audit_log (workspace_id, actor, actor_id, action, object)
    values (p_ws, 'you', uid, jsonb_build_object('en', 'Withdrew consent to be recorded', 'zh', '撤回录制同意'), jsonb_build_object('en', p_kind, 'zh', p_kind));
  end if;
end $$;

-- The app's view: is this workspace treated as California for me, and what have I agreed to.
create or replace function public.recording_policy(p_ws uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.can_view(p_ws) then null else jsonb_build_object(
    'states', to_jsonb(s.st), 'strict', public.recording_strict(s.st), 'version', public.recording_consent_version(),
    'consents', coalesce((select jsonb_object_agg(c.kind, c.given_at) from public.recording_consents c
                           where c.user_id = auth.uid() and c.workspace_id = p_ws and c.withdrawn_at is null), '{}'::jsonb))
  end
  from (select public.privacy_states(p_ws, auth.uid()) st) s;
$$;

-- odelia-voice: one person's rule for a call.
create or replace function public.recording_policy_for(p_ws uuid, p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('states', to_jsonb(s.st), 'strict', public.recording_strict(s.st),
    'call', exists (select 1 from public.recording_consents c where c.user_id = p_uid and c.workspace_id = p_ws and c.kind = 'call' and c.withdrawn_at is null))
  from (select public.privacy_states(p_ws, p_uid) st) s;
$$;

-- The portal worker, before a run: the hand-back's page can go to any member, so screen and teach count only when
-- every member (and up) of the workspace opted in. The strictest of their states applies.
create or replace function public.filer_recording_policy(p_filing uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f public.filings; st text[] := '{}'; m record; members int := 0; screen int := 0; teach int := 0;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is null then raise exception 'filing_not_given_to_agent'; end if;
  if public.filer_caller() and not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  st := public.workspace_states(f.workspace_id);
  for m in select wm.user_id from public.workspace_members wm where wm.workspace_id = f.workspace_id and wm.role in ('owner', 'admin', 'member') loop
    members := members + 1;
    st := st || public.privacy_states(f.workspace_id, m.user_id);
    if exists (select 1 from public.recording_consents c where c.user_id = m.user_id and c.workspace_id = f.workspace_id and c.kind = 'screen' and c.withdrawn_at is null) then screen := screen + 1; end if;
    if exists (select 1 from public.recording_consents c where c.user_id = m.user_id and c.workspace_id = f.workspace_id and c.kind = 'teach' and c.withdrawn_at is null) then teach := teach + 1; end if;
  end loop;
  st := coalesce(array(select distinct x from unnest(st) x where x is not null order by x), '{}'::text[]);
  return jsonb_build_object(
    'synthetic', coalesce((select w.synthetic from public.workspaces w where w.id = f.workspace_id), false),
    'states', to_jsonb(st), 'strict', public.recording_strict(st),
    'screen', members > 0 and screen = members, 'teach', members > 0 and teach = members);
end $$;

revoke execute on function public.workspace_states(uuid), public.privacy_states(uuid, uuid), public.recording_policy_for(uuid, uuid),
  public.filer_recording_policy(uuid) from public, anon, authenticated;
grant execute on function public.workspace_states(uuid), public.privacy_states(uuid, uuid), public.recording_policy_for(uuid, uuid),
  public.filer_recording_policy(uuid) to service_role;
revoke execute on function public.recording_strict(text[]), public.recording_consent_text(text, text), public.recording_consent_version(),
  public.give_recording_consent(uuid, text, text), public.withdraw_recording_consent(uuid, text), public.recording_policy(uuid) from public, anon;
grant execute on function public.recording_strict(text[]), public.recording_consent_text(text, text), public.recording_consent_version(),
  public.give_recording_consent(uuid, text, text), public.withdraw_recording_consent(uuid, text), public.recording_policy(uuid) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'grant execute on function public.filer_recording_policy(uuid) to placetta_filer';
  end if;
end $$;
