-- Measured outcomes (20261105091400_outcomes.sql): one row per filing from what is logged, the sourced baseline, the
-- rejection-reasons library, each agency's observed time, the team's metrics and the website's gated numbers.
-- Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); wp uuid := gen_random_uuid();
  f1 uuid; f2 uuid; f3 uuid; fr uuid; fp uuid; i int;
  res jsonb := '{}'::jsonb; ok boolean; o record; m jsonb; p jsonb; x jsonb;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@outcomes.test', now(), now(), now(), '{}', '{}'),
    (inst, s, 'authenticated', 'authenticated', 'staff@outcomes.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (s, 'email');
  insert into public.staff_emails (email) values ('staff@outcomes.test') on conflict do nothing;
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Real Tea', now(), a, a), (wp, 'Probe', now(), a, a);
  update public.workspaces set synthetic = true where id = wp;
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (wp, a, 'owner');

  alter table public.filings disable trigger filings_guard;
  -- 22 real EINs approved by the IRS, 6 days each (two are rejected below), the first three with something special
  for i in 1..22 loop
    insert into public.filings (workspace_id, app_id, title, agency, payload, approved_by, status, channel, requirements_checked, submitted_at, decided_at, fee_estimate)
      values (w, 'ein-' || i, '{"en":"EIN","zh":"EIN"}', '{"en":"Internal Revenue Service","zh":"美国国税局"}', '{"official":"irs-ss4"}', a, 'accepted', 'fax', true,
              now() - interval '30 days' + (i || ' hours')::interval, now() - interval '24 days' + (i || ' hours')::interval, 0)
      returning id into fr;
    if i = 1 then f1 := fr; elsif i = 2 then f2 := fr; elsif i = 3 then f3 := fr; end if;
  end loop;
  -- f1: paid $299, an AI run of $0.05 on Browserbase for 10 minutes, one fax
  insert into public.license_charges (workspace_id, ref, tier, cents, status, filing_id, paid_at, used_at) values (w, 'ein-1', 'license', 29900, 'used', f1, now(), now());
  insert into public.filer_runs (token_hash, filing_id, issued_at, expires_at, ended_at, provider, ai_usd) values (repeat('b', 64), f1, now() - interval '10 minutes', now() + interval '1 hour', now(), 'browserbase', 0.05);
  insert into public.paper_pieces (id, provider, purpose, workspace_id, filing_id) values ('fax-outcomes-1', 'telnyx', 'filing', w, f1);
  -- f2: the team spent 30 minutes; f3: handed back once, the owner uploaded a page and paid, and it went in twice
  update public.filings set team_minutes = 30 where id = f2;
  update public.filings set agent_log = '[{"kind":"needs_you","en":"x","zh":"x"},{"kind":"check","en":"y","zh":"y"}]' where id = f3;
  insert into public.documents (workspace_id, app_id, filing_id, name, path, source, uploaded_by) values (w, 'ein-3', f3, 'page.pdf', w::text || '/outcomes/page.pdf', 'customer', a);
  insert into public.filing_events (workspace_id, filing_id, kind, status, title, source) values (w, f3, 'status', 'in_progress', '{"en":"paid","zh":"x"}', 'owner');
  insert into public.filing_events (workspace_id, filing_id, kind, status, title, source) values
    (w, f3, 'status', 'submitted', '{"en":"first","zh":"x"}', 'placetta'), (w, f3, 'status', 'submitted', '{"en":"again","zh":"x"}', 'placetta');
  -- 19 California LLCs: one short of the public line
  for i in 1..19 loop
    insert into public.filings (workspace_id, app_id, title, agency, payload, approved_by, status, channel, requirements_checked, submitted_at, decided_at)
      values (w, 'llc-' || i, '{"en":"LLC","zh":"LLC"}', '{"en":"California Secretary of State","zh":"加州州务卿"}', '{"official":"ca-llc-1"}', a, 'accepted', 'portal', true,
              now() - interval '20 days', now() - interval '17 days');
  end loop;
  -- 4 San Jose permits: one short of the agency line
  for i in 1..4 loop
    insert into public.filings (workspace_id, app_id, title, agency, payload, approved_by, status, channel, requirements_checked, submitted_at, decided_at)
      values (w, 'sj-' || i, '{"en":"Permit","zh":"许可"}', '{"en":"City of San Jose","zh":"圣何塞市"}', '{"official":"sj-building-ti"}', a, 'accepted', 'portal', true,
              now() - interval '20 days', now() - interval '10 days');
  end loop;
  -- 30 probe EINs, all instant: never counted
  for i in 1..30 loop
    insert into public.filings (workspace_id, app_id, title, agency, payload, approved_by, status, channel, requirements_checked, submitted_at, decided_at)
      values (wp, 'ein-' || i, '{"en":"EIN","zh":"EIN"}', '{"en":"Internal Revenue Service","zh":"美国国税局"}', '{"official":"irs-ss4"}', a, 'accepted', 'fax', true,
              now() - interval '2 days', now() - interval '2 days');
  end loop;

  /* ------------------------------ one row per filing ------------------------------ */
  select * into o from public.filing_outcomes where filing_id = f1;
  res := res || jsonb_build_object(
    'days to approval: submitted to accepted', o.days_to_approval = 6,
    'the price paid against the agency fee', o.price_usd = 299 and o.agency_fee_usd = 0,
    'Stripe on $299 by card: $8.97', o.stripe_usd = 8.97,
    'AI from the filer run', o.ai_usd = 0.05,
    'browser time and its cost', o.browser_minutes = 10 and o.browser_usd = round(10 / 60.0 * 0.10, 4),
    'a fax at 4 pages', o.telephony_usd = round(4 * 0.007, 4),
    'one owner touch (the approval), no person after it', o.owner_touches = 1 and o.approvals = 1 and o.human_free,
    'the owner''s estimated time per approval', o.owner_hours = round(2 / 60.0, 2),
    'the first EIN is the form''s first', o.form_seq = 1);
  select * into o from public.filing_outcomes where filing_id = f2;
  res := res || jsonb_build_object('team minutes mean a person handled it', o.team_minutes = 30 and o.team_usd = 30 and not o.human_free);
  select * into o from public.filing_outcomes where filing_id = f3;
  res := res || jsonb_build_object('a hand-back, an upload and an answer are owner touches', o.hand_backs = 1 and o.uploads = 1 and o.answers = 1 and o.owner_touches = 4 and not o.human_free,
    'owner hours add up per kind', o.owner_hours = round((2 + 5 + 15 + 5) / 60.0, 2),
    'a second submission is a resubmission', o.resubmissions = 1);
  res := res || jsonb_build_object('probe filings are marked synthetic and get no place in the form''s count',
    (select bool_and(synthetic and form_seq is null) from public.filing_outcomes where workspace_id = wp));

  /* ------------------------------ the rejection-reasons library ------------------------------ */
  update public.filings set status = 'submitted', decided_at = null where workspace_id = w and app_id in ('ein-21', 'ein-22');
  update public.filings set status = 'rejected', decided_at = now(), note = 'Responsible party SSN missing on line 7b. Call 408-555-1234 or write to clerk@irs.example.' where workspace_id = w and app_id = 'ein-21';
  update public.filings set status = 'rejected', decided_at = now(), note = 'Responsible party SSN missing on line 7b. Call 408-555-1234 or write to clerk@irs.example.' where workspace_id = w and app_id = 'ein-22';
  update public.filings set status = 'submitted' where workspace_id = wp and app_id = 'ein-1';
  update public.filings set status = 'rejected', note = 'Probe reason' where workspace_id = wp and app_id = 'ein-1';
  x := public.rejection_reasons_for('irs-ss4');
  res := res || jsonb_build_object(
    'a rejection''s reason lands in the form''s library, seen twice', jsonb_array_length(x) = 1 and (x -> 0 ->> 'seen')::int = 2,
    'scrubbed of numbers and email addresses', (x -> 0 ->> 'reason') !~ '[0-9]{3}' and (x -> 0 ->> 'reason') !~ '@' and (x -> 0 ->> 'reason') like '%SSN missing%',
    'a probe''s rejection teaches nothing', not exists (select 1 from public.form_rejection_reasons where reason like 'Probe%'));
  alter table public.filings enable trigger filings_guard;

  /* ------------------------------ each agency's observed time ------------------------------ */
  res := res || jsonb_build_object(
    'the IRS has its observed time (20 real approvals, probes left out)', exists (select 1 from public.agency_times() where agency = 'internal revenue service' and n = 20 and median_days = 6),
    'an agency with 4 approvals has none yet', not exists (select 1 from public.agency_times() where agency = 'city of san jose'),
    'probe filings never reach filing_stats', (select n from public.filing_stats() where form = 'irs-ss4') = 22);

  /* ------------------------------ the website's gated numbers ------------------------------ */
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  p := public.public_outcomes();
  begin perform 1 from public.filing_outcomes limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anon can''t read the per-filing view', ok);
  begin perform 1 from public.alternative_costs limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anon reads the baseline only through the page''s function', ok);
  begin perform public.outcome_metrics(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anon can''t run the team''s metrics', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object(
    'licenses approved shows with 20 or more real ones', (p -> 'licenses_approved' ->> 'n')::int = 43 and (p -> 'licenses_approved' ->> 'value')::int = 43,
    'the median carries its sample size', (p -> 'median_days' ->> 'n')::int = 43,
    'the form with 19 has no comparison', not exists (select 1 from jsonb_array_elements(p -> 'comparisons') c where c ->> 'form' = 'ca-llc-1'),
    'the EIN''s time is compared with the IRS''s published fax time', exists (select 1 from jsonb_array_elements(p -> 'comparisons') c
       where c ->> 'form' = 'irs-ss4' and c ->> 'metric' = 'days' and (c ->> 'baseline')::numeric = 4 and c ->> 'unit' = 'business' and (c ->> 'n')::int = 20
         and c ->> 'source_url' = 'https://www.irs.gov/instructions/iss4'),
    'owner hours against the IRS''s own estimate, the ratio computed', exists (select 1 from jsonb_array_elements(p -> 'comparisons') c
       where c ->> 'form' = 'irs-ss4' and c ->> 'metric' = 'owner_hours' and (c ->> 'baseline')::numeric = 8.68 and (c ->> 'ratio')::numeric = round(8.68 / 0.03, 1)),
    'no comparison where the baseline is null (the seller''s permit)', not exists (select 1 from jsonb_array_elements(p -> 'comparisons') c where c ->> 'form' = 'ca-cdtfa'),
    'the price comparison needs 20 paid ones', not exists (select 1 from jsonb_array_elements(p -> 'comparisons') c where c ->> 'metric' = 'price'));

  /* ------------------------------ the team's metrics ------------------------------ */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin perform public.outcome_metrics(); ok := false; exception when others then ok := sqlerrm like 'Placetta team only%'; end;
  res := res || jsonb_build_object('an owner can''t read the team''s metrics', ok);
  begin perform public.outcome_export(); ok := false; exception when others then ok := sqlerrm like 'Placetta team only%'; end;
  res := res || jsonb_build_object('or its export', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  m := public.outcome_metrics();
  x := public.outcome_export();
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object(
    'staff read every number with its n', (m -> 'licenses_approved' ->> 'n')::int = 43 and (m -> 'median_days' ->> 'n')::int = 43 and m ? 'flywheel' and m ? 'margin',
    'per agency', jsonb_array_length(m -> 'by_agency') = 3 and exists (select 1 from jsonb_array_elements(m -> 'by_agency') b where b ->> 'agency' = 'Internal Revenue Service' and (b ->> 'n')::int = 20),
    'probe filings left out, and counted', (m ->> 'probe_filings_left_out')::int = 30,
    'the baseline rides along with its sources', jsonb_array_length(m -> 'baseline') >= 6 and not exists (select 1 from jsonb_array_elements(m -> 'baseline') b where b ->> 'source_url' !~ '^https://'),
    'the flywheel buckets by the form''s filing count', exists (select 1 from jsonb_array_elements(m -> 'flywheel') b where b ->> 'bucket' = '10+'),
    'the export has a row per real filing and no business name', jsonb_array_length(x) = 45 and x::text not like '%Real Tea%');

  -- no real filings: nothing to say
  delete from public.filings where workspace_id = w;
  p := public.public_outcomes();
  res := res || jsonb_build_object('under 20, every number is null', p -> 'licenses_approved' = 'null'::jsonb and p -> 'owner_touches' = 'null'::jsonb
    and p -> 'human_free_pct' = 'null'::jsonb and jsonb_array_length(p -> 'comparisons') = 0);

  raise exception 'TEST_RESULTS %', res;
end
$test$;
