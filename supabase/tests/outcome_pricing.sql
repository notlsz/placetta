-- Outcome pricing (migration 20261105091200): approving saves the card and charges nothing; the agency's approval, with
-- its proof, makes the charge due; a sweep claims it once; rejected through Placetta's fault waives it and refunds an
-- earlier fee; rejected for a reason that isn't Placetta's fault charges it; the owner disputes with one tap; SCA; and
-- a legacy workspace is unchanged. Run with scripts/test-db.sh.
do $test$
declare
  o uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); wl uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; r jsonb; c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; up uuid;
  f1 uuid; f2 uuid; f3 uuid; f4 uuid; f5 uuid; fu uuid; claimed jsonb; st text;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@outcome.test', now(), now(), now(), '{}', '{}'),
    (inst, x, 'authenticated', 'authenticated', 'stranger@outcome.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (x, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Outcome', now(), o, o), (wl, 'Legacy', now(), o, o);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (wl, o, 'owner');
  insert into public.billing (workspace_id, stripe_customer_id) values (w, 'cus_outcome1');
  insert into public.billing (workspace_id, price_model, subscription_status, subscription_plan, paid_locations) values (wl, 'legacy', 'active', 'essentials', 1);
  update public.app_settings set payments_on = true;

  -- 1. approval: the card is saved, nothing is charged, and the filing may go in
  r := public.license_outcome_open(w, 'lic-a', 'license', 14900, o); c1 := (r->>'id')::uuid;
  res := res || jsonb_build_object('approving opens a pending on-approval charge', (r->>'ok')::boolean and not (r->>'paid')::boolean
    and (select collect = 'on_approval' and status = 'pending' from public.license_charges where id = c1) and not public.can_file_app(w, 'lic-a'));
  res := res || jsonb_build_object('only a new or complex license is collected this way', (public.license_outcome_open(w, 'lic-z', 'renewal', 9900, o)->>'code') = 'bad_tier');
  ok := public.license_outcome_authorize(c1, 'pm_card1234', 'cus_outcome1');
  res := res || jsonb_build_object('the saved card authorizes it, with nothing charged', ok
    and (select status = 'authorized' and paid_at is null and payment_method = 'pm_card1234' from public.license_charges where id = c1)
    and not public.license_outcome_authorize(c1, 'pm_card1234', null));
  res := res || jsonb_build_object('authorized: the filing may go in', public.can_file_app(w, 'lic-a'));
  r := public.license_outcome_open(w, 'lic-a', 'license', 14900, o);
  res := res || jsonb_build_object('approving again returns the same charge', (r->>'authorized')::boolean and (r->>'id')::uuid = c1);
  res := res || jsonb_build_object('the quote knows it is authorized', (public.license_state(w, 'lic-a')->'authorized'->>'id')::uuid = c1);
  res := res || jsonb_build_object('approval alone is no revenue', public.margin_revenue(w, current_date) = 0);
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'lic-a', '{"en":"Sign permit","zh":"招牌许可"}', '{}', o) returning id into f1;
  res := res || jsonb_build_object('the filing is tied to its charge, still uncharged', (select filing_id = f1 and status = 'authorized' from public.license_charges where id = c1)
    and not public.can_file_app(w, 'lic-a'));

  -- 2. accepted: due only with the agency's proof; claimed once; paid once
  update public.filings set status = 'accepted', decided_at = now() where id = f1;
  res := res || jsonb_build_object('accepted without proof waits, and the team is asked for it', (select status from public.license_charges where id = c1) = 'authorized'
    and exists (select 1 from public.team_tasks where dedupe = 'outcome_proof:' || f1));
  update public.filings set confirmation_number = 'SJ-123' where id = f1;
  res := res || jsonb_build_object('the agency''s confirmation makes it due', (select status = 'due' and outcome = 'approved' from public.license_charges where id = c1) and public.license_outcome_due());
  claimed := public.license_outcome_claim(10);
  res := res || jsonb_build_object('the sweep claims it to charge', jsonb_array_length(claimed) = 1 and claimed->0->>'job' = 'charge' and claimed->0->>'customer' = 'cus_outcome1'
    and (claimed->0->>'cents')::int = 14900 and claimed->0->>'payment_method' = 'pm_card1234');
  res := res || jsonb_build_object('a second sweep does not claim it again', jsonb_array_length(public.license_outcome_claim(10)) = 0);
  ok := public.license_outcome_invoice(c1, 'in_outcome1');
  res := res || jsonb_build_object('its invoice is kept on it', ok and (select stripe_ref from public.license_charges where id = c1) = 'in_outcome1');
  begin perform public.license_outcome_invoice(c1, 'in_other1'); ok := (select stripe_ref from public.license_charges where id = c1) = 'in_outcome1'; exception when others then ok := false; end;
  res := res || jsonb_build_object('a second invoice never replaces it', ok);
  res := res || jsonb_build_object('paid: used', public.license_outcome_result(c1, 'paid', 'in_outcome1') = 'used'
    and public.license_outcome_result(c1, 'paid', 'in_outcome1') = 'unchanged' and public.license_outcome_paid(c1, 'in_outcome1') = 'unchanged');
  res := res || jsonb_build_object('it counts as revenue once', public.margin_revenue(w, current_date) = 149);
  res := res || jsonb_build_object('the next one is a renewal', (public.license_state(w, 'lic-a')->>'renewal')::boolean);

  -- 3. rejected through Placetta's fault: nothing charged
  r := public.license_outcome_open(w, 'lic-b', 'license', 14900, o); c2 := (r->>'id')::uuid;
  perform public.license_outcome_authorize(c2, 'pm_card1234', 'cus_outcome1');
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'lic-b', '{"en":"Health permit","zh":"卫生许可"}', '{}', o) returning id into f2;
  update public.filings set status = 'rejected', note = 'Wrong seating count' where id = f2;
  res := res || jsonb_build_object('rejected without a reason: nothing moves, the team is asked why', (select status from public.license_charges where id = c2) = 'authorized'
    and exists (select 1 from public.team_tasks where dedupe = 'rejection_reason:' || f2));
  update public.filings set rejection_reason = 'placetta_wrong_value', rejection_note = 'We typed 40 seats; the lease says 24.' where id = f2;
  res := res || jsonb_build_object('our fault: waived, never charged', (select status = 'waived' and fault = 'placetta' and paid_at is null from public.license_charges where id = c2)
    and (select rejection_fault = 'placetta' and rejection_marked_at is not null from public.filings where id = f2));

  -- our fault after an earlier fee was paid up front ($299, before outcome pricing): refunded
  insert into public.license_charges (workspace_id, ref, tier, cents, status, paid_at, used_at, stripe_ref) values (w, 'lic-old', 'license', 29900, 'paid', now(), null, 'cs_old1') returning id into up;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'lic-old', '{"en":"Seller''s permit","zh":"销售许可"}', '{}', o) returning id into fu;
  update public.filings set status = 'rejected', rejection_reason = 'placetta_missed_document' where id = fu;
  res := res || jsonb_build_object('our fault after a fee was paid: refund due', (select status from public.license_charges where id = up) = 'refund_due');
  claimed := public.license_outcome_claim(10);
  res := res || jsonb_build_object('the sweep claims the refund', jsonb_array_length(claimed) = 1 and claimed->0->>'job' = 'undo' and claimed->0->>'stripe_ref' = 'cs_old1');
  res := res || jsonb_build_object('refunded once', public.license_outcome_result(up, 'refunded', 're_1') = 'refunded' and public.license_outcome_result(up, 'refunded', 're_1') = 'unchanged');

  -- 4. rejected, not Placetta's fault: charged when the reason is marked
  r := public.license_outcome_open(w, 'lic-c', 'complex', 99900, o); c3 := (r->>'id')::uuid;
  perform public.license_outcome_authorize(c3, 'pm_card1234', 'cus_outcome1');
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'lic-c', '{"en":"Liquor license","zh":"酒类执照"}', '{}', o) returning id into f3;
  update public.filings set status = 'rejected' where id = f3;
  update public.filings set rejection_reason = 'zoning', rejection_note = 'The parcel is not zoned for on-sale alcohol.' where id = f3;
  res := res || jsonb_build_object('not our fault: due when the reason is marked', (select status = 'due' and outcome = 'rejected' and fault = 'not_placetta' and cents = 99900 from public.license_charges where id = c3));
  claimed := public.license_outcome_claim(10);
  res := res || jsonb_build_object('the same sweep charges it, once', jsonb_array_length(claimed) = 1 and (claimed->0->>'id')::uuid = c3 and claimed->0->>'outcome' = 'rejected');
  res := res || jsonb_build_object('paid: used', public.license_outcome_result(c3, 'paid', 'in_outcome3') = 'used');
  update public.filings set rejection_reason = 'zoning', rejection_note = 'Zoning, confirmed.' where id = f3;
  res := res || jsonb_build_object('marking the same reason again never charges again', (select status from public.license_charges where id = c3) = 'used'
    and not public.license_outcome_due());

  -- 5. the owner disputes with one tap; the team agrees it was our fault: refunded
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin update public.filings set rejection_reason = 'placetta_wrong_form' where id = f3; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an owner cannot mark the reason', ok);
  r := public.filing_dispute_rejection(f3, 'Our zoning letter allows it.');
  res := res || jsonb_build_object('the owner disputes it with one tap', (r->>'disputed')::boolean);
  res := res || jsonb_build_object('the owner sees the reason and the dispute', (select rejection_reason = 'zoning' from public.filings where id = f3)
    and exists (select 1 from public.rejection_disputes where filing_id = f3 and resolved_at is null));
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.filing_dispute_rejection(f3, 'not mine'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('someone else cannot dispute it', ok and not exists (select 1 from public.rejection_disputes where filing_id = f3 and note = 'not mine'));
  res := res || jsonb_build_object('someone else cannot read the dispute', not exists (select 1 from public.rejection_disputes where filing_id = f3));
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('the dispute goes to the team', exists (select 1 from public.team_tasks where dedupe = 'rejection_dispute:' || f3 and done_at is null));
  update public.filings set rejection_reason = 'placetta_wrong_form', rejection_note = 'We used the off-sale form.' where id = f3;
  res := res || jsonb_build_object('the team changes it to our fault: refund due, the dispute resolved', (select status = 'refund_due' and fault = 'placetta' from public.license_charges where id = c3)
    and exists (select 1 from public.rejection_disputes where filing_id = f3 and resolved_at is not null));
  claimed := public.license_outcome_claim(10);
  perform public.license_outcome_result(c3, 'refunded', 're_3');
  res := res || jsonb_build_object('and it is refunded', (select status from public.license_charges where id = c3) = 'refunded');

  -- 6. SCA: the owner gets the pay link; paying it settles the charge
  r := public.license_outcome_open(w, 'lic-d', 'license', 14900, o); c4 := (r->>'id')::uuid;
  perform public.license_outcome_authorize(c4, 'pm_card5678', 'cus_outcome1');
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'lic-d', '{"en":"Fire permit","zh":"消防许可"}', '{}', o) returning id into f4;
  update public.filings set status = 'accepted', license_path = w || '/licenses/fire.pdf' where id = f4;
  perform public.license_outcome_claim(10);
  st := public.license_outcome_result(c4, 'action', 'in_outcome4', 'https://invoice.stripe.com/i/test_1', 'authentication_required');
  res := res || jsonb_build_object('SCA: action, with the pay link', st = 'action' and (select pay_url from public.license_charges where id = c4) = 'https://invoice.stripe.com/i/test_1'
    and not public.license_outcome_due());
  st := public.license_outcome_paid(c4, 'in_outcome4');
  res := res || jsonb_build_object('the owner paid the link: used', st = 'used' and (select pay_url is null from public.license_charges where id = c4));

  -- 7. a refused card: failed (the dunning runs), then Stripe's retry pays it
  r := public.license_outcome_open(w, 'lic-e', 'license', 14900, o); c5 := (r->>'id')::uuid;
  perform public.license_outcome_authorize(c5, 'pm_card9999', 'cus_outcome1');
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'lic-e', '{"en":"Business tax certificate","zh":"营业税证书"}', '{}', o) returning id into f5;
  update public.filings set status = 'rejected', rejection_reason = 'owner_info' where id = f5;
  perform public.license_outcome_claim(10);
  res := res || jsonb_build_object('a refused card: failed', public.license_outcome_result(c5, 'failed', 'in_outcome5', 'https://invoice.stripe.com/i/test_5', 'card_declined') = 'failed');
  res := res || jsonb_build_object('Stripe''s retry pays it', public.license_outcome_paid(c5, 'in_outcome5') = 'used');

  -- 8. legacy: unchanged
  res := res || jsonb_build_object('a legacy workspace files as before', public.can_file_app(wl, 'any') = public.can_file(wl)
    and (select price_model from public.billing where workspace_id = wl) = 'legacy');

  -- only the server
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.license_outcome_open(w, 'x', 'license', 14900, o); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('only the billing function opens charges', ok);
  begin perform public.license_outcome_claim(10); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('only the server sweeps', ok);
  begin insert into public.rejection_disputes (filing_id, workspace_id, reason) values (f2, w, 'zoning'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nobody writes disputes directly', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
