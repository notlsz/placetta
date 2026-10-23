-- Teams and Telegram (migration 20261029143000_chat_channels): the new channels and bot kinds, Telegram link codes and
-- who a Telegram user is, kept to one workspace, and the migration run twice. Run with scripts/test-db.sh (ends by
-- raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); z uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; ca text; cb text; cz text; i int; k text;
  bot text := '7012345678'; ua text := '123456789'; ub text := '987654321';
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@tg.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'member@tg.test', now(), now(), now(), '{}', '{}'),
    (inst, z, 'authenticated', 'authenticated', 'other@tg.test', now(), now(), now(), '{}', '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Golden Ox', now(), a, a), (w2, 'Other', now(), z, z);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, b, 'member'), (w2, z, 'owner');

  -- the new kinds and channels, and every one from before
  begin insert into public.integrations (workspace_id, kind, account) values (w, 'teams_bot', 'Odelia'), (w, 'telegram_bot', '@odelia_bot'); ok := true;
  exception when others then ok := false; end;
  res := res || jsonb_build_object('integrations take teams_bot and telegram_bot', ok);
  ok := true;
  foreach k in array array['gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams', 'dingtalk', 'slack_bot', 'lark_bot', 'wechat_bot', 'square', 'toast', 'webhook', 'gbp', 'clover', 'shopify', 'xero', 'dropbox_sign'] loop
    begin insert into public.integrations (workspace_id, kind, account) values (w2, k, k); exception when others then ok := false; end;
  end loop;
  res := res || jsonb_build_object('every kind from before still saves', ok);
  begin insert into public.integrations (workspace_id, kind) values (w, 'discord_bot'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a kind not built (Discord) is refused', ok);
  ok := true;
  foreach k in array array['app', 'sms', 'voice', 'slack', 'lark', 'email', 'wechat', 'teams', 'telegram'] loop
    begin insert into public.agent_runs (workspace_id, created_by, kind, prompt, lang, channel, heartbeat_at) values (w, a, 'task', 'When does the permit expire?', 'en', k, now());
    exception when others then ok := false; end;
  end loop;
  res := res || jsonb_build_object('a run can come from every channel, Teams and Telegram included', ok);
  begin insert into public.agent_runs (workspace_id, created_by, kind, prompt, lang, channel, heartbeat_at) values (w, a, 'task', 'x', 'en', 'discord', now()); ok := false;
  exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a channel not built is refused', ok);

  -- codes: members only, six digits, only the hash kept
  ca := public.telegram_link_start(w, a)->>'code';
  res := res || jsonb_build_object('a member gets a six-digit code', ca ~ '^\d{6}$');
  res := res || jsonb_build_object('only its hash is stored', (select code_hash <> ca and code_hash like '$2%' from public.telegram_links where workspace_id = w and user_id = a));
  begin perform public.telegram_link_start(w, z); ok := false; exception when others then ok := sqlerrm like '%not_member%'; end;
  res := res || jsonb_build_object('someone outside the workspace gets no code', ok);
  cb := public.telegram_link_start(w, b)->>'code';
  res := res || jsonb_build_object('two members never share a live code', cb <> ca);

  -- claiming
  j := public.telegram_link_claim(w, bot, ua, case when ca = '000000' then '111111' else '000000' end);
  res := res || jsonb_build_object('a wrong code is wrong', j->>'result' = 'wrong');
  res := res || jsonb_build_object('an unlinked Telegram user is nobody', public.telegram_sender(w, bot, ua) is null);
  j := public.telegram_link_claim(w, bot, ua, ca);
  res := res || jsonb_build_object('the right code links that Telegram user to its member', j->>'result' = 'ok' and (j->>'user_id')::uuid = a);
  j := public.telegram_sender(w, bot, ua);
  res := res || jsonb_build_object('the Telegram user is now that member', (j->>'user_id')::uuid = a and (j->>'member')::boolean);
  res := res || jsonb_build_object('the code is used up', (select code_hash is null and code_expires_at is null from public.telegram_links where workspace_id = w and user_id = a));
  res := res || jsonb_build_object('a used code links nobody else', public.telegram_link_claim(w, bot, ub, ca)->>'result' = 'wrong');
  res := res || jsonb_build_object('another bot''s user with the same id is nobody', public.telegram_sender(w, '7000000001', ua) is null);

  -- tenancy: another workspace's code can't link here, and this link means nothing there
  cz := public.telegram_link_start(w2, z)->>'code';
  res := res || jsonb_build_object('another workspace''s code doesn''t link in this one', public.telegram_link_claim(w, bot, '555555555', cz)->>'result' = 'wrong');
  res := res || jsonb_build_object('another workspace knows nothing of the link', public.telegram_sender(w2, bot, ua) is null);
  res := res || jsonb_build_object('a bad bot or user id is refused before any lookup', public.telegram_link_claim(w, 'x', ua, cb)->>'result' = 'wrong' and public.telegram_link_claim(w, bot, 'abc', cb)->>'result' = 'wrong');

  -- the same Telegram user moves to the member whose code it sends next
  j := public.telegram_link_claim(w, bot, ua, cb);
  res := res || jsonb_build_object('a Telegram user moves to the member whose code it sent', j->>'result' = 'ok' and (public.telegram_sender(w, bot, ua)->>'user_id')::uuid = b
    and (select tg_user is null and linked_at is null from public.telegram_links where workspace_id = w and user_id = a));

  -- someone who leaves the workspace is no longer a member here
  delete from public.workspace_members where workspace_id = w and user_id = b;
  res := res || jsonb_build_object('a member who left is linked but not a member', (public.telegram_sender(w, bot, ua)->>'member')::boolean = false);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, b, 'member');

  -- guessing: five tries an hour from one Telegram user
  for i in 1..6 loop j := public.telegram_link_claim(w, bot, '444444444', '000001'); end loop;
  res := res || jsonb_build_object('a sixth guess in an hour is locked', j->>'result' = 'locked');

  -- no customer role reaches any of it
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform 1 from public.telegram_links limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a signed-in member can''t read telegram_links', ok);
  begin perform public.telegram_link_start(w, a); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a signed-in member can''t make codes directly', ok);
  begin perform public.telegram_link_claim(w, bot, '333333333', '123456'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a signed-in member can''t claim codes directly', ok);
  begin perform public.telegram_sender(w, bot, ua); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a signed-in member can''t look up senders', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform 1 from public.telegram_links limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anonymous visitors can''t read telegram_links', ok);
  execute 'reset role';

  -- the migration again, as written: nothing changes and nothing fails
  begin
    alter table public.agent_runs drop constraint if exists agent_runs_channel_check;
    alter table public.agent_runs add constraint agent_runs_channel_check
      check (channel in ('app', 'sms', 'voice', 'slack', 'lark', 'email', 'wechat', 'teams', 'telegram'));
    alter table public.integrations drop constraint if exists integrations_kind_check;
    alter table public.integrations add constraint integrations_kind_check
      check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams', 'dingtalk',
        'slack_bot', 'lark_bot', 'wechat_bot', 'square', 'toast', 'webhook', 'gbp', 'clover', 'shopify', 'xero', 'dropbox_sign',
        'teams_bot', 'telegram_bot'));
    create table if not exists public.telegram_links (workspace_id uuid, user_id uuid);
    create unique index if not exists telegram_links_user on public.telegram_links(workspace_id, bot_id, tg_user) where tg_user is not null;
    ok := (select count(*) from public.telegram_links where workspace_id = w and linked_at is not null) = 1;
  exception when others then ok := false; end;
  res := res || jsonb_build_object('running it twice keeps every link and connection', ok);

  -- deleting the workspace takes its links and codes with it
  delete from public.workspaces where id = w;
  res := res || jsonb_build_object('a deleted workspace leaves no Telegram links or codes', not exists (select 1 from public.telegram_links where workspace_id = w));
  raise exception 'TEST_RESULTS %', res;
end $test$;
