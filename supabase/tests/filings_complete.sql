-- A customer can't file with a blank line or a missing document. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; n int := 0;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@c.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'C', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);

  -- each case on its own app id, so the one-open-filing-per-app rule doesn't interfere
  begin insert into public.filings (workspace_id, app_id, title, payload) values (w, 'c1', '{"en":"x","zh":"x"}', '{"fields":[{"id":"a","label":{"en":"Owner"},"value":""}],"checklist":[]}'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('empty field refused', ok);
  begin insert into public.filings (workspace_id, app_id, title, payload) values (w, 'c2', '{"en":"x","zh":"x"}', '{"fields":[{"id":"a","label":{"en":"Owner"},"value":"   "}],"checklist":[]}'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('whitespace refused', ok);
  begin insert into public.filings (workspace_id, app_id, title, payload) values (w, 'c3', '{"en":"x","zh":"x"}', '{"fields":[{"id":"a","label":{"en":"Owner"},"value":"TBD"}],"checklist":[]}'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('TBD refused', ok);
  begin insert into public.filings (workspace_id, app_id, title, payload) values (w, 'c4', '{"en":"x","zh":"x"}', '{"fields":[{"id":"a","label":{"en":"Owner"},"value":"[owner name]"}],"checklist":[]}'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('bracket placeholder refused', ok);
  begin insert into public.filings (workspace_id, app_id, title, payload) values (w, 'c5', '{"en":"x","zh":"x"}', '{"fields":[{"id":"a","label":{"en":"Owner"},"value":"Jamie"}],"checklist":[{"label":{"en":"Floor plan"},"state":"missing"}]}'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('missing document refused', ok);
  begin insert into public.filings (workspace_id, app_id, title, payload) values (w, 'c6', '{"en":"x","zh":"x"}', '{"fields":[{"id":"a","label":{"en":"Owner"},"value":"Jamie"},{"id":"b","label":{"en":"Suite"},"value":"N/A"},{"id":"c","label":{"en":"Hazmat"},"value":"None"}],"checklist":[{"label":{"en":"Floor plan"},"state":"done"},{"label":{"en":"Hood"},"state":"auto"}]}'); ok := true; exception when others then ok := false; end;
  res := res || jsonb_build_object('complete filing goes in (N/A and None are answers)', ok);
  begin insert into public.filings (workspace_id, app_id, title, payload) values (w, 'c7', '{"en":"x","zh":"x"}', '{"official":"irs-ss4"}'); ok := true; exception when others then ok := false; end;
  res := res || jsonb_build_object('a payload without lines still goes in', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- the service role (no user) isn't held to it
  begin insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'c8', '{"en":"x","zh":"x"}', '{"fields":[{"id":"a","value":""}]}', a); ok := true; exception when others then ok := false; end;
  res := res || jsonb_build_object('service role not blocked', ok);
  res := res || jsonb_build_object('blank rule', public.is_blank_value('') and public.is_blank_value(' ? ') and public.is_blank_value('待定') and public.is_blank_value('<name>')
    and not public.is_blank_value('N/A') and not public.is_blank_value('0') and not public.is_blank_value('Unknown Pleasures LLC'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
