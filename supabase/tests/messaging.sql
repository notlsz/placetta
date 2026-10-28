-- Approving by text (20261105090900_messaging.sql): a code for one owner and one card, once, with a lockout; the filing
-- goes in with the app's gates (an owner, the Terms, two owners when a rule wants them, the plan, the Autopilot caps or
-- the text cap); the mark can't be forged or changed; and nobody but Odelia's server reaches any of it. Run with
-- scripts/test-db.sh (ends by raising TEST_RESULTS).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); m uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  w uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; n int; r jsonb; f1 uuid; v text;
  ver text := public.current_terms_version();
  pay jsonb := '{"official":"sj-sign","fields":[{"id":"l1","label":{"en":"Business name","zh":"名称"},"value":"Moonleaf Tea LLC"}],"checklist":[]}';
  ttl jsonb := '{"en":"File the sign permit","zh":"提交招牌许可"}';
  agy jsonb := '{"en":"City of San José","zh":"圣何塞市"}';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'mei@moonleaf.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'jun@moonleaf.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@moonleaf.test', now(), now(), now(), '{}', '{}'),
    (inst, eve, 'authenticated', 'authenticated', 'eve@other.test', now(), now(), now(), '{}', '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values (w, 'Moonleaf', now(), a, a, '{"apps":[],"controls":{"autonomy":"usual"}}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, b, 'owner'), (w, m, 'member');
  insert into public.billing (workspace_id, comped) values (w, true);
  insert into public.terms_acceptances (user_id, workspace_id, doc, version) values (a, null, 'terms', ver), (a, null, 'privacy', ver), (b, null, 'terms', ver), (b, null, 'privacy', ver), (m, null, 'terms', ver), (m, null, 'privacy', ver);

  /* ------------------------------ codes ------------------------------ */
  res := res || jsonb_build_object('an owner gets a code for a card', public.text_approval_set(a, w, 'ap-1', '4821'));
  res := res || jsonb_build_object('a member doesn''t', not public.text_approval_set(m, w, 'ap-1', '1111'));
  res := res || jsonb_build_object('nor someone from another business', not public.text_approval_set(eve, w, 'ap-1', '1111'));
  select count(*) into n from public.text_approvals where code_hash like '%4821%';
  res := res || jsonb_build_object('only a hash is kept', n = 0);
  r := public.text_approval_take(b, '4821');
  res := res || jsonb_build_object('another owner''s code isn''t theirs', r ->> 'result' = 'none');
  r := public.text_approval_take(a, '4821');
  res := res || jsonb_build_object('the right code takes the card', r ->> 'result' = 'ok' and r ->> 'approval_id' = 'ap-1' and (r ->> 'workspace_id')::uuid = w);
  r := public.text_approval_take(a, '4821');
  res := res || jsonb_build_object('once', r ->> 'result' = 'none');
  perform public.text_approval_set(a, w, 'ap-2', '1234');
  r := public.text_approval_take(a, '9999');
  res := res || jsonb_build_object('a wrong code is wrong', r ->> 'result' = 'wrong');
  perform public.text_approval_take(a, '9998'); perform public.text_approval_take(a, '9997'); perform public.text_approval_take(a, '9996');
  r := public.text_approval_take(a, '9995');
  res := res || jsonb_build_object('five wrong codes lock it', r ->> 'result' = 'locked');
  r := public.text_approval_take(a, '1234');
  res := res || jsonb_build_object('even the right one, for a day', r ->> 'result' = 'locked');
  delete from public.text_approval_misses where user_id = a;
  update public.text_approvals set expires_at = now() - interval '1 minute' where user_id = a and approval_id = 'ap-2';
  r := public.text_approval_take(a, '1234');
  res := res || jsonb_build_object('an expired code takes nothing', r ->> 'result' = 'none');

  /* ------------------------------ the filing ------------------------------ */
  r := public.text_approve_file(w, m, 'ap-x', 'sign', ttl, agy, null, 0, pay, 250);
  res := res || jsonb_build_object('a member can''t approve a filing by text', r ->> 'result' = 'refused' and r ->> 'why' like 'owner_only%');
  r := public.text_approve_file(w, eve, 'ap-x', 'sign', ttl, agy, null, 0, pay, 250);
  res := res || jsonb_build_object('nor an outsider', r ->> 'result' = 'refused');
  r := public.text_approve_file(w, a, 'ap-x', 'sign', ttl, agy, null, 400, pay, 250);
  res := res || jsonb_build_object('over the text cap: the app', r ->> 'result' = 'refused' and r ->> 'why' like 'text_cap%');
  r := public.text_approve_file(w, a, 'ap-x', 'sign', ttl, agy, null, null, pay, 250);
  res := res || jsonb_build_object('an unknown fee: the app', r ->> 'result' = 'refused' and r ->> 'why' like 'text_cap%');
  delete from public.terms_acceptances where user_id = a;
  r := public.text_approve_file(w, a, 'ap-x', 'sign', ttl, agy, null, 50, pay, 250);
  res := res || jsonb_build_object('the updated Terms first', r ->> 'result' = 'refused' and r ->> 'why' like 'terms_version%');
  insert into public.terms_acceptances (user_id, workspace_id, doc, version) values (a, null, 'terms', ver), (a, null, 'privacy', ver);
  r := public.text_approve_file(w, a, 'ap-x', 'sign', ttl, agy, null, 50, pay, 250);
  f1 := (r ->> 'id')::uuid;
  select count(*) into n from public.filings where id = f1 and approved_by = a and approved_via = 'text' and status = 'requested' and fee_estimate = 50;
  res := res || jsonb_build_object('an owner''s YES files it as theirs, marked approved by text', r ->> 'result' = 'filed' and n = 1);
  select count(*) into n from public.audit_log where workspace_id = w and actor_id = a and action ->> 'en' = 'Approved by text';
  res := res || jsonb_build_object('and it''s in the audit trail as them', n = 1);
  r := public.text_approve_file(w, a, 'ap-x', 'sign', ttl, agy, null, 50, pay, 250);
  res := res || jsonb_build_object('one open filing per application', r ->> 'result' = 'refused' and r ->> 'why' like 'already_filed%');
  begin update public.filings set approved_via = null where id = f1; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('the mark can''t be changed', ok);

  -- Autopilot's caps hold for a text approval when Autopilot is on (and the text cap doesn't)
  insert into public.autopilot_grants (workspace_id, granted_by, signer_name, expires_at, terms_version, scope, cap_per_filing, cap_monthly, signature_kind)
  values (w, a, 'Mei Lin', now() + interval '1 year', ver, '{"stores":[],"agencies":[],"forms":[]}', 500, 600, 'typed');
  r := public.text_approve_file(w, a, 'ap-y', 'health', ttl, agy, null, 700, pay, 250);
  res := res || jsonb_build_object('over the Autopilot per-filing cap: the app', r ->> 'result' = 'refused' and r ->> 'why' like '%Autopilot cap%');
  r := public.text_approve_file(w, a, 'ap-y', 'health', ttl, agy, null, 400, pay, 250);
  res := res || jsonb_build_object('within it, over the text cap: filed', r ->> 'result' = 'filed');
  r := public.text_approve_file(w, a, 'ap-z', 'tax', ttl, agy, null, 300, pay, 250);
  res := res || jsonb_build_object('the month''s Autopilot and text approvals count together against the monthly cap', r ->> 'result' = 'refused' and r ->> 'why' like '%monthly cap%');
  update public.autopilot_grants set revoked_at = now() where workspace_id = w;

  -- a business rule wanting two owners: the first YES is recorded and waits; the second files it
  update public.workspaces set state = jsonb_set(state, '{controls,business}', '[{"id":"r1","on":true,"when":{"event":"filing_approval"},"then":{"action":"second_owner"}}]') where id = w;
  r := public.text_approve_file(w, a, 'ap-t', 'two', ttl, agy, null, 10, pay, 250);
  select count(*) into n from public.filings where workspace_id = w and app_id = 'two';
  res := res || jsonb_build_object('one owner: waiting, nothing filed', r ->> 'result' = 'waiting' and n = 0);
  r := public.text_approve_file(w, a, 'ap-t', 'two', ttl, agy, null, 10, pay, 250);
  res := res || jsonb_build_object('the same owner again: still waiting', r ->> 'result' = 'waiting');
  r := public.text_approve_file(w, b, 'ap-t', 'two', ttl, agy, null, 10, pay, 250);
  res := res || jsonb_build_object('a second owner: filed', r ->> 'result' = 'filed');

  -- the plan: a workspace that can't file gets nothing in
  update public.workspaces set state = state #- '{controls,business}' where id = w;
  update public.billing set comped = false where workspace_id = w;
  update public.app_settings set payments_on = true where id = true;
  r := public.text_approve_file(w, a, 'ap-p', 'plan', ttl, agy, null, 10, pay, 250);
  res := res || jsonb_build_object('no plan: refused', r ->> 'result' = 'refused' and r ->> 'why' like 'plan_required%');
  update public.app_settings set payments_on = false where id = true;

  /* ------------------------------ nobody else reaches it ------------------------------ */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.text_approval_set(a, w, 'ap-9', '1111'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a signed-in person can''t mint a code', ok);
  begin perform public.text_approval_take(a, '1111'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('or take one', ok);
  begin perform public.text_approve_file(w, a, 'ap-9', 'q', ttl, agy, null, 0, pay, 250); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('or file through the text path', ok);
  begin select count(*) into n from public.text_approvals; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('or read the codes table', ok);
  -- a customer's own insert can't claim it came by text
  insert into public.filings (workspace_id, app_id, title, agency, fee_estimate, payload, approved_via) values (w, 'own', ttl, agy, 0, pay, 'text') returning id into f1;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select approved_via into v from public.filings where id = f1;
  res := res || jsonb_build_object('a customer''s own filing is never marked approved by text', v is null);

  raise exception 'TEST_RESULTS %', res;
end
$test$;
