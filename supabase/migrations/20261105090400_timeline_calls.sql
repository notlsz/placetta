-- The timeline keeps Odelia's phone calls: 20261105090300_carry_to_approval redefined filing_timeline from the version
-- before voice calls (20261030120000) and dropped each event's call_id, so a call's link vanished from the timeline.
-- Same function as carry_to_approval's, with call_id back on every event.
create or replace function public.filing_timeline(p_filing uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid; f public.filings;
begin
  select * into f from public.filings where id = p_filing;
  ws := f.workspace_id;
  if ws is null or not (public.is_member(ws) or public.is_staff()) then raise exception 'No such filing.'; end if;
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'status', e.status, 'title', e.title, 'source', e.source,
      'confidence', e.confidence, 'url', e.url, 'call_id', e.call_id) order by e.at desc) from (select * from public.filing_events where filing_id = p_filing order by at desc limit 50) e), '[]'::jsonb),
    'tracking', (select jsonb_build_object('last_checked_at', t.last_checked_at, 'next_check_at', t.next_check_at, 'agency_status', t.agency_status,
      'agency_norm', t.agency_norm, 'last_movement_at', t.last_movement_at, 'escalated_at', t.escalated_at) from public.filing_tracking t where t.filing_id = p_filing),
    'license', case when f.license_path is not null or f.status = 'accepted' then jsonb_build_object('path', f.license_path, 'number', f.license_number,
      'expires', f.license_expires, 'decided_at', f.decided_at,
      'shown_at', (select e.at from public.filing_events e where e.filing_id = p_filing and e.dedupe = 'license-shown' limit 1)) end,
    'outbox', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'to', o.to_addr, 'subject', o.subject, 'body', o.body, 'status', o.status,
      'send_after', o.send_after, 'sent_at', o.sent_at) order by o.created_at desc) from (select * from public.agency_outbox where filing_id = p_filing order by created_at desc limit 10) o), '[]'::jsonb),
    'mail', coalesce((select jsonb_agg(jsonb_build_object('at', m.created_at, 'kind', m.kind, 'from', m.from_addr, 'subject', m.subject, 'action', m.action) order by m.created_at desc)
      from (select * from public.agency_mail where filing_id = p_filing order by created_at desc limit 10) m), '[]'::jsonb));
end $$;
revoke execute on function public.filing_timeline(uuid) from public, anon;
grant execute on function public.filing_timeline(uuid) to authenticated;
