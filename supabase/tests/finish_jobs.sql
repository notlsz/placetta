-- Another way when the agency's site fails: filing_reroute_due() sees every hand-back nobody has acted on (another way
-- after the site failed, the business's packet otherwise, a check first when it may have gone), and not one the
-- Placetta team took over. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid(); f uuid; g uuid; h uuid;
  res jsonb := '{}'::jsonb; ok boolean;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@r.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'R', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'sign', '{"en":"Sign","zh":"招牌"}', '{"official":"sj-sign"}') returning id into f;
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'edd', '{"en":"EDD","zh":"EDD"}', '{"official":"ca-de1"}') returning id into g;
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'fire', '{"en":"Fire","zh":"消防"}', '{"official":"sj-fire"}') returning id into h;
  begin perform public.filing_reroute_due(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('customers can''t call it', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  res := res || jsonb_build_object('nothing due at first', not public.filing_reroute_due());

  -- a portal run that couldn't finish hands it back, nothing submitted
  perform public.filing_agent_step(f, '{"en":"Opening the site","zh":"打开网站","kind":"visit"}', '{"channel":"portal","agent_state":"running","status":"in_progress"}');
  perform public.filing_agent_step(f, '{"en":"Couldn''t finish on the site","zh":"未能完成","kind":"handoff","ref":"limit"}', '{"channel":"team","agent_state":"handoff"}');
  res := res || jsonb_build_object('a failed portal run is due for another way', public.filing_reroute_due());

  -- the sweep decided (sent it by mail, or left it with the team): its log entry ends it
  perform public.filing_agent_step(f, '{"en":"Sending by certified mail instead","zh":"改为挂号信","kind":"reroute","ref":"mail"}', '{"expect_agent_state":"handoff","channel":"mail","agent_state":"running"}');
  res := res || jsonb_build_object('once decided, it isn''t due again', not public.filing_reroute_due());

  -- a hand-back for another reason (the review page differs) is due too: the sweep gives the business the packet
  -- (migration 20261101090000_handoffs_to_business; file/logic.ts handBackDue "yours")
  perform public.filing_agent_step(g, '{"en":"Opening the site","zh":"打开网站","kind":"visit"}', '{"channel":"portal","agent_state":"running","status":"in_progress"}');
  perform public.filing_agent_step(g, '{"en":"The review page differs","zh":"核对页不一致","kind":"handoff","ref":"review_differs"}', '{"channel":"team","agent_state":"handoff"}');
  res := res || jsonb_build_object('another hand-back reason is due, for the business''s packet', public.filing_reroute_due());

  -- after a submit was pressed it's still due, though never sent again: the business is asked to check first ("check")
  perform public.filing_agent_step(g, '{"en":"Failed 3 times","zh":"3 次失败","kind":"handoff","ref":"portal_failed"}', jsonb_build_object('submit_clicked_at', now()));
  res := res || jsonb_build_object('one that may have been submitted is due, for a check first', public.filing_reroute_due());

  -- the sweep gave it to the business (file/index.ts toYou): it waits on them now, not on Placetta
  perform public.filing_agent_step(g, '{"en":"Something may already have reached the agency. It''s ready for you to send.","zh":"可能已送达","kind":"needs_you","ref":"yours"}', '{"expect_agent_state":"handoff","agent_state":"needs_you"}');
  res := res || jsonb_build_object('handed to the business, it isn''t due again', not public.filing_reroute_due());

  -- the team took it over: not due
  perform public.filing_agent_step(h, '{"en":"Failed 3 times","zh":"3 次失败","kind":"handoff","ref":"portal_failed"}', '{"channel":"team","agent_state":"handoff"}');
  res := res || jsonb_build_object('three failures are due', public.filing_reroute_due());
  perform public.filing_agent_step(h, '{"en":"The Placetta team took over this filing","zh":"快哉团队已接手","kind":"take_over"}', '{"agent_state":"handoff","channel":"team"}');
  res := res || jsonb_build_object('a take-over ends it', not public.filing_reroute_due());
  raise exception 'TEST_RESULTS %', res;
end $test$;
