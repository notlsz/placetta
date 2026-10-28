-- The money path's database side (migration 20261101120000): each Stripe event once and a crashed one retried, a
-- pack's credit once, the dunning mark set and cleared in order, refunds, and only the service role may call any of it.
-- Run with scripts/test-db.sh.
do $test$
declare
  o uuid := gen_random_uuid(); w uuid := gen_random_uuid(); res jsonb := '{}'::jsonb; ok boolean; cid uuid; used uuid;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (inst, o, 'authenticated', 'authenticated', 'money@t.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Money', now(), o, o);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner');
  insert into public.billing (workspace_id) values (w) on conflict (workspace_id) do nothing;

  -- each event once
  res := res || jsonb_build_object(
    'a new event is claimed', public.stripe_event_claim('evt_a', 'invoice.paid') = 'new',
    'a second delivery is a duplicate', public.stripe_event_claim('evt_a', 'invoice.paid') = 'duplicate');
  update public.stripe_events set received_at = now() - interval '10 minutes' where id = 'evt_a';
  res := res || jsonb_build_object('one that crashed mid-way is claimed again after five minutes', public.stripe_event_claim('evt_a', 'invoice.paid') = 'retry');
  perform public.stripe_event_done('evt_a');
  update public.stripe_events set received_at = now() - interval '10 minutes' where id = 'evt_a';
  res := res || jsonb_build_object('one that was done is never applied again', public.stripe_event_claim('evt_a', 'invoice.paid') = 'duplicate');

  -- a pack's credit once per Checkout session, taken back once per refund, never below zero
  -- (each call is its own statement: a check in the same statement wouldn't see the call's write)
  ok := public.ai_credit_once(w, 25, 'pack:cs_1');
  res := res || jsonb_build_object('a pack adds its credit', ok and (select ai_credit_usd from public.billing where workspace_id = w) = 25);
  ok := public.ai_credit_once(w, 25, 'pack:cs_1');
  res := res || jsonb_build_object('the same session again adds nothing', not ok and (select ai_credit_usd from public.billing where workspace_id = w) = 25);
  perform public.ai_credit_once(w, -50, 'refund:ch_1');
  res := res || jsonb_build_object('a refund takes it back, never below zero', (select ai_credit_usd from public.billing where workspace_id = w) = 0);
  begin perform public.ai_credit_once(gen_random_uuid(), 25, 'pack:cs_none'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a credit for a workspace without billing is an error, not lost silently', ok
    and not exists (select 1 from public.stripe_events where id = 'pack:cs_none'));

  -- failed payments: marked, cleared by a later payment, a stale failure ignored
  ok := public.billing_payment_apply(w, true, now() - interval '2 days', 'in_1');
  res := res || jsonb_build_object('a failed invoice marks the workspace', ok and (select payment_issue_invoice from public.billing where workspace_id = w) = 'in_1');
  ok := public.billing_payment_apply(w, false, now() - interval '1 day', 'in_1');
  res := res || jsonb_build_object('a payment after it clears it', ok and (select payment_issue_at is null from public.billing where workspace_id = w));
  perform public.billing_payment_apply(w, true, now() - interval '3 days', 'in_0');
  res := res || jsonb_build_object('a failure older than the last payment is stale', (select payment_issue_at is null from public.billing where workspace_id = w));

  -- refunds: a paid charge is let go; one whose filing went in stays used
  update public.app_settings set payments_on = true;
  select (public.license_charge_open(w, 'sj-sign', 'license', 29900, o)->>'id')::uuid into cid;
  perform public.license_charge_settle(cid, true, 'cs_l');
  insert into public.license_charges (workspace_id, ref, tier, cents, status, paid_at, used_at) values (w, 'sj-health', 'license', 29900, 'used', now(), now()) returning id into used;
  ok := public.license_charge_refund(cid, 'ch_1') = 'void';
  res := res || jsonb_build_object(
    'a refunded charge is let go', ok and (select status from public.license_charges where id = cid) = 'void',
    'and its filing can no longer go in on it', not public.can_file_app(w, 'sj-sign'),
    'a refund after the filing went in is for the team', public.license_charge_refund(used, 'ch_2') = 'used',
    'an unknown charge', public.license_charge_refund(gen_random_uuid(), 'ch_3') = 'none');

  -- billing tasks for the team
  insert into public.team_tasks (kind, workspace_id, title, dedupe) values ('billing', w, 'Billing health', 'billing-test');
  res := res || jsonb_build_object('the team gets billing tasks', exists (select 1 from public.team_tasks where dedupe = 'billing-test'));

  -- only the service role
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  begin perform public.ai_credit_once(w, 1000, 'pack:steal'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('an owner can''t add credit', ok);
  begin perform public.stripe_event_claim('evt_x', 'x'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('an owner can''t claim events', ok);
  begin perform public.billing_payment_apply(w, false, now(), 'in_x'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('an owner can''t clear a failed payment', ok);
  res := res || jsonb_build_object('an owner reads the dunning mark', (select payment_issue_at is null from public.billing where workspace_id = w));
  execute 'reset role';
  raise exception 'TEST_RESULTS %', res;
end $test$;
