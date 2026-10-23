-- Teach mode's taught playbooks (migration 20261030174100_teach_mode): a draft from a run that asked to be taught,
-- never one carrying the customer's values; drafts and approved ones for the filer; staff approve with two-step sign-in;
-- results counted, repeated failure sends an approved one back to review, drift reaches the Quality queue.
do $test$
declare
  s uuid := gen_random_uuid(); o uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); inst uuid := '00000000-0000-0000-0000-000000000000';
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); f uuid; plain uuid; other uuid; pid uuid; st text; ok boolean; res jsonb := '{}'::jsonb; n int;
  bdy jsonb := '{"version":1,"host":"tax.county.example","official":"cty-business-tax","name":"County business tax on tax.county.example",
    "playbook":{"host":"tax.county.example","final":[{"page":"Review","button":"File application"}],"receipt":["Application received"],"forms":{}},
    "fields":[{"selector":"label:Legal name","fact":"legal_name"}],"trace":[{"action":"fill","selector":"label:Legal name","fact":"legal_name","field":"Legal name","url":"x","heading":"Business details","at":1}],"flags":["signs_in"]}';
  pl jsonb := '{"official":"cty-business-tax","fields":[{"id":"legal_name","label":{"en":"Legal name","zh":"x"},"value":"Acme Noodles LLC"},{"id":"ein","label":{"en":"EIN","zh":"x"},"value":"12-3456789"}],
    "attachments":[{"name":"acme-lease.pdf","path":"w/acme-lease.pdf"}]}';
  teach jsonb := '[{"en":"Show Odelia how","zh":"x","kind":"teach","ref":"record"}]';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, s, 'authenticated', 'authenticated', 'staff@teach.test', now(), now(), now(), '{}', '{}'),
    (inst, o, 'authenticated', 'authenticated', 'owner@teach.test', now(), now(), now(), '{}', '{}'),
    (inst, o2, 'authenticated', 'authenticated', 'other@teach.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (s, 'email'), (o, 'email'), (o2, 'email');
  insert into public.staff_emails (email) values ('staff@teach.test') on conflict do nothing;
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'A', now(), o, o), (w2, 'B', now(), o2, o2);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w2, o2, 'owner');
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'btr', '{"en":"BTR","zh":"BTR"}', pl) returning id into f;
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'btr2', '{"en":"BTR","zh":"BTR"}', pl) returning id into plain;
  insert into public.filings (workspace_id, app_id, title, payload) values (w2, 'btr', '{"en":"BTR","zh":"BTR"}', '{"official":"cty-business-tax","fields":[{"id":"legal_name","label":{"en":"Legal name","zh":"x"},"value":"Golden Tea House Inc"}]}') returning id into other;
  update public.filings set agent_state = 'running', channel = 'portal', agent_log = teach where id = f;
  update public.filings set agent_state = 'running', channel = 'portal' where id in (plain, other);

  -- saving a draft
  begin perform public.filer_save_taught(plain, 'tax.county.example', 'cty-business-tax', 'x', bdy, '{}'); ok := false; exception when others then ok := sqlerrm ~ 'not_a_teach_run'; end;
  res := res || jsonb_build_object('only a run that asked to be taught saves one', ok);
  begin perform public.filer_save_taught(f, 'tax.county.example', 'other-form', 'x', bdy, '{}'); ok := false; exception when others then ok := sqlerrm ~ 'not_this_form'; end;
  res := res || jsonb_build_object('only for its own form', ok);
  begin perform public.filer_save_taught(f, 'tax.county.example', 'cty-business-tax', 'x', jsonb_set(bdy, '{name}', '"Acme Noodles LLC on the county site"'), '{}'); ok := false; exception when others then ok := sqlerrm ~ 'carries_customer_data'; end;
  res := res || jsonb_build_object('a body with the customer''s value is refused', ok);
  begin perform public.filer_save_taught(f, 'tax.county.example', 'cty-business-tax', 'x', jsonb_set(bdy, '{flags}', '["ACME-LEASE.PDF"]'), '{}'); ok := false; exception when others then ok := sqlerrm ~ 'carries_customer_data'; end;
  res := res || jsonb_build_object('and one with their file name, in any case', ok);
  select t.id, t.status into pid, st from public.filer_save_taught(f, 'Tax.County.Example', 'cty-business-tax', 'County business tax', bdy, '{signs_in}') t;
  res := res || jsonb_build_object('a clean draft is saved as a draft', st = 'draft' and (select host from public.portal_playbooks where id = pid) = 'tax.county.example');
  res := res || jsonb_build_object('and goes to the team to review', exists (select 1 from public.team_tasks where kind = 'playbook_review' and detail ->> 'playbook' = pid::text and done_at is null));
  select t.status into st from public.filer_save_taught(f, 'tax.county.example', 'cty-business-tax', 'County business tax', bdy, '{}') t;
  res := res || jsonb_build_object('saving again replaces the draft, one row per portal and form', st = 'draft' and (select count(*) from public.portal_playbooks) = 1 and (select version from public.portal_playbooks where id = pid) = 2);

  -- the filer reads it for any workspace's filing on that portal, without who taught it
  res := res || jsonb_build_object('a draft is returned to the filer', (select t.status from public.filer_taught_playbook('tax.county.example', 'cty-business-tax') t) = 'draft');
  res := res || jsonb_build_object('the filer''s answer has no teaching filing in it', (select count(*) from public.filer_taught_playbook('tax.county.example', 'cty-business-tax') t where t.body::text like '%' || f::text || '%') = 0);

  -- customers can't read or decide
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('a customer reads no taught playbook', (select count(*) from public.portal_playbooks) = 0);
  begin perform public.playbook_decide(pid, 'approved', null); ok := false; exception when others then ok := sqlerrm ~ 'team only'; end;
  res := res || jsonb_build_object('and cannot approve one', ok);
  begin perform public.filer_taught_playbook('tax.county.example', 'cty-business-tax'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor call the filer''s functions', ok);
  -- staff without two-step: not staff
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.playbook_queue(); ok := false; exception when others then ok := sqlerrm ~ 'team only'; end;
  res := res || jsonb_build_object('staff need two-step sign-in', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('staff see the draft in the queue', (select count(*) from public.playbook_queue() q where q.id = pid and q.status = 'draft') = 1);
  begin perform public.playbook_decide(pid, 'rejected', ''); ok := false; exception when others then ok := sqlerrm ~ 'note_needed'; end;
  res := res || jsonb_build_object('a rejection needs a note', ok);
  execute 'reset role';
  update public.portal_playbooks set flags = '{page_injection}' where id = pid;
  execute 'set local role authenticated';
  begin perform public.playbook_decide(pid, 'approved', null); ok := false; exception when others then ok := sqlerrm ~ 'note_needed'; end;
  res := res || jsonb_build_object('a draft a page talked to the AI on needs a note to approve', ok);
  perform public.playbook_decide(pid, 'approved', 'Checked each page by hand; the note on Business details was ignored.');
  res := res || jsonb_build_object('staff approve it, with who and when', (select status = 'approved' and reviewed_by = s from public.portal_playbooks where id = pid));
  res := res || jsonb_build_object('and the review task is done', not exists (select 1 from public.team_tasks where kind = 'playbook_review' and detail ->> 'playbook' = pid::text and done_at is null));
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- an incomplete body can't be approved
  update public.portal_playbooks set status = 'draft', body = body - 'trace' where id = pid;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin perform public.playbook_decide(pid, 'approved', 'x'); ok := false; exception when others then ok := sqlerrm ~ 'not_complete'; end;
  res := res || jsonb_build_object('an incomplete draft can''t be approved', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.portal_playbooks set status = 'approved', body = jsonb_set(body, '{trace}', '[{"action":"click","selector":"button:Continue"}]') where id = pid;

  -- a new recording never overwrites a reviewed playbook
  select t.status into st from public.filer_save_taught(f, 'tax.county.example', 'cty-business-tax', 'y', bdy, '{}') t;
  res := res || jsonb_build_object('a reviewed playbook isn''t overwritten by a new recording', st = 'approved' and (select status from public.portal_playbooks where id = pid) = 'approved');

  -- results, from another workspace's filing on the same portal
  st := public.filer_taught_result(pid, other, true, null);
  res := res || jsonb_build_object('a success counts', st = 'approved' and (select successes from public.portal_playbooks where id = pid) = 1);
  perform public.filer_taught_result(pid, other, false, '["label:Legal name -> label:Legal name of the business"]');
  res := res || jsonb_build_object('a healed selector reaches the Quality queue as drift', exists (select 1 from public.qa_findings where kind = 'drift' and subject like 'Taught steps for cty-business-tax%' and repro like '%Legal name of the business%'));
  perform public.filer_taught_result(pid, other, false, null);
  res := res || jsonb_build_object('two failures in a row: still approved', (select status from public.portal_playbooks where id = pid) = 'approved');
  st := public.filer_taught_result(pid, other, false, null);
  res := res || jsonb_build_object('the third in a row sends it back to review', st = 'draft' and (select demoted_at is not null and demoted_reason like '3 failed%' from public.portal_playbooks where id = pid));
  res := res || jsonb_build_object('with a task for the team', exists (select 1 from public.team_tasks where kind = 'playbook_review' and detail ->> 'demoted' = 'true'));
  res := res || jsonb_build_object('a demoted playbook runs only as a draft (assist mode)', (select t.status from public.filer_taught_playbook('tax.county.example', 'cty-business-tax') t) = 'draft');
  -- a low success rate does it too
  update public.portal_playbooks set status = 'approved', runs = 4, successes = 2, failures = 2, fails_in_a_row = 0 where id = pid;
  st := public.filer_taught_result(pid, other, false, null);
  res := res || jsonb_build_object('under 60% after five runs sends it back', st = 'draft' and (select demoted_reason from public.portal_playbooks where id = pid) = '2 of 5 runs succeeded');
  insert into public.filings (workspace_id, app_id, title, payload, agent_state, channel) values (w2, 'other', '{"en":"X","zh":"X"}', '{"official":"another-form"}', 'running', 'portal') returning id into plain;
  begin perform public.filer_taught_result(pid, plain, true, null); ok := false; exception when others then ok := sqlerrm ~ 'not_this_form'; end;
  res := res || jsonb_build_object('a run can only score the playbook for its own form', ok);

  -- a rejected one is never run
  update public.portal_playbooks set status = 'rejected' where id = pid;
  res := res || jsonb_build_object('a rejected playbook is never returned', not exists (select 1 from public.filer_taught_playbook('tax.county.example', 'cty-business-tax')));

  -- grants
  res := res || jsonb_build_object('the filer role has the three functions and not the table',
    has_function_privilege('placetta_filer', 'public.filer_taught_playbook(text, text)', 'execute')
    and has_function_privilege('placetta_filer', 'public.filer_save_taught(uuid, text, text, text, jsonb, text[])', 'execute')
    and has_function_privilege('placetta_filer', 'public.filer_taught_result(uuid, uuid, boolean, jsonb)', 'execute')
    and not has_table_privilege('placetta_filer', 'public.portal_playbooks', 'select'));
  res := res || jsonb_build_object('anon has none of it', not has_function_privilege('anon', 'public.playbook_queue()', 'execute')
    and not has_function_privilege('anon', 'public.filer_save_taught(uuid, text, text, text, jsonb, text[])', 'execute') and not has_table_privilege('anon', 'public.portal_playbooks', 'select'));
  select count(*) into n from pg_proc where proname in ('filer_save_taught', 'filer_taught_playbook', 'filer_taught_result', 'playbook_queue', 'playbook_decide', 'taught_body_leaks')
    and pronamespace = 'public'::regnamespace and not ('search_path=""' = any(proconfig) or 'search_path=' = any(proconfig));
  res := res || jsonb_build_object('every function pins an empty search_path', n = 0);

  raise exception 'TEST_RESULTS %', res;
end $test$;
