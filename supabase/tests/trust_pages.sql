-- Status pages (20261031160000_trust_pages.sql): only an owner shares, changes or revokes; the token is kept as a hash;
-- anyone with the link sees only what the owner allowed, worked out again as it's read; a revoked, expired or made-up
-- token gets the same "gone"; nobody reads the tables; document requests need the owner's yes and land in Updates.
-- Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); m uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); f1 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; tok text; tok2 text; lid uuid; lid2 uuid; n int; v text; e text;
  snap jsonb := jsonb_build_object(
    'business', jsonb_build_object('en', 'Acme Tea', 'zh', '阿克米茶'), 'store', jsonb_build_object('en', 'San Jose', 'zh', '圣何塞'),
    'address', '1 Main St, San Jose, CA', 'stage', 'open', 'as_of', '2026-10-31',
    'fees', 9999, 'owner', 'Olivia Secret', 'ein', '12-3456789',
    'rows', jsonb_build_array(
      jsonb_build_object('id', 'bl', 'name', jsonb_build_object('en', 'Business license', 'zh', '营业执照'), 'agency', jsonb_build_object('en', 'City of San Jose', 'zh', '圣何塞市'),
        'status', 'approved', 'level', 'city', 'expires', to_char(current_date + 200, 'YYYY-MM-DD'), 'number', 'BL-123', 'proof', true, 'confirmed', true,
        'source', 'https://www.sanjoseca.gov/business-tax', 'fee', '$195', 'path', w::text || '/receipt.pdf', 'fields', jsonb_build_object('ssn', '123-45-6789')),
      jsonb_build_object('id', 'hp', 'name', jsonb_build_object('en', 'Health permit', 'zh', '卫生许可证'), 'status', 'approved', 'expires', to_char(current_date + 10, 'YYYY-MM-DD')),
      jsonb_build_object('id', 'old', 'name', jsonb_build_object('en', 'Sign permit', 'zh', '招牌许可'), 'status', 'held', 'expires', to_char(current_date - 3, 'YYYY-MM-DD')),
      jsonb_build_object('id', 'abc', 'name', jsonb_build_object('en', 'Liquor license', 'zh', '酒牌'), 'status', 'review'),
      jsonb_build_object('id', 'bad', 'name', jsonb_build_object('en', 'Bad row', 'zh', 'x'), 'status', 'hacked'),
      jsonb_build_object('id', 'xss', 'name', jsonb_build_object('en', 'Fire permit', 'zh', '消防'), 'status', 'approved', 'source', 'javascript:alert(1)', 'number', '<script>', 'expires', '2026-13-45')));
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'olivia@trust.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'mo@trust.test', now(), now(), now(), '{}', '{}'),
    (inst, eve, 'authenticated', 'authenticated', 'eve@trust.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (m, 'email'), (eve, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Acme Tea', now(), o, o, '{"stores":[{"id":"sj","name":{"en":"San Jose","zh":"圣何塞"}}]}'), (w2, 'Eve Co', now(), eve, eve, '{"stores":[{"id":"ev","name":{"en":"Eve","zh":"Eve"}}]}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w, m, 'member'), (w2, eve, 'owner');
  insert into public.filings (id, workspace_id, app_id, payload, title, status) values (f1, w, 'bl', '{}', '{"en":"Business license","zh":"营业执照"}', 'accepted');
  insert into public.filing_tracking (filing_id, workspace_id, last_checked_at, agency_status, agency_norm) values (f1, w, now() - interval '1 day', 'Active', 'issued');

  execute 'set local role authenticated';
  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.7"}', true);

  /* ---------------- a member can't share; the owner can, for a store that is theirs ---------------- */
  perform set_config('request.jwt.claims', jsonb_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.trust_link_create(w, 'sj', 'Landlord', null, 90, snap); ok := false; exception when others then ok := sqlstate = '42501'; end;
  res := res || jsonb_build_object('a member can''t share a status page', ok);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.trust_link_create(w, 'nope', 'Landlord', null, 90, snap); ok := false; exception when others then ok := sqlstate = 'P0002'; end;
  res := res || jsonb_build_object('a link is only for a store in the workspace', ok);
  j := public.trust_link_create(w, 'sj', 'Landlord, Westfield', null, 90, snap);
  tok := j ->> 'token'; lid := (j ->> 'id')::uuid;
  res := res || jsonb_build_object('the token is 48 random hex characters', tok ~ '^[0-9a-f]{48}$');
  j := public.trust_link_create(w, 'sj', 'Franchisor', '{"numbers": true, "docs": true, "address": false}', 9999, snap);
  tok2 := j ->> 'token'; lid2 := (j ->> 'id')::uuid;
  res := res || jsonb_build_object('a link lasts at most a year', (j ->> 'expires_at')::timestamptz < now() + interval '367 days');
  select count(*) into n from public.trust_link_list(w);
  res := res || jsonb_build_object('the owner lists both links, without their tokens', n = 2 and not exists (select 1 from public.trust_link_list(w) l where l.prefix <> left(tok, 8) and l.prefix <> left(tok2, 8)));
  begin perform count(*) from public.trust_links; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('the app can''t read the links table', ok);
  begin perform count(*) from public.trust_requests; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor the requests table', ok);
  execute 'reset role';
  res := res || jsonb_build_object('only the token''s SHA-256 is kept', not exists (select 1 from public.trust_links where token_hash = tok or snapshot::text like '%' || tok || '%')
    and exists (select 1 from public.trust_links where token_hash = encode(extensions.digest(tok, 'sha256'), 'hex')));
  select snapshot::text into v from public.trust_links where id = lid;
  res := res || jsonb_build_object('fees, people, form answers, file paths and IDs never get in', v not like '%9999%' and v not like '%Olivia Secret%' and v not like '%12-3456789%'
    and v not like '%123-45-6789%' and v not like '%receipt.pdf%' and v not like '%$195%');
  res := res || jsonb_build_object('numbers stay out unless the owner turned them on', v not like '%BL-123%');

  /* ---------------- someone else's workspace ---------------- */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.trust_link_create(w, 'sj', 'x', null, 90, snap); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace''s owner can''t share this store', ok);
  begin perform public.trust_link_revoke(lid); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor revoke its link', ok);
  begin perform public.trust_link_update(lid, '{"numbers": true}', null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor change what it shows', ok);
  begin perform public.trust_link_list(w); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor list its links', ok);
  begin perform public.trust_refresh(w, 'sj', '{"rows":[{"id":"x","name":{"en":"Fake","zh":"Fake"},"status":"approved"}]}'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor write its page', ok);
  begin perform public.trust_requests_for(w); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor read its document requests', ok);

  /* ---------------- the public page ---------------- */
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  j := public.trust_page(tok);
  res := res || jsonb_build_object('anyone with the link sees the page', j ->> 'status' = 'ok' and j -> 'page' -> 'store' ->> 'en' = 'San Jose');
  res := res || jsonb_build_object('a bad status row and a script source are dropped', jsonb_array_length(j -> 'page' -> 'rows') = 5
    and not (j::text like '%javascript:%') and not (j::text like '%<script>%') and not (j::text like '%Bad row%'));
  select r into j from jsonb_array_elements(public.trust_page(tok) -> 'page' -> 'rows') r where r ->> 'id' = 'bl';
  res := res || jsonb_build_object('a license in force shows good, its agency, its expiry and when Placetta last read the agency''s record',
    j ->> 'standing' = 'good' and j -> 'agency' ->> 'en' = 'City of San Jose' and j ? 'expires' and j ->> 'verified' = to_char((now() - interval '1 day') at time zone 'UTC', 'YYYY-MM-DD') and not j ? 'number' and not j ? 'proof');
  if not (res -> 'a license in force shows good, its agency, its expiry and when Placetta last read the agency''s record')::boolean then raise notice 'bl row: %', j; end if;
  select r into j from jsonb_array_elements(public.trust_page(tok) -> 'page' -> 'rows') r where r ->> 'id' = 'hp';
  res := res || jsonb_build_object('one expiring within 30 days shows renewing', j ->> 'standing' = 'renewing');
  select r into j from jsonb_array_elements(public.trust_page(tok) -> 'page' -> 'rows') r where r ->> 'id' = 'old';
  res := res || jsonb_build_object('one past its expiry shows expired, worked out on the day it''s read', j ->> 'standing' = 'expired');
  select r into j from jsonb_array_elements(public.trust_page(tok) -> 'page' -> 'rows') r where r ->> 'id' = 'abc';
  res := res || jsonb_build_object('one with the agency shows pending', j ->> 'standing' = 'pending');
  execute 'reset role';
  insert into public.filings (workspace_id, app_id, payload, title, status) values (w, 'abc', '{}', '{"en":"Liquor license","zh":"酒牌"}', 'accepted');
  execute 'set local role anon';
  select r into j from jsonb_array_elements(public.trust_page(tok) -> 'page' -> 'rows') r where r ->> 'id' = 'abc';
  res := res || jsonb_build_object('approved by the agency since the page was written: good now, without waiting for the app', j ->> 'standing' = 'good' and j ->> 'status' = 'approved');
  execute 'reset role';
  delete from public.filings where workspace_id = w and app_id = 'abc';
  execute 'set local role anon';
  select r into j from jsonb_array_elements(public.trust_page(tok) -> 'page' -> 'rows') r where r ->> 'id' = 'xss';
  res := res || jsonb_build_object('a date that isn''t a day is dropped', not j ? 'expires' and j ->> 'standing' = 'good');
  j := public.trust_page(tok);
  res := res || jsonb_build_object('the counts are the rows''', (j -> 'counts' ->> 'total')::int = 5 and (j -> 'counts' ->> 'good')::int = 3 and (j -> 'counts' ->> 'attention')::int = 1);
  res := res || jsonb_build_object('the address shows by default', j -> 'page' ->> 'address' = '1 Main St, San Jose, CA');
  res := res || jsonb_build_object('the first link takes no document requests', not (j ->> 'requests')::boolean);
  j := public.trust_page(tok2);
  select r into e from jsonb_array_elements(j -> 'page' -> 'rows') r where r ->> 'id' = 'bl';
  res := res || jsonb_build_object('the second shows numbers and proof on file, and no address, as its owner chose', e::jsonb ->> 'number' = 'BL-123' and (e::jsonb ->> 'proof')::boolean and not (j -> 'page') ? 'address');
  res := res || jsonb_build_object('a made-up token, a malformed one and an empty one all get "gone"', public.trust_page(repeat('a', 48)) ->> 'status' = 'gone'
    and public.trust_page('x'' or 1=1 --') ->> 'status' = 'gone' and public.trust_page(null) ->> 'status' = 'gone');
  begin perform count(*) from public.trust_links; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anon can''t read the links table', ok);
  begin perform public.trust_link_list(w); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anon can''t run the owner''s functions', ok);

  /* ---------------- drift on the agency's record ---------------- */
  execute 'reset role';
  update public.filing_tracking set agency_norm = 'expired', agency_status = 'Inactive' where filing_id = f1;
  execute 'set local role anon';
  select r into j from jsonb_array_elements(public.trust_page(tok) -> 'page' -> 'rows') r where r ->> 'id' = 'bl';
  res := res || jsonb_build_object('when the agency''s record says expired, the page says it needs attention', j ->> 'standing' = 'attention');

  /* ---------------- document requests ---------------- */
  begin perform public.trust_request(tok, 'Lena', 'lena@landlord.test', 'Westfield', 'COI please'); ok := false; exception when others then ok := sqlstate = '42501'; end;
  res := res || jsonb_build_object('a page without requests turned on refuses one', ok);
  j := public.trust_request(tok2, 'Lena', 'lena@landlord.test', 'Westfield', 'COI please');
  res := res || jsonb_build_object('a page with requests on takes one', j ->> 'status' = 'ok');
  begin perform public.trust_request(tok2, 'Lena', 'not an email', '', ''); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a request needs a real-looking email', ok);
  n := 0;
  for i in 1..6 loop
    begin perform public.trust_request(tok2, 'Spam', 'spam' || i || '@x.test', '', ''); n := n + 1; exception when others then e := sqlstate; end;
  end loop;
  res := res || jsonb_build_object('one address sends at most 5 requests an hour', n <= 4 and e = '54000');
  execute 'reset role';
  res := res || jsonb_build_object('a request lands in the owner''s Updates and says nothing was sent', exists (select 1 from public.updates u where u.workspace_id = w and u.dedupe like 'trust-request:%' and u.body ->> 'en' like '%Nothing was sent%'));

  /* ---------------- the owner changes, refreshes and revokes ---------------- */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.trust_requests_for(w);
  res := res || jsonb_build_object('the owner sees the request', n >= 1);
  perform public.trust_link_update(lid2, '{"numbers": false, "docs": true}', null);
  execute 'reset role';
  select snapshot::text into v from public.trust_links where id = lid2;
  res := res || jsonb_build_object('turning numbers off takes them out of what''s kept at once', v not like '%BL-123%');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  n := public.trust_refresh(w, 'sj', jsonb_set(snap, '{store}', '{"en": "San Jose, Downtown", "zh": "圣何塞市中心"}'));
  res := res || jsonb_build_object('a member''s refresh writes every live link for the store', n = 2);
  begin perform public.trust_link_revoke(lid); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t revoke', ok);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.trust_link_revoke(lid);
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  res := res || jsonb_build_object('a revoked link is gone at once', public.trust_page(tok) ->> 'status' = 'gone');
  res := res || jsonb_build_object('the other link still works, with the refreshed name', public.trust_page(tok2) -> 'page' -> 'store' ->> 'en' = 'San Jose, Downtown');
  execute 'reset role';
  res := res || jsonb_build_object('a revoked link keeps nothing of the page', (select snapshot from public.trust_links where id = lid) = '{}'::jsonb);
  update public.trust_links set expires_at = now() - interval '1 minute' where id = lid2;
  execute 'set local role anon';
  res := res || jsonb_build_object('an expired link is gone, the same as a made-up one', public.trust_page(tok2) ->> 'status' = 'gone');
  execute 'reset role';
  res := res || jsonb_build_object('sharing and revoking are in the audit log', (select count(*) from public.audit_log where workspace_id = w and action ->> 'en' in ('Shared a status page', 'Revoked a status page')) = 3);
  delete from public.workspaces where id = w;
  res := res || jsonb_build_object('a deleted workspace takes its links and requests with it', not exists (select 1 from public.trust_links where workspace_id = w) and not exists (select 1 from public.trust_requests where workspace_id = w));
  raise exception 'TEST_RESULTS %', res;
end $test$;
