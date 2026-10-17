-- WeChat links and the Square and Toast tables (migration 20261017120000_wechat_pos). Run with scripts/test-db.sh
-- (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); z uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; ca text; cb text; i int; r text;
  app text := 'wx3e7a9c1b2d4f6a8b'; oa text := 'o9AgO5Kd5ggOC-bXrbNODIiE3bGY'; ob text := 'oB7xYzQw1234567890abcdefgh';
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@wx.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'member@wx.test', now(), now(), now(), '{}', '{}'),
    (inst, z, 'authenticated', 'authenticated', 'stranger@wx.test', now(), now(), now(), '{}', '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Golden Ox', now(), a, a), (w2, 'Other', now(), z, z);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, b, 'member'), (w2, z, 'owner');

  -- the new kinds and channel
  begin
    insert into public.integrations (workspace_id, kind, account) values (w, 'wechat_bot', app), (w, 'square', 'Golden Ox'), (w, 'toast', 'Golden Ox');
    ok := true;
  exception when others then ok := false; end;
  res := res || jsonb_build_object('integrations take wechat_bot, square and toast', ok);
  begin insert into public.integrations (workspace_id, kind) values (w, 'clover'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('an unknown kind is still refused', ok);
  begin insert into public.oauth_pending (id, workspace_id, user_id, kind, secret_id) values (repeat('c', 64), w, a, 'square', public.vault_put('t', 'integration:square')); ok := true;
  exception when others then ok := false; end;
  res := res || jsonb_build_object('a Square sign-in can wait in oauth_pending', ok);
  begin insert into public.oauth_pending (id, workspace_id, user_id, kind, secret_id) values (repeat('d', 64), w, a, 'toast', public.vault_put('t', 'integration:toast')); ok := false;
  exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('Toast never goes through oauth_pending', ok);
  begin
    insert into public.agent_runs (workspace_id, created_by, kind, prompt, lang, channel, chat_to, heartbeat_at)
    values (w, a, 'task', '营业执照什么时候到期？', 'zh', 'wechat', jsonb_build_object('kind', 'wechat', 'openid', oa), now());
    ok := true;
  exception when others then ok := false; end;
  res := res || jsonb_build_object('a run can come from WeChat', ok);

  -- codes: members only, six digits, at most 5 an hour
  ca := public.wechat_link_start(w, a)->>'code';
  res := res || jsonb_build_object('a member gets a six-digit code', ca ~ '^\d{6}$');
  res := res || jsonb_build_object('only its hash is stored', (select code_hash <> ca and code_hash like '$2%' from public.wechat_links where workspace_id = w and user_id = a));
  begin perform public.wechat_link_start(w, z); ok := false; exception when others then ok := sqlerrm like '%not_member%'; end;
  res := res || jsonb_build_object('someone outside the workspace gets no code', ok);
  cb := public.wechat_link_start(w, b)->>'code';
  res := res || jsonb_build_object('two members never share a live code', cb <> ca);

  -- claiming: a wrong code, then the right one
  j := public.wechat_link_claim(w, app, oa, case when ca = '000000' then '111111' else '000000' end);
  res := res || jsonb_build_object('a wrong code is wrong', j->>'result' = 'wrong');
  res := res || jsonb_build_object('an unlinked follower is nobody', public.wechat_sender(w, app, oa) is null);
  j := public.wechat_link_claim(w, app, oa, ca);
  res := res || jsonb_build_object('the right code links that WeChat to its member', j->>'result' = 'ok' and (j->>'user_id')::uuid = a);
  j := public.wechat_sender(w, app, oa);
  res := res || jsonb_build_object('the follower is now that member', (j->>'user_id')::uuid = a and (j->>'member')::boolean);
  res := res || jsonb_build_object('the code is used up', (select code_hash is null and code_expires_at is null from public.wechat_links where workspace_id = w and user_id = a));
  res := res || jsonb_build_object('a used code links nobody else', public.wechat_link_claim(w, app, ob, ca)->>'result' = 'wrong');
  res := res || jsonb_build_object('another account''s follower with the same OpenID is nobody', public.wechat_sender(w, 'wx0000000000000000', oa) is null);
  res := res || jsonb_build_object('another workspace knows nothing of the link', public.wechat_sender(w2, app, oa) is null);

  -- the same WeChat moves to the member whose code it sends
  j := public.wechat_link_claim(w, app, oa, cb);
  res := res || jsonb_build_object('a WeChat links to one member at a time',
    (public.wechat_sender(w, app, oa)->>'user_id')::uuid = b and (select openid is null and linked_at is null from public.wechat_links where workspace_id = w and user_id = a));

  -- expired codes don't link
  ca := public.wechat_link_start(w, a)->>'code';
  update public.wechat_links set code_expires_at = now() - interval '1 second' where workspace_id = w and user_id = a;
  res := res || jsonb_build_object('an expired code is wrong', public.wechat_link_claim(w, app, 'oExpired000000000000', ca)->>'result' = 'wrong');

  -- a member who leaves is still linked, but not a member
  delete from public.workspace_members where workspace_id = w and user_id = b;
  j := public.wechat_sender(w, app, oa);
  res := res || jsonb_build_object('a linked WeChat whose member left is known but not a member', (j->>'user_id')::uuid = b and not (j->>'member')::boolean);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, b, 'member');

  -- guessing: 5 tries an hour from one follower, then locked even with the right code
  ca := public.wechat_link_start(w, a)->>'code';
  for i in 1..5 loop r := public.wechat_link_claim(w, app, 'oGuesser00000000000000', lpad(i::text, 6, '0'))->>'result'; end loop;
  res := res || jsonb_build_object('the sixth try in an hour is locked', public.wechat_link_claim(w, app, 'oGuesser00000000000000', ca)->>'result' = 'locked');
  res := res || jsonb_build_object('the locked follower linked nothing', public.wechat_sender(w, app, 'oGuesser00000000000000') is null);
  res := res || jsonb_build_object('a malformed OpenID is refused', public.wechat_link_claim(w, app, 'bad id!', ca)->>'result' = 'wrong');
  -- and 60 tries an hour for the whole account
  for i in 1..60 loop r := public.wechat_link_claim(w, app, 'oMany' || lpad(i::text, 6, '0') || 'xxxxxxxx', '999999')->>'result'; end loop;
  res := res || jsonb_build_object('past 60 tries an hour, the account''s codes are locked', public.wechat_link_claim(w, app, 'oLegit0000000000000000', ca)->>'result' = 'locked');

  -- 5 codes an hour per member
  begin for i in 1..6 loop perform public.wechat_link_start(w2, z); end loop; ok := false; exception when others then ok := sqlerrm like '%rate_limited%'; end;
  res := res || jsonb_build_object('a sixth code in an hour is refused', ok);

  -- Toast codes and the shared token
  insert into public.pos_link_codes (workspace_id, toast_code) values (w, 'PLACETTA-7KQ3MZ9W');
  begin insert into public.pos_link_codes (workspace_id, toast_code) values (w2, 'PLACETTA-7KQ3MZ9W'); ok := false; exception when unique_violation then ok := true; end;
  res := res || jsonb_build_object('a Toast code belongs to one workspace', ok);
  begin insert into public.pos_link_codes (workspace_id, toast_code) values (w2, 'PLACETTA-OOOO1111'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('Toast codes use letters that can''t be misread', ok);
  insert into public.server_tokens (name, secret_id, expires_at) values ('toast', public.vault_put('tok', 'server:toast'), now() + interval '1 day');

  -- nothing here is for customers
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform 1 from public.wechat_links limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a signed-in member can''t read wechat_links', ok);
  begin perform public.wechat_link_start(w, a); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a signed-in member can''t make codes directly', ok);
  begin perform public.wechat_link_claim(w, app, 'oSelf000000000000000', '123456'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a signed-in member can''t claim codes directly', ok);
  begin perform public.wechat_sender(w, app, oa); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a signed-in member can''t look up senders', ok);
  begin perform 1 from public.server_tokens limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a signed-in member can''t read server tokens', ok);
  begin perform 1 from public.pos_link_codes limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a signed-in member can''t read Toast codes', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform 1 from public.wechat_links limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anonymous visitors can''t read wechat_links', ok);
  execute 'reset role';

  -- deleting the workspace takes its links and codes with it
  delete from public.workspaces where id = w;
  res := res || jsonb_build_object('a deleted workspace leaves no links or codes',
    not exists (select 1 from public.wechat_links where workspace_id = w) and not exists (select 1 from public.pos_link_codes where workspace_id = w));
  raise exception 'TEST_RESULTS %', res;
end $test$;
