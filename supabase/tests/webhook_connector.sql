-- The generic webhook connection (20261028100000_webhook_connector): a workspace can save one, every kind it had
-- before still saves, and a made-up kind is still refused. Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; k text;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@hook.test', now(), now(), now(), '{}', '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values (w, 'Hook Tea', now(), a, a, '{}');
  insert into public.integrations (workspace_id, kind, account) values (w, 'webhook', 'Webhook');
  res := res || jsonb_build_object('a webhook connection saves', exists (select 1 from public.integrations where workspace_id = w and kind = 'webhook'));
  ok := true;
  foreach k in array array['gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams', 'dingtalk', 'slack_bot', 'lark_bot', 'wechat_bot', 'square', 'toast'] loop
    begin insert into public.integrations (workspace_id, kind, account) values (w, k, k); exception when others then ok := false; end;
  end loop;
  res := res || jsonb_build_object('every kind from before still saves', ok);
  begin insert into public.integrations (workspace_id, kind, account) values (w, 'ftp', 'x'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a made-up kind is refused', ok);
  raise exception 'TEST_RESULTS %', res;
end $test$;
