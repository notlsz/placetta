-- Sign once (20261105090200_sign_once_paper.sql): an owner adopts one signature with its ESIGN/UETA consent record; it
-- lives in the vault, members see the record but never the image, only the signer reads their own image back, and only
-- Placetta's server reads it to place; every placement is logged append-only; withdrawing stops it at once; Lob and
-- Telnyx pieces are server-written and members read their own. Run with scripts/test-db.sh (ends by raising TEST_RESULTS).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); f1 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; n int; s jsonb; mine jsonb; sid uuid; v text := public.current_esign_disclosure();
  png text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'mei@signonce.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@signonce.test', now(), now(), now(), '{}', '{}'),
    (inst, eve, 'authenticated', 'authenticated', 'eve@other.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (m, 'email'), (eve, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Sign Once Co', now(), a, a, '{"apps":[]}'), (w2, 'Eve Co', now(), eve, eve, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, m, 'member'), (w2, eve, 'owner');
  insert into public.billing (workspace_id, comped) values (w, true), (w2, true);
  insert into public.filings (id, workspace_id, app_id, title, agency, payload, approved_by)
    values (f1, w, 'llc', '{"en":"Entity election","zh":"实体选择"}', '{"en":"IRS","zh":"IRS"}', '{"official":"irs-8832"}', a);

  execute 'set local role authenticated';
  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.9", "user-agent": "Safari test"}', true);

  /* ------------------------------ adopting ------------------------------ */
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.signature_adopt(w, 'Member', null, 'typed', null, v, true, true, true, true); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t adopt a signature for the business', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.signature_adopt(w, 'Mei Chen', null, 'drawn', png, '2020-01-01', true, true, true, true); ok := false; exception when others then ok := sqlerrm ~ 'esign_version'; end;
  res := res || jsonb_build_object('an old disclosure version is refused', ok);
  begin perform public.signature_adopt(w, 'Mei Chen', null, 'drawn', png, v, true, true, false, true); ok := false; exception when others then ok := sqlerrm ~ 'esign_consent'; end;
  res := res || jsonb_build_object('every consent box is needed', ok);
  begin perform public.signature_adopt(w, 'Mei Chen', null, 'drawn', 'data:text/html,<script>', v, true, true, true, true); ok := false; exception when others then ok := sqlerrm ~ 'esign_drawn'; end;
  res := res || jsonb_build_object('a drawn signature must be a PNG', ok);

  s := public.signature_adopt(w, 'Mei Chen', 'Managing member', 'drawn', png, v, true, true, true, true);
  sid := (s ->> 'id')::uuid;
  res := res || jsonb_build_object('the owner adopts a drawn signature', s ->> 'kind' = 'drawn' and s ->> 'by' = 'Mei Chen' and not (s ? 'image'));

  /* ------------------------------ who sees what ------------------------------ */
  mine := public.signature_mine(w);
  res := res || jsonb_build_object('the signer reads their own image back', mine ->> 'image' = png);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('another member never gets the image', public.signature_mine(w) is null);
  select count(*) into n from public.signer_signatures where workspace_id = w and consent_records and consent_apply and disclosure_version = v and ip = '198.51.100.9';
  res := res || jsonb_build_object('members read the consent record, with the IP it came from', n = 1);
  begin perform (select secret_id from public.signer_signatures limit 1); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nobody but the server reads the vault id', ok);
  begin perform public.signature_for(w, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('only Placetta''s server reads the signature to place it', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.signer_signatures where workspace_id = w;
  res := res || jsonb_build_object('another business sees nothing', n = 0 and public.signature_mine(w) is null);
  begin perform public.signature_stamp_log(w, sid, f1, 'irs-8832', null, 'owner_tap'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another business can''t log a placement', ok);

  /* ------------------------------ placing ------------------------------ */
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.signature_stamp_log(w, sid, f1, 'irs-8832', null, 'owner_tap'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('only the signer places their own signature', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.signature_stamp_log(w, sid, f1, 'irs-8832', repeat('ab', 32), 'owner_tap');
  select count(*) into n from public.signature_stamps where filing_id = f1 and asked_by = 'owner_tap';
  res := res || jsonb_build_object('the owner''s tap is logged against the filing', n = 1);
  reset role;
  s := public.signature_for(w, null);
  res := res || jsonb_build_object('the server reads the live owner signature', s ->> 'image' = png and s ->> 'sha' ~ '^[0-9a-f]{64}$');
  begin update public.signature_stamps set form = 'x' where filing_id = f1; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('placements are append-only, the service role included', ok);
  select count(*) into n from public.audit_log where workspace_id = w and action ->> 'en' = 'Adopted a signature' and actor_id = a;
  res := res || jsonb_build_object('adopting is in the audit trail', n = 1);
  select count(*) into n from public.workspaces where id = w and state -> 'controls' -> 'signature' ->> 'id' = sid::text and not (state -> 'controls' -> 'signature' ? 'image');
  res := res || jsonb_build_object('the workspace keeps the record, never the image', n = 1);

  /* ------------------------------ replacing and withdrawing ------------------------------ */
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.signature_adopt(w, 'Mei Chen', null, 'typed', null, v, true, true, true, false);
  select count(*) into n from public.signer_signatures where workspace_id = w and user_id = a and withdrawn_at is null;
  res := res || jsonb_build_object('one live signature per signer: a new one replaces the old', n = 1);
  res := res || jsonb_build_object('a typed signature has no image', (public.signature_mine(w) ->> 'image') is null and public.signature_mine(w) ->> 'kind' = 'typed');
  begin perform public.signature_stamp_log(w, sid, f1, 'irs-8832', null, 'owner_tap'); ok := false; exception when others then ok := sqlerrm ~ 'esign_withdrawn'; end;
  res := res || jsonb_build_object('a replaced signature can''t be placed', ok);
  res := res || jsonb_build_object('the signer withdraws in one call', public.signature_withdraw(w, null));
  res := res || jsonb_build_object('after withdrawing, nothing to place', public.signature_mine(w) is null);
  reset role;
  res := res || jsonb_build_object('the server has nothing to place either', public.signature_for(w, null) is null);

  /* ------------------------------ paper ------------------------------ */
  insert into public.paper_pieces (id, provider, purpose, workspace_id, filing_id) values ('ltr_test123', 'lob', 'sign_kit', w, f1);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.paper_pieces where filing_id = f1;
  res := res || jsonb_build_object('members see their letters and faxes', n = 1);
  begin insert into public.paper_pieces (id, provider, purpose, workspace_id, filing_id) values ('ltr_fake', 'lob', 'filing', w, f1); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('only the server records a letter', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.paper_pieces where filing_id = f1;
  res := res || jsonb_build_object('another business sees none of them', n = 0);
  reset role;

  raise exception 'TEST_RESULTS %', res;
end
$test$;
