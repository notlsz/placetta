-- Connected apps through their own MCP servers (migration 20261017140000_mcp_connectors). Run with scripts/test-db.sh
-- (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); z uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; s1 uuid; s2 uuid; s3 uuid; srv uuid; c1 uuid; c2 uuid; c3 uuid; c4 uuid;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@mcp.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'member@mcp.test', now(), now(), now(), '{}', '{}'),
    (inst, z, 'authenticated', 'authenticated', 'stranger@mcp.test', now(), now(), now(), '{}', '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Golden Ox', now(), a, a), (w2, 'Other', now(), z, z);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, b, 'member'), (w2, z, 'owner');

  -- a server: https only, a slug its tools can go under, a secret unless it needs no sign-in
  s1 := public.vault_put('{"access_token":"t1"}', 'mcp');
  insert into public.mcp_servers (workspace_id, slug, name, url, auth, secret_id, connected_by, tools)
    values (w, 'notion', 'Notion', 'https://mcp.notion.com/mcp', 'oauth', s1, a, '[{"name":"notion-search","read_only":true}]') returning id into srv;
  begin insert into public.mcp_servers (workspace_id, slug, name, url, auth) values (w, 'local', 'Local', 'http://127.0.0.1/mcp', 'none'); ok := false;
  exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a server address must be https', ok);
  begin insert into public.mcp_servers (workspace_id, slug, name, url, auth) values (w, 'Bad Slug', 'X', 'https://x.example/mcp', 'none'); ok := false;
  exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a slug is short lowercase letters and digits', ok);
  begin insert into public.mcp_servers (workspace_id, slug, name, url, auth) values (w, 'nosecret', 'X', 'https://x.example/mcp', 'oauth'); ok := false;
  exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a server that signs in must have its secret', ok);
  begin insert into public.mcp_servers (workspace_id, slug, name, url, auth) values (w, 'notion2', 'Notion', 'https://mcp.notion.com/mcp', 'none'); ok := false;
  exception when unique_violation then ok := true; end;
  res := res || jsonb_build_object('the same address can''t be connected twice in a workspace', ok);

  -- a proposed call runs once, after an owner approves it
  insert into public.mcp_calls (workspace_id, server_id, tool, arguments, proposed_by) values (w, srv, 'notion-create-pages', '{"title":"Opening checklist"}', b) returning id into c1;
  begin perform public.mcp_claim_call(c1, w, b); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a member can''t approve a call', ok and (select status from public.mcp_calls where id = c1) = 'waiting');
  begin perform public.mcp_claim_call(c1, w, z); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('an owner of another workspace can''t either', ok);
  j := public.mcp_claim_call(c1, w, a);
  res := res || jsonb_build_object('the owner''s approval claims it with its tool and arguments',
    j->>'tool' = 'notion-create-pages' and j->'arguments'->>'title' = 'Opening checklist' and (select status from public.mcp_calls where id = c1) = 'running');
  res := res || jsonb_build_object('approving it again claims nothing: it runs once', public.mcp_claim_call(c1, w, a) is null);
  insert into public.mcp_calls (workspace_id, server_id, tool, expires_at) values (w, srv, 'notion-update-page', now() - interval '1 minute') returning id into c2;
  ok := public.mcp_claim_call(c2, w, a) is null;
  res := res || jsonb_build_object('an expired call can''t be approved', ok and (select status from public.mcp_calls where id = c2) = 'expired');
  insert into public.mcp_calls (workspace_id, server_id, tool, status) values (w, srv, 'notion-update-page', 'declined') returning id into c3;
  res := res || jsonb_build_object('a declined call can''t be approved', public.mcp_claim_call(c3, w, a) is null);
  insert into public.mcp_calls (workspace_id, server_id, tool) values (w, srv, 'notion-update-page') returning id into c4;
  begin perform public.mcp_claim_call(c4, w2, z); ok := true; exception when others then ok := false; end;
  res := res || jsonb_build_object('a call can''t be claimed through another workspace', ok and public.mcp_claim_call(c4, w2, z) is null and (select status from public.mcp_calls where id = c4) = 'waiting');
  begin insert into public.mcp_calls (workspace_id, server_id, tool, arguments) values (w, srv, 'x', '[1,2]'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('arguments must be an object', ok);

  -- an MCP sign-in can wait in oauth_pending, and the tokens replacing the verifier drop the verifier
  s2 := public.vault_put('{"verifier":"v"}', 'mcp-pending');
  insert into public.oauth_pending (id, workspace_id, user_id, kind, secret_id, meta) values (repeat('e', 64), w, a, 'mcp', s2, '{"stage":"authorize"}');
  s3 := public.vault_put('{"access_token":"t2"}', 'mcp');
  update public.oauth_pending set secret_id = s3, meta = '{"stage":"ready"}' where id = repeat('e', 64);
  res := res || jsonb_build_object('the verifier''s secret is dropped once the tokens replace it', not exists (select 1 from vault.secrets where id = s2) and exists (select 1 from vault.secrets where id = s3));
  -- finish claims the pending row (its secret is kept) and hands the secret to the server
  delete from public.oauth_pending where id = repeat('e', 64);
  update public.mcp_servers set secret_id = s3 where id = srv;
  res := res || jsonb_build_object('reconnecting with new tokens drops the old secret and keeps the new one', not exists (select 1 from vault.secrets where id = s1) and exists (select 1 from vault.secrets where id = s3));
  -- a second server, disconnected: its secret and its calls go with it
  s2 := public.vault_put('{"access_token":"t3"}', 'mcp');
  insert into public.mcp_servers (workspace_id, slug, name, url, auth, secret_id, connected_by) values (w, 'linear', 'Linear', 'https://mcp.linear.app/mcp', 'bearer', s2, a) returning id into c2;
  insert into public.mcp_calls (workspace_id, server_id, tool) values (w, c2, 'create_issue');
  delete from public.mcp_servers where id = c2;
  res := res || jsonb_build_object('disconnecting drops its secret and its calls', not exists (select 1 from vault.secrets where id = s2) and not exists (select 1 from public.mcp_calls where server_id = c2));

  -- nothing here is for customers
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform 1 from public.mcp_servers limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a signed-in owner can''t read mcp_servers directly', ok);
  begin perform 1 from public.mcp_calls limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor mcp_calls', ok);
  begin perform public.mcp_claim_call(c4, w, a); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor approve a call around the server', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform 1 from public.mcp_servers limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anonymous visitors can''t read mcp_servers', ok);
  execute 'reset role';

  -- the daily tidy-up expires calls nobody approved in time
  update public.mcp_calls set expires_at = now() - interval '1 second' where id = c4;
  perform public.purge_expired();
  res := res || jsonb_build_object('the daily tidy-up expires unapproved calls', (select status from public.mcp_calls where id = c4) = 'expired');
  delete from public.workspaces where id = w;
  res := res || jsonb_build_object('a deleted workspace leaves no servers or calls', not exists (select 1 from public.mcp_servers where workspace_id = w) and not exists (select 1 from public.mcp_calls where workspace_id = w));
  raise exception 'TEST_RESULTS %', res;
end $test$;
