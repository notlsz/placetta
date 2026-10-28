-- Measured outcomes (2026-10-28): what each filing really took, against what the alternative costs, so "better" is a
-- number with its sample size, never a claim.
--   1. outcome_rules(): the minutes a person spends per owner touch (FOUNDER TO CONFIRM) and the cost constants, the
--      same as src/economics.ts (scripts/outcomes-test.ts checks they agree).
--   2. filing_outcomes: a view, one row per filing, from what is already logged: filings (agent_log, team_minutes, the
--      dates), filing_events, filer_runs, filing_checks, voice_calls, paper_pieces, license_charges, documents,
--      owner_approvals, team_tasks and human_checks. Nothing is copied into a second table.
--   3. alternative_costs: what the alternative costs per form (an expediter's or consultant's price and time; doing it
--      yourself in hours and days), each row with the public page it came from and the day it was read. Unknown is null.
--   4. form_rejection_reasons: every reason an agency gave for sending a filing back, per form, scrubbed of numbers and
--      addresses. The file function reads it before the next filing of that form (rejection_reasons_for).
--   5. agency_times(): each agency's observed time from submission to approval, live from accepted filings; the
--      opening estimate uses it once 5 or more are behind it (src/smart.ts stepTiming).
--   6. outcome_metrics() and outcome_export() for the team (staff only), public_outcomes() for the website: a public
--      number only once 20 or more real filings are behind it, and a comparison only where both sides are known.
-- Synthetic (probe) workspaces never count. RLS is on for every new table. Safe to run twice.

/* ------------------------------ 1. the numbers ------------------------------ */

create or replace function public.outcome_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    -- FOUNDER TO CONFIRM: minutes an owner spends on one touch, by kind (no production timing yet)
    'touch_minutes', jsonb_build_object('approval', 2, 'upload', 5, 'hand_back', 15, 'answer', 5),
    -- the same as src/economics.ts VENDOR and ASSUME
    'stripe_card_pct', 0.029, 'stripe_card_fixed', 0.30,
    'fax_page', 0.007, 'pages_per_filing', 4, 'letter', 0.89,
    'browser_hour', 0.10, 'team_hour_usd', 60,
    -- the gates: a public number needs 20 real filings, an agency's observed time 5
    'public_min_n', 20, 'agency_min_n', 5
  )
$$;
revoke execute on function public.outcome_rules() from public, anon;
grant execute on function public.outcome_rules() to authenticated, service_role;

/* ------------------------------ 2. one row per filing ------------------------------ */

create or replace view public.filing_outcomes with (security_invoker = true) as
with r as (select public.outcome_rules() as x),
base as (
  select f.*, coalesce(w.synthetic, false) as synthetic,
         nullif(f.payload ->> 'official', '') as form,
         nullif(lower(btrim(f.agency ->> 'en')), '') as agency_key
  from public.filings f join public.workspaces w on w.id = f.workspace_id
),
seq as (
  -- the nth real filing of its form to go in, across every workspace: the flywheel's x axis
  select id, row_number() over (partition by form order by submitted_at, id) as form_seq
  from base where form is not null and submitted_at is not null and not synthetic
)
select b.id as filing_id, b.workspace_id, b.synthetic, b.app_id, b.form, b.agency_key, b.agency ->> 'en' as agency_name,
  b.status, b.channel, b.created_at, b.approved_at, b.submitted_at, b.decided_at, b.license_expires,
  case when b.status = 'accepted' and b.submitted_at is not null and b.decided_at >= b.submitted_at
       then round((extract(epoch from b.decided_at - b.submitted_at) / 86400)::numeric, 2) end as days_to_approval,
  s.form_seq,
  (select count(*) from public.filings p where p.workspace_id = b.workspace_id and p.app_id = b.app_id and p.created_at <= b.created_at)::int as attempt_no,
  -- owner touches: this filing's own approval (none under Autopilot's standing one) and a second owner's, uploads,
  -- hand-backs (Odelia gave it back to them) and answers (the owner moved it on: paid, replied)
  t.approvals, t.uploads, t.hand_backs, t.answers,
  t.approvals + t.uploads + t.hand_backs + t.answers as owner_touches,
  round(((t.approvals * (r.x -> 'touch_minutes' ->> 'approval')::numeric + t.uploads * (r.x -> 'touch_minutes' ->> 'upload')::numeric
        + t.hand_backs * (r.x -> 'touch_minutes' ->> 'hand_back')::numeric + t.answers * (r.x -> 'touch_minutes' ->> 'answer')::numeric) / 60), 2) as owner_hours,
  b.team_minutes, tm.team_tasks, tm.human_checks, tm.team_events, tm.team_steps,
  (t.uploads + t.hand_backs + t.answers = 0 and b.team_minutes = 0 and tm.team_tasks + tm.human_checks + tm.team_events + tm.team_steps = 0
     and coalesce(b.channel, '') <> 'team') as human_free,
  b.autopilot_grant is not null as standing_approval,
  ev.rejections, ev.returns, greatest(ev.submits - 1, 0) as resubmissions,
  ch.tier, ch.price_usd, coalesce(b.fee_paid, b.fee_estimate) as agency_fee_usd,
  round(c.ai_usd + c.check_usd, 4) as ai_usd,
  round(c.browser_min, 1) as browser_minutes,
  round(c.browser_min / 60 * (r.x ->> 'browser_hour')::numeric, 4) as browser_usd,
  round(c.voice_usd + c.faxes * (r.x ->> 'pages_per_filing')::numeric * (r.x ->> 'fax_page')::numeric + c.letters * (r.x ->> 'letter')::numeric, 4) as telephony_usd,
  case when ch.price_usd > 0 then round(ch.price_usd * (r.x ->> 'stripe_card_pct')::numeric + (r.x ->> 'stripe_card_fixed')::numeric, 2) else 0 end as stripe_usd,
  round(b.team_minutes / 60.0 * (r.x ->> 'team_hour_usd')::numeric, 2) as team_usd
from base b
cross join r
left join seq s on s.id = b.id
cross join lateral (
  select
    (case when b.autopilot_grant is null and b.approved_by is not null then 1 else 0 end
      + greatest((select count(*) from public.owner_approvals o where o.workspace_id = b.workspace_id and o.app_id = b.app_id) - 1, 0))::int as approvals,
    (select count(*) from public.documents d where d.workspace_id = b.workspace_id and d.source = 'customer'
       and (d.filing_id = b.id or (d.filing_id is null and d.app_id = b.app_id and d.created_at <= coalesce(b.decided_at, now()))))::int as uploads,
    (select count(*) from jsonb_array_elements(case when jsonb_typeof(b.agent_log) = 'array' then b.agent_log else '[]'::jsonb end) e
       where e ->> 'kind' in ('needs_you', 'wet_signature'))::int as hand_backs,
    ((select count(*) from public.filing_events e where e.filing_id = b.id and e.source = 'owner' and coalesce(e.status, '') not in ('requested', 'canceled'))
      + case when b.customer_paid_at is not null then 1 else 0 end)::int as answers
) t
cross join lateral (
  select
    (select count(*) from public.team_tasks k where k.filing_id = b.id)::int as team_tasks,
    (select count(*) from public.human_checks h where h.filing_id = b.id)::int as human_checks,
    (select count(*) from public.filing_events e where e.filing_id = b.id and e.source = 'team')::int as team_events,
    (select count(*) from jsonb_array_elements(case when jsonb_typeof(b.agent_log) = 'array' then b.agent_log else '[]'::jsonb end) e
       where e ->> 'kind' in ('handoff', 'as_agent', 'take_over', 'two_key_ok'))::int as team_steps
) tm
cross join lateral (
  select count(*) filter (where e.status = 'rejected')::int as rejections,
         count(*) filter (where e.status = 'needs_info')::int as returns,
         count(*) filter (where e.status = 'submitted')::int as submits
  from public.filing_events e where e.filing_id = b.id and e.kind = 'status'
) ev
cross join lateral (
  select max(l.tier) as tier, sum(l.cents) filter (where l.status in ('paid', 'used')) / 100.0 as price_usd
  from public.license_charges l where l.filing_id = b.id
) ch
cross join lateral (
  select
    coalesce((select sum(fr.ai_usd) from public.filer_runs fr where fr.filing_id = b.id), 0) as ai_usd,
    coalesce((select sum(least(extract(epoch from coalesce(fr.ended_at, fr.expires_at) - fr.issued_at) / 60, 60))
              from public.filer_runs fr where fr.filing_id = b.id and fr.provider in ('steel', 'browserbase')), 0)::numeric as browser_min,
    coalesce((select sum(k.cost_usd) from public.filing_checks k where k.filing_id = b.id), 0) as check_usd,
    coalesce((select sum(v.cost_usd) from public.voice_calls v where v.filing_id = b.id), 0) as voice_usd,
    (select count(*) from public.paper_pieces p where p.filing_id = b.id and p.provider = 'telnyx') as faxes,
    (select count(*) from public.paper_pieces p where p.filing_id = b.id and p.provider = 'lob') as letters
) c;
comment on view public.filing_outcomes is 'One row per filing: days to approval, owner touches and estimated hours, team minutes, whether no person handled it, rejections and resubmissions, the price paid against the agency fee, and its AI, browser, telephony, Stripe and team cost. Server and staff only.';
revoke all on public.filing_outcomes from public, anon, authenticated;
grant select on public.filing_outcomes to service_role;

/* ------------------------------ 3. what the alternative costs ------------------------------ */

create table if not exists public.alternative_costs (
  id uuid primary key default gen_random_uuid(),
  form text not null check (length(form) between 1 and 120),
  kind text not null check (kind in ('expediter', 'consultant', 'diy')),
  provider text not null check (length(provider) between 1 and 120),
  price_usd numeric(10, 2) check (price_usd is null or price_usd >= 0),
  days numeric(6, 1) check (days is null or days >= 0),
  days_unit text check (days_unit is null or days_unit in ('calendar', 'business')),
  hours numeric(6, 2) check (hours is null or hours >= 0),
  note text check (note is null or length(note) <= 500),
  source_url text not null check (source_url ~ '^https://' and length(source_url) <= 500),
  read_on date not null,
  created_at timestamptz not null default now(),
  unique (form, kind, provider)
);
comment on table public.alternative_costs is 'What the alternative to Placetta costs for one form: an expediter''s or consultant''s price and time, or doing it yourself in hours and days, each from a public page (source_url, read_on). Null where the source does not say.';
alter table public.alternative_costs enable row level security;
revoke all on public.alternative_costs from public, anon, authenticated;
grant select on public.alternative_costs to authenticated;
grant all on public.alternative_costs to service_role;
-- public sources, so any signed-in person may read them; the website gets them through public_outcomes() only
drop policy if exists "signed-in people read the sourced baseline" on public.alternative_costs;
create policy "signed-in people read the sourced baseline" on public.alternative_costs for select to authenticated using (true);

-- Seeded only with what an official or reputable page states. Read 2026-10-28.
insert into public.alternative_costs (form, kind, provider, price_usd, days, days_unit, hours, note, source_url, read_on) values
  ('irs-ss4', 'diy', 'IRS', null, 4, 'business', 8.68,
   'IRS estimate for Form SS-4: recordkeeping 5 hr 58 min, learning about the form 1 hr 17 min, preparing and sending 1 hr 26 min. EIN by fax generally within 4 business days; by mail about 4 weeks.',
   'https://www.irs.gov/instructions/iss4', '2026-10-28'),
  ('irs-ss4', 'expediter', 'LegalZoom', 79, null, null, null,
   'LegalZoom lists its EIN service at $79; the page states no turnaround time.',
   'https://legalzoom.com/business/business-operations/ein-federal-tax-identification-pricing.html', '2026-10-28'),
  ('ca-cdtfa', 'diy', 'CDTFA', null, null, null, null,
   'No charge for a seller''s permit; the CDTFA says it may issue the permit the same day, not a stated processing time.',
   'https://cdtfa.ca.gov/formspubs/pub107/applying-for-a-sellers-permit.htm', '2026-10-28'),
  ('ca-llc-1', 'expediter', 'LegalZoom', 0, null, null, null,
   'LegalZoom LLC Basic $0 plus state filing fees (Pro $249, Premium $299), as listed by NerdWallet; no turnaround stated.',
   'https://www.nerdwallet.com/business/legal/learn/legalzoom-review', '2026-10-28'),
  ('ca-llc-1', 'diy', 'California Secretary of State', null, 5, 'calendar', null,
   'On 2026-10-26 the Secretary of State was reviewing online formations received 2026-10-21: 5 days behind.',
   'https://www.sos.ca.gov/business-programs/business-entities/processing-times/', '2026-10-28'),
  ('ca-llc-12', 'diy', 'California Secretary of State', null, 4, 'calendar', null,
   'On 2026-10-26 the Secretary of State was reviewing online Statements of Information received 2026-10-22: 4 days behind.',
   'https://www.sos.ca.gov/business-programs/business-entities/processing-times/', '2026-10-28')
on conflict (form, kind, provider) do nothing;

/* ------------------------------ 4. why agencies sent filings back ------------------------------ */

create table if not exists public.form_rejection_reasons (
  form text not null check (length(form) between 1 and 120),
  reason_key text not null check (reason_key ~ '^[0-9a-f]{32}$'),
  reason text not null check (length(reason) between 1 and 300),
  seen int not null default 1 check (seen >= 1),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (form, reason_key)
);
comment on table public.form_rejection_reasons is 'Per form, each reason an agency gave for rejecting a filing, scrubbed of numbers and email addresses, with how often it was seen. Learned from real filings only; read by the file function before the next filing of the form. Staff and server only.';
alter table public.form_rejection_reasons enable row level security;
revoke all on public.form_rejection_reasons from public, anon, authenticated;
grant all on public.form_rejection_reasons to service_role;

-- A reason without the business in it: email addresses and any run of 3 or more digits (case, permit, phone and
-- account numbers) are taken out, whitespace folded, at most 300 characters.
create or replace function public.rejection_reason_clean(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+', '[email]', 'g'), '[0-9][0-9 ().-]{1,}[0-9]', '#', 'g'), '\s+', ' ', 'g')), 300), '')
$$;
revoke execute on function public.rejection_reason_clean(text) from public, anon;

create or replace function public.filings_rejection_learn() returns trigger
language plpgsql security definer set search_path = '' as $$
declare why text; v_form text := nullif(new.payload ->> 'official', '');
begin
  if new.status <> 'rejected' or old.status = 'rejected' or v_form is null then return null; end if;
  if exists (select 1 from public.workspaces w where w.id = new.workspace_id and w.synthetic) then return null; end if;
  why := public.rejection_reason_clean(coalesce(nullif(btrim(new.note), ''),
           (select t.agency_status from public.filing_tracking t where t.filing_id = new.id)));
  if why is null then return null; end if;
  insert into public.form_rejection_reasons (form, reason_key, reason) values (v_form, md5(lower(why)), why)
  on conflict (form, reason_key) do update set seen = public.form_rejection_reasons.seen + 1, last_seen = now();
  return null;
end $$;
revoke execute on function public.filings_rejection_learn() from public, anon, authenticated;
drop trigger if exists filings_rejection_learn on public.filings;
create trigger filings_rejection_learn after update of status on public.filings
  for each row execute function public.filings_rejection_learn();

-- What the agency said before about this form, most often seen first: the file function checks the next one against it.
create or replace function public.rejection_reasons_for(p_form text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'seen', seen, 'last_seen', last_seen) order by seen desc, last_seen desc), '[]'::jsonb)
  from (select * from public.form_rejection_reasons where form = p_form order by seen desc, last_seen desc limit 20) x
$$;
revoke execute on function public.rejection_reasons_for(text) from public, anon, authenticated;
grant execute on function public.rejection_reasons_for(text) to service_role;

/* ------------------------------ 5. each agency's observed time ------------------------------ */

-- Live from accepted real filings, so each approval updates it. Only agencies with 5 or more, and only aggregates.
create or replace function public.agency_times() returns table (agency text, n int, median_days int, p90_days int)
language sql stable security definer set search_path = '' as $$
  select o.agency_key, count(*)::int,
         ceil(percentile_cont(0.5) within group (order by o.days_to_approval))::int,
         ceil(percentile_cont(0.9) within group (order by o.days_to_approval))::int
  from public.filing_outcomes o
  where not o.synthetic and o.agency_key is not null and o.days_to_approval is not null
  group by o.agency_key
  having count(*) >= (public.outcome_rules() ->> 'agency_min_n')::int
$$;
revoke execute on function public.agency_times() from public, anon;
grant execute on function public.agency_times() to authenticated, service_role;

-- filing_stats, as 20261009180000 defines it, without probe workspaces' filings.
create or replace function public.filing_stats() returns table (form text, n int, median_days int, p90_days int, rejected_pct int)
language sql stable security definer set search_path = '' as $$
  select f.payload->>'official' as form,
         count(*)::int as n,
         ceil(percentile_cont(0.5) within group (order by extract(epoch from f.decided_at - f.submitted_at) / 86400))::int as median_days,
         ceil(percentile_cont(0.9) within group (order by extract(epoch from f.decided_at - f.submitted_at) / 86400))::int as p90_days,
         round(100.0 * count(*) filter (where f.status = 'rejected') / count(*))::int as rejected_pct
  from public.filings f join public.workspaces w on w.id = f.workspace_id
  where f.payload ? 'official' and f.submitted_at is not null and f.decided_at is not null
    and f.status in ('accepted', 'rejected') and f.decided_at >= f.submitted_at and not coalesce(w.synthetic, false)
  group by 1
  having count(*) >= 3;
$$;
revoke execute on function public.filing_stats() from public, anon;
grant execute on function public.filing_stats() to authenticated;

/* ------------------------------ 6. the numbers, for the team and for the website ------------------------------ */

-- A median of numbers, null for none.
create or replace function public.outcome_median(v numeric[]) returns numeric
language sql immutable set search_path = '' as $$
  select round(percentile_cont(0.5) within group (order by x)::numeric, 2) from unnest(v) x where x is not null
$$;

-- Everything the team and investors see, each with its sample size (n). Licenses are accepted filings; "filed" is a
-- filing that reached the agency. Real (non-probe) workspaces only.
create or replace function public.outcome_metrics_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb; r jsonb := public.outcome_rules();
begin
  with o as (select * from public.filing_outcomes where not synthetic),
  lic as (select *, coalesce(price_usd, 0) - (stripe_usd + ai_usd + browser_usd + telephony_usd + team_usd) as margin_usd,
                 stripe_usd + ai_usd + browser_usd + telephony_usd + team_usd as cost_usd
          from o where status = 'accepted'),
  filed as (select * from o where submitted_at is not null and status <> 'canceled'),
  due as (select l.*, exists (select 1 from public.filings n where n.workspace_id = l.workspace_id and n.app_id = l.app_id
                 and n.created_at > l.created_at and n.submitted_at is not null and n.submitted_at::date <= l.license_expires) as on_time
          from lic l where l.license_expires is not null and l.license_expires <= current_date),
  wsx as (select w.id, exists (select 1 from public.filings f where f.workspace_id = w.id and f.created_at > now() - interval '90 days')
                 or exists (select 1 from public.license_charges c where c.workspace_id = w.id and c.created_at > now() - interval '90 days') as active
          from public.workspaces w
          where not coalesce(w.synthetic, false)
            and exists (select 1 from public.filings f where f.workspace_id = w.id and f.status = 'accepted' and f.decided_at < now() - interval '90 days')),
  fly as (select case when form_seq = 1 then '1' when form_seq < 5 then '2-4' when form_seq < 10 then '5-9' else '10+' end as bucket,
                 min(form_seq) as first_seq, count(*)::int as n,
                 public.outcome_median(array_agg(cost_usd)) as median_cost_usd,
                 public.outcome_median(array_agg(days_to_approval)) as median_days,
                 public.outcome_median(array_agg(team_minutes::numeric)) as median_team_minutes,
                 round(100.0 * count(*) filter (where human_free) / count(*))::int as human_free_pct
          from lic where form_seq is not null group by 1),
  tenth as (select a.form, a.cost_usd as first_cost, a.days_to_approval as first_days, a.team_minutes as first_team,
                   b.cost_usd as tenth_cost, b.days_to_approval as tenth_days, b.team_minutes as tenth_team
            from lic a join lic b on b.form = a.form and b.form_seq = 10 where a.form_seq = 1)
  select jsonb_build_object(
    'rules', r,
    'probe_filings_left_out', (select count(*) from public.filing_outcomes where synthetic),
    'licenses_approved', jsonb_build_object('n', (select count(*) from lic), 'value', (select count(*) from lic)),
    'median_days', jsonb_build_object('n', (select count(*) from lic where days_to_approval is not null),
                                      'value', (select public.outcome_median(array_agg(days_to_approval)) from lic)),
    'by_agency', coalesce((select jsonb_agg(x order by x.n desc) from (
        select agency_name as agency, count(*)::int as n, public.outcome_median(array_agg(days_to_approval)) as median_days
        from lic where days_to_approval is not null group by agency_name) x), '[]'::jsonb),
    'human_free', jsonb_build_object('n', (select count(*) from filed),
                                     'pct', (select round(100.0 * count(*) filter (where human_free) / nullif(count(*), 0))::int from filed),
                                     'unattended_pct', (select round(100.0 * count(*) filter (where human_free and standing_approval) / nullif(count(*), 0))::int from filed)),
    'owner_touches', jsonb_build_object('n', (select count(*) from lic), 'mean', (select round(avg(owner_touches), 2) from lic),
                                        'median', (select public.outcome_median(array_agg(owner_touches::numeric)) from lic),
                                        'hours_mean', (select round(avg(owner_hours), 2) from lic),
                                        'by_kind', (select jsonb_build_object('approvals', sum(approvals), 'uploads', sum(uploads), 'hand_backs', sum(hand_backs), 'answers', sum(answers)) from lic)),
    'team_minutes', jsonb_build_object('n', (select count(*) from lic), 'mean', (select round(avg(team_minutes), 1) from lic),
                                       'median', (select public.outcome_median(array_agg(team_minutes::numeric)) from lic)),
    'ai_usd', jsonb_build_object('n', (select count(*) from lic), 'mean', (select round(avg(ai_usd), 4) from lic),
                                 'median', (select public.outcome_median(array_agg(ai_usd)) from lic),
                                 -- Odelia's chat, planning and research in those workspaces (ai_events), spread over their licenses
                                 'other_per_license', (select round(sum(e.cost_usd) / nullif((select count(*) from lic), 0), 4) from public.ai_events e
                                                        where e.workspace_id in (select workspace_id from lic))),
    'rejections', jsonb_build_object('n', (select count(*) from filed), 'rejected', (select sum(rejections) from filed),
                                     'returned', (select sum(returns) from filed), 'resubmissions', (select sum(resubmissions) from filed)),
    'price', jsonb_build_object('n', (select count(*) from lic where price_usd is not null),
                                'mean_price_usd', (select round(avg(price_usd), 2) from lic where price_usd is not null),
                                'mean_agency_fee_usd', (select round(avg(agency_fee_usd), 2) from lic where price_usd is not null)),
    'margin', jsonb_build_object('n', (select count(*) from lic),
                                 'per_license_mean', (select round(avg(margin_usd), 2) from lic),
                                 'revenue', (select round(coalesce(sum(price_usd), 0), 2) from lic),
                                 'stripe', (select round(sum(stripe_usd), 2) from lic), 'ai', (select round(sum(ai_usd), 4) from lic),
                                 'browser', (select round(sum(browser_usd), 4) from lic), 'telephony', (select round(sum(telephony_usd), 4) from lic),
                                 'team', (select round(sum(team_usd), 2) from lic), 'total', (select round(sum(margin_usd), 2) from lic),
                                 'pct', (select round(100 * sum(margin_usd) / nullif(sum(price_usd), 0))::int from lic)),
    'renewals', jsonb_build_object('n', (select count(*) from due), 'on_time_pct', (select round(100.0 * count(*) filter (where on_time) / nullif(count(*), 0))::int from due)),
    'workspaces', jsonb_build_object('n', (select count(*) from wsx), 'retained_pct', (select round(100.0 * count(*) filter (where active) / nullif(count(*), 0))::int from wsx)),
    'flywheel', coalesce((select jsonb_agg(to_jsonb(fly) - 'first_seq' order by first_seq) from fly), '[]'::jsonb),
    'first_vs_tenth', coalesce((select jsonb_agg(to_jsonb(tenth)) from tenth), '[]'::jsonb),
    'scripts', coalesce((select jsonb_agg(x order by x.uses desc) from (
        select s.name, s.key, s.uses, s.best_seconds from public.agent_skills s where s.kind = 'portal' and s.uses > 0 order by s.uses desc limit 30) x), '[]'::jsonb),
    'playbooks', coalesce((select jsonb_agg(x order by x.runs desc) from (
        select p.official, p.host, p.runs, p.successes, p.status from public.portal_playbooks p where p.runs > 0 order by p.runs desc limit 30) x), '[]'::jsonb),
    'rejection_reasons', coalesce((select jsonb_agg(x order by x.seen desc) from (
        select form, reason, seen from public.form_rejection_reasons order by seen desc limit 30) x), '[]'::jsonb),
    'baseline', coalesce((select jsonb_agg(to_jsonb(a) - 'id' - 'created_at' order by a.form, a.kind) from public.alternative_costs a), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke execute on function public.outcome_metrics_data() from public, anon, authenticated;
grant execute on function public.outcome_metrics_data() to service_role;

create or replace function public.outcome_metrics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return public.outcome_metrics_data();
end $$;

-- One row per real filing for the export: no business name, the workspace as a short one-way key.
create or replace function public.outcome_export() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'filing', o.filing_id, 'workspace', left(md5(o.workspace_id::text), 10), 'form', o.form, 'agency', o.agency_name, 'status', o.status,
      'channel', o.channel, 'submitted_at', o.submitted_at, 'decided_at', o.decided_at, 'days_to_approval', o.days_to_approval,
      'form_seq', o.form_seq, 'owner_touches', o.owner_touches, 'owner_hours', o.owner_hours, 'team_minutes', o.team_minutes,
      'human_free', o.human_free, 'rejections', o.rejections, 'resubmissions', o.resubmissions, 'price_usd', o.price_usd,
      'agency_fee_usd', o.agency_fee_usd, 'ai_usd', o.ai_usd, 'browser_usd', o.browser_usd, 'telephony_usd', o.telephony_usd,
      'stripe_usd', o.stripe_usd, 'team_usd', o.team_usd) order by o.submitted_at nulls last)
    from public.filing_outcomes o where not o.synthetic), '[]'::jsonb);
end $$;
revoke execute on function public.outcome_metrics(), public.outcome_export() from public, anon;
grant execute on function public.outcome_metrics(), public.outcome_export() to authenticated;

-- The website's numbers (site/stats.html). A number is returned only once 20 or more real filings are behind it; a
-- comparison only for a form where Placetta's side has 20 or more and the baseline's side is sourced; the ratio is
-- computed here from those two, never typed. Everything else is null, so the page has nothing to print.
create or replace function public.public_outcomes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m int := (public.outcome_rules() ->> 'public_min_n')::int; out jsonb;
begin
  with o as (select * from public.filing_outcomes where not synthetic),
  lic as (select * from o where status = 'accepted'),
  filed as (select * from o where submitted_at is not null and status <> 'canceled'),
  per_form as (select form, count(*)::int as n, public.outcome_median(array_agg(days_to_approval)) as days,
                      public.outcome_median(array_agg(owner_hours)) as owner_hours,
                      count(price_usd)::int as price_n, public.outcome_median(array_agg(price_usd)) as price
               from lic where form is not null group by form having count(*) >= m),
  cmp as (
    select p.form, 'days' as metric, p.days as placetta, p.n, a.kind, a.provider, a.days as baseline, a.days_unit as unit, a.source_url, a.read_on
      from per_form p join public.alternative_costs a on a.form = p.form where a.days is not null and p.days is not null
    union all
    select p.form, 'owner_hours', p.owner_hours, p.n, a.kind, a.provider, a.hours, null, a.source_url, a.read_on
      from per_form p join public.alternative_costs a on a.form = p.form where a.hours is not null and p.owner_hours is not null
    union all
    select p.form, 'price', p.price, p.price_n, a.kind, a.provider, a.price_usd, null, a.source_url, a.read_on
      from per_form p join public.alternative_costs a on a.form = p.form where a.price_usd is not null and p.price is not null and p.price_n >= m)
  select jsonb_build_object(
    'min_n', m,
    'filings', (select count(*) from filed),
    'licenses_approved', case when (select count(*) from lic) >= m then jsonb_build_object('n', (select count(*) from lic), 'value', (select count(*) from lic)) end,
    'median_days', (select case when count(*) >= m then jsonb_build_object('n', count(*), 'value', public.outcome_median(array_agg(days_to_approval))) end
                    from lic where days_to_approval is not null),
    'human_free_pct', (select case when count(*) >= m then jsonb_build_object('n', count(*), 'value', round(100.0 * count(*) filter (where human_free) / count(*))::int) end from filed),
    'owner_touches', (select case when count(*) >= m then jsonb_build_object('n', count(*), 'value', round(avg(owner_touches), 1)) end from lic),
    'owner_hours', (select case when count(*) >= m then jsonb_build_object('n', count(*), 'value', round(avg(owner_hours), 2)) end from lic),
    'comparisons', coalesce((select jsonb_agg(jsonb_build_object('form', form, 'metric', metric, 'placetta', placetta, 'n', n, 'kind', kind, 'provider', provider,
        'baseline', baseline, 'unit', unit, 'source_url', source_url, 'read_on', read_on,
        'ratio', case when placetta > 0 then round(baseline / placetta, 1) end) order by form, metric) from cmp), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke execute on function public.public_outcomes() from public;
grant execute on function public.public_outcomes() to anon, authenticated;
