-- The incident log gets what an auditor samples: a severity and the time of each stage (detected, contained,
-- resolved, customers told), so each entry can be checked against the timelines in
-- docs/soc2/policies/incident-response.md. Safe to run twice; written 2026-10-22, not applied to the live database.
-- Needs 20261017210300_agent_health.sql (the incidents table), which isn't live either: apply that first.
-- Controls: SOC 2 CC7.3a, CC7.4a; ISO/IEC 27001:2022 A.5.24 to A.5.27. Tests: supabase/tests/incident_timeline.sql.

alter table public.incidents
  add column if not exists severity text,
  add column if not exists detected_at timestamptz,
  add column if not exists contained_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists customers_notified_at timestamptz;

alter table public.incidents drop constraint if exists incidents_severity_check;
alter table public.incidents add constraint incidents_severity_check check (severity is null or severity in ('SEV1', 'SEV2', 'SEV3'));
alter table public.incidents drop constraint if exists incidents_stages_in_order;
alter table public.incidents add constraint incidents_stages_in_order check (
  (contained_at is null or detected_at is null or contained_at >= detected_at)
  and (resolved_at is null or contained_at is null or resolved_at >= contained_at)
  and (resolved_at is null or detected_at is null or resolved_at >= detected_at));

-- Staff set or correct the severity and the stage times; a null argument leaves that field as it is.
create or replace function public.incident_timeline(p_id uuid, p_severity text default null, p_detected_at timestamptz default null,
  p_contained_at timestamptz default null, p_resolved_at timestamptz default null, p_customers_notified_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if p_severity is not null and p_severity not in ('SEV1', 'SEV2', 'SEV3') then raise exception 'Severity is SEV1, SEV2 or SEV3.'; end if;
  if greatest(p_detected_at, p_contained_at, p_resolved_at, p_customers_notified_at) > now() + interval '1 hour' then
    raise exception 'A stage can''t be in the future.';
  end if;
  update public.incidents set
    severity = coalesce(p_severity, severity),
    detected_at = coalesce(p_detected_at, detected_at),
    contained_at = coalesce(p_contained_at, contained_at),
    resolved_at = coalesce(p_resolved_at, resolved_at),
    customers_notified_at = coalesce(p_customers_notified_at, customers_notified_at)
  where id = p_id;
  if not found then raise exception 'No such incident.'; end if;
end $$;

revoke execute on function public.incident_timeline(uuid, text, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.incident_timeline(uuid, text, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;

-- Hours from detection to each stage, for the monthly review and the management review (staff only, through the
-- function's own check).
create or replace function public.incident_timings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'severity', i.severity,
      'hours_to_contain', round(extract(epoch from i.contained_at - i.detected_at)::numeric / 3600, 1),
      'hours_to_resolve', round(extract(epoch from i.resolved_at - i.detected_at)::numeric / 3600, 1),
      'hours_to_notify', round(extract(epoch from i.customers_notified_at - i.detected_at)::numeric / 3600, 1),
      'open', i.resolved_at is null) order by i.happened_at desc), '[]'::jsonb)
    from public.incidents i);
end $$;
revoke execute on function public.incident_timings() from public, anon;
grant execute on function public.incident_timings() to authenticated;
