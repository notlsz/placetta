-- Is the portal worker live? (worker/filer/src/main.ts, supabase/functions/file action "worker", the app's Settings and
-- FilingLive). The worker beats once a minute through filer_heartbeat; the file function queues filings for agency
-- websites only while the beat is fresh (unless FILER_ENABLED says otherwise), and the app says "Online filing: live"
-- only then. A worker that stops (a crash, a missing key, Render's plan suspended) stops beating, and filings go to the
-- team instead of waiting on nobody.
--
-- And the nightly re-check of the playbooks against the agencies' public pages (worker/filer/src/probe.ts) reports its
-- drift through filer_probe_report, into the Quality tab's queue (qa_report, 20261025100000_quality.sql).
--
-- One row, no customer data: a time, counts and versions. Staff read it; the filer writes it only through the function.
-- Safe to run twice. Not applied to the live database by this commit.

create table if not exists public.filer_status (
  id int primary key default 1 check (id = 1),
  seen_at timestamptz not null default now(),
  started_at timestamptz,
  info jsonb not null default '{}'::jsonb check (jsonb_typeof(info) = 'object' and pg_column_size(info) < 4000)
);
comment on table public.filer_status is 'The portal worker''s heartbeat: one row, a time and counts, never a filing. Staff only.';
alter table public.filer_status enable row level security;
revoke all on public.filer_status from public, anon, authenticated;
grant select on public.filer_status to authenticated;
drop policy if exists "staff read the filer heartbeat" on public.filer_status;
create policy "staff read the filer heartbeat" on public.filer_status for select to authenticated using (public.is_staff());
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'revoke all on public.filer_status from placetta_filer';
  end if;
end $$;

/* The worker is alive. Only counts, versions and times are kept (anything else in p_info is dropped). */
create or replace function public.filer_heartbeat(p_info jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare keep jsonb := '{}'::jsonb; k text;
begin
  if jsonb_typeof(coalesce(p_info, '{}'::jsonb)) <> 'object' then raise exception 'info must be an object'; end if;
  foreach k in array array['version', 'browser', 'live_view', 'slots', 'playbooks', 'running', 'nightly_check', 'nightly_drift'] loop
    if p_info ? k and jsonb_typeof(p_info -> k) in ('string', 'number', 'boolean', 'null') then
      keep := keep || jsonb_build_object(k, case when jsonb_typeof(p_info -> k) = 'string' then to_jsonb(left(p_info ->> k, 60)) else p_info -> k end);
    end if;
  end loop;
  insert into public.filer_status as s (id, seen_at, started_at, info) values (1, now(), now(), keep)
  on conflict (id) do update set seen_at = now(), info = excluded.info,
    started_at = case when s.seen_at < now() - interval '5 minutes' then now() else s.started_at end;
end $$;

/* Live means a beat in the last three minutes. Read by the file function (service role) for the app. */
create or replace function public.filer_live(p_within interval default interval '3 minutes')
returns table (live boolean, seen_at timestamptz, info jsonb)
language sql stable security definer set search_path = '' as $$
  select coalesce(s.seen_at > now() - p_within, false), s.seen_at, s.info
  from (select 1) one left join public.filer_status s on s.id = 1
$$;

/* The nightly re-check's drift, into the Quality tab. Only drift findings, at most 50 a night, each a public page. */
create or replace function public.filer_probe_report(p_findings jsonb)
returns int
language plpgsql security definer set search_path = '' as $$
declare clean jsonb;
begin
  if jsonb_typeof(p_findings) <> 'array' then raise exception 'findings must be an array'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', 'drift',
      'severity', case when x ->> 'severity' = 'high' then 'high' else 'medium' end,
      'source', left(x ->> 'source', 500),
      'subject', left(coalesce(x ->> 'subject', 'Playbook drift'), 300),
      'repro', left(coalesce(nullif(x ->> 'repro', ''), 'The playbook''s public page no longer matches.'), 4000),
      'fix', left(coalesce(nullif(x ->> 'fix', ''), 'Update the playbook in worker/filer/src/playbooks.ts.'), 2000))), '[]'::jsonb)
    into clean
  from (select x from jsonb_array_elements(p_findings) x
        where x ->> 'kind' = 'drift' and coalesce(x ->> 'source', '') ~ '^https://' limit 50) s;
  if jsonb_array_length(clean) = 0 then return 0; end if;
  return public.qa_report(clean);
end $$;

revoke execute on function public.filer_heartbeat(jsonb), public.filer_live(interval), public.filer_probe_report(jsonb) from public, anon, authenticated;
grant execute on function public.filer_heartbeat(jsonb), public.filer_live(interval), public.filer_probe_report(jsonb) to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'grant execute on function public.filer_heartbeat(jsonb), public.filer_probe_report(jsonb) to placetta_filer';
  end if;
end $$;
