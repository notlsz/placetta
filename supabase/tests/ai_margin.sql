-- Roles and vendors on AI events, saver mode from 60%, the once-per-period notice, allowance alerts, daily throttles
-- and the margin views. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); w3 uuid := gen_random_uuid(); w4 uuid := gen_random_uuid(); w5 uuid := gen_random_uuid(); w6 uuid := gen_random_uuid();
  inst uuid := '00000000-0000-0000-0000-000000000000';
  res jsonb := '{}'::jsonb; g jsonb; m jsonb; ok boolean; n int; ev bigint; i int; ws uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'a@margin.test', now(), now(), now(), '{}', '{}'),
    (inst, s, 'authenticated', 'authenticated', 'staff@margin.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (s, 'email');
  insert into public.staff_emails (email) values ('staff@margin.test') on conflict do nothing;
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w1, 'Essentials one', now(), a, a, '{}'), (w2, 'Pro two', now(), a, a, '{}'), (w3, 'Entry', now(), a, a, '{}'),
    (w4, 'Small 4', now(), a, a, '{}'), (w5, 'Small 5', now(), a, a, '{}'), (w6, 'Small 6', now(), a, a, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) select id, a, 'owner' from public.workspaces where id in (w1, w2, w3, w4, w5, w6);
  -- Essentials and Pro are legacy plans (the store plan has its own numbers: margin_guard.sql)
  insert into public.billing (workspace_id, subscription_status, subscription_plan, paid_locations, price_model) values
    (w1, 'active', 'locations', 1, 'legacy'), (w2, 'active', 'pro', 2, 'legacy'), (w4, 'active', 'locations', 1, 'legacy'), (w5, 'active', 'locations', 1, 'legacy'), (w6, 'active', 'locations', 1, 'legacy');
  insert into public.billing (workspace_id, price_model, entry_markets, entry_paid_at) values (w3, 'legacy', 1, now() - interval '2 days');

  -- 1. role and vendor land on the event; the old five-argument call still works
  g := public.ai_gate(w1, a, 'call', null);
  ev := (g->>'event')::bigint;
  perform public.ai_record(ev, 0.05, 'gemini:gemini-2.5-flash-lite', 1000, 200, 'extract', 'gemini');
  res := res || jsonb_build_object('role and provider recorded', (select role = 'extract' and provider = 'gemini' and model = 'gemini:gemini-2.5-flash-lite' from public.ai_events where id = ev));
  g := public.ai_gate(w1, a, 'call', null);
  perform public.ai_record((g->>'event')::bigint, 0.05, 'anthropic:claude-sonnet-5-5', 1000, 200);
  res := res || jsonb_build_object('five-argument record still works, role null', (select role is null and cost_usd = 0.05 from public.ai_events where id = (g->>'event')::bigint));
  g := public.ai_gate(w1, a, 'call', null);
  perform public.ai_record((g->>'event')::bigint, 0.01, 'x:y', 1, 1, 'not-a-role', 'x');
  res := res || jsonb_build_object('an unknown role is dropped, not an error', (select role is null and provider = 'x' from public.ai_events where id = (g->>'event')::bigint));

  -- 2. saver mode from 60%: $25 a month on Essentials, one location
  res := res || jsonb_build_object('rules: saver at 60%', (public.ai_rules()->>'reduced_at')::numeric = 0.6);
  g := public.ai_gate(w1, a, 'call', null);
  res := res || jsonb_build_object('under 60%: full', g->>'tier' = 'full' and g->>'reason' is null);
  perform public.ai_record((g->>'event')::bigint, 14.9, 'anthropic:claude-sonnet-5-5', 1, 1, 'plan', 'anthropic');   -- 15.01 of 25 used
  g := public.ai_gate(w1, a, 'call', null);
  res := res || jsonb_build_object('past 60%: reduced, because of the allowance', g->>'tier' = 'reduced' and g->>'reason' = 'allowance');

  -- 3. told once per period
  res := res || jsonb_build_object('saver notice due the first time', public.ai_saver_told(w1));
  res := res || jsonb_build_object('and not the second', not public.ai_saver_told(w1));
  update public.billing set ai_saver_told_at = now() - interval '2 months' where workspace_id = w1;
  res := res || jsonb_build_object('a new period tells again', public.ai_saver_told(w1));

  -- 4. allowance alerts: w1 is past 50% (one Update), nothing for a workspace under 50%
  g := public.ai_gate(w2, a, 'call', null);
  perform public.ai_record((g->>'event')::bigint, 1.5, 'anthropic:claude-sonnet-5-5', 1, 1, 'plan', 'anthropic');   -- 1.5 of 100
  n := (select count(*) from public.ai_allowance_alerts());
  res := res || jsonb_build_object('one alert, for the workspace past 50%', n = 1 and (select count(*) from public.updates where workspace_id = w1 and dedupe like 'ai:50:%') = 1);
  res := res || jsonb_build_object('the alert names what is left and saver mode', (select body->>'en' ~ 'is left' and body->>'en' ~ '60%' and body->>'zh' ~ '节省模式' from public.updates where workspace_id = w1 and dedupe like 'ai:50:%'));
  res := res || jsonb_build_object('no second alert for the same threshold', (select count(*) from public.ai_allowance_alerts()) = 0);
  g := public.ai_gate(w1, a, 'call', null);
  perform public.ai_record((g->>'event')::bigint, 6, 'anthropic:claude-sonnet-5-5', 1, 1, 'plan', 'anthropic');   -- 21.02 of 25: past 80%
  n := (select count(*) from public.ai_allowance_alerts());
  res := res || jsonb_build_object('80% crossed: one more alert', n = 1 and (select count(*) from public.updates where workspace_id = w1 and dedupe like 'ai:80:%') = 1);

  -- 5. throttles: over the daily limit, or far above the median (5 or more spenders)
  foreach ws in array array[w4, w5, w6] loop
    g := public.ai_gate(ws, a, 'call', null);
    perform public.ai_record((g->>'event')::bigint, 0.2, 'gemini:gemini-2.5-flash', 1, 1, 'short', 'gemini');
  end loop;
  -- spenders today: w1 21.01, w2 1.5, w3 nothing, w4..w6 0.2 each: median 0.2 over 5 spenders; limit $10
  n := (select count(*) from public.ai_throttle_sweep(10));
  res := res || jsonb_build_object('w1 is throttled: over $10 today', (select count(*) from public.ai_throttles where workspace_id = w1 and reason = 'daily_limit') = 1);
  res := res || jsonb_build_object('w2 is throttled: $1.50 is more than 5x the median', (select count(*) from public.ai_throttles where workspace_id = w2 and reason = 'outlier') = 1);
  res := res || jsonb_build_object('the small ones are not', n = 2 and (select count(*) from public.ai_throttles where workspace_id in (w4, w5, w6)) = 0);
  res := res || jsonb_build_object('a team task per throttle', (select count(*) from public.team_tasks where kind = 'ai_spend' and workspace_id in (w1, w2) and done_at is null) = 2);
  g := public.ai_gate(w2, a, 'call', null);
  res := res || jsonb_build_object('a throttled workspace is reduced for the day', g->>'tier' = 'reduced' and g->>'reason' = 'throttle');
  res := res || jsonb_build_object('a second sweep adds nothing', (select count(*) from public.ai_throttle_sweep(10)) = 0);
  res := res || jsonb_build_object('without a limit the sweep reads app_settings ($10 by default)', (select ai_ws_daily_limit_usd from public.app_settings) = 10 and (select count(*) from public.ai_throttle_sweep(null)) = 0);
  update public.ai_throttles set until = now() - interval '1 minute' where workspace_id = w2;
  g := public.ai_gate(w2, a, 'call', null);
  res := res || jsonb_build_object('and the next day it is full again', g->>'tier' = 'full');

  -- 6. margin: per workspace per month, and the company (read as the server)
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  m := public.ai_margin(w1, current_date);
  res := res || jsonb_build_object('w1: $149 revenue, $25 allowance, cost summed', (m->>'revenue_usd')::numeric = 149 and (m->>'allowance_usd')::numeric = 25 and (m->>'ai_cost_usd')::numeric between 21.0 and 21.1);
  res := res || jsonb_build_object('w1: cost as a share of revenue', (m->>'cost_pct')::numeric between 14 and 14.2);
  res := res || jsonb_build_object('w1: top roles, plan first', m->'top_roles'->0->>'role' = 'plan' and (m->'top_roles'->0->>'cost_usd')::numeric between 20.9 and 20.91);
  m := public.ai_margin(w2, current_date);
  res := res || jsonb_build_object('w2: Pro, two locations: $598 revenue, $100 allowance', (m->>'revenue_usd')::numeric = 598 and (m->>'allowance_usd')::numeric = 100);
  m := public.ai_margin(w3, current_date);
  res := res || jsonb_build_object('w3: entry plan paid this month counts $299 once', (m->>'revenue_usd')::numeric = 299 and (m->>'ai_cost_usd')::numeric = 0);
  m := public.ai_margin(w3, (current_date - interval '1 month')::date);
  res := res || jsonb_build_object('w3: not in another month', (m->>'revenue_usd')::numeric = 0);
  m := public.ai_margin_company(current_date);
  res := res || jsonb_build_object('company: MRR adds up', (m->>'mrr_usd')::numeric = 149 + 598 + 299 + 3 * 149);
  res := res || jsonb_build_object('company: cost and margin', (m->>'ai_cost_usd')::numeric between 23.0 and 23.2 and (m->>'gross_margin_pct')::numeric between 98 and 99);
  res := res || jsonb_build_object('company: dearest workspace first', m->'top'->0->>'name' = 'Essentials one' and jsonb_array_length(m->'top') between 6 and 10);
  res := res || jsonb_build_object('company: by role and by vendor', (select bool_or(x->>'role' = 'plan') from jsonb_array_elements(m->'by_role') x) and (select bool_or(x->>'provider' = 'gemini') from jsonb_array_elements(m->'by_vendor') x));

  -- 7. who may read it
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin perform public.ai_margin_company(current_date); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a customer cannot read the company margin', ok);
  begin perform public.ai_margin(w1, current_date); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor a workspace margin', ok);
  begin perform count(*) from public.ai_margin_month; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor the view', ok);
  begin perform public.ai_throttle_sweep(10); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor run the sweep', ok);
  res := res || jsonb_build_object('a member sees saver mode in their status', (public.ai_status(w1)->>'saver')::boolean and (public.ai_status(w1)->>'saver_at_pct')::int = 60);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('staff read the company margin', (public.ai_margin_company(current_date)->>'mrr_usd')::numeric > 0);
  res := res || jsonb_build_object('staff read a workspace margin', (public.ai_margin(w1, current_date)->>'revenue_usd')::numeric = 149);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  res := res || jsonb_build_object('the server reads it too', public.is_service() and (public.ai_margin_company(current_date)->>'mrr_usd')::numeric > 0);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  raise exception 'TEST_RESULTS %', res;
end $test$;
