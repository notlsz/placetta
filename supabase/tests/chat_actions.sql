-- A chat button's safe actions (20261031151800_chat_actions): assign to the person who pressed it, or remind them; never
-- for someone off the workspace, never by a viewer for assigning, never from the browser. Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); v uuid := gen_random_uuid(); x uuid := gen_random_uuid(); w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; r jsonb;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@chat.test', now(), now(), now(), '{}', '{}'),
    (inst, v, 'authenticated', 'authenticated', 'viewer@chat.test', now(), now(), now(), '{}', '{}'),
    (inst, x, 'authenticated', 'authenticated', 'outsider@chat.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (v, 'email'), (x, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Chat Tea', now(), o, o, '{"apps": [{"id": "sign", "name": {"en": "Sign permit", "zh": "招牌许可"}}]}'),
    (w2, 'Other Tea', now(), x, x, '{"apps": [{"id": "sign", "name": {"en": "Their sign permit", "zh": "x"}}]}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w, v, 'viewer'), (w2, x, 'owner');

  r := public.chat_item_action(w, o, 'assign_me', 'app', 'sign');
  res := res || jsonb_build_object(
    'assign to me: assigned to the person who pressed it', exists (select 1 from public.assignments where workspace_id = w and item_id = 'sign' and assignee = o and assigned_by = o),
    'with the item''s title back', r->'title'->>'en' = 'Sign permit',
    'and audited as them', exists (select 1 from public.audit_log where workspace_id = w and actor_id = o and action->>'en' = 'Assigned from a chat'));
  r := public.chat_item_action(w, v, 'remind', 'app', 'sign', 7);
  perform public.chat_item_action(w, v, 'remind', 'app', 'sign', 7);
  res := res || jsonb_build_object(
    'remind me next week: a reminder for that person on that day', (select count(*) from public.mention_notices where workspace_id = w and user_id = v and kind = 'reminder' and remind_on = current_date + 7) = 1,
    'pressed twice, still one', (select count(*) from public.mention_notices where workspace_id = w and user_id = v) = 1,
    'the day comes back', (r->>'remind_on')::date = current_date + 7);
  begin perform public.chat_item_action(w, v, 'assign_me', 'app', 'sign'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a viewer can''t take on work', ok);
  begin perform public.chat_item_action(w, x, 'assign_me', 'app', 'sign'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('someone from another workspace can''t act on this one', ok and not exists (select 1 from public.assignments where workspace_id = w and assignee = x));
  begin perform public.chat_item_action(w, o, 'approve', 'app', 'sign'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('no button approves, files or pays', ok);
  begin perform public.chat_item_action(w, o, 'remind', 'app', 'sign', 400); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a reminder is 1 to 30 days out', ok);
  begin perform public.chat_item_action(w, o, 'assign_me', 'app', 'nope'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an item that isn''t there is refused', ok);
  res := res || jsonb_build_object('the browser can''t call it', not has_function_privilege('authenticated', 'public.chat_item_action(uuid, uuid, text, text, text, integer)', 'execute')
    and not has_function_privilege('anon', 'public.chat_item_action(uuid, uuid, text, text, text, integer)', 'execute'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
