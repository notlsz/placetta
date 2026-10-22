-- Agent memory (20261022171905_agent_memory.sql): row-level security per workspace, the four roles, no secrets, approval
-- with supersede, the memory cap, forget all, briefs and proposals, the nightly check against the records, and the run's
-- cache record. Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); ad uuid := gen_random_uuid(); mb uuid := gen_random_uuid(); vw uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); r1 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; n int; j jsonb; e text; pw jsonb;
  claims text;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'olivia@acme.test', now(), now(), now(), '{}', '{}'),
    (inst, ad, 'authenticated', 'authenticated', 'adam@acme.test', now(), now(), now(), '{}', '{}'),
    (inst, mb, 'authenticated', 'authenticated', 'mia@acme.test', now(), now(), now(), '{}', '{}'),
    (inst, vw, 'authenticated', 'authenticated', 'vic@acme.test', now(), now(), now(), '{}', '{}'),
    (inst, eve, 'authenticated', 'authenticated', 'eve@other.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (ad, 'email'), (mb, 'email'), (vw, 'email'), (eve, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Acme Tea', now(), o, o, '{"deadlines":[{"id":"dl-soi","date":"2027-03-01","kind":"renewal","title":{"en":"Statement","zh":"声明"}}],"entities":[{"id":"e1","name":"Acme Tea LLC","kind":"llc","registrations":[]}]}'),
    (w2, 'Other', now(), eve, eve, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w, ad, 'admin'), (w, mb, 'member'), (w, vw, 'viewer'), (w2, eve, 'owner');
  insert into public.billing (workspace_id, comped) values (w, true), (w2, true);
  pw := jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1)));

  -- what agent-run (the service role) writes: suggestions, one from an email
  insert into public.agent_memories (id, workspace_id, topic, entity, attr, value, text_en, text_zh, source_kind, source_ref, status, trust) values
    ('m1', w, 'company', 'entity:e1', 'name', 'Acme Tea LLC', 'Brand files under Acme Tea LLC (Delaware)', '品牌以 Acme Tea LLC（特拉华州）名义申报', 'chat', 'run-1', 'suggested', 'agent'),
    ('m2', w, 'rules', 'landlord', 'requires', 'coi naming them', 'Landlord requires a COI naming them', '房东要求保险证明列明房东', 'email', 'msg-9', 'suggested', 'untrusted'),
    ('m3', w, 'company', 'deadline:dl-soi', 'renews on', '2027-04-01', 'Statement of Information renews 2027-04-01', '信息声明 2027-04-01 续期', 'chat', 'run-2', 'approved', 'owner'),
    ('mx', w2, 'company', 'secret', 'note', 'x', 'Other workspace memory', '其他工作区记忆', 'chat', 'run-x', 'approved', 'owner'),
    ('mp', w, 'preferences', 'owner', 'prefers', 'wechat', 'Prefers WeChat', '偏好微信', 'chat', 'run-3', 'approved', 'owner');
  update public.agent_memories set scope_kind = 'person', scope_id = o::text where id = 'mp';

  -- no secrets, whoever writes
  begin insert into public.agent_memories (workspace_id, entity, attr, text_en, text_zh, source_kind) values (w, 'owner', 'ssn', 'Owner SSN 123-45-6789', 'x', 'chat');
    res := res || '{"an SSN is refused even from the server": false}';
  exception when check_violation then res := res || '{"an SSN is refused even from the server": true}'; end;
  begin insert into public.agent_memories (workspace_id, entity, attr, text_en, text_zh, source_kind) values (w, 'card', 'number', 'Card 4111 1111 1111 1111', 'x', 'chat');
    res := res || '{"a card number is refused": false}';
  exception when check_violation then res := res || '{"a card number is refused": true}'; end;
  begin insert into public.agent_memories (workspace_id, entity, attr, text_en, text_zh, source_kind) values (w, 'portal', 'login', 'Portal password: hunter22', 'x', 'chat');
    res := res || '{"a password is refused": false}';
  exception when check_violation then res := res || '{"a password is refused": true}'; end;
  begin insert into public.agent_memories (workspace_id, entity, attr, text_en, text_zh, source_kind, status, trust) values (w, 'x', 'y', 'From an email, approved', 'x', 'email', 'approved', 'untrusted');
    res := res || '{"nothing from outside is approved without a person": false}';
  exception when check_violation then res := res || '{"nothing from outside is approved without a person": true}'; end;
  res := res || jsonb_build_object('two dates on a line are fine', public.memory_text_ok('Due 2026-10-22, renews 2027-03-01'));

  execute 'set local role authenticated';

  -- a viewer reads, changes nothing
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', vw, 'role', 'authenticated', 'aal', 'aal1') || pw)::text, true);
  res := res || jsonb_build_object('viewer reads the workspace''s memories', (select count(*) from public.agent_memories where workspace_id = w) = 3,
    'viewer doesn''t see another person''s memory', (select count(*) from public.agent_memories where id = 'mp') = 0,
    'viewer doesn''t see another workspace', (select count(*) from public.agent_memories where workspace_id = w2) = 0);
  begin perform public.agent_memory_edit('m3', 'changed', 'changed'); res := res || '{"viewer can''t edit": false}';
  exception when others then res := res || '{"viewer can''t edit": true}'; end;
  begin perform public.agent_memory_delete('m3'); res := res || '{"viewer can''t delete": false}';
  exception when others then res := res || '{"viewer can''t delete": true}'; end;
  begin update public.agent_memories set text_en = 'x' where id = 'm3'; res := res || '{"no direct writes from the browser": false}';
  exception when insufficient_privilege then res := res || '{"no direct writes from the browser": true}'; end;
  begin perform public.agent_memory_settings_set(w, true); res := res || '{"viewer can''t turn memory on": false}';
  exception when others then res := res || '{"viewer can''t turn memory on": true}'; end;

  -- a member edits and pins, but doesn't approve or turn memory on
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', mb, 'role', 'authenticated', 'aal', 'aal1') || pw)::text, true);
  j := public.agent_memory_edit('m3', 'Statement of Information renews on 2027-04-01', '');
  res := res || jsonb_build_object('member edits words', j->>'text_en' = 'Statement of Information renews on 2027-04-01' and j->>'text_zh' = 'Statement of Information renews on 2027-04-01');
  begin perform public.agent_memory_edit('m3', 'SSN 123-45-6789', ''); res := res || '{"an edit can''t add a secret": false}';
  exception when others then res := res || '{"an edit can''t add a secret": true}'; end;
  begin perform public.agent_memory_review('m1', true); res := res || '{"member can''t approve": false}';
  exception when others then res := res || '{"member can''t approve": true}'; end;
  begin perform public.agent_memory_settings_set(w, true); res := res || '{"member can''t turn memory on": false}';
  exception when others then res := res || '{"member can''t turn memory on": true}'; end;
  j := public.agent_memory_brief_set(w, 'store', 'flushing', 'Hood cleaning tags in the binder by the door');
  res := res || jsonb_build_object('member writes a store brief', j->>'body' = 'Hood cleaning tags in the binder by the door');

  -- another workspace's owner sees and changes nothing here
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1') || pw)::text, true);
  res := res || jsonb_build_object('outsider reads nothing', (select count(*) from public.agent_memories where workspace_id = w) = 0 and (select count(*) from public.agent_memory_briefs where workspace_id = w) = 0);
  begin perform public.agent_memory_review('m1', true); res := res || '{"outsider can''t approve": false}';
  exception when others then res := res || '{"outsider can''t approve": true}'; end;
  begin perform public.agent_memory_forget_all(w); res := res || '{"outsider can''t clear": false}';
  exception when others then res := res || '{"outsider can''t clear": true}'; end;

  -- the owner turns memory on and approves; approving a new value supersedes the old one, which stays in the history
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1') || pw)::text, true);
  j := public.agent_memory_settings_set(w, true);
  res := res || jsonb_build_object('owner turns memory on', (j->>'enabled')::boolean, 'it''s in the audit trail', (select count(*) from public.audit_log where workspace_id = w and action->>'en' = 'Turned agent memory on') = 1,
    'owner sees their own person memory', (select count(*) from public.agent_memories where id = 'mp') = 1);
  perform public.agent_memory_review('m1', true);
  perform public.agent_memory_review('m2', true);
  res := res || jsonb_build_object('approved', (select status from public.agent_memories where id = 'm1') = 'approved',
    'an outside suggestion is approved only with who approved it', (select updated_by = o from public.agent_memories where id = 'm2'));
  reset role;
  insert into public.agent_memories (id, workspace_id, topic, entity, attr, value, text_en, text_zh, source_kind, source_ref, status, trust, supersedes) values
    ('m4', w, 'company', 'entity:e1', 'name', 'Acme Tea Holdings LLC', 'Brand files under Acme Tea Holdings LLC', '品牌以 Acme Tea Holdings LLC 名义申报', 'chat', 'run-5', 'suggested', 'agent', 'm1');
  execute 'set local role authenticated';
  perform public.agent_memory_review('m4', true);
  res := res || jsonb_build_object('a changed fact supersedes the old one', (select status = 'superseded' and valid_to is not null and superseded_by = 'm4' from public.agent_memories where id = 'm1'),
    'one current value per slot', (select count(*) from public.agent_memories where workspace_id = w and lower(entity) = 'entity:e1' and status = 'approved' and valid_to is null) = 1);

  -- the nightly check: memory says a different renewal date and a different entity name than the records
  reset role;
  n := public.agent_memory_check();
  res := res || jsonb_build_object('the check finds both conflicts', n = 2,
    'the deadline conflict names the record', (select record_value from public.agent_memory_conflicts where memory_id = 'm3') = '2027-03-01',
    'the owners hear about it', (select count(*) from public.updates where workspace_id = w and dedupe like 'memory-conflict:%') = 2,
    'a second check doesn''t raise them again', public.agent_memory_check() = 0);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', mb, 'role', 'authenticated', 'aal', 'aal1') || pw)::text, true);
  perform public.agent_memory_conflict_settle((select id from public.agent_memory_conflicts where memory_id = 'm3'), 'record');
  res := res || jsonb_build_object('settling takes the record''s value', (select count(*) from public.agent_memories where workspace_id = w and entity = 'deadline:dl-soi' and status = 'approved' and value = '2027-03-01' and valid_to is null) = 1,
    'and keeps the old value in the history', (select status = 'superseded' from public.agent_memories where id = 'm3'));

  -- the cap: refuses approval when full
  reset role;
  update public.agent_memory_settings set cap = 10 where workspace_id = w;
  insert into public.agent_memories (workspace_id, entity, attr, value, text_en, text_zh, source_kind, status, trust)
    select w, 'fact ' || g, 'is', 'v' || g, 'Fact number ' || g, '事实 ' || g, 'chat', 'approved', 'owner' from generate_series(1, 10) g;
  insert into public.agent_memories (id, workspace_id, entity, attr, value, text_en, text_zh, source_kind, status, trust) values ('m9', w, 'one more', 'is', 'x', 'One more fact', '再一条', 'chat', 'suggested', 'agent');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1') || pw)::text, true);
  begin perform public.agent_memory_review('m9', true); res := res || '{"memory full refuses approval": false}';
  exception when others then res := res || jsonb_build_object('memory full refuses approval', sqlerrm like 'Memory is full%'); end;

  -- briefs: a proposal approved joins the brief
  reset role;
  insert into public.agent_memory_proposals (id, workspace_id, scope_kind, scope_id, line, why) values ('p1', w, 'store', 'flushing', 'Inspector asked for hood cleaning tags last visit', 'flushed');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', mb, 'role', 'authenticated', 'aal', 'aal1') || pw)::text, true);
  perform public.agent_memory_proposal_review('p1', true);
  res := res || jsonb_build_object('an approved proposal joins the brief', (select body from public.agent_memory_briefs where workspace_id = w and scope_kind = 'store' and scope_id = 'flushing') like '%- Inspector asked for hood cleaning tags last visit');

  -- forget all: owners and admins; the briefs stay
  begin perform public.agent_memory_forget_all(w); res := res || '{"member can''t clear": false}';
  exception when others then res := res || '{"member can''t clear": true}'; end;
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal1') || pw)::text, true);
  n := public.agent_memory_forget_all(w);
  reset role;
  res := res || jsonb_build_object('admin forgets all', n > 0 and (select count(*) from public.agent_memories where workspace_id = w) = 0,
    'the owners'' briefs stay', (select count(*) from public.agent_memory_briefs where workspace_id = w) = 1,
    'another workspace is untouched', (select count(*) from public.agent_memories where workspace_id = w2) = 1);

  -- the run's cache record: the server's alone
  insert into public.agent_runs (id, workspace_id, created_by, prompt, status) values (r1, w, o, 'Where do things stand?', 'done');
  perform public.agent_run_cache(r1, 4, 2000, 18000, 6000, 900, 0.0123, 'abcdef0123456789');
  res := res || jsonb_build_object('a run records its cache use', (select cache_read_tokens = 18000 and cost_usd = 0.0123 and prefix_hash = 'abcdef0123456789' from public.agent_runs where id = r1),
    'the browser can''t write it', not has_function_privilege('authenticated', 'public.agent_run_cache(uuid, int, int, int, int, int, numeric, text)', 'execute'),
    'the browser can''t run the check', not has_function_privilege('authenticated', 'public.agent_memory_check()', 'execute'),
    'memory is off by default', (select column_default from information_schema.columns where table_name = 'agent_memory_settings' and column_name = 'enabled') = 'false');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', vw, 'role', 'authenticated', 'aal', 'aal1') || pw)::text, true);
  j := public.agent_cache_stats(w);
  res := res || jsonb_build_object('cache hit rate per workspace', (j->>'hit_rate')::numeric = 0.6923);
  reset role;
  raise exception 'TEST_RESULTS %', res;
end $test$;
