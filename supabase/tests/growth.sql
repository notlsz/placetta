-- Growth mechanics: the monthly cap on filings past the allowance, the term and the online cancel, the renewal notice
-- claim, modules, and the brand plan (invites, who pays, coverage). Run with scripts/test-db.sh.
do $test$
declare
  o uuid := gen_random_uuid(); m uuid := gen_random_uuid(); h uuid := gen_random_uuid(); f uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); w3 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; r jsonb; b public.billing; code text; code2 text; v jsonb; n int; cid uuid;
  inst uuid := '00000000-0000-0000-0000-000000000000';
  st jsonb := '{"stores":[{"id":"s1","name":{"en":"Main St"},"stage":"open","kind":"retail"},{"id":"s2","name":{"en":"Mall"},"stage":"open","kind":"retail"}]}';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@g.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@g.test', now(), now(), now(), '{}', '{}'),
    (inst, h, 'authenticated', 'authenticated', 'hq@brand.test', now(), now(), now(), '{}', '{}'),
    (inst, f, 'authenticated', 'authenticated', 'franchisee@g.test', now(), now(), now(), '{}', '{}'),
    (inst, x, 'authenticated', 'authenticated', 'self@g.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (m, 'email'), (h, 'email'), (f, 'email'), (x, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'G', now(), o, o, st), (w2, 'Franchise One', now(), f, f, st), (w3, 'Pays Itself', now(), x, x, '{"stores":[{"id":"z","stage":"open","kind":"retail"}]}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w, m, 'member'), (w2, f, 'owner'), (w2, m, 'member'), (w3, x, 'owner');
  insert into public.billing (workspace_id, subscription_status, paid_locations) values (w, 'active', 2), (w2, null, 0);
  insert into public.billing (workspace_id, subscription_id, subscription_status, subscription_plan, paid_locations) values (w3, 'sub_own', 'active', 'locations', 1);

  /* ---------------- the cap ---------------- */
  res := res || jsonb_build_object('a new workspace''s cap is $0', (select filing_cap_cents from public.billing where workspace_id = w) = 0);
  r := public.filing_charge_reserve(w, 'app-1', 'sales_tax', 4900, 4, o);
  res := res || jsonb_build_object('within the allowance: counted at no charge', r->>'kind' = 'allowance' and (select cents from public.filing_charges where id = (r->>'id')::uuid) = 0);
  r := public.filing_charge_reserve(w, 'app-1', 'sales_tax', 4900, 4, o);
  res := res || jsonb_build_object('the same filing twice in a month is one row', (r->>'again')::boolean and (select count(*) from public.filing_charges where workspace_id = w) = 1);
  perform public.filing_charge_reserve(w, 'app-' || k, 'entity', 4900, 4, o) from generate_series(2, 4) k;
  r := public.filing_charge_reserve(w, 'app-5', 'entity', 4900, 4, o);
  res := res || jsonb_build_object('past the allowance with a $0 cap: refused, nothing reserved', r->>'code' = 'no_cap' and (select count(*) from public.filing_charges where workspace_id = w and ref = 'app-5') = 0);

  -- only an owner sets the cap
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.filing_cap_set(w, 10000); ok := false; exception when others then ok := sqlerrm like 'Only an owner%'; end;
  res := res || jsonb_build_object('a member can''t set the cap', ok);
  v := public.filing_month(w);
  res := res || jsonb_build_object('a member reads this month', (v->>'used')::int = 4 and (v->>'cap_cents')::int = 0 and (v->>'locations')::int = 2);
  begin perform public.filing_charge_reserve(w, 'sneak', 'other', 1, 99, m); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('members can''t reserve charges', ok);
  begin insert into public.filing_charges (workspace_id, ref, kind, month, cents) values (w, 'x', 'other', current_date, 0); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor write filing charges', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.filing_cap_set(w, 1050); ok := false; exception when others then ok := sqlerrm like 'Set the cap in whole dollars%'; end;
  res := res || jsonb_build_object('the cap is whole dollars', ok);
  begin perform public.filing_cap_set(w, 600000); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('and no more than $5,000', ok);
  perform public.filing_cap_set(w, 10000);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('an owner sets a $100 cap', (select filing_cap_cents from public.billing where workspace_id = w) = 10000,
    'with an audit line', exists (select 1 from public.audit_log where workspace_id = w and action->>'en' like 'Set the monthly cap%'));

  r := public.filing_charge_reserve(w, 'app-5', 'entity', 4900, 4, o);
  cid := (r->>'id')::uuid;
  res := res || jsonb_build_object('past the allowance under the cap: reserved', r->>'kind' = 'charge' and (select status from public.filing_charges where id = cid) = 'reserved');
  perform public.filing_charge_settle(cid, true, 'ii_1');
  r := public.filing_charge_reserve(w, 'app-6', 'entity', 4900, 4, o);
  res := res || jsonb_build_object('two at $49 fit under $100', r->>'kind' = 'charge');
  r := public.filing_charge_reserve(w, 'app-7', 'entity', 4900, 4, o);
  res := res || jsonb_build_object('a third would pass the cap: refused', r->>'code' = 'over_cap' and (r->>'left_cents')::int = 200);
  perform public.filing_charge_settle((select id from public.filing_charges where workspace_id = w and ref = 'app-6'), false, null);
  r := public.filing_charge_reserve(w, 'app-7', 'entity', 4900, 4, o);
  res := res || jsonb_build_object('a charge Stripe refused frees its room', r->>'kind' = 'charge',
    'a settled charge stays settled', (select status from public.filing_charges where id = cid) = 'charged');
  r := public.filing_charge_reserve(w, 'bad', 'license', 4900, 4, o);
  res := res || jsonb_build_object('a plan''s own license is never charged here', r->>'code' = 'bad_kind');

  /* ---------------- the term, the online cancel, the renewal notice ---------------- */
  perform public.billing_term_apply(w, 2);
  res := res || jsonb_build_object('the term is recorded', (select term_years = 2 and term_started = current_date from public.billing where workspace_id = w));
  perform public.billing_term_apply(w, 9);
  res := res || jsonb_build_object('and kept to three years at most', (select term_years from public.billing where workspace_id = w) = 3);
  res := res || jsonb_build_object('the renewal notice is claimed once', public.renewal_notice_claim(w, '2026-11-20') and not public.renewal_notice_claim(w, '2026-11-20'));
  perform public.renewal_notice_release(w, '2026-11-20');
  res := res || jsonb_build_object('released when the email couldn''t go', public.renewal_notice_claim(w, '2026-11-20'));
  perform public.billing_auto_renew_apply(w, false, o);
  select * into b from public.billing where workspace_id = w;
  res := res || jsonb_build_object('auto-renew cancelled', not b.auto_renew and b.auto_renew_off_at is not null,
    'with an audit line', exists (select 1 from public.audit_log where workspace_id = w and action->>'en' = 'Cancelled auto-renew'),
    'no notice once auto-renew is off', not public.renewal_notice_claim(w, '2027-11-20'));
  perform public.billing_auto_renew_apply(w, true, o);
  res := res || jsonb_build_object('and back on', (select auto_renew from public.billing where workspace_id = w));

  /* ---------------- modules ---------------- */
  ok := public.module_apply(w, 'alcohol', false, o) = 'requested';
  res := res || jsonb_build_object('a module without a price is requested and quoted', ok
    and exists (select 1 from public.team_tasks where kind = 'quote' and dedupe = 'module:' || w || ':alcohol'));
  perform public.module_apply(w, 'alcohol', false, o);
  res := res || jsonb_build_object('asked twice, quoted once', (select count(*) from public.team_tasks where dedupe = 'module:' || w || ':alcohol') = 1);
  perform public.module_apply(w, 'alcohol', true, o);
  select * into b from public.billing where workspace_id = w;
  res := res || jsonb_build_object('billed: on, no longer waiting', b.modules = '{alcohol}' and b.modules_requested = '{}');
  begin perform public.module_apply(w, 'vendor_marketplace', true, o); ok := false; exception when others then ok := sqlerrm = 'Unknown module.'; end;
  res := res || jsonb_build_object('only the six modules exist', ok);

  /* ---------------- the brand plan ---------------- */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.hq_invite_create('Store 1'); ok := false; exception when others then ok := sqlerrm like 'Set up the brand plan%'; end;
  res := res || jsonb_build_object('no invite before a brand plan', ok);
  v := public.hq_plan_set('Moonleaf', 'hq', 'essentials');
  res := res || jsonb_build_object('headquarters sets its plan', v->'plan'->>'bill_to' = 'hq' and v->'plan'->>'brand' = 'Moonleaf');
  code := public.hq_invite_create('Store 1');
  code2 := public.hq_invite_create('Store 2');
  res := res || jsonb_build_object('an invite code is long and random', length(code) = 64 and code <> code2);
  begin perform 1 from public.hq_invites; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nobody reads invites directly', ok);
  execute 'reset role';
  res := res || jsonb_build_object('only its hash is kept', not exists (select 1 from public.hq_invites where code_hash = code)
    and exists (select 1 from public.hq_invites where code_hash = encode(sha256(convert_to(code, 'UTF8')), 'hex')));
  execute 'set local role authenticated';
  v := public.hq_plan_view();
  res := res || jsonb_build_object('the invites are listed without their codes', jsonb_array_length(v->'invites') = 2 and not (v::text like '%' || code || '%'));
  begin insert into public.hq_invites (hq_email, code_hash) values ('hq@brand.test', 'x'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nobody writes invites directly', ok);

  -- a member of the franchise can't redeem; its owner can
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.hq_invite_redeem(w2, code); ok := false; exception when others then ok := sqlerrm like 'Only an owner%'; end;
  res := res || jsonb_build_object('a member can''t join a brand', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.hq_invite_redeem(w2, 'nope-nope-nope-nope'); ok := false; exception when others then ok := sqlerrm like 'This invite is not valid%'; end;
  res := res || jsonb_build_object('a wrong code is refused', ok);
  r := public.hq_invite_redeem(w2, code);
  res := res || jsonb_build_object('the owner joins with one invite', r->>'hq_email' = 'hq@brand.test' and r->>'bill_to' = 'hq');
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.hq_invite_redeem(w3, code); ok := false; exception when others then ok := sqlerrm like 'This invite was already used%'; end;
  res := res || jsonb_build_object('an invite works once', ok);
  r := public.hq_invite_redeem(w3, code2);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('and the stores are shared with headquarters', exists (select 1 from public.hq_links where workspace_id = w2 and hq_email = 'hq@brand.test' and revoked_at is null and brand = 'Moonleaf'));
  cid := (select id from public.hq_links where workspace_id = w2 and revoked_at is null);

  v := public.hq_counts('hq@brand.test');
  res := res || jsonb_build_object('locations and people are counted across the brand', (v->>'locations')::int = 3 and (v->>'people')::int = 3 and (v->>'workspaces')::int = 2,
    'headquarters'' own login is not counted as a person', not exists (select 1 from public.workspace_members where user_id = h));
  select * into b from public.billing where workspace_id = w2;
  res := res || jsonb_build_object('nothing is covered before headquarters pays', b.hq_paid_by is null and b.subscription_status is null);
  res := res || jsonb_build_object('headquarters'' payment applies', public.hq_subscription_apply('hq@brand.test', '2026-10-22 10:00+00', 'cus_hq', 'sub_hq', 'active', '2027-10-22'));
  select * into b from public.billing where workspace_id = w2;
  res := res || jsonb_build_object('a franchisee without its own plan is covered', b.hq_paid_by = 'hq@brand.test' and b.subscription_status = 'active' and b.paid_locations = 2 and b.subscription_plan = 'locations',
    'and can file', public.plan_of(w2) = 'monthly');
  select * into b from public.billing where workspace_id = w3;
  res := res || jsonb_build_object('a franchisee paying for itself is never touched', b.hq_paid_by is null and b.subscription_id = 'sub_own' and b.paid_locations = 1);
  res := res || jsonb_build_object('an older event is ignored', not public.hq_subscription_apply('hq@brand.test', '2026-10-22 09:00+00', 'cus_hq', 'sub_hq', 'canceled', null)
    and (select subscription_status from public.billing where workspace_id = w2) = 'active');

  -- headquarters can't switch who pays while it pays
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.hq_plan_set('Moonleaf', 'franchisee', 'essentials'); ok := false; exception when others then ok := sqlerrm like 'Headquarters is paying now%'; end;
  res := res || jsonb_build_object('who pays can''t switch while headquarters pays', ok);
  begin perform public.hq_cover_apply('hq@brand.test'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nobody signed in can apply coverage', ok);
  -- the franchisee leaves: coverage ends with the link
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.hq_unshare(cid);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  select * into b from public.billing where workspace_id = w2;
  res := res || jsonb_build_object('a franchisee that leaves is no longer covered', b.hq_paid_by is null and b.subscription_status is null and b.paid_locations = 0);
  perform public.hq_subscription_apply('hq@brand.test', '2026-10-22 11:00+00', 'cus_hq', 'sub_hq', 'canceled', null);
  res := res || jsonb_build_object('a canceled headquarters plan covers nobody', not exists (select 1 from public.billing where hq_paid_by = 'hq@brand.test'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
