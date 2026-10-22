-- Margin guardrails (migration 20261025090000_margin_guard): a task is never refused part way for the allowance, team
-- minutes on a filing with an alert past budget, and the monthly AI-cost-to-revenue watch. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); w3 uuid := gen_random_uuid(); w4 uuid := gen_random_uuid();
  inst uuid := '00000000-0000-0000-0000-000000000000';
  res jsonb := '{}'::jsonb; g jsonb; m jsonb; n int; fl uuid; fc uuid; ok boolean;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'a@guard.test', now(), now(), now(), '{}', '{}'),
    (inst, s, 'authenticated', 'authenticated', 'staff@guard.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (s, 'email');
  insert into public.staff_emails (email) values ('staff@guard.test') on conflict do nothing;
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w1, 'Store plan one', now(), a, a, '{}'), (w2, 'Comped', now(), a, a, '{}'), (w3, 'Quiet store', now(), a, a, '{}'), (w4, 'Free preview', now(), a, a, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) select id, a, 'owner' from public.workspaces where id in (w1, w2, w3, w4);
  insert into public.billing (workspace_id, subscription_status, subscription_plan, paid_locations, price_model) values
    (w1, 'active', 'locations', 1, 'simple'), (w3, 'active', 'locations', 1, 'simple');
  insert into public.billing (workspace_id, comped, price_model) values (w2, true, 'simple');
  insert into public.billing (workspace_id, price_model) values (w4, 'simple');

  -- 1. the rules agree with src/economics.ts (the app test checks the same numbers from the other side)
  res := res || jsonb_build_object('rules: 10% share, $5 with no revenue, 1.5x team budget',
    (public.margin_rules()->>'ai_share_alert')::numeric = 0.10 and (public.margin_rules()->>'ai_no_revenue_alert_usd')::numeric = 5
    and (public.margin_rules()->>'team_over_budget_factor')::numeric = 1.5 and (public.margin_rules()->'team_minutes'->>'complex')::int = 300);

  -- 1b. the $50 store ceiling: $44 of AI a store hard, saver mode from $29; legacy Essentials keeps $25
  res := res || jsonb_build_object('store plan: $44 hard, $29 soft', (public.ai_budget(w1)->>'budget_usd')::numeric = 44 and (public.ai_budget(w1)->>'soft_usd')::numeric = 29);
  g := public.ai_gate(w1, a, 'call', null);
  perform public.ai_record((g->>'event')::bigint, 28.5, 'gemini:gemini-3.8-flash', 1, 1, 'plan', 'gemini');
  g := public.ai_gate(w1, a, 'call', null);
  res := res || jsonb_build_object('at $28.50 of AI, full mode', g->>'tier' = 'full');
  perform public.ai_record((g->>'event')::bigint, 1, 'gemini:gemini-3.8-flash', 1, 1, 'plan', 'gemini');
  g := public.ai_gate(w1, a, 'call', null);
  res := res || jsonb_build_object('at $29.50, saver mode', g->>'tier' = 'reduced' and g->>'reason' = 'allowance');

  -- 2. a workspace at its allowance: a new task is refused, a call inside a running task goes on in saver mode
  perform public.ai_record((g->>'event')::bigint, 15, 'gemini:gemini-3.8-flash', 1, 1, 'plan', 'gemini');
  g := public.ai_gate(w1, a, 'task', null);
  res := res || jsonb_build_object('at the allowance, a new task is refused', g->>'code' = 'over_budget');
  g := public.ai_gate_in_task(w1, a, null);
  res := res || jsonb_build_object('a call inside a running task goes on, in saver mode', (g->>'ok')::boolean and g->>'tier' = 'reduced' and (g->>'finishing')::boolean);
  res := res || jsonb_build_object('and its cost is still counted', exists (select 1 from public.ai_events where id = (g->>'event')::bigint and workspace_id = w1 and kind = 'call'));
  g := public.ai_gate_in_task(w3, a, null);
  res := res || jsonb_build_object('under the allowance it is the ordinary gate', (g->>'ok')::boolean and g->>'tier' = 'full' and g->'finishing' is null);
  g := public.ai_gate_in_task(w1, a, 0.0001);
  res := res || jsonb_build_object('the company ceiling still holds mid-task', g->>'code' = 'paused');

  -- 3. the margin watch: w1 spent $44.5 on $149 (30%), w2 is comped with $6, w3 spent $1 on $149, w4 is free with $4
  g := public.ai_gate(w2, a, 'call', null); perform public.ai_record((g->>'event')::bigint, 6, 'gemini:gemini-3.8-flash', 1, 1, 'plan', 'gemini');
  g := public.ai_gate(w3, a, 'call', null); perform public.ai_record((g->>'event')::bigint, 1, 'gemini:gemini-3.8-flash', 1, 1, 'plan', 'gemini');
  insert into public.ai_events (workspace_id, user_id, kind, cost_usd) values (w4, a, 'call', 4);
  n := (select count(*) from public.margin_watch(current_date));
  res := res || jsonb_build_object('two alerts: past 10% of revenue, and past $5 with none', n = 2
    and exists (select 1 from public.team_tasks where kind = 'margin' and workspace_id = w1 and title ~ 'of \$149')
    and exists (select 1 from public.team_tasks where kind = 'margin' and workspace_id = w2 and title ~ 'no revenue'));
  res := res || jsonb_build_object('no alert under the lines', not exists (select 1 from public.team_tasks where kind = 'margin' and workspace_id in (w3, w4)));
  res := res || jsonb_build_object('once a workspace a month', (select count(*) from public.margin_watch(current_date)) = 0);
  -- a paid license this month counts as revenue
  insert into public.license_charges (workspace_id, ref, tier, cents, status, paid_at) values (w3, 'app-x', 'license', 29900, 'paid', now());
  res := res || jsonb_build_object('license charges count as revenue', public.margin_revenue(w3, current_date) = 149 + 299);

  -- 4. team minutes: staff only, an alert past 1.5x the budget of what was charged
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w1, 'lic', '{"en":"Seller''s permit","zh":"销售许可"}', '{"official":"cdtfa-400"}', a) returning id into fl;
  insert into public.license_charges (workspace_id, ref, tier, cents, status, paid_at) values (w1, 'cx', 'complex', 99900, 'paid', now());
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w1, 'cx', '{"en":"Restaurant wine license","zh":"餐厅酒牌"}', '{"official":"ny-sla-rw"}', a) returning id into fc;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin perform public.filing_add_team_minutes(fl, 10); ok := false; exception when others then ok := sqlerrm ~ 'team only'; end;
  res := res || jsonb_build_object('only staff record team minutes', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  m := public.filing_add_team_minutes(fl, 40);
  res := res || jsonb_build_object('40 minutes on a license: within 1.5x of 45', (m->>'minutes')::int = 40 and not (m->>'over')::boolean and m->>'tier' = 'license');
  m := public.filing_add_team_minutes(fl, 30);
  res := res || jsonb_build_object('70 minutes: past 67.5, an alert', (m->>'over')::boolean);
  m := public.filing_add_team_minutes(fc, 120);
  res := res || jsonb_build_object('the liquor license is budgeted as complex (300)', m->>'tier' = 'complex' and (m->>'budget')::int = 300 and not (m->>'over')::boolean);
  begin perform public.filing_add_team_minutes(fl, 0); ok := false; exception when others then ok := sqlerrm ~ 'between 1 and 1440'; end;
  res := res || jsonb_build_object('zero or silly minutes are refused', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('one team-time alert, on the license only', (select count(*) from public.team_tasks where kind = 'team_time') = 1
    and exists (select 1 from public.team_tasks where kind = 'team_time' and filing_id = fl and title ~ '70 minutes'));

  raise exception 'TEST_RESULTS %', res;
end $test$;
