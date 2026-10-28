-- Law watch (migration 20261105091000_rule_alerts): candidates in once, staff only, approval needs both languages, no
-- dashes and an official source, a decision is final, and a sweep drift finding becomes a candidate.
do $test$
declare
  s uuid := gen_random_uuid(); c uuid := gen_random_uuid(); inst uuid := '00000000-0000-0000-0000-000000000000';
  res jsonb := '{}'::jsonb; n int; r public.rule_alerts; ok boolean;
  a jsonb := '[{"origin":"register","jurisdiction":"US","forms":["fda-*"],"source_url":"https://www.federalregister.gov/documents/2026/10/22/2026-1/food","source_label":"federalregister.gov","title":"Food facility registration","excerpt":"FDA proposes","published":"2026-10-22","dedupe":"register:fr-fda:1"},
               {"origin":"odelia","jurisdiction":"US","forms":[],"source_url":"https://example.com/blog","title":"Weekly check","dedupe":"odelia:run-1"},
               {"origin":"nonsense","title":"x","dedupe":"x"}]';
  h jsonb := '{"en":"FDA proposes new food facility rules","zh":"FDA 拟议新的食品设施规则"}';
  b jsonb := '{"en":"Your FDA registration may need a new field.","zh":"您的 FDA 注册可能需要新增一项。"}';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, s, 'authenticated', 'authenticated', 'staff@law.test', now(), now(), now(), '{}', '{}'),
    (inst, c, 'authenticated', 'authenticated', 'customer@law.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (s, 'email'), (c, 'email');
  insert into public.staff_emails (email) values ('staff@law.test') on conflict do nothing;

  n := public.rule_alert_report(a);
  res := res || jsonb_build_object('two candidates in, the unknown origin left out', n = 2 and (select count(*) from public.rule_alerts where dedupe in ('register:fr-fda:1', 'odelia:run-1')) = 2);
  n := public.rule_alert_report(a);
  res := res || jsonb_build_object('seen again: not duplicated', n = 0);
  res := res || jsonb_build_object('a source that is not official is dropped', (select source_url is null from public.rule_alerts where dedupe = 'odelia:run-1'));
  res := res || jsonb_build_object('they wait for the team', (select bool_and(status = 'pending') from public.rule_alerts where dedupe in ('register:fr-fda:1', 'odelia:run-1')));

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('a customer reads no alerts', (select count(*) from public.rule_alerts) = 0);
  begin perform public.rule_alert_queue(); ok := false; exception when others then ok := sqlerrm ~ 'team only'; end;
  res := res || jsonb_build_object('nor the queue', ok);
  begin perform public.rule_alert_decide((select id from public.rule_alerts where dedupe = 'register:fr-fda:1'), 'approved', h, b); ok := false; exception when others then ok := sqlerrm ~ 'team only'; end;
  res := res || jsonb_build_object('nor decides', ok);
  begin perform public.rule_alert_report(a); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor reports', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('staff see the queue', (select count(*) from public.rule_alert_queue()) >= 2);
  begin perform public.rule_alert_decide((select id from public.rule_alerts where dedupe = 'register:fr-fda:1'), 'approved', '{"en":"Only English"}'::jsonb, b); ok := false; exception when others then ok := sqlerrm ~ 'English and Chinese'; end;
  res := res || jsonb_build_object('approval needs both languages', ok);
  begin perform public.rule_alert_decide((select id from public.rule_alerts where dedupe = 'register:fr-fda:1'), 'approved', '{"en":"New rule — read it","zh":"新规则"}'::jsonb, b); ok := false; exception when others then ok := sqlerrm ~ 'dash'; end;
  res := res || jsonb_build_object('and no dashes', ok);
  begin perform public.rule_alert_decide((select id from public.rule_alerts where dedupe = 'odelia:run-1'), 'approved', h, b); ok := false; exception when others then ok := sqlerrm ~ 'official source'; end;
  res := res || jsonb_build_object('and an official source', ok);
  r := public.rule_alert_decide((select id from public.rule_alerts where dedupe = 'odelia:run-1'), 'approved', h, b, 'https://www.fda.gov/food/registration');
  res := res || jsonb_build_object('the team can give the official source', r.status = 'approved' and r.source_url = 'https://www.fda.gov/food/registration');
  r := public.rule_alert_decide((select id from public.rule_alerts where dedupe = 'register:fr-fda:1'), 'approved', h, b, null, '2027-01-01', 'Checked the PDF');
  res := res || jsonb_build_object('approved with the words, who and when', r.status = 'approved' and r.headline->>'zh' = h->>'zh' and r.decided_by = s and r.effective = '2027-01-01');
  begin perform public.rule_alert_decide(r.id, 'dismissed'); ok := false; exception when others then ok := sqlerrm ~ 'Already decided'; end;
  res := res || jsonb_build_object('a decision is final', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  perform public.qa_report('[{"kind":"drift","severity":"high","source":"https://www.cdtfa.ca.gov/formspubs/pub73.pdf","subject":"ca-cdtfa-seller","repro":"words gone","fix":"re-read"}]');
  res := res || jsonb_build_object('a drift finding becomes a candidate', exists (select 1 from public.rule_alerts where origin = 'sweep' and forms = array['ca-cdtfa-seller'] and status = 'pending' and source_url like 'https://www.cdtfa.ca.gov/%'));
  res := res || jsonb_build_object('rule_source_official', public.rule_source_official('https://www.federalregister.gov/x') and not public.rule_source_official('http://fda.gov/x')
    and not public.rule_source_official('https://fda.gov.evil.com/x') and not public.rule_source_official(null));

  raise exception 'TEST_RESULTS %', res;
end $test$;
