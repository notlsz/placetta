-- No charge for a failed run (20261024090000_failed_runs_free.sql): its calls are given back to the allowance and any
-- pack credit they used to the pack, once, only in its own workspace; the real cost stays recorded. Run with scripts/test-db.sh.
do $test$
declare
  x uuid := gen_random_uuid(); wm uuid := gen_random_uuid(); wo uuid := gen_random_uuid();
  inst uuid := '00000000-0000-0000-0000-000000000000';
  res jsonb := '{}'::jsonb; g jsonb; e1 bigint; e2 bigint; e3 bigint; eo bigint; r jsonb; before numeric; credit numeric;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, x, 'authenticated', 'authenticated', 'x@refund.test', now(), now(), now(), '{}', '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values (wm, 'Refunds', now(), x, x, '{}'), (wo, 'Other', now(), x, x, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (wm, x, 'owner'), (wo, x, 'owner');
  insert into public.billing (workspace_id, price_model, subscription_status, paid_locations) values (wm, 'legacy', 'active', 1), (wo, 'legacy', 'active', 1);

  -- a $25 allowance: a run that worked ($5), then a run that failed after three calls ($20 and $8, the last $3 from a pack)
  g := public.ai_gate(wm, x, 'call', null); perform public.ai_record((g->>'event')::bigint, 5, 'gemini:gemini-3.8-flash', 1, 1);
  perform public.ai_add_credit(wm, 10);
  g := public.ai_gate(wm, x, 'call', null); e1 := (g->>'event')::bigint; perform public.ai_record(e1, 12, 'gemini:gemini-3.8-flash', 1, 1);
  g := public.ai_gate(wm, x, 'call', null); e2 := (g->>'event')::bigint; perform public.ai_record(e2, 8, 'gemini:gemini-3.8-flash', 1, 1);
  g := public.ai_gate(wm, x, 'call', null); e3 := (g->>'event')::bigint; perform public.ai_record(e3, 3, 'gemini:gemini-3.8-flash', 1, 1);
  before := (public.ai_budget(wm)->>'used_usd')::numeric;
  credit := (select ai_credit_usd from public.billing where workspace_id = wm);
  res := res || jsonb_build_object('before: $28 used, $3 of the pack spent', before = 28 and credit between 6.99 and 7.01);

  -- another workspace's call can't be given back through this one
  g := public.ai_gate(wo, x, 'call', null); eo := (g->>'event')::bigint; perform public.ai_record(eo, 4, 'gemini:gemini-3.8-flash', 1, 1);

  r := public.ai_refund_events(wm, array[e1, e2, e3, eo]);
  res := res || jsonb_build_object('the failed run''s three calls are given back, not the other workspace''s', (r->>'events')::int = 3 and (r->>'usd')::numeric = 23);
  res := res || jsonb_build_object('they no longer count against the allowance', (public.ai_budget(wm)->>'used_usd')::numeric = 5);
  res := res || jsonb_build_object('the pack gets its $3 back', (select ai_credit_usd from public.billing where workspace_id = wm) between 9.99 and 10.01);
  res := res || jsonb_build_object('the real cost stays recorded', (select sum(cost_usd) from public.ai_events where workspace_id = wm) = 28);
  res := res || jsonb_build_object('the other workspace is untouched', (public.ai_budget(wo)->>'used_usd')::numeric = 4 and (select refunded_at from public.ai_events where id = eo) is null);
  r := public.ai_refund_events(wm, array[e1, e2, e3]);
  res := res || jsonb_build_object('giving back twice gives nothing more', (r->>'events')::int = 0 and (select ai_credit_usd from public.billing where workspace_id = wm) between 9.99 and 10.01);
  res := res || jsonb_build_object('empty or missing lists are a no-op', (public.ai_refund_events(wm, '{}')->>'events')::int = 0 and (public.ai_refund_events(null, array[e1])->>'events')::int = 0);

  -- only the service role may give calls back
  res := res || jsonb_build_object('members can''t call it', not has_function_privilege('authenticated', 'public.ai_refund_events(uuid, bigint[])', 'execute'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
