-- Odelia's AI budgets, credits, rate limits and the company-wide ceiling. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); wm uuid := gen_random_uuid(); we uuid := gen_random_uuid(); wo uuid := gen_random_uuid();
  inst uuid := '00000000-0000-0000-0000-000000000000';
  res jsonb := '{}'::jsonb; g jsonb; ok boolean; i int; ev bigint;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'a@ai.test', now(), now(), now(), '{}', '{}'),
    (inst, x, 'authenticated', 'authenticated', 'x@ai.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (x, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w1, 'Trial 1', now(), a, a, '{}'), (w2, 'Trial 2', now(), a, a, '{}'), (wm, 'Monthly', now(), x, x, '{}'), (we, 'Entry', now(), x, x, '{}'),
    (wo, 'Opening', now(), x, x, '{"stores":[{"id":"s1","stage":"opening"},{"id":"s2","stage":"open"},{"id":"s3","stage":"opening"}]}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w1, a, 'owner'), (w2, a, 'owner'), (wm, x, 'owner'), (we, x, 'owner'), (wo, x, 'owner');

  -- No paid plan, no AI: not even a small trial, and a new workspace changes nothing
  g := public.ai_gate(w1, a, 'call', null);
  res := res || jsonb_build_object('no plan, no AI', not (g->>'ok')::boolean and g->>'code' = 'plan_required' and (g->'budget'->>'limit_usd')::numeric = 0);
  g := public.ai_gate(w2, a, 'task', null);
  res := res || jsonb_build_object('a second unpaid workspace is refused too', g->>'code' = 'plan_required');
  res := res || jsonb_build_object('a refused workspace adds nothing to the log', (select count(*) from public.ai_events where workspace_id in (w1, w2)) = 0);
  perform public.ai_add_credit(w1, 100);
  res := res || jsonb_build_object('credit alone does not buy AI without a plan', public.ai_gate(w1, a, 'call', null)->>'code' = 'plan_required');

  -- Per location: $25 a location a month
  insert into public.billing (workspace_id, subscription_status, paid_locations) values (wm, 'active', 2);
  g := public.ai_gate(wm, x, 'call', null);
  res := res || jsonb_build_object('two locations, $50', (g->'budget'->>'limit_usd')::numeric = 50 and g->>'tier' = 'full');
  perform public.ai_record((g->>'event')::bigint, 49.99, 'anthropic:claude-opus-5-5', 1, 1);
  g := public.ai_gate(wm, x, 'call', null);
  res := res || jsonb_build_object('near the budget, reduced', (g->>'ok')::boolean and g->>'tier' = 'reduced');
  perform public.ai_record((g->>'event')::bigint, 0.02, 'anthropic:claude-sonnet-5-5', 1, 1);
  g := public.ai_gate(wm, x, 'call', null);
  res := res || jsonb_build_object('over the budget, stops with an upgrade', g->>'code' = 'over_budget');

  -- A pack: credit on top, used only past the budget, and spent down
  perform public.ai_add_credit(wm, 10);
  g := public.ai_gate(wm, x, 'call', null);
  res := res || jsonb_build_object('a pack reopens it', (g->>'ok')::boolean and (g->'budget'->>'limit_usd')::numeric = 60);
  perform public.ai_record((g->>'event')::bigint, 4, 'anthropic:claude-sonnet-5-5', 1, 1);
  res := res || jsonb_build_object('overage comes out of the pack', (select ai_credit_usd from public.billing where workspace_id = wm) between 5.9 and 6.0);
  g := public.ai_gate(wm, x, 'call', null);
  res := res || jsonb_build_object('spent credit still counts this period', (g->'budget'->>'limit_usd')::numeric between 59.9 and 60.1);

  -- Pro: twice the allowance per location
  update public.billing set subscription_plan = 'pro' where workspace_id = wm;
  res := res || jsonb_build_object('Pro doubles the allowance per location', (public.ai_budget(wm)->>'budget_usd')::numeric = 100);
  update public.billing set subscription_plan = 'locations' where workspace_id = wm;

  -- Opening: $50 a month more for each paid store still opening
  insert into public.billing (workspace_id, subscription_status, paid_locations, charged_store_ids) values (wo, 'active', 3, '{s1,s2}');
  res := res || jsonb_build_object('opening stores add budget only when paid and opening', (public.ai_budget(wo)->>'budget_usd')::numeric = 125);

  -- Entry: $15 a market for 30 days, then it ends
  insert into public.billing (workspace_id, entry_markets, entry_paid_at) values (we, 2, now() - interval '3 days');
  res := res || jsonb_build_object('entry, $15 a market', (public.ai_budget(we)->>'budget_usd')::numeric = 30 and public.ai_budget(we)->>'plan' = 'entry');
  update public.billing set entry_paid_at = now() - interval '31 days' where workspace_id = we;
  g := public.ai_gate(we, x, 'call', null);
  res := res || jsonb_build_object('entry ends after 30 days', g->>'code' = 'entry_ended');

  -- Rate limits: tasks per person per hour, calls per workspace per minute
  update public.billing set paid_locations = 20 where workspace_id = wm;
  for i in 1..15 loop perform public.ai_gate(wm, x, 'task', null); end loop;
  g := public.ai_gate(wm, x, 'task', null);
  res := res || jsonb_build_object('16th task in an hour waits', g->>'code' = 'rate_limited' and (g->>'retry_after')::int >= 60);
  delete from public.ai_events where workspace_id = wm and kind = 'call';
  for i in 1..30 loop perform public.ai_gate(wm, x, 'call', null); end loop;
  g := public.ai_gate(wm, x, 'call', null);
  res := res || jsonb_build_object('31st call in a minute waits', g->>'code' = 'rate_limited');

  -- The company-wide ceiling
  insert into public.ai_events (workspace_id, user_id, kind, cost_usd) values (wo, x, 'call', 5);
  g := public.ai_gate(wm, x, 'call', 1);
  res := res || jsonb_build_object('company ceiling pauses everyone', g->>'code' = 'paused');

  -- Who can call what
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.ai_gate(w1, a, 'call', null); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('members cannot call the gate', ok);
  begin perform public.ai_add_credit(w1, 1000); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('members cannot give themselves credit', ok);
  res := res || jsonb_build_object('members see their own status', public.ai_status(w1)->>'plan' = 'none');
  begin perform public.ai_status(wm); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('but not another workspace''s', ok);
  begin perform count(*) from public.ai_events; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('members cannot read the event log', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  raise exception 'TEST_RESULTS %', res;
end $test$;
