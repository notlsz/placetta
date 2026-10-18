-- Text to start: a plan texted to someone new waits as a pending workspace, and its signed link claims it once, within
-- 7 days, after sign-in: the workspace with the plan in it, the owner, the Filing Authorization, the phone linked with
-- its consent record. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  e uuid := gen_random_uuid(); f uuid := gen_random_uuid(); g uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; wid uuid; k text := 'test-monitor-key';
  inst uuid := '00000000-0000-0000-0000-000000000000';
  exp7 bigint := floor(extract(epoch from now() + interval '7 days'));
  st jsonb := '{"business": {"en": "Milk tea shop in Flushing", "zh": "Milk tea shop in Flushing"}, "goal": {"en": "", "zh": ""},
    "apps": [{"id": "pv-ny-dos-1336", "name": {"en": "Articles of Organization", "zh": "组织章程"}, "status": "todo", "preview": true},
             {"id": "pv-irs-ss4", "name": {"en": "Application for Employer Identification Number (EIN)", "zh": "雇主识别号（EIN）申请"}, "status": "todo", "preview": true}],
    "stores": [{"id": "flushing", "apps": ["pv-ny-dos-1336", "pv-irs-ss4"], "stage": "opening"}],
    "firstPlan": {"what": "Milk tea shop", "where": "Flushing, NY", "apps": 2}, "meta": {"city": "Flushing", "region": "New York", "what": "Milk tea shop"}}';
  tok_a text; tok_x text; tok_c text; tok_s text; tok_b text; tok_d text; tok_w text; tok_p text; tok_n text;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select inst, u, 'authenticated', 'authenticated', 'ts' || n || '@p.test', now(), now(), now(), '{}', '{}'
    from unnest(array[a, b, c, d, e, f, g, h]) with ordinality as x(u, n);
  -- the monitor key the functions sign with; this one is the key text_start_test.ts signs its fixed token with
  update vault.secrets set secret = k where name = 'monitor_key';

  -- a token, signed the way odelia-sms signs it
  create temp table if not exists ts_tok (id text, exp bigint, tok text) on commit drop;
  insert into ts_tok select i, x, i || '.' || x || '.' || left(translate(rtrim(encode(extensions.hmac('text-start|' || i || '|' || x, k, 'sha256'), 'base64'), '='), '+/', '-_'), 16)
    from (values ('StartAaaa1', exp7), ('StartXpird', floor(extract(epoch from now() - interval '1 hour'))), ('StartCcccc', exp7), ('StartStopd', exp7),
                 ('StartBbbbb', exp7), ('StartDddd1', exp7), ('StartWchat', exp7), ('StartPin11', exp7), ('StartNoPhn', exp7)) v(i, x);
  select tok into tok_a from ts_tok where id = 'StartAaaa1'; select tok into tok_x from ts_tok where id = 'StartXpird';
  select tok into tok_c from ts_tok where id = 'StartCcccc'; select tok into tok_s from ts_tok where id = 'StartStopd';
  select tok into tok_b from ts_tok where id = 'StartBbbbb'; select tok into tok_d from ts_tok where id = 'StartDddd1';
  select tok into tok_w from ts_tok where id = 'StartWchat'; select tok into tok_p from ts_tok where id = 'StartPin11';
  select tok into tok_n from ts_tok where id = 'StartNoPhn';

  insert into public.text_starts (id, channel, handle, line, lang, tz, what, place, place_zh, name, state, permits, expires_at) values
    ('StartAaaa1', 'imessage', '+16465550199', '+12125550100', 'en', 'America/New_York', 'Milk tea shop', 'Flushing, NY', '纽约法拉盛', 'Milk tea shop in Flushing', st, 10, to_timestamp(exp7)),
    ('StartXpird', 'sms', '+16465550198', null, 'en', 'America/New_York', 'Bakery', 'Houston, TX', '休斯顿', 'Bakery in Houston', st, 11, now() - interval '1 hour'),
    ('StartCcccc', 'sms', '+16465550197', null, 'en', 'America/New_York', 'Bakery', 'Houston, TX', null, 'Bakery in Houston', st, 11, to_timestamp(exp7)),
    ('StartStopd', 'whatsapp', '+16465550196', null, 'zh', 'America/Los_Angeles', '火锅店', 'Irvine, CA', '加州尔湾', 'Irvine火锅店', st, 8, to_timestamp(exp7)),
    ('StartBbbbb', 'sms', '+16465550195', null, 'en', 'America/New_York', 'Coffee shop', 'Seattle, WA', null, 'Coffee shop in Seattle', st, 7, to_timestamp(exp7)),
    ('StartDddd1', 'sms', '+16465550194', null, 'en', 'America/New_York', 'Coffee shop', 'Seattle, WA', null, 'Coffee shop in Seattle', st, 7, to_timestamp(exp7)),
    ('StartWchat', 'wechat', 'wx:oUpF8uMuAJO_M2pxb1Q9zNjWeS6o', null, 'zh', 'America/New_York', '奶茶店', 'Flushing, NY', '纽约法拉盛', 'Flushing奶茶店', st, 10, to_timestamp(exp7)),
    ('StartPin11', 'sms', '+16465550193', null, 'en', 'America/New_York', 'Coffee shop', 'Seattle, WA', null, 'Coffee shop in Seattle', st, 7, to_timestamp(exp7)),
    ('StartNoPhn', 'sms', '+16465550192', null, 'en', 'America/New_York', 'Coffee shop', 'Seattle, WA', null, 'Coffee shop in Seattle', st, 7, to_timestamp(exp7)),
    ('AbCdEfGhJk', 'sms', '+16465550191', null, 'en', 'America/New_York', 'Coffee shop', 'Seattle, WA', null, 'Coffee shop in Seattle', st, 7, to_timestamp(1893456000));

  -- the same signature as the functions (text_start_test.ts signs this exact token with the same key)
  res := res || jsonb_build_object(
    'the database checks the token odelia-sms signs', public.text_start_verify('AbCdEfGhJk.1893456000.EwczhPtP0QQwO2J3') = 'AbCdEfGhJk',
    'a changed signature is refused', public.text_start_verify('AbCdEfGhJk.1893456000.EwczhPtP0QQwO2J4') is null,
    'a later expiry written in is refused', public.text_start_verify('AbCdEfGhJk.1893456001.EwczhPtP0QQwO2J3') is null,
    'another start''s id is refused', public.text_start_verify(replace(tok_a, 'StartAaaa1', 'StartCcccc')) is null,
    'an expired link is refused', public.text_start_verify(tok_x) is null,
    'nonsense is refused', public.text_start_verify('hello') is null and public.text_start_verify(null) is null);

  -- anyone with the link can see what it's for, but not the whole number, and can't read the table or claim it
  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  j := public.text_start_peek(tok_a);
  res := res || jsonb_build_object('anyone with the link sees what the plan is for',
    j->>'status' = 'ok' and j->>'what' = 'Milk tea shop' and j->>'place' = 'Flushing, NY' and (j->>'permits')::int = 10 and j->>'phone_last4' = '0199' and not j::text like '%6465550199%');
  res := res || jsonb_build_object('a forged link shows nothing', public.text_start_peek(left(tok_a, length(tok_a) - 1) || 'Z')->>'status' = 'invalid' and public.text_start_peek(left(tok_a, length(tok_a) - 1) || 'Z')->>'what' is null);
  res := res || jsonb_build_object('an expired link says so', public.text_start_peek(tok_x)->>'status' = 'expired');
  begin perform public.text_start_claim(tok_a, true); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('signed out, nothing can be claimed', ok);
  begin perform 1 from public.text_starts limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nobody reads the pending plans directly', ok);
  begin perform 1 from public.text_start_parts limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nobody reads half-read lines', ok);
  begin perform public.text_start_consent('+16465550199', 'texted_to_start'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('only the server writes consent for texts in', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- the claim: a new person, after signing in
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.text_start_claim(tok_a, true);
  wid := (j->>'workspace_id')::uuid;
  res := res || jsonb_build_object('claiming makes the workspace and links the phone', wid is not null and j->>'phone' = 'linked' and j->>'number' = '+16465550199');
  begin perform public.text_start_claim(tok_a, true); ok := false; exception when others then ok := sqlerrm like '%start_used%'; end;
  res := res || jsonb_build_object('the link works once', ok);
  j := public.text_start_peek(tok_a);
  res := res || jsonb_build_object('opening it again goes to the workspace it became', j->>'status' = 'used' and (j->>'workspace_id')::uuid = wid);
  begin perform public.text_start_claim(tok_x, true); ok := false; exception when others then ok := sqlerrm like '%start_expired%'; end;
  res := res || jsonb_build_object('an expired link can''t be claimed', ok);
  begin perform public.text_start_claim(replace(tok_c, 'StartCcccc', 'StartBbbbb'), true); ok := false; exception when others then ok := sqlerrm like '%start_invalid%'; end;
  res := res || jsonb_build_object('a forged link can''t be claimed', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  res := res || jsonb_build_object(
    'the workspace holds the texted plan', (select w.name = 'Milk tea shop in Flushing' and w.state->'apps' = st->'apps' and w.state->'firstPlan'->>'where' = 'Flushing, NY' and w.authorized_at is not null and w.authorized_by = a
      from public.workspaces w where w.id = wid),
    'the person is its owner, with billing', exists (select 1 from public.workspace_members m where m.workspace_id = wid and m.user_id = a and m.role = 'owner') and exists (select 1 from public.billing x where x.workspace_id = wid),
    'the Filing Authorization is recorded', exists (select 1 from public.terms_acceptances t where t.user_id = a and t.doc = 'authorization'),
    'the phone is linked and verified, answering on the line it texted', (select l.number = '+16465550199' and l.verified_at is not null and l.last_workspace_id = wid and l.line = '+12125550100' and l.texts_on and l.opted_out_at is null and l.lang = 'en' and l.tz = 'America/New_York'
      from public.phone_links l where l.user_id = a),
    'consent is in the ledger with the current version', (select count(*) = 2 from public.phone_consent_log x where x.user_id = a and x.number = '+16465550199' and x.event in ('linked', 'texts_on') and x.disclosure_version = public.phone_consent_version()),
    'the pending plan is marked claimed', (select s.claimed_at is not null and s.claimed_by = a and s.workspace_id = wid and s.phone_result = 'linked' from public.text_starts s where s.id = 'StartAaaa1'),
    'the audit trail says where it came from', exists (select 1 from public.audit_log x where x.workspace_id = wid and x.action->>'en' like 'Opened the plan Odelia texted%'));

  -- someone else opening the same link afterwards
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.text_start_claim(tok_a, true); ok := false; exception when others then ok := sqlerrm like '%start_used%'; end;
  res := res || jsonb_build_object('nobody else can claim it after', ok and (public.text_start_peek(tok_a)->>'workspace_id') is null);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- a number someone else already verified: the plan opens, the number isn't linked here
  insert into public.phone_links (user_id, number, verified_at) values (e, '+16465550197', now());
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.text_start_claim(tok_c, true);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('a number verified by someone else is not taken over', j->>'phone' = 'taken' and (j->>'workspace_id') is not null and not exists (select 1 from public.phone_links where user_id = c)
    and (select user_id from public.phone_links where number = '+16465550197' and verified_at is not null) = e);

  -- a number that texted STOP stays opted out once linked; WhatsApp answers keep going to WhatsApp
  insert into public.odelia_strangers (number, opted_out_at) values ('+16465550196', now());
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.text_start_claim(tok_s, true);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('a number that texted STOP stays opted out', j->>'phone' = 'linked' and (select l.opted_out_at is not null and l.via = 'whatsapp' and l.lang = 'zh' and l.tz = 'America/Los_Angeles' from public.phone_links l where l.user_id = f));

  -- a person with another verified number keeps it
  insert into public.phone_links (user_id, number, verified_at) values (b, '+17185550123', now());
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.text_start_claim(tok_b, true);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('another verified number is kept', j->>'phone' = 'kept' and (select number from public.phone_links where user_id = b) = '+17185550123');
  -- opening without linking the phone
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.text_start_claim(tok_d, false);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('opening without linking leaves the phone alone', j->>'phone' = 'declined' and (j->>'workspace_id') is not null and not exists (select 1 from public.phone_links where user_id = d));
  -- WeChat has no phone to link
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.text_start_claim(tok_w, true);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('a plan from WeChat opens with no phone', j->>'phone' = 'none' and (select w.name from public.workspaces w where w.id = (j->>'workspace_id')::uuid) = 'Flushing奶茶店');

  -- a locked settings PIN: the plan opens, the phone waits for Settings
  insert into public.account_pins (user_id, pin_hash) values (h, extensions.crypt('1234', extensions.gen_salt('bf', 4)));
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.text_start_claim(tok_p, true);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('with the settings PIN locked the phone isn''t linked', j->>'phone' = 'pin_required' and not exists (select 1 from public.phone_links where user_id = h));

  -- two-step sign-in on, signed in with one step: refused until the second
  insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at) values (gen_random_uuid(), e, 'totp', 'verified', now(), now());
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.text_start_claim(tok_n, true); ok := false; exception when others then ok := sqlerrm like '%mfa_required%'; end;
  res := res || jsonb_build_object('two-step accounts claim after the second step', ok and public.text_start_peek(tok_n)->>'status' = 'ok');
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- consent for texts in, from odelia-sms (service role)
  perform public.text_start_consent('+16465550190', 'texted_to_start');
  perform public.text_start_consent('+16465550190', 'asked_reminder');
  perform public.text_start_consent('wx:oUpF8uMuAJO_M2pxb1Q9zNjWeS6o', 'texted_to_start');
  perform public.text_start_consent('+16465550190', 'linked');
  res := res || jsonb_build_object('a text in and a reminder asked for are recorded, with the texted disclosure',
    (select count(*) = 2 and bool_and(x.user_id is null and x.disclosure_version = public.text_start_disclosure_version()) from public.phone_consent_log x where x.number = '+16465550190')
    and not exists (select 1 from public.phone_consent_log where number like 'wx:%'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
