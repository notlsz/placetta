-- Rejection risk's learning and proof links (20261106090000_risk_and_proof.sql).
-- Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  o uuid := gen_random_uuid(); m uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); wp uuid := gen_random_uuid(); we uuid := gen_random_uuid();
  f uuid; fx uuid; i int; d_agent uuid; d_cust uuid; d_other uuid;
  res jsonb := '{}'::jsonb; ok boolean; r jsonb; tok text; lid uuid; p jsonb; s record; n int;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@proof.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@proof.test', now(), now(), now(), '{}', '{}'),
    (inst, e, 'authenticated', 'authenticated', 'eve@proof.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (m, 'email'), (e, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Golden Ox', now(), o, o), (wp, 'Probe', now(), o, o), (we, 'Eve Co', now(), e, e);
  update public.workspaces set synthetic = true where id = wp;
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w, m, 'member'), (wp, o, 'owner'), (we, e, 'owner');

  alter table public.filings disable trigger filings_guard;
  -- 4 decided EINs flagged "name": 3 sent back (2 rejected, 1 asked for more), 1 approved; 1 still pending (doesn't count)
  for i in 1..5 loop
    insert into public.filings (workspace_id, app_id, title, agency, payload, approved_by, status, channel, requirements_checked, submitted_at, decided_at, fee_estimate, confirmation_number)
      values (w, 'ein-' || i, '{"en":"EIN","zh":"EIN"}', '{"en":"Internal Revenue Service","zh":"美国国税局"}', '{"official":"irs-ss4"}', o,
        case when i <= 2 then 'rejected' when i = 3 then 'submitted' when i = 4 then 'accepted' else 'submitted' end, 'fax', true, now() - interval '9 days',
        case when i <> 5 and i <> 3 then now() - interval '2 days' end, 0, case when i = 4 then 'EIN-CONF-4' end)
      returning id into fx;
    if i = 3 then insert into public.filing_events (workspace_id, filing_id, kind, status, title, source) values (w, fx, 'status', 'needs_info', '{"en":"The IRS asked for the responsible party''s name","zh":"x"}', 'agency_page'); end if;
    insert into public.filing_risk_flags (filing_id, workspace_id, form, issue, severity) values (fx, w, 'irs-ss4', 'name', 'medium');
    if i = 4 then f := fx; end if;
  end loop;
  -- a probe workspace's flagged filings never teach
  for i in 1..5 loop
    insert into public.filings (workspace_id, app_id, title, payload, approved_by, status, channel, requirements_checked, fee_estimate)
      values (wp, 'p-' || i, '{"en":"EIN","zh":"EIN"}', '{"official":"irs-ss4"}', o, 'rejected', 'fax', true, 0) returning id into fx;
    insert into public.filing_risk_flags (filing_id, workspace_id, form, issue, severity) values (fx, wp, 'irs-ss4', 'zip', 'medium');
  end loop;
  alter table public.filings enable trigger filings_guard;

  /* ------------------------------ learning ------------------------------ */
  select * into s from public.risk_issue_stats('irs-ss4') x where x.issue = 'name';
  res := res || jsonb_build_object(
    'an issue counts decided filings only, and those the agency sent back', s.n = 4 and s.sent_back = 3,
    'a probe workspace never teaches', not exists (select 1 from public.risk_issue_stats('irs-ss4') x where x.issue = 'zip'),
    'another form learns nothing from this one', not exists (select 1 from public.risk_issue_stats('ca-seller'))
  );
  begin insert into public.filing_risk_flags (filing_id, workspace_id, form, issue, severity) values (f, w, 'irs-ss4', 'Bad Issue!', 'medium'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('an issue is a short kind, never free text', ok);

  -- documents with the approved EIN: the receipt Placetta saved, a lease the owner uploaded
  insert into public.documents (workspace_id, app_id, filing_id, name, path, source, uploaded_by) values (w, 'ein-4', f, 'confirmation.pdf', w::text || '/receipts/c.pdf', 'agent', null) returning id into d_agent;
  insert into public.documents (workspace_id, app_id, filing_id, name, path, source, uploaded_by) values (w, 'ein-4', f, 'lease.pdf', w::text || '/lease.pdf', 'customer', o) returning id into d_cust;
  insert into public.documents (workspace_id, app_id, name, path, source, uploaded_by) values (w, 'other', 'other.pdf', w::text || '/receipts/other.pdf', 'agent', null) returning id into d_other;
  insert into public.filing_events (workspace_id, filing_id, kind, status, title, source, url) values (w, f, 'status', 'accepted', '{"en":"The IRS issued the EIN","zh":"国税局已签发 EIN"}', 'agency_page', 'https://www.irs.gov/');

  /* ------------------------------ who may share ------------------------------ */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('the owner reads their filings'' risk flags', (select count(*) from public.filing_risk_flags where workspace_id = w) = 5);
  r := public.proof_link_create(w, f, 90, true, 'Landlord');
  tok := r ->> 'token'; lid := (r ->> 'id')::uuid;
  res := res || jsonb_build_object('an owner makes a link; the token is 48 hex, shown once', tok ~ '^[0-9a-f]{48}$',
    'it lasts 30 days at most, whatever is asked', (r ->> 'expires_at')::timestamptz <= now() + interval '30 days 1 minute' and (r ->> 'expires_at')::timestamptz > now() + interval '29 days');
  execute 'reset role';
  res := res || jsonb_build_object('only the hash is kept', (select count(*) from public.proof_links where token_hash = encode(extensions.digest(tok, 'sha256'), 'hex')) = 1
    and not exists (select 1 from public.proof_links where token_hash = tok));
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin perform public.proof_link_create(w, f, 7, false); ok := false; exception when others then ok := sqlstate = '42501'; end;
  res := res || jsonb_build_object('a member who isn''t an owner can''t share', ok);
  begin perform public.proof_link_revoke(lid); ok := false; exception when others then ok := sqlstate = '42501'; end;
  res := res || jsonb_build_object('or revoke', ok);
  res := res || jsonb_build_object('a member sees the links', (select count(*) from public.proof_link_list(w)) = 1);
  begin perform 1 from public.proof_links; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('the links table itself is closed to signed-in people', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin perform public.proof_link_create(w, f, 7, false); ok := false; exception when others then ok := sqlstate = '42501'; end;
  res := res || jsonb_build_object('another workspace''s owner can''t share it', ok);
  begin perform public.proof_link_create(we, f, 7, false); ok := false; exception when others then ok := sqlstate = 'P0002'; end;
  res := res || jsonb_build_object('nor share it from their own workspace', ok);
  begin perform public.proof_link_list(w); ok := false; exception when others then ok := sqlstate = '42501'; end;
  res := res || jsonb_build_object('nor list its links', ok);
  res := res || jsonb_build_object('nor read its risk flags', (select count(*) from public.filing_risk_flags where workspace_id = w) = 0);

  execute 'reset role';
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values (gen_random_uuid(), o, 'test', 'totp', 'verified', now(), now());
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.proof_link_create(w, f, 7, false); ok := false; exception when others then ok := sqlstate = '42501'; end;
  res := res || jsonb_build_object('an owner with two-step sign-in set up, signed in without it, can''t share', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  /* ------------------------------ the shared page ------------------------------ */
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  p := public.proof_page(tok);
  res := res || jsonb_build_object(
    'anyone with the link sees the proof', p ->> 'status' = 'ok' and p ->> 'confirmation' = 'EIN-CONF-4' and p ->> 'filing_status' = 'accepted',
    'with every status change and its source', exists (select 1 from jsonb_array_elements(p -> 'events') x where x ->> 'source' = 'agency_page' and x ->> 'url' = 'https://www.irs.gov/'),
    'the receipt is listed; the owner''s lease never is', jsonb_array_length(p -> 'docs') = 1 and p -> 'docs' -> 0 ->> 'name' = 'confirmation.pdf',
    'never a form answer or a fee', not (p ? 'payload') and not (p ? 'fee_estimate') and p::text not like '%lease%',
    'a made-up token is gone', public.proof_page(repeat('a', 48)) ->> 'status' = 'gone',
    'a malformed one too', public.proof_page('x'' or 1=1 --') ->> 'status' = 'gone');
  begin perform public.proof_doc(tok, d_agent); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('only the proof function may turn a token into a file path', ok);
  begin perform public.proof_link_create(w, f, 7, false); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a stranger can''t make a link', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  res := res || jsonb_build_object(
    'the proof function gets the receipt''s path', public.proof_doc(tok, d_agent) = w::text || '/receipts/c.pdf',
    'never the owner''s upload', public.proof_doc(tok, d_cust) is null,
    'never another filing''s file', public.proof_doc(tok, d_other) is null,
    'views are counted', (select views from public.proof_links where id = lid) = 1);

  -- a link without documents shares none
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  r := public.proof_link_create(w, f, 1, false);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('a link without documents lists none', jsonb_array_length(public.proof_page(r ->> 'token') -> 'docs') = 0,
    'and the function signs none', public.proof_doc(r ->> 'token', d_agent) is null);

  -- expired, then revoked: the same "gone"
  update public.proof_links set expires_at = now() - interval '1 minute' where token_hash = encode(extensions.digest(r ->> 'token', 'sha256'), 'hex');
  res := res || jsonb_build_object('an expired link is gone', public.proof_page(r ->> 'token') ->> 'status' = 'gone');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.proof_link_revoke(lid);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('a revoked link is gone', public.proof_page(tok) ->> 'status' = 'gone',
    'and its files with it', public.proof_doc(tok, d_agent) is null,
    'sharing and revoking are in the audit log', (select count(*) from public.audit_log where workspace_id = w and action ->> 'en' in ('Shared proof of a filing', 'Revoked a proof link')) = 3);
  begin update public.proof_links set expires_at = created_at + interval '90 days' where id = lid; ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('the table itself refuses a link longer than 30 days', ok);

  raise exception 'TEST_RESULTS %', res;
end
$test$;
