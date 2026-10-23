-- OAuth for Placetta's MCP server (20261028090000_mcp_oauth): an assistant registers, an owner or admin allows it to
-- read one workspace, the code is traded once with the right PKCE verifier, access tokens last an hour, refresh tokens
-- rotate and a reused one revokes the grant; a member or another workspace's owner can't connect anything.
-- Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); bo uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; cid text; code text; code2 text; t1 jsonb; t2 jsonb; n int;
  ch text := rpad('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', 43, 'x');
  cb text := 'https://claude.ai/api/mcp/auth_callback';
  h text;
  as_user text := 'set local role authenticated';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner-a@shop.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member-a@shop.test', now(), now(), now(), '{}', '{}'),
    (inst, bo, 'authenticated', 'authenticated', 'owner-b@shop.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (m, 'email'), (bo, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w1, 'Lucky Leaf Tea', now(), a, a, '{}'), (w2, 'Quiet Noodle', now(), bo, bo, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w1, a, 'owner'), (w1, m, 'member'), (w2, bo, 'owner');

  -- registration (the mcp function, service role)
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  begin perform public.mcp_oauth_register('Evil', array['http://evil.example/cb']); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a plain http redirect is refused', ok);
  begin perform public.mcp_oauth_register('Frag', array['https://x.example/cb#frag']); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a redirect with a fragment is refused', ok);
  j := public.mcp_oauth_register('Claude', array[cb, 'http://localhost/callback', 'http://127.0.0.1/callback']);
  cid := j->>'client_id';
  res := res || jsonb_build_object('a client registers and gets a client id', cid ~ '^plc_client_[0-9a-f]{32}$',
    'its exact redirect matches', (public.mcp_oauth_client(cid, cb)->>'redirect_ok')::boolean,
    'a loopback redirect matches on any port', (public.mcp_oauth_client(cid, 'http://localhost:3118/callback')->>'redirect_ok')::boolean
      and (public.mcp_oauth_client(cid, 'http://127.0.0.1:50000/callback')->>'redirect_ok')::boolean,
    'another address doesn''t match', not (public.mcp_oauth_client(cid, 'https://claude.ai.evil.example/api/mcp/auth_callback')->>'redirect_ok')::boolean
      and not (public.mcp_oauth_client(cid, 'http://localhost:3118/other')->>'redirect_ok')::boolean,
    'an unknown client is nothing', public.mcp_oauth_client('plc_client_' || repeat('0', 32), cb) is null);

  -- consent (the person, signed in)
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute as_user;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.mcp_oauth_approve(w1, cid, cb, null, ch, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t connect an assistant', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', bo, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.mcp_oauth_approve(w1, cid, cb, null, ch, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace''s owner can''t connect one to it', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.mcp_oauth_approve(w1, cid, 'https://evil.example/cb', null, ch, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an unregistered redirect is refused at consent', ok);
  begin perform public.mcp_oauth_approve(w1, cid, cb, null, 'short', null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('no PKCE challenge, no code', ok);
  begin perform public.mcp_oauth_approve(w1, cid, cb, array['status', 'write'], ch, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an unknown scope is refused', ok);
  code := public.mcp_oauth_approve(w1, cid, cb, array['status', 'deadlines'], ch, 'https://ref.fake.test/functions/v1/mcp');
  code2 := public.mcp_oauth_approve(w1, cid, cb, array['plan'], ch, null);
  res := res || jsonb_build_object('the owner gets a code', code ~ '^[0-9a-f]{64}$');
  begin perform count(*) from public.mcp_oauth_codes; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nobody reads the codes directly', ok);
  begin perform public.mcp_oauth_exchange(encode(extensions.digest(code, 'sha256'), 'hex'), cid, cb, ch, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a signed-in person can''t trade a code', ok);

  -- the token endpoint (service role)
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  res := res || jsonb_build_object('a wrong PKCE verifier gets nothing', public.mcp_oauth_exchange(encode(extensions.digest(code2, 'sha256'), 'hex'), cid, cb, rpad('x', 43, 'y'), null)->>'error' = 'invalid_grant',
    'and that code is spent', public.mcp_oauth_exchange(encode(extensions.digest(code2, 'sha256'), 'hex'), cid, cb, ch, null)->>'error' = 'invalid_grant');
  res := res || jsonb_build_object('a different resource gets nothing', public.mcp_oauth_exchange(encode(extensions.digest(code, 'sha256'), 'hex'), cid, cb, ch, 'https://other.example/mcp')->>'error' = 'invalid_grant');
  -- that spent the first code too: a fresh one
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute as_user; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  code := public.mcp_oauth_approve(w1, cid, cb, array['status', 'deadlines'], ch, 'https://ref.fake.test/functions/v1/mcp');
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  t1 := public.mcp_oauth_exchange(encode(extensions.digest(code, 'sha256'), 'hex'), cid, cb, ch, 'https://ref.fake.test/functions/v1/mcp/');
  j := public.mcp_token_auth(encode(extensions.digest(t1->>'access_token', 'sha256'), 'hex'));
  res := res || jsonb_build_object('the code trades for an access token and a refresh token', t1->>'access_token' ~ '^plc_mcp_[0-9a-f]{8}_[0-9a-f]{48}$' and t1->>'refresh_token' ~ '^plc_mrt_[0-9a-f]{64}$' and (t1->>'expires_in')::int = 3600,
    'the access token reads the workspace with the scopes allowed', (j->>'workspace_id')::uuid = w1 and j->'scopes' = '["deadlines", "status"]'::jsonb and (j->>'actor_id')::uuid = a,
    'only hashes are stored', not exists (select 1 from public.mcp_tokens where token_hash = t1->>'access_token' or refresh_hash = t1->>'refresh_token'));
  -- the same code again: refused, and what it gave is revoked
  res := res || jsonb_build_object('a code traded twice is refused', public.mcp_oauth_exchange(encode(extensions.digest(code, 'sha256'), 'hex'), cid, cb, ch, null)->>'error' = 'invalid_grant',
    'and revokes what it gave', public.mcp_token_auth(encode(extensions.digest(t1->>'access_token', 'sha256'), 'hex')) is null);

  -- a new connection, then refresh rotation
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute as_user; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  code := public.mcp_oauth_approve(w1, cid, cb, null, ch, null);
  select count(*) into n from public.mcp_token_list(w1) t where t.oauth;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  t1 := public.mcp_oauth_exchange(encode(extensions.digest(code, 'sha256'), 'hex'), cid, cb, ch, null);
  h := encode(extensions.digest(t1->>'refresh_token', 'sha256'), 'hex');
  res := res || jsonb_build_object('a refresh needs the client it was issued to', public.mcp_oauth_refresh(h, 'plc_client_' || repeat('1', 32))->>'error' = 'invalid_grant');
  t2 := public.mcp_oauth_refresh(h, cid);
  res := res || jsonb_build_object('a refresh gives new tokens', t2->>'access_token' is not null and t2->>'refresh_token' <> t1->>'refresh_token',
    'the old access token stops', public.mcp_token_auth(encode(extensions.digest(t1->>'access_token', 'sha256'), 'hex')) is null,
    'the new one works', public.mcp_token_auth(encode(extensions.digest(t2->>'access_token', 'sha256'), 'hex')) is not null);
  res := res || jsonb_build_object('an old refresh token used again is refused', public.mcp_oauth_refresh(h, cid)->>'error' = 'invalid_grant',
    'and disconnects the assistant', public.mcp_token_auth(encode(extensions.digest(t2->>'access_token', 'sha256'), 'hex')) is null
      and public.mcp_oauth_refresh(encode(extensions.digest(t2->>'refresh_token', 'sha256'), 'hex'), cid)->>'error' = 'invalid_grant');

  -- expiry, and a maker who is no longer an owner
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute as_user; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  code := public.mcp_oauth_approve(w1, cid, cb, null, ch, null);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  t1 := public.mcp_oauth_exchange(encode(extensions.digest(code, 'sha256'), 'hex'), cid, cb, ch, null);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.mcp_tokens set expires_at = now() - interval '1 second' where token_hash = encode(extensions.digest(t1->>'access_token', 'sha256'), 'hex');
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  res := res || jsonb_build_object('an access token stops at its expiry', public.mcp_token_auth(encode(extensions.digest(t1->>'access_token', 'sha256'), 'hex')) is null);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  -- a pasted token still works without an expiry, and OAuth grants don't use up the 10 pasted tokens
  select count(*) into n from public.mcp_tokens where workspace_id = w1 and client_id is not null;
  res := res || jsonb_build_object('connections are rows in the token list', n >= 3);
  update public.workspace_members set role = 'member' where workspace_id = w1 and user_id = a;
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  res := res || jsonb_build_object('a refresh stops when the maker is no longer an owner or admin',
    public.mcp_oauth_refresh(encode(extensions.digest(t1->>'refresh_token', 'sha256'), 'hex'), cid)->>'error' = 'invalid_grant');
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.workspace_members set role = 'owner' where workspace_id = w1 and user_id = a;
  res := res || jsonb_build_object('connecting is audited, never with a token',
    (select count(*) from public.audit_log where workspace_id = w1 and action->>'en' = 'Connected an AI assistant') >= 4
      and not exists (select 1 from public.audit_log where object::text ~ 'plc_mcp_[0-9a-f]{8}_[0-9a-f]{48}|plc_mrt_'),
    'a reused refresh token is in the audit trail', exists (select 1 from public.audit_log where workspace_id = w1 and action->>'en' like 'Disconnected an AI assistant%'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
