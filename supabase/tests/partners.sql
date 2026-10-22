-- Partners: sign-up and approval, referral attribution (first touch, 90 days), consent, what partners can read through
-- row-level security, API keys (only hashes kept) and the revenue share. Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  st uuid := gen_random_uuid(); pu uuid := gen_random_uuid(); qu uuid := gen_random_uuid();
  a uuid := gen_random_uuid(); am uuid := gen_random_uuid(); bo uuid := gen_random_uuid(); co uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); w3 uuid := gen_random_uuid(); wold uuid := gen_random_uuid(); wp uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; pid uuid; qid uuid; p_code text; q_code text; k jsonb; n int;
  state1 jsonb := '{"stores":[{"id":"s1","name":{"en":"Main St"},"stage":"opening","plannedOpen":"2027-03-15","projectedOpen":"2027-04-01"}],"apps":[{"id":"a1","status":"approved"},{"id":"a2","status":"todo"},{"id":"a3","status":"review"}],"facts":[{"id":"f","value":{"en":"secret EIN 12-3456789"}}]}';
  mo date := date_trunc('month', now())::date;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, st, 'authenticated', 'authenticated', 'staff@placetta.test', now(), now(), now(), '{}', '{}'),
    (inst, pu, 'authenticated', 'authenticated', 'broker@partner.test', now(), now(), now(), '{}', '{}'),
    (inst, qu, 'authenticated', 'authenticated', 'cpa@other.test', now(), now(), now(), '{}', '{}'),
    (inst, a, 'authenticated', 'authenticated', 'owner-a@shop.test', now(), now(), now(), '{}', '{}'),
    (inst, am, 'authenticated', 'authenticated', 'member-a@shop.test', now(), now(), now(), '{}', '{}'),
    (inst, bo, 'authenticated', 'authenticated', 'owner-b@shop.test', now(), now(), now(), '{}', '{}'),
    (inst, co, 'authenticated', 'authenticated', 'owner-c@shop.test', now(), now(), now(), '{}', '{}'),
    (inst, s, 'authenticated', 'authenticated', 'stranger@x.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (st, 'email'), (pu, 'email'), (qu, 'email'), (a, 'email'), (am, 'email'), (bo, 'email'), (co, 'email'), (s, 'email');
  insert into public.staff_emails (email) values ('staff@placetta.test');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w1, 'Lucky Leaf Tea', now(), a, a, state1), (w2, 'Quiet Noodle', now(), bo, bo, '{}'), (w3, 'Other Bakery', now(), co, co, state1), (wp, 'Broker''s own shop', now(), pu, pu, '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, created_at) values (wold, 'Old Shop', now(), a, a, now() - interval '3 days');
  insert into public.workspace_members (workspace_id, user_id, role) values (w1, a, 'owner'), (w1, am, 'member'), (w2, bo, 'owner'), (w3, co, 'owner'), (wold, a, 'owner'), (wp, pu, 'owner');
  insert into public.billing (workspace_id) values (w1), (w2), (w3), (wold), (wp);

  execute 'set local role authenticated';
  -- the broker applies
  perform set_config('request.jwt.claims', json_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.partner_apply('Bay Bridge Realty', 'broker', 'Ann Lee', 'baybridge.test', 'We lease to tea brands from Shanghai');
  pid := (j->>'id')::uuid;
  res := res || jsonb_build_object('an application starts pending', j->>'status' = 'pending',
    'a pending partner has no code', j->>'code' is null, 'a bare website gets https', j->>'website' = 'https://baybridge.test');
  begin perform public.partner_apply('X', 'astrologer'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an unknown kind is refused', ok);
  begin perform public.partner_key_create('test'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a pending partner can''t make API keys', ok);
  begin perform public.partner_admin_set(pid, 'approved', 10, 12); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a partner can''t approve themselves', ok);
  begin perform public.partner_admin_list(); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a partner can''t list partners', ok);
  -- the accountant applies too
  perform set_config('request.jwt.claims', json_build_object('sub', qu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  qid := (public.partner_apply('Golden Gate CPA', 'accountant')->>'id')::uuid;

  -- the team approves, with a 10% share for 12 months
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  j := public.partner_admin_set(pid, 'approved', 10, 12);
  p_code := j->>'code';
  res := res || jsonb_build_object('approval gives a code', p_code ~ '^[A-Z2-9]{8}$', 'and the share', (j->>'share_pct')::numeric = 10);
  j := public.partner_admin_set(pid, 'approved', 12.5, null);
  res := res || jsonb_build_object('approving again keeps the code', j->>'code' = p_code, 'the share can change', (j->>'share_pct')::numeric = 12.5);
  begin perform public.partner_admin_set(pid, 'approved', 80, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a share over 50% is refused', ok);
  res := res || jsonb_build_object('the team lists partners', jsonb_array_length(public.partner_admin_list()) = 2);

  -- signed out: a code names an approved partner only
  execute 'set local role anon'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('anyone can look up an approved code', public.partner_lookup(lower(p_code))->>'org_name' = 'Bay Bridge Realty',
    'a wrong code is nobody', public.partner_lookup('ZZZZZZZZ') is null);
  begin perform 1 from public.workspace_referrals; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('signed out, referrals can''t be read', ok);
  execute 'set local role authenticated';

  -- the team approves the accountant; the broker's code still works, the accountant gets their own
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  q_code := public.partner_admin_set(qid, 'approved', 5, 6)->>'code';

  -- referred businesses
  perform set_config('request.jwt.claims', json_build_object('sub', am, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.referral_claim(w1, p_code, now() - interval '3 days', true); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t record the partner', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.referral_claim(w1, p_code, now() - interval '91 days', true); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a first touch older than 90 days doesn''t count', ok);
  begin perform public.referral_claim(wold, p_code, now() - interval '1 day', true); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('only a workspace just created takes a partner', ok);
  j := public.referral_claim(w1, p_code, now() - interval '89 days', true);
  res := res || jsonb_build_object('an 89-day-old first touch counts', j->>'org_name' = 'Bay Bridge Realty' and (j->>'consent')::boolean);
  j := public.referral_claim(w1, q_code, now() - interval '1 day', false);
  res := res || jsonb_build_object('the first partner recorded stays', j->>'org_name' = 'Bay Bridge Realty' and (j->>'consent')::boolean);
  res := res || jsonb_build_object('the audit trail says where it came from', exists (select 1 from public.audit_log where workspace_id = w1 and action->>'en' like 'Started through Bay Bridge Realty%'));
  perform set_config('request.jwt.claims', json_build_object('sub', bo, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.referral_claim(w2, p_code, now(), false);
  res := res || jsonb_build_object('a business can come through a partner without sharing', j is not null and not (j->>'consent')::boolean);
  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.referral_claim(w3, q_code, now(), true);
  perform set_config('request.jwt.claims', json_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.referral_claim(wp, p_code, now(), true); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a partner can''t refer their own business', ok);

  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('without consent nothing is copied', (select business_name is null and stage is null and permits_total is null from public.workspace_referrals where workspace_id = w2),
    'with consent the three things are copied', (select business_name = 'Lucky Leaf Tea' and stage = 'opening' and permits_done = 1 and permits_total = 3 and opening_date = '2027-04-01' from public.workspace_referrals where workspace_id = w1));
  execute 'set local role authenticated';

  -- what the broker can read: their consenting referral, these columns only
  perform set_config('request.jwt.claims', json_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.workspace_referrals;
  res := res || jsonb_build_object('a partner reads only their consenting referrals', n = 1,
    'the one they read is the consenting one', (select business_name from public.workspace_referrals) = 'Lucky Leaf Tea',
    'the other partner''s referral is invisible', not exists (select 1 from public.workspace_referrals where business_name = 'Other Bakery'));
  begin perform workspace_id from public.workspace_referrals; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a partner can''t read the workspace id', ok);
  begin perform touched_at, code from public.workspace_referrals; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor the attribution details', ok);
  begin perform 1 from public.workspaces where id = w1; ok := not found; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a partner can''t read the workspace itself', ok);
  begin update public.workspace_referrals set consent = true; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a partner can''t turn consent on', ok);
  j := public.partner_dashboard();
  res := res || jsonb_build_object('the dashboard counts every referral', (j->>'referred')::int = 2, 'and the ones sharing', (j->>'sharing')::int = 1,
    'the dashboard shows no business by name', j::text not like '%Quiet Noodle%');

  -- the owner's side: who referred them, and turning sharing off and on
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('a stranger learns nothing about a workspace''s partner', public.referral_for(w1) is null);
  perform set_config('request.jwt.claims', json_build_object('sub', am, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('a member sees who referred them', public.referral_for(w1)->>'org_name' = 'Bay Bridge Realty');
  begin perform public.referral_consent_set(w1, false); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('only an owner changes sharing', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.workspace_referrals;
  res := res || jsonb_build_object('an owner can''t read the referrals table directly', n = 0);
  perform public.referral_consent_set(w1, false);
  update public.workspaces set state = jsonb_set(state, '{apps,1,status}', '"approved"') where id = w1;
  perform set_config('request.jwt.claims', json_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.workspace_referrals;
  res := res || jsonb_build_object('turned off, the partner sees nothing', n = 0);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('turned off, the copy is emptied and stays empty on save', (select business_name is null and permits_done is null from public.workspace_referrals where workspace_id = w1));
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.referral_consent_set(w1, true);
  update public.workspaces set state = jsonb_set(state, '{apps,2,status}', '"approved"') where id = w1;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('turned on again, saves keep the copy current', (select permits_done = 3 and permits_total = 3 from public.workspace_referrals where workspace_id = w1),
    'consent changes are in the audit trail', (select count(*) from public.audit_log where workspace_id = w1 and action->>'en' ~ '^(Stopped sharing|Shared) progress with Bay Bridge Realty$') = 2,
    'nothing but the three things is ever copied', (select to_jsonb(r)::text not like '%12-3456789%' from public.workspace_referrals r where workspace_id = w1));
  execute 'set local role authenticated';

  -- API keys
  perform set_config('request.jwt.claims', json_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  k := public.partner_key_create('Our CRM');
  res := res || jsonb_build_object('a key is shown once, in its format', k->>'key' ~ '^plk_[0-9a-f]{8}_[0-9a-f]{48}$',
    'the list never shows the key', (select count(*) from public.partner_keys() where prefix = k->>'prefix') = 1);
  begin perform key_hash from public.partner_api_keys; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a partner can''t read key hashes', ok);
  begin perform public.partner_api_auth('00'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('only the server checks keys', ok);
  for i in 1..4 loop perform public.partner_key_create('k' || i); end loop;
  begin perform public.partner_key_create('six'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('five live keys at most', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('only the SHA-256 is stored', (select key_hash = encode(extensions.digest(k->>'key', 'sha256'), 'hex') from public.partner_api_keys where prefix = k->>'prefix'),
    'the key itself is nowhere in the table', not exists (select 1 from public.partner_api_keys kk where to_jsonb(kk)::text like '%' || (k->>'key') || '%'));
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  res := res || jsonb_build_object('the right hash is the partner', public.partner_api_auth(encode(extensions.digest(k->>'key', 'sha256'), 'hex')) = pid,
    'a wrong hash is nobody', public.partner_api_auth(encode(extensions.digest('plk_00000000_x', 'sha256'), 'hex')) is null);
  j := public.partner_api_referrals(pid);
  res := res || jsonb_build_object('the API answers with consenting referrals only', jsonb_array_length(j) = 1 and j->0->>'business_name' = 'Lucky Leaf Tea',
    'with the three things and nothing else', (select array_agg(x order by x collate "C") from jsonb_object_keys(j->0) x) = '{business_name,opening_date,permits_done,permits_total,referral_id,referred_at,stage,updated_at}'::text[],
    'another partner''s referrals stay theirs', jsonb_array_length(public.partner_api_referrals(qid)) = 1 and public.partner_api_referrals(qid)->0->>'business_name' = 'Other Bakery');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.partner_key_revoke((k->>'id')::uuid);
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  res := res || jsonb_build_object('a revoked key stops working', public.partner_api_auth(encode(extensions.digest(k->>'key', 'sha256'), 'hex')) is null);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.partner_admin_set(qid, 'paused');
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  res := res || jsonb_build_object('a paused partner''s API answers nothing', jsonb_array_length(public.partner_api_referrals(qid)) = 0);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- the revenue share, from billing
  update public.billing set subscription_status = 'active', subscription_plan = 'locations', paid_locations = 2 where workspace_id = w1;
  update public.billing set price_model = 'legacy', entry_markets = 1, entry_paid_at = now() where workspace_id = w2;
  perform public.partner_revenue_sweep();
  res := res || jsonb_build_object('two locations on Essentials: $298 this month', (select revenue_usd = 298 and share_usd = 37.25 from public.partner_revenue where workspace_id = w1 and month = mo),
    'an entry plan paid this month counts', (select revenue_usd = 299 from public.partner_revenue where workspace_id = w2 and month = mo),
    'a paused partner''s referrals keep earning', exists (select 1 from public.partner_revenue where workspace_id = w3 and month = mo));
  update public.billing set subscription_status = 'canceled' where workspace_id = w1;
  perform public.partner_revenue_sweep();
  res := res || jsonb_build_object('canceling mid-month keeps this month''s share', (select revenue_usd = 298 from public.partner_revenue where workspace_id = w1 and month = mo));
  update public.workspace_referrals set attributed_at = now() - interval '13 months' where workspace_id = w2;
  perform public.partner_revenue_sweep((mo + interval '1 month')::date);
  res := res || jsonb_build_object('past the share''s 12 months, nothing more accrues', not exists (select 1 from public.partner_revenue where workspace_id = w2 and month > mo));
  -- last month closed with $40 owed; the team paid $20
  insert into public.partner_revenue(workspace_id, month, partner_id, revenue_usd, share_pct, share_usd) values (w1, (mo - interval '1 month')::date, pid, 320, 12.5, 40);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.partner_payout_add(pid, 20, current_date); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a partner can''t record their own payout', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.partner_payout_add(pid, 20, current_date, 'ACH 1029');
  perform set_config('request.jwt.claims', json_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.partner_dashboard();
  res := res || jsonb_build_object('earned adds every month', (j->>'earned_usd')::numeric = 40 + 37.25 + 37.38,
    'owed is closed months less payouts', (j->>'owed_usd')::numeric = 20, 'the payout is listed', j->'payouts'->0->>'reference' = 'ACH 1029',
    'months show paying referrals, not who', (select (m->>'paying')::int from jsonb_array_elements(j->'months') m where (m->>'month')::date = mo) = 2);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
