-- Send once: a filing is claimed for sending exactly one time, steps compare-and-set, the daily cap on fax and mail,
-- duplicates, and webhook event ids. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  f uuid; g uuid; h uuid; d1 uuid; d2 uuid; d3 uuid; i int;
  res jsonb := '{}'::jsonb; ok boolean; row public.filings; dup jsonb;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@once.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Once', now(), a, a), (w2, 'Cap', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w2, a, 'owner');
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values
    (w, 'ein', '{"en":"EIN","zh":"EIN"}', '{"official":"irs-ss4","fields":[{"id":"l1","label":{"en":"Name","zh":"名称"},"value":"Acme"}]}', a) returning id into f;

  -- The claim: the first caller gets the row, a second one is refused, and the time is never overwritten.
  perform public.filing_agent_step(f, null, '{"channel":"fax","agent_state":"running","status":"in_progress"}');
  row := public.filing_claim_submit(f, '{"en":"Faxing it","zh":"正在传真","kind":"submit"}', 10);
  res := res || jsonb_build_object('the first claim wins', row.submit_clicked_at is not null and row.agent_log->-1->>'kind' = 'submit');
  begin perform public.filing_claim_submit(f, '{"en":"Faxing it","zh":"正在传真","kind":"submit"}', 10); ok := false;
  exception when others then ok := sqlerrm like 'already_submitted%'; end;
  res := res || jsonb_build_object('a second claim is refused', ok);
  begin perform public.filing_agent_step(f, '{"en":"x","zh":"x","kind":"submit"}', jsonb_build_object('submit_clicked_at', now() + interval '1 minute')); ok := false;
  exception when others then ok := sqlerrm like 'already_submitted%'; end;
  res := res || jsonb_build_object('the step raises on a second submit time', ok
    and (select submit_clicked_at from public.filings where id = f) = row.submit_clicked_at);

  -- Compare-and-set on agent_state and provider_ref.
  perform public.filing_agent_step(f, null, '{"provider_ref":"fax-1"}');
  begin perform public.filing_agent_step(f, '{"en":"Fax failed","zh":"传真失败","kind":"fax_failed"}', '{"expect_provider_ref":"fax-0","provider_ref":null}'); ok := false;
  exception when others then ok := sqlerrm like 'filing_changed%'; end;
  res := res || jsonb_build_object('a stale provider_ref is refused', ok and (select provider_ref from public.filings where id = f) = 'fax-1');
  row := public.filing_agent_step(f, '{"en":"Fax failed","zh":"传真失败","kind":"fax_failed"}', '{"expect_provider_ref":"fax-1","provider_ref":null}');
  res := res || jsonb_build_object('the matching provider_ref wins once', row.provider_ref is null);
  begin perform public.filing_agent_step(f, '{"en":"Fax failed","zh":"传真失败","kind":"fax_failed"}', '{"expect_provider_ref":"fax-1","provider_ref":null}'); ok := false;
  exception when others then ok := sqlerrm like 'filing_changed%'; end;
  res := res || jsonb_build_object('and the loser does nothing', ok
    and (select jsonb_array_length(jsonb_path_query_array(agent_log, '$[*] ? (@.kind == "fax_failed")')) from public.filings where id = f) = 1);
  begin perform public.filing_agent_step(f, null, '{"expect_agent_state":null,"agent_state":"running"}'); ok := false;
  exception when others then ok := sqlerrm like 'filing_changed%'; end;
  res := res || jsonb_build_object('a start that expects a fresh filing is refused once it has started', ok);
  begin perform public.filing_agent_step(f, null, '{"expect_nothing":1}'); ok := false; exception when others then ok := sqlerrm like '%unknown field%'; end;
  res := res || jsonb_build_object('unknown patch fields are still refused', ok);

  -- A stopped filing can't be claimed.
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'sign', '{"en":"Sign","zh":"招牌"}', '{"official":"sj-sign"}', a) returning id into g;
  perform public.filing_agent_step(g, null, '{"channel":"mail","agent_state":"running","status":"in_progress"}');
  perform public.stop_agent_filing(g, 'owner@once.test');
  begin perform public.filing_claim_submit(g, '{"en":"Mailing it","zh":"正在寄出","kind":"submit"}', 10); ok := false;
  exception when others then ok := sqlerrm like 'filing_stopped%'; end;
  res := res || jsonb_build_object('a stopped filing is never claimed', ok);

  -- The daily cap: 2 faxes or letters, then refused; email doesn't count.
  for i in 1..3 loop
    insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w2, 'app' || i, '{"en":"F","zh":"F"}', jsonb_build_object('official', 'form-' || i), a) returning id into h;
    perform public.filing_agent_step(h, null, jsonb_build_object('channel', case when i = 3 then 'email' else 'fax' end, 'agent_state', 'running'));
    perform public.filing_claim_submit(h, '{"en":"Sending","zh":"发送中","kind":"submit"}', 2);
  end loop;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w2, 'app4', '{"en":"F","zh":"F"}', '{"official":"form-4"}', a) returning id into h;
  perform public.filing_agent_step(h, null, '{"channel":"mail","agent_state":"running"}');
  begin perform public.filing_claim_submit(h, '{"en":"Mailing","zh":"寄出","kind":"submit"}', 2); ok := false;
  exception when others then ok := sqlerrm like 'daily_cap%'; end;
  res := res || jsonb_build_object('the third fax or letter in a day is refused', ok and (select submit_clicked_at is null from public.filings where id = h),
    'email is not counted against the cap', (select submit_clicked_at is not null from public.filings where workspace_id = w2 and app_id = 'app3'));
  row := public.filing_claim_submit(h, '{"en":"Mailing","zh":"寄出","kind":"submit"}', 10);
  res := res || jsonb_build_object('a higher cap lets it through', row.submit_clicked_at is not null);

  -- Duplicates: same form, same answers; a new PDF path and signature time don't make it different.
  insert into public.filings (workspace_id, app_id, title, payload, approved_by, approved_at) values
    (w, 'dba', '{"en":"DBA","zh":"DBA"}', '{"official":"ca-dba","pdf_path":"x/1.pdf","signature":{"name":"A","signed_at":"2026-10-01"},"fields":[{"id":"l1","label":{"en":"Name","zh":"名称"},"value":"Moon Tea"}]}', a, now() - interval '5 days')
    returning id into d1;
  update public.filings set status = 'submitted', requirements_checked = true where id = d1;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values
    (w, 'dba2', '{"en":"DBA","zh":"DBA"}', '{"official":"ca-dba","pdf_path":"x/2.pdf","signature":{"name":"A","signed_at":"2026-10-16"},"fields":[{"id":"l1","label":{"en":"Name","zh":"名称"},"value":" Moon Tea "}]}', a)
    returning id into d2;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values
    (w, 'dba3', '{"en":"DBA","zh":"DBA"}', '{"official":"ca-dba","pdf_path":"x/3.pdf","fields":[{"id":"l1","label":{"en":"Name","zh":"名称"},"value":"Sun Tea"}]}', a)
    returning id into d3;
  dup := public.filing_duplicate_of(d2, 30);
  res := res || jsonb_build_object('the same answers again are a duplicate', (dup->>'id')::uuid = d1,
    'different answers are not', public.filing_duplicate_of(d3, 30) is null,
    'the earlier one is not a duplicate of the later one', public.filing_duplicate_of(d1, 30) is null,
    'older than the window is not', public.filing_duplicate_of(d2, 3) is null);
  update public.filings set status = 'canceled' where id = d1;
  res := res || jsonb_build_object('a canceled one does not count', public.filing_duplicate_of(d2, 30) is null);

  -- Webhook ids, once each.
  insert into public.webhook_events (provider, id) values ('telnyx', 'ev-1');
  begin insert into public.webhook_events (provider, id) values ('telnyx', 'ev-1'); ok := false; exception when unique_violation then ok := true; end;
  res := res || jsonb_build_object('a webhook event id is recorded once', ok);

  -- Customers reach none of this directly.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.filing_claim_submit(d3, '{"en":"x","zh":"x"}', 10); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('customers cannot claim a send', ok);
  begin perform public.filing_duplicate_of(d3, 30); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('customers cannot call the duplicate check', ok);
  begin perform 1 from public.webhook_events; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('customers cannot read webhook events', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- rate_hit: a sliding window per key.
  res := res || jsonb_build_object('rate_hit allows up to the limit',
    public.rate_hit('test:a', 2, 60) and public.rate_hit('test:a', 2, 60) and not public.rate_hit('test:a', 2, 60),
    'rate_hit keys are separate', public.rate_hit('test:b', 2, 60));
  update public.rate_hits set at = now() - interval '2 minutes' where key = 'test:a';
  res := res || jsonb_build_object('rate_hit frees up after the window', public.rate_hit('test:a', 2, 60));
  raise exception 'TEST_RESULTS %', res;
end $test$;
