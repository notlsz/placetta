-- The location, company and e-signature connections (20261029100000_location_connectors): each new kind saves, every
-- kind from before still saves, a made-up kind is still refused, and the migration runs twice. Run with
-- scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; k text;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@places.test', now(), now(), now(), '{}', '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values (w, 'Places Tea', now(), a, a, '{}');
  ok := true;
  foreach k in array array['gbp', 'clover', 'shopify', 'xero', 'dropbox_sign'] loop
    begin insert into public.integrations (workspace_id, kind, account) values (w, k, k); exception when others then ok := false; end;
  end loop;
  res := res || jsonb_build_object('Google Business Profile, Clover, Shopify, Xero and Dropbox Sign save', ok and (select count(*) from public.integrations where workspace_id = w) = 5);
  ok := true;
  foreach k in array array['gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams', 'dingtalk', 'slack_bot', 'lark_bot', 'wechat_bot', 'square', 'toast', 'webhook'] loop
    begin insert into public.integrations (workspace_id, kind, account) values (w, k, k); exception when others then ok := false; end;
  end loop;
  res := res || jsonb_build_object('every kind from before still saves', ok);
  begin insert into public.integrations (workspace_id, kind, account) values (w, 'lightspeed', 'x'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a kind not built is refused', ok);
  -- the migration again, as written: nothing changes and nothing fails
  begin
    alter table public.integrations drop constraint if exists integrations_kind_check;
    alter table public.integrations add constraint integrations_kind_check
      check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams', 'dingtalk',
        'slack_bot', 'lark_bot', 'wechat_bot', 'square', 'toast', 'webhook', 'gbp', 'clover', 'shopify', 'xero', 'dropbox_sign'));
    ok := (select count(*) from public.integrations where workspace_id = w) = 23;
  exception when others then ok := false; end;
  res := res || jsonb_build_object('running it twice keeps every connection', ok);
  raise exception 'TEST_RESULTS %', res;
end $test$;
