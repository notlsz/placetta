-- Status pages and partners, finished (20261105091300_trust_partners.sql): "Fully licensed" only when every license is
-- active, worked out from the expiry even when it's hidden; a link with no end date; a password; a revoked or wrong
-- token gets nothing; the footer's sign-up link (first touch, 90 days); the commission terms (15% of the plan and 10% of
-- license fees by default) and their ledger; a partner sees only consenting referrals, and each store's licensing
-- status only under the consent that covers it; revoking empties it; the first valid referral wins and expires after
-- 90 days. Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); m uuid := gen_random_uuid(); nb uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  pu uuid := gen_random_uuid(); qu uuid := gen_random_uuid(); a uuid := gen_random_uuid(); bo uuid := gen_random_uuid(); co uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); wn uuid := gen_random_uuid(); wn2 uuid := gen_random_uuid(); wold uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); w3 uuid := gen_random_uuid(); w4 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; tok text; tok2 text; tok3 text; lid uuid; lid2 uuid; v_ref text; n int; e text; pid uuid; qid uuid; p_code text; q_code text;
  mo date := date_trunc('month', now())::date; plan_p numeric; plan_q numeric;
  snap jsonb := jsonb_build_object('business', jsonb_build_object('en', 'Acme Tea', 'zh', '阿克米茶'), 'store', jsonb_build_object('en', 'San Jose', 'zh', '圣何塞'),
    'address', '1 Main St, San Jose, CA', 'owner', 'Olivia Secret', 'ein', '12-3456789',
    'rows', jsonb_build_array(
      jsonb_build_object('id', 'bl', 'name', jsonb_build_object('en', 'Business license', 'zh', '营业执照'), 'status', 'approved', 'expires', to_char(current_date + 200, 'YYYY-MM-DD'), 'number', 'BL-123'),
      jsonb_build_object('id', 'hp', 'name', jsonb_build_object('en', 'Health permit', 'zh', '卫生许可证'), 'status', 'approved', 'expires', to_char(current_date + 10, 'YYYY-MM-DD'))));
  snap_lapsed jsonb;
  st1 jsonb := '{"stores":[{"id":"s1","name":{"en":"Main St","zh":"主街"},"stage":"opening","address":"9 Secret Ave","apps":["a1","a2"]},{"id":"s2","name":{"en":"Pier","zh":"码头"},"stage":"opening","apps":["a3"]}],"apps":[{"id":"a1","status":"approved"},{"id":"a2","status":"todo"},{"id":"a3","status":"approved"}]}';
begin
  snap_lapsed := jsonb_set(snap, '{rows,1,expires}', to_jsonb(to_char(current_date - 2, 'YYYY-MM-DD')));
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@tp.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@tp.test', now(), now(), now(), '{}', '{}'),
    (inst, nb, 'authenticated', 'authenticated', 'neighbor@tp.test', now(), now(), now(), '{}', '{}'),
    (inst, st, 'authenticated', 'authenticated', 'staff2@placetta.test', now(), now(), now(), '{}', '{}'),
    (inst, pu, 'authenticated', 'authenticated', 'landlord@tp.test', now(), now(), now(), '{}', '{}'),
    (inst, qu, 'authenticated', 'authenticated', 'chamber@tp.test', now(), now(), now(), '{}', '{}'),
    (inst, a, 'authenticated', 'authenticated', 'tenant-a@tp.test', now(), now(), now(), '{}', '{}'),
    (inst, bo, 'authenticated', 'authenticated', 'tenant-b@tp.test', now(), now(), now(), '{}', '{}'),
    (inst, co, 'authenticated', 'authenticated', 'tenant-c@tp.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (m, 'email'), (nb, 'email'), (st, 'email'), (pu, 'email'), (qu, 'email'), (a, 'email'), (bo, 'email'), (co, 'email');
  insert into public.staff_emails (email) values ('staff2@placetta.test');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Acme Tea', now(), o, o, '{"stores":[{"id":"sj","name":{"en":"San Jose","zh":"圣何塞"}}]}'),
    (wn, 'Neighbor Noodle', now(), nb, nb, '{}'), (wn2, 'Second Noodle', now(), nb, nb, '{}'),
    (w1, 'Lucky Leaf Tea', now(), a, a, st1), (w2, 'Quiet Noodle', now(), bo, bo, st1), (w3, 'Chamber Bakery', now(), co, co, st1), (w4, 'Late Bakery', now(), co, co, '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, created_at) values (wold, 'Old Shop', now(), nb, nb, now() - interval '3 days');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w, m, 'member'), (wn, nb, 'owner'), (wn2, nb, 'owner'), (wold, nb, 'owner'),
    (w1, a, 'owner'), (w2, bo, 'owner'), (w3, co, 'owner'), (w4, co, 'owner');
  insert into public.billing (workspace_id) values (w1), (w2), (w3), (w4);

  execute 'set local role authenticated';
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.9"}', true);

  /* ================================================================ A. status pages */
  perform set_config('request.jwt.claims', jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.trust_link_create(w, 'sj', 'Insurer', '{"expiry": false}', 0, snap);
  tok := j ->> 'token'; lid := (j ->> 'id')::uuid;
  res := res || jsonb_build_object('a link can have no end date', j -> 'expires_at' = 'null'::jsonb);
  begin perform public.trust_link_create(w, 'sj', 'x', null, 90, snap, 'abc'); ok := false; exception when others then ok := sqlstate = '22023'; end;
  res := res || jsonb_build_object('a page password is at least 6 characters', ok);
  j := public.trust_link_create(w, 'sj', 'Landlord', '{"name": false}', 30, snap, 'window-sign');
  tok2 := j ->> 'token'; lid2 := (j ->> 'id')::uuid;
  res := res || jsonb_build_object('the owner''s list says which link is locked', (select bool_and(l.locked = (l.id = lid2)) from public.trust_link_list(w) l)
    and (select (l.show ->> 'name')::boolean = false from public.trust_link_list(w) l where l.id = lid2));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.trust_link_password(lid, 'member-pass'); ok := false; exception when others then ok := sqlstate = '42501'; end;
  res := res || jsonb_build_object('a member can''t set a password', ok);
  res := res || jsonb_build_object('a member''s refresh writes the link with no end date', public.trust_refresh(w, 'sj', snap_lapsed) = 2);
  execute 'reset role';
  res := res || jsonb_build_object('only bcrypt is kept for a password', (select password_hash like '$2%' and password_hash not like '%window-sign%' from public.trust_links where id = lid2),
    'every link has a public ref apart from its token', (select bool_and(ref ~ '^[a-z2-9]{10}$' and position(ref in prefix) = 0) from public.trust_links where workspace_id = w));
  select t.ref into v_ref from public.trust_links t where t.id = lid;
  select t.ref into e from public.trust_links t where t.id = lid2;

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  j := public.trust_page(tok);
  res := res || jsonb_build_object('the page is up with no end date', j ->> 'status' = 'ok' and j -> 'expires_at' = 'null'::jsonb,
    'a hidden expiry still counts: a lapsed permit is expired', (select r ->> 'standing' from jsonb_array_elements(j -> 'page' -> 'rows') r where r ->> 'id' = 'hp') = 'expired',
    'and its date stays hidden', not (j::text like '%' || to_char(current_date - 2, 'YYYY-MM-DD') || '%') and strpos(j::text, '"_exp"') = 0,
    'so the store is not fully licensed', not (j ->> 'licensed')::boolean,
    'the footer carries the page''s ref', j ->> 'ref' = v_ref,
    'owners, tax IDs and numbers never show', not (j::text like '%Olivia%') and not (j::text like '%12-3456789%') and not (j::text like '%BL-123%'));
  execute 'reset role';
  select views into n from public.trust_links where id = lid2;
  execute 'set local role anon';
  j := public.trust_page(tok2);
  res := res || jsonb_build_object('a locked page says only that it''s locked', j = '{"status": "locked", "wrong": false}'::jsonb);
  j := public.trust_page(tok2, 'not-it');
  res := res || jsonb_build_object('a wrong password gets nothing', j = '{"status": "locked", "wrong": true}'::jsonb);
  execute 'reset role';
  res := res || jsonb_build_object('a locked page counts no view', (select views from public.trust_links where id = lid2) = n);
  execute 'set local role anon';
  j := public.trust_page(tok2, 'window-sign');
  res := res || jsonb_build_object('the right password opens it', j ->> 'status' = 'ok',
    'with the store''s name off, only the business shows', not (j -> 'page' ? 'store') and j -> 'page' -> 'business' ->> 'en' = 'Acme Tea');
  begin perform public.trust_request(tok2, 'Lena', 'lena@x.test'); ok := true; exception when others then ok := false; end;
  res := res || jsonb_build_object('a document request on a locked page needs the password', ok and (public.trust_request(tok2, 'Lena', 'lena@x.test') ->> 'status') = 'locked');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.trust_refresh(w, 'sj', snap);
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  j := public.trust_page(tok2, 'window-sign');
  res := res || jsonb_build_object('every license active: fully licensed', (j ->> 'licensed')::boolean and (j -> 'counts' ->> 'good')::int = 2);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.trust_refresh(w, 'sj', jsonb_set(snap, '{rows,1,status}', '"review"'));
  perform public.trust_link_password(lid2, null);
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  j := public.trust_page(tok2);
  res := res || jsonb_build_object('the password can come off', j ->> 'status' = 'ok',
    'one pending license: not fully licensed', not (j ->> 'licensed')::boolean);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.trust_refresh(w, 'sj', '{"rows": []}');
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  res := res || jsonb_build_object('no licenses at all is never fully licensed', not (public.trust_page(tok2) ->> 'licensed')::boolean);

  -- revoked, wrong, malformed: nothing
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.trust_link_revoke(lid);
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  res := res || jsonb_build_object('a revoked link with no end date gets nothing', public.trust_page(tok) = '{"status": "gone"}'::jsonb,
    'nor with any password', public.trust_page(tok, 'window-sign') = '{"status": "gone"}'::jsonb,
    'a wrong token gets nothing', public.trust_page(repeat('0', 48)) = '{"status": "gone"}'::jsonb and public.trust_page(upper(tok2)) = '{"status": "gone"}'::jsonb
      and public.trust_page(left(tok2, 47)) = '{"status": "gone"}'::jsonb and public.trust_page(null) = '{"status": "gone"}'::jsonb,
    'a ref is not a token', public.trust_page(v_ref) = '{"status": "gone"}'::jsonb);
  begin perform public.trust_signup_claim(wn, v_ref, now()); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anon can''t record a sign-up', ok);
  begin perform 1 from public.trust_signups; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anon can''t read sign-ups', ok);

  -- the footer's sign-up link
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('a workspace never counts for its own page', not public.trust_signup_claim(w, v_ref, now()));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', nb, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('a touch older than 90 days doesn''t count', not public.trust_signup_claim(wn, v_ref, now() - interval '91 days'),
    'only a workspace just created counts', not public.trust_signup_claim(wold, v_ref, now()),
    'an unknown ref is quiet', not public.trust_signup_claim(wn, 'zzzzzzzzzz', now()),
    'a new business through the footer counts', public.trust_signup_claim(wn, v_ref, now() - interval '89 days'));
  res := res || jsonb_build_object('the first page recorded stays', not public.trust_signup_claim(wn, e, now()));
  begin perform public.trust_signup_claim(w, e, now()); ok := false; exception when others then ok := sqlstate = '42501'; end;
  res := res || jsonb_build_object('nobody records a sign-up for someone else''s workspace', ok);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('the owner sees how many the page brought in', (select l.signups from public.trust_link_list(w) l where l.id = lid) = 1);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', nb, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.trust_link_list(w); ok := false; exception when others then ok := sqlstate = '42501'; end;
  res := res || jsonb_build_object('nobody else sees the owner''s links or counts', ok);

  /* ================================================================ B. partners */
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  pid := (public.partner_apply('Westfield Leasing', 'landlord')->>'id')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', qu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.partner_apply('Silicon Valley Chinese Chamber', 'chamber');
  qid := (j->>'id')::uuid;
  res := res || jsonb_build_object('a chamber of commerce can apply', j->>'kind' = 'chamber');
  res := res || jsonb_build_object('and so can bookkeepers and consultancies', (public.partner_apply('Ledger Co', 'bookkeeper')->>'kind') = 'bookkeeper'
    and (public.partner_apply('Silicon Valley Chinese Chamber', 'consultancy')->>'kind') = 'consultancy');
  perform public.partner_apply('Silicon Valley Chinese Chamber', 'chamber');
  begin perform public.partner_terms_set(20, 5); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a partner can''t change the terms', ok);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('the default terms are 15% of the plan and 10% of license fees', public.partner_terms_get() @> '{"plan_pct": 15, "fee_pct": 10}');
  p_code := public.partner_admin_set(pid, 'approved')->>'code';
  j := public.partner_admin_set(qid, 'approved', 12, 12, 8);
  q_code := j->>'code';
  res := res || jsonb_build_object('a partner''s own terms win', j->'terms' @> '{"plan_pct": 12, "fee_pct": 8, "months": 12}');
  begin perform public.partner_terms_set(60, 5); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a default share over 50% is refused', ok);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('a partner with no terms of their own sees the default', public.partner_me()->'terms' @> '{"plan_pct": 15, "fee_pct": 10, "plan_default": true}');

  -- attribution: the first valid referral wins and expires after 90 days
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('a code that isn''t an approved partner records nothing', public.referral_claim(w1, 'ZZZZZZZZ', now() - interval '10 days', true) is null);
  begin perform public.referral_claim(w1, q_code, now() - interval '90 days 1 hour', true); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a referral past 90 days is refused', ok);
  j := public.referral_claim(w1, p_code, now() - interval '5 days', true);
  res := res || jsonb_build_object('so the next valid one is the first, and it wins', j->>'org_name' = 'Westfield Leasing' and (j->>'scope')::int = 2);
  j := public.referral_claim(w1, q_code, now() - interval '1 day', true);
  res := res || jsonb_build_object('a later valid referral doesn''t replace it', j->>'org_name' = 'Westfield Leasing');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', bo, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.referral_claim(w2, p_code, now(), false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', co, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.referral_claim(w3, q_code, now(), true);

  -- tenancy: the landlord sees only its consenting referral, with each store's status and what's due, no address
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.workspace_referrals;
  res := res || jsonb_build_object('a partner sees only consenting referrals', n = 1 and (select business_name from public.workspace_referrals) = 'Lucky Leaf Tea',
    'not one that came through them without consent', not exists (select 1 from public.workspace_referrals where business_name = 'Quiet Noodle'),
    'nor another partner''s', not exists (select 1 from public.workspace_referrals where business_name = 'Chamber Bakery'));
  select stores into j from public.workspace_referrals;
  res := res || jsonb_build_object('every location in one view', jsonb_array_length(j) = 2,
    'a store with a license still to file is not fully licensed', (select not (s->>'licensed')::boolean and (s->>'pending')::int = 1 from jsonb_array_elements(j) s where s->>'id' = 's1'),
    'a store with every license approved is', (select (s->>'licensed')::boolean from jsonb_array_elements(j) s where s->>'id' = 's2'),
    'no address reaches the partner', not (j::text like '%Secret Ave%'));
  begin perform touched_at from public.workspace_referrals; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('the attribution details stay hidden', ok);

  -- a consent given before the store view shares only what it covered
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.workspace_referrals set consent_scope = 1 where workspace_id = w3;
  update public.workspaces set name = 'Chamber Bakery & Cafe' where id = w3;
  res := res || jsonb_build_object('an older consent doesn''t share the store view', (select stores is null and business_name = 'Chamber Bakery & Cafe' from public.workspace_referrals where workspace_id = w3));
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', co, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('the owner can see what their consent covers', (public.referral_for(w3)->>'scope')::int = 1);
  perform public.referral_consent_set(w3, true);
  execute 'reset role';
  res := res || jsonb_build_object('saying yes again covers it', (select consent_scope = 2 and jsonb_array_length(stores) = 2 from public.workspace_referrals where workspace_id = w3));

  -- revocation: off empties everything the partner saw, at once and on later saves
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.referral_consent_set(w1, false);
  update public.workspaces set state = jsonb_set(state, '{apps,1,status}', '"approved"') where id = w1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.workspace_referrals;
  res := res || jsonb_build_object('revoked, the partner sees nothing', n = 0);
  execute 'reset role';
  res := res || jsonb_build_object('revoked, the store view is emptied and stays empty', (select stores is null and business_name is null from public.workspace_referrals where workspace_id = w1));

  -- the ledger: plan and license fees, at the terms that apply
  update public.billing set subscription_status = 'active', subscription_plan = 'locations', paid_locations = 1 where workspace_id in (w1, w3);
  insert into public.license_charges (workspace_id, ref, tier, cents, status, paid_at) values
    (w1, 'bl', 'license', 20000, 'paid', now()), (w1, 'hp', 'license', 0, 'paid', now()), (w1, 'old', 'license', 50000, 'void', now()),
    (w3, 'bl', 'license', 10000, 'used', now());
  insert into public.license_charges (workspace_id, ref, tier, cents, status, paid_at, created_at) values (w2, 'bl', 'license', 30000, 'paid', now(), now());
  update public.workspace_referrals set attributed_at = now() - interval '13 months' where workspace_id = w2;
  perform public.partner_revenue_sweep();
  res := res || jsonb_build_object('the plan at the default 15%', (select share_pct = 15 and share_usd = round(revenue_usd * 0.15, 2) from public.partner_revenue where workspace_id = w1 and month = mo),
    'a paid license fee at the default 10%', (select amount_usd = 20 and pct = 10 from public.partner_fee_commissions fc join public.license_charges c on c.id = fc.charge_id where c.workspace_id = w1 and c.ref = 'bl'),
    'free and void charges earn nothing', (select count(*) from public.partner_fee_commissions where workspace_id = w1) = 1,
    'a partner''s own fee share wins', (select amount_usd = 8 from public.partner_fee_commissions where workspace_id = w3),
    'past the first year, nothing accrues', not exists (select 1 from public.partner_fee_commissions where workspace_id = w2),
    'running it again adds nothing', public.partner_revenue_sweep() >= 0 and (select count(*) from public.partner_fee_commissions) = 2);
  update public.license_charges set status = 'void' where workspace_id = w1 and ref = 'bl';
  perform public.partner_revenue_sweep();
  res := res || jsonb_build_object('a charge let go this month comes off', not exists (select 1 from public.partner_fee_commissions where workspace_id = w1));
  update public.license_charges set status = 'paid' where workspace_id = w1 and ref = 'bl';
  perform public.partner_revenue_sweep();
  select sum(share_usd) into plan_p from public.partner_revenue where partner_id = pid;
  select sum(share_usd) into plan_q from public.partner_revenue where partner_id = qid;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.partner_dashboard();
  res := res || jsonb_build_object('the statement adds plan and fees', (j->>'earned_usd')::numeric = plan_p + 20
    and (select (x->>'fee_usd')::numeric = 20 and (x->>'total_usd')::numeric = (x->>'share_usd')::numeric + 20 from jsonb_array_elements(j->'months') x where (x->>'month')::date = mo),
    'this month isn''t owed yet', (j->>'owed_usd')::numeric = 0);
  begin perform 1 from public.partner_fee_commissions; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a partner can''t read the ledger''s rows', ok);
  begin perform 1 from public.partner_terms; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor the terms table', ok);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', qu, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('another partner''s statement has only their own', (public.partner_dashboard()->>'earned_usd')::numeric = plan_q + 8);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('rate-limit keys hold no address', exists (select 1 from public.rate_hits where key like 'trust_page:%') and not exists (select 1 from public.rate_hits where key like '%203.0.113.9%'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
