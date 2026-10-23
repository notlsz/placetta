-- Memory tied to the records, checked again when a rule changes, shared by role (20261031151700_memory_records_roles).
-- Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid(); w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  f uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; n int; r public.agent_memories;
  claims text;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@rec.test', now(), now(), now(), '{}', '{}'),
    (inst, a, 'authenticated', 'authenticated', 'admin@rec.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@rec.test', now(), now(), now(), '{}', '{}'),
    (inst, v, 'authenticated', 'authenticated', 'viewer@rec.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (a, 'email'), (m, 'email'), (v, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Record Tea', now(), o, o, '{"apps": [{"id": "seller", "official": "ca-seller-permit"}, {"id": "sign", "official": "sj-sign"}]}'),
    (w2, 'Other Tea', now(), o, o, '{"apps": [{"id": "seller2", "official": "ca-seller-permit"}]}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w, a, 'admin'), (w, m, 'member'), (w, v, 'viewer'), (w2, o, 'owner');
  insert into public.agent_memory_settings (workspace_id, enabled) values (w, true), (w2, true);

  -- written by the server (service role), as agent-run writes them
  insert into public.agent_memories (id, workspace_id, entity, attr, value, text_en, text_zh, source_kind, status, trust) values
    ('m-app', w, 'app:seller', 'deposit', 'yes', 'The seller''s permit needs a deposit', '销售许可证需要押金', 'chat', 'approved', 'owner'),
    ('m-form', w, 'form:ca-seller-permit', 'fee', '0', 'The state charges no fee for the seller''s permit', '州政府不收取销售许可证费用', 'chat', 'approved', 'owner'),
    ('m-plain', w, 'Bayou Realty', 'requires', 'coi', 'Bayou Realty requires a COI naming them', '房东要求保险证明', 'chat', 'approved', 'owner'),
    ('m-sign', w, 'app:sign', 'asked for', 'mall approval', 'The mall approves every sign first', '商场先批准招牌', 'chat', 'approved', 'owner'),
    ('m-rent', w, 'Main St lease', 'rent', '9000', 'Main St rent is 9000 a month until 2028', '月租 9000 至 2028 年', 'chat', 'approved', 'owner'),
    ('m-other', w2, 'app:seller2', 'deposit', 'yes', 'Other workspace: deposit', '其他工作区', 'chat', 'approved', 'owner');
  insert into public.agent_memories (id, workspace_id, entity, attr, value, text_en, text_zh, source_kind, source_url, status, trust) values
    ('m-page', w, 'CDTFA', 'says', 'deposit', 'CDTFA''s page says a security deposit may be required', '税务局网页说可能需要押金', 'portal', 'https://www.cdtfa.ca.gov/services/permits-licenses.htm', 'approved', 'agent');
  insert into public.agent_memories (id, workspace_id, scope_kind, scope_id, entity, attr, value, text_en, text_zh, source_kind, status, trust) values
    ('m-mine', w, 'person', m::text, 'entity:e1', 'name', 'Moonleaf LLC', 'I file as Moonleaf LLC', '以 Moonleaf LLC 申报', 'chat', 'approved', 'owner'),
    ('m-mysug', w, 'person', m::text, 'note', 'imported', 'x', 'Prefers short answers from me', '偏好简短', 'upload', 'suggested', 'untrusted');
  insert into public.agent_memory_conflicts (id, workspace_id, memory_id, record, memory_value, record_value) values ('c-mine', w, 'm-mine', 'entity:e1', 'Moonleaf LLC', 'Moonleaf Tea LLC');
  update public.agent_memories set visibility = 'admins' where id = 'm-rent';

  select * into r from public.agent_memories where id = 'm-app';
  res := res || jsonb_build_object(
    'app: links the application', r.record_kind = 'application' and r.record_id = 'seller',
    'form: links the official form', (select record_kind = 'form' and record_id = 'ca-seller-permit' from public.agent_memories where id = 'm-form'),
    'a plain name links nothing', (select record_kind is null from public.agent_memories where id = 'm-plain'),
    'a new memory starts current, for the team', r.verify = 'current' and r.visibility = 'team');
  begin update public.agent_memories set visibility = 'admins' where id = 'm-mine'; ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a personal memory can''t be admins-only (it is already its owner''s alone)', ok);

  /* ---------- roles ---------- */
  execute 'set local role authenticated';
  claims := json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal2')::text;
  perform set_config('request.jwt.claims', claims, true);
  res := res || jsonb_build_object(
    'a member doesn''t read an admins-only memory', not exists (select 1 from public.agent_memories where id = 'm-rent'),
    'a member reads the team''s memories and their own', (select count(*) from public.agent_memories where workspace_id = w) = 7);
  begin perform public.agent_memory_delete('m-rent'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t delete an admins-only memory', ok);
  begin perform public.agent_memory_edit('m-rent', 'Rent is 1', 'x'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor edit it', ok);
  begin perform public.agent_memory_visibility_set('m-plain', 'admins'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t choose who sees a memory', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('a viewer doesn''t read an admins-only memory either', not exists (select 1 from public.agent_memories where id = 'm-rent'));

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object(
    'an admin reads the admins-only memory', exists (select 1 from public.agent_memories where id = 'm-rent'),
    'an admin doesn''t read a teammate''s personal memory', not exists (select 1 from public.agent_memories where id = 'm-mine'),
    'nor the conflict raised about it (its value)', not exists (select 1 from public.agent_memory_conflicts where id = 'c-mine'));
  begin perform public.agent_memory_review('m-mysug', true); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an admin can''t approve a teammate''s own imported suggestion', ok);
  perform public.agent_memory_visibility_set('m-plain', 'admins');
  res := res || jsonb_build_object('an admin makes a memory admins-only, and it''s audited', (select visibility = 'admins' from public.agent_memories where id = 'm-plain')
    and exists (select 1 from public.audit_log where workspace_id = w and action->>'en' = 'Made a memory owners and admins only'));
  perform public.agent_memory_visibility_set('m-plain', 'team');
  begin perform public.agent_memory_visibility_set('m-mine', 'admins'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor on a personal memory', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('the person reads their own memory and its conflict', exists (select 1 from public.agent_memories where id = 'm-mine') and exists (select 1 from public.agent_memory_conflicts where id = 'c-mine'));

  /* ---------- each person's own switches ---------- */
  perform public.agent_memory_person_set(w, false, null);
  res := res || jsonb_build_object('a person turns off Reference saved memories for themselves', (select not reference_memories and reference_chats from public.agent_memory_person where workspace_id = w));
  perform public.agent_memory_person_set(w, null, false);
  res := res || jsonb_build_object('and Reference chat history, keeping the other', (select not reference_memories and not reference_chats from public.agent_memory_person where workspace_id = w));
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('nobody else reads a person''s switches', not exists (select 1 from public.agent_memory_person where workspace_id = w));
  begin perform public.agent_memory_person_set(w2, true, true); ok := true; exception when others then ok := false; end;
  res := res || jsonb_build_object('each workspace has its own', ok and (select count(*) from public.agent_memory_person) = 1);

  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  /* ---------- re-verification ---------- */
  insert into public.qa_findings (kind, severity, source, subject, repro, fix, dedupe) values ('stale', 'low', 'https://www.cdtfa.ca.gov/services/permits-licenses.htm', 'ca-seller-permit', 'old', 'reread', 'stale:x');
  res := res || jsonb_build_object('a stale proof (nothing changed) marks nothing', not exists (select 1 from public.agent_memories where verify = 'recheck'));
  perform public.qa_report('[{"kind":"drift","severity":"high","source":"https://www.cdtfa.ca.gov/services/permits-licenses.htm","subject":"ca-seller-permit","repro":"gone","fix":"reread"}]'::jsonb);
  res := res || jsonb_build_object(
    'the sweeper''s drift marks the memory tied to the form', (select verify = 'recheck' from public.agent_memories where id = 'm-form'),
    'and the one tied to an application filed on it', (select verify = 'recheck' and verify_reason->>'en' like '%changed the page%' from public.agent_memories where id = 'm-app'),
    'and the one read from that page', (select verify = 'recheck' from public.agent_memories where id = 'm-page'),
    'in every workspace with such an application', (select verify = 'recheck' from public.agent_memories where id = 'm-other'),
    'but not an unrelated one', (select verify = 'current' from public.agent_memories where id = 'm-sign') and (select verify = 'current' from public.agent_memories where id = 'm-plain'),
    'the owners hear once a day', (select count(*) from public.updates where workspace_id = w and dedupe like 'memory-recheck:%') = 1,
    'still live: nothing is deleted or expired', (select count(*) from public.agent_memories where workspace_id = w and status = 'approved') = 7);
  perform public.qa_report('[{"kind":"drift","severity":"high","source":"https://www.cdtfa.ca.gov/services/permits-licenses.htm","subject":"ca-seller-permit","repro":"gone again","fix":"reread"}]'::jsonb);
  res := res || jsonb_build_object('the same finding seen again marks nothing new', (select count(*) from public.updates where workspace_id = w and dedupe like 'memory-recheck:%') = 1);

  insert into public.filings (id, workspace_id, app_id, title, payload, status, approved_by) values (f, w, 'sign', '{"en":"Sign permit"}', '{}', 'submitted', o);
  update public.filings set status = 'in_progress' where id = f;
  res := res || jsonb_build_object('a filing moving along marks nothing', (select verify = 'current' from public.agent_memories where id = 'm-sign'));
  update public.filings set status = 'needs_info' where id = f;
  res := res || jsonb_build_object('a filing that needs info marks what memory says about it', (select verify = 'recheck' and verify_reason->>'en' = 'The filing is now needs info.' from public.agent_memories where id = 'm-sign'));

  -- a person settles them
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin perform public.agent_memory_reverify('m-app', true); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a viewer can''t settle a re-check', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.agent_memory_reverify('m-app', true);
  perform public.agent_memory_reverify('m-form', false);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object(
    'still true: confirmed, by whom and when', (select verify = 'confirmed' and verified_by = m and verify_at is not null and status = 'approved' from public.agent_memories where id = 'm-app'),
    'retired: expired and kept in the history', (select status = 'expired' and valid_to = current_date from public.agent_memories where id = 'm-form'),
    'both audited', (select count(*) from public.audit_log where workspace_id = w and action->>'en' in ('Confirmed a memory after a rule changed', 'Retired a memory after a rule changed')) = 2);
  update public.qa_findings set status = 'fixed' where dedupe like 'drift:%';
  update public.qa_findings set status = 'open' where dedupe like 'drift:%';
  res := res || jsonb_build_object('a fixed finding that reopens marks a confirmed memory again', (select verify = 'recheck' from public.agent_memories where id = 'm-app'));

  res := res || jsonb_build_object(
    'agent_memory_flag is the server''s alone', not has_function_privilege('authenticated', 'public.agent_memory_flag(uuid, text, text[], text, text, text)', 'execute'),
    'the trigger functions are never called directly', not has_function_privilege('authenticated', 'public.qa_findings_memory()', 'execute'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
