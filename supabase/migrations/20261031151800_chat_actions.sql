-- What a button on one of Odelia's chat messages may do (supabase/functions/_shared/slack.ts): assign an application or
-- a job to the person who pressed it, or remind that person about it in a day or a week. Nothing else: no button files,
-- pays, sends, approves or removes anything. chat-events calls it with the service role after checking Slack's
-- signature and matching the Slack user to a Placetta teammate by email; the person is passed in because the request
-- comes from Slack, not from their session. Safe to run twice. Tests: supabase/tests/chat_actions.sql.

create or replace function public.chat_item_action(ws uuid, p_user uuid, p_action text, p_kind text, p_item text, p_days int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text; title jsonb; d date; who text;
begin
  select m.role into r from public.workspace_members m where m.workspace_id = ws and m.user_id = p_user;
  if r is null then raise exception 'Not on this workspace.'; end if;
  if p_action not in ('assign_me', 'remind') then raise exception 'That button can''t do that.'; end if;
  if p_kind is null or p_kind not in ('app', 'job') then raise exception 'Only an application or a job.'; end if;
  title := public.item_title(ws, p_kind, p_item);
  if title is null then raise exception 'That item is gone.'; end if;
  if p_action = 'assign_me' then
    -- the same rule as assigning in the app: members and up, not viewers
    if r not in ('owner', 'admin', 'member') then raise exception 'A viewer can''t take on work.'; end if;
    insert into public.assignments(workspace_id, item_kind, item_id, assignee, assigned_by) values (ws, p_kind, p_item, p_user, p_user)
    on conflict (workspace_id, item_kind, item_id) do update set assignee = excluded.assignee, assigned_by = excluded.assigned_by, assigned_at = now();
    select lower(u.email) into who from auth.users u where u.id = p_user;
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (ws, 'you', p_user, '{"en": "Assigned from a chat", "zh": "在聊天中分配"}'::jsonb, title, jsonb_build_object('en', coalesce(who, ''), 'zh', coalesce(who, '')));
    return jsonb_build_object('action', 'assign_me', 'title', title);
  end if;
  -- a reminder to the person who pressed it, on the day they chose (the monitor sends it, by email or text)
  if p_days is null or p_days not between 1 and 30 then raise exception 'Remind in 1 to 30 days.'; end if;
  d := current_date + p_days;
  if not exists (select 1 from public.mention_notices n where n.workspace_id = ws and n.user_id = p_user and n.kind = 'reminder'
                   and n.item_kind = p_kind and n.item_id = p_item and n.remind_on = d and n.sent_at is null) then
    insert into public.mention_notices(workspace_id, kind, user_id, item_kind, item_id, title, body, remind_on, created_by)
    values (ws, 'reminder', p_user, p_kind, p_item,
      jsonb_build_object('en', 'Reminder: ' || coalesce(title->>'en', ''), 'zh', '提醒：' || coalesce(title->>'zh', title->>'en', '')),
      '{"en": "You asked Odelia to remind you about this.", "zh": "您让 Odelia 提醒您这件事。"}'::jsonb, d, p_user);
  end if;
  return jsonb_build_object('action', 'remind', 'title', title, 'remind_on', d);
end $$;
revoke execute on function public.chat_item_action(uuid, uuid, text, text, text, int) from public, anon, authenticated;
grant execute on function public.chat_item_action(uuid, uuid, text, text, text, int) to service_role;
