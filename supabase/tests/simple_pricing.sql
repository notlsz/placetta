-- The simple pricing model: legacy customers keep their plans, a new workspace is on the simple model, a filing goes in
-- only once its own charge is paid, the next one is a renewal, and Odelia's free allowance. Run with scripts/test-db.sh.
do $test$
declare
  o uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); wl uuid := gen_random_uuid(); wc uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; r jsonb; s jsonb; cid uuid; fid uuid;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@s.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@s.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (m, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'New', now(), o, o), (wl, 'Old', now(), o, o), (wc, 'Chain', now(), o, o);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w, m, 'member'), (wl, o, 'owner'), (wc, o, 'owner');
  insert into public.billing (workspace_id) values (w);
  insert into public.billing (workspace_id, price_model, entry_markets, entry_paid_at) values (wl, 'legacy', 1, now() - interval '90 days');
  insert into public.billing (workspace_id, subscription_status, subscription_plan, paid_locations) values (wc, 'active', 'chain', 12);
  update public.app_settings set payments_on = true;

  res := res || jsonb_build_object(
    'a new workspace is on the simple model', (select price_model from public.billing where workspace_id = w) = 'simple' and public.plan_of(w) = 'simple',
    'a legacy customer keeps its plan', public.plan_of(wl) = 'entry',
    'the chain plan is a paid plan that files everything', public.plan_of(wc) = 'monthly' and public.can_file_app(wc, 'any'),
    'the simple model gets Odelia free, with a small allowance', (public.ai_budget(w)->>'plan') = 'simple' and (public.ai_budget(w)->>'budget_usd')::numeric = 5,
    'a legacy workspace without a plan still gets no AI', (public.ai_budget(wl)->>'plan') = 'entry_ended',
    'an unpaid license cannot be filed', not public.can_file_app(w, 'app-health'));

  -- the owner approved $299; Stripe Checkout is open
  r := public.license_charge_open(w, 'app-health', 'license', 29900, o);
  cid := (r->>'id')::uuid;
  res := res || jsonb_build_object('approving opens a pending charge', (r->>'ok')::boolean and not (r->>'paid')::boolean and not public.can_file_app(w, 'app-health'));
  res := res || jsonb_build_object('a wrong price is refused', (public.license_charge_open(w, 'app-health', 'free', 29900, o)->>'code') = 'bad_price');
  -- approving again lets the abandoned checkout go
  r := public.license_charge_open(w, 'app-health', 'license', 29900, o);
  res := res || jsonb_build_object('approving again replaces the unpaid one', (select status from public.license_charges where id = cid) = 'void'
    and (select count(*) from public.license_charges where workspace_id = w and status in ('pending', 'paid')) = 1);
  cid := (r->>'id')::uuid;
  res := res || jsonb_build_object('Stripe paid: settled once', public.license_charge_settle(cid, true, 'cs_1') and not public.license_charge_settle(cid, true, 'cs_1'));
  res := res || jsonb_build_object('paid: the filing may go in', public.can_file_app(w, 'app-health'));
  r := public.license_charge_open(w, 'app-health', 'license', 29900, o);
  res := res || jsonb_build_object('a paid charge is never opened twice', (r->>'paid')::boolean and (r->>'again')::boolean and (r->>'id')::uuid = cid);
  res := res || jsonb_build_object('the allowance grows with a paid license', (public.ai_budget(w)->>'budget_usd')::numeric = 10);

  -- the owner files it (through the policy, as the app does)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'app-health', '{"en":"Health permit","zh":"卫生许可"}', '{}', o) returning id into fid;
  begin
    insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'app-sign', '{"en":"Sign permit","zh":"招牌许可"}', '{}', o); ok := false;
  exception when insufficient_privilege or check_violation then ok := true; end;
  res := res || jsonb_build_object('an unpaid filing is refused by the database', ok);
  res := res || jsonb_build_object('members read their license charges', (select count(*) from public.license_charges where workspace_id = w) = 2);
  begin perform public.license_charge_open(w, 'x', 'license', 29900, o); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('only the billing function opens charges', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  res := res || jsonb_build_object('the filing used its charge', (select status = 'used' and filing_id = fid from public.license_charges where id = cid));
  s := public.license_state(w, 'app-health');
  res := res || jsonb_build_object('the next one for the same license is a renewal', (s->>'renewal')::boolean and s->'paid' = 'null'::jsonb and s->>'model' = 'simple');
  res := res || jsonb_build_object('a new license is not a renewal', not (public.license_state(w, 'app-sign')->>'renewal')::boolean);
  r := public.license_charge_open(w, 'app-cert', 'free', 0, o);
  res := res || jsonb_build_object('a free item is paid at once at $0', (r->>'paid')::boolean and public.can_file_app(w, 'app-cert'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
