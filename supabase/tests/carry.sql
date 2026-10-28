-- Carry to approval (20261105090300): the agency outbox under the agent packet with its undo window, the portal status
-- checks the worker reaches only through its functions, the license, and who reads what. Run with scripts/test-db.sh
-- (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); ag uuid; f uuid; g uuid; o1 uuid; o2 uuid; j uuid; t text; lg uuid;
  res jsonb := '{}'::jsonb; ok boolean; n int; tl jsonb; r record;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@c.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@c.test', now(), now(), now(), '{}', '{}'),
    (inst, x, 'authenticated', 'authenticated', 'stranger@c.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (m, 'email'), (x, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Carry Tea', now(), a, a), (w2, 'Other', now(), x, x);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, m, 'member'), (w2, x, 'owner');
  insert into public.billing (workspace_id, comped) values (w, true);
  insert into public.agent_authorizations (workspace_id, granted_by, signer_name, expires_at, terms_version, agent_name, agencies, forms, items)
    values (w, a, 'Owner One', now() + interval '1 year', '2026-10-28', 'Jane Agent', '["County health"]', '{"scc-health": true}', '[]') returning id into ag;
  insert into public.filings (workspace_id, app_id, title, agency, payload, status, requirements_checked, channel, agent_state, confirmation_number, agent_auth)
    values (w, 'hp', '{"en":"Health permit","zh":"卫生许可"}', '{"en":"County health","zh":"县卫生局"}', jsonb_build_object('official', 'scc-health', 'agent', jsonb_build_object('auth', ag)), 'submitted', true, 'portal', 'done', 'HP-123456', ag) returning id into f;
  insert into public.filings (workspace_id, app_id, title, agency, payload, status, requirements_checked, channel, agent_state)
    values (w, 'sign', '{"en":"Sign permit","zh":"招牌许可"}', '{"en":"City planning","zh":"市规划局"}', '{"official":"sj-sign"}', 'submitted', true, 'email', 'done') returning id into g;

  -- the outbox: only under the packet, once per dedupe, held for the undo window, on the timeline and in agent_acts
  o1 := public.agency_outbox_add(w, f, 'rfi_answer', 'Clerk@SCCgov.org', 'Re: RFI', 'This is Odelia, an AI assistant.', '[{"name":"Lease.pdf","path":"x/lease.pdf"}]', '<m1@scc>', 10, 'rfi:f:1');
  res := res || jsonb_build_object('a send under the packet is added, held for its window',
    exists (select 1 from public.agency_outbox where id = o1 and status = 'held' and to_addr = 'clerk@sccgov.org' and send_after between now() + interval '9 minutes' and now() + interval '11 minutes'),
    'it is an act as agent', exists (select 1 from public.agent_acts where filing_id = f and act = 'answered' and actor = 'odelia'),
    'it is on the timeline and in Updates', exists (select 1 from public.filing_events where filing_id = f and dedupe = 'outbox:' || o1::text)
      and exists (select 1 from public.updates where workspace_id = w and dedupe = 'outbox:' || o1::text),
    'the same send twice is added once', public.agency_outbox_add(w, f, 'rfi_answer', 'clerk@sccgov.org', 'Re: RFI', 'x', '[]', null, 10, 'rfi:f:1') is null);
  begin perform public.agency_outbox_add(w, g, 'status_inquiry', 'a@b.gov', 's', 'b', '[]', null, 10, 'g:1'); ok := false; exception when others then ok := sqlerrm like 'agent_scope%'; end;
  res := res || jsonb_build_object('no packet on the filing: refused', ok);
  begin perform public.agency_outbox_add(w2, f, 'status_inquiry', 'a@b.gov', 's', 'b', '[]', null, 10, 'g:2'); ok := false; exception when others then ok := sqlerrm like 'No such filing%'; end;
  res := res || jsonb_build_object('another workspace''s filing: refused', ok);
  res := res || jsonb_build_object('nothing goes before its window', (select count(*) from public.agency_outbox_claim(20)) = 0);

  -- who reads, who undoes
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  res := res || jsonb_build_object('a stranger reads none of it', (select count(*) from public.agency_outbox) = 0 and (select count(*) from public.portal_status_jobs) = 0 and (select count(*) from public.agency_mail) = 0);
  begin perform public.agency_outbox_undo(o1); ok := false; exception when others then ok := sqlerrm like 'No such send%'; end;
  res := res || jsonb_build_object('a stranger can''t undo', ok);
  begin perform public.agency_outbox_add(w, f, 'rfi_answer', 'a@b.gov', 's', 'b', '[]', null, 10, 'z'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nobody signed in can add a send', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  res := res || jsonb_build_object('a member reads the send', (select count(*) from public.agency_outbox) = 1);
  begin perform public.agency_outbox_undo(o1); ok := false; exception when others then ok := sqlerrm like 'No such send%'; end;
  res := res || jsonb_build_object('a member can''t undo', ok);
  begin update public.filings set license_path = w::text || '/fake.pdf', status = 'canceled' where id = f; exception when others then null; end;
  execute 'reset role';
  res := res || jsonb_build_object('a customer can''t record a license', (select license_path is null and status = 'submitted' from public.filings where id = f));
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  res := res || jsonb_build_object('the owner undoes it while held', public.agency_outbox_undo(o1) = true, 'and only once', public.agency_outbox_undo(o1) = false);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.agency_outbox set send_after = now() - interval '1 minute' where id = o1;
  res := res || jsonb_build_object('an undone send never goes', (select count(*) from public.agency_outbox_claim(20)) = 0);

  -- its time is up: claimed once, sent, on the timeline; a revoked packet fails the row and nothing goes
  o2 := public.agency_outbox_add(w, f, 'status_inquiry', 'permits@sccgov.org', 'Status', 'Hello', '[]', null, 1, 'chase:f:1');
  update public.agency_outbox set send_after = now() - interval '1 minute' where id = o2;
  select count(*) into n from public.agency_outbox_claim(20);
  res := res || jsonb_build_object('due: claimed once', n = 1 and (select count(*) from public.agency_outbox_claim(20)) = 0);
  perform public.agency_outbox_done(o2, true, 'prov-1', null);
  res := res || jsonb_build_object('sent: recorded, on the timeline and as an act', exists (select 1 from public.agency_outbox where id = o2 and status = 'sent' and provider_id = 'prov-1')
    and exists (select 1 from public.filing_events where filing_id = f and dedupe = 'outbox-sent:' || o2::text) and exists (select 1 from public.agent_acts where filing_id = f and act = 'submitted'));
  o2 := public.agency_outbox_add(w, f, 'status_inquiry', 'permits@sccgov.org', 'Status', 'Hello', '[]', null, 1, 'chase:f:2');
  update public.agency_outbox set send_after = now() - interval '1 minute' where id = o2;
  update public.agent_authorizations set revoked_at = now() where id = ag;
  select count(*) into n from public.agency_outbox_claim(20);
  res := res || jsonb_build_object('a revoked packet: nothing goes', n = 0 and exists (select 1 from public.agency_outbox where id = o2 and status = 'failed' and error like 'agent_revoked%'));
  update public.agent_authorizations set revoked_at = null where id = ag;

  -- portal status checks: claimed by the worker, a token for the one filing, the login audited first, the report on the timeline
  insert into public.agency_logins (workspace_id, agency, url, username, secret_id) values (w, 'County health', 'https://portal.sccgov.org/', 'owner1', public.vault_put('pw-secret', 'login test')) returning id into lg;
  insert into public.portal_status_jobs (workspace_id, filing_id, host) values (w, f, 'portal.sccgov.org') returning id into j;
  begin insert into public.portal_status_jobs (workspace_id, filing_id, host) values (w, f, 'portal.sccgov.org'); ok := false; exception when unique_violation then ok := true; end;
  res := res || jsonb_build_object('one open check per filing', ok);
  select * into r from public.filer_claim_status_job();
  res := res || jsonb_build_object('the worker claims it, with the receipt number', r.job_id = j and r.confirmation_number = 'HP-123456' and r.official = 'scc-health',
    'and only once', not exists (select 1 from public.filer_claim_status_job()));
  t := public.filer_status_begin(j);
  res := res || jsonb_build_object('a run token for the one filing', length(t) = 64 and exists (select 1 from public.filer_runs where filing_id = f and ended_at is null));
  res := res || jsonb_build_object('it sees the workspace''s logins', exists (select 1 from public.filer_status_logins(j) where id = lg));
  select count(*) into n from public.audit_log where workspace_id = w and action->>'en' like 'Placetta signed in to County health%';
  select password into t from public.filer_status_open_login(j, lg);
  res := res || jsonb_build_object('the password comes with its audit entry', t = 'pw-secret'
    and (select count(*) from public.audit_log where workspace_id = w and action->>'en' like 'Placetta signed in to County health%') = n + 1);
  perform public.filer_status_report(j, '{"state":"issued","status":"Issued","matched":true,"confidence":0.9,"url":"https://portal.sccgov.org/rec/1","license_path":null}', null);
  res := res || jsonb_build_object('the read is on the timeline and left for the monitor', exists (select 1 from public.filing_events where filing_id = f and kind = 'agency' and status = 'Issued')
    and exists (select 1 from public.portal_status_jobs where id = j and status = 'done' and acted_at is null and result->>'state' = 'issued'));
  begin perform public.filer_status_report(j, '{}', null); ok := false; exception when others then ok := sqlerrm like 'status_job_not_running%'; end;
  res := res || jsonb_build_object('a finished check takes no second report', ok);

  -- the license: set by the server only, shown on the timeline with the owner's first look
  update public.filings set status = 'accepted' where id = f;
  perform public.filing_license_set(f, w::text || '/receipts/' || f::text || '-license.pdf', 'PR-77', '2027-10-31');
  begin perform public.filing_license_set(f, w2::text || '/x.pdf', null, null); ok := false; exception when others then ok := sqlerrm like 'path_outside_workspace%'; end;
  res := res || jsonb_build_object('a license path outside the workspace is refused', ok);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  perform public.filing_license_seen(f);
  tl := public.filing_timeline(f);
  res := res || jsonb_build_object('the timeline has the license', tl->'license'->>'number' = 'PR-77' and tl->'license'->>'expires' = '2027-10-31' and tl->'license'->>'path' like '%-license.pdf'
    and tl->'license'->>'shown_at' is not null, 'and the sends', jsonb_array_length(tl->'outbox') = 3);
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  begin perform public.filing_timeline(f); ok := false; exception when others then ok := sqlerrm like 'No such filing%'; end;
  res := res || jsonb_build_object('a stranger can''t read the timeline', ok);
  begin perform public.filing_license_seen(f); ok := false; exception when others then ok := sqlerrm like 'No such filing%'; end;
  res := res || jsonb_build_object('or mark it seen', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
