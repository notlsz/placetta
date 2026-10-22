-- Placetta's MCP server tokens (20261023100000_mcp_tokens): owners and admins make, list and revoke them; only hashes
-- are kept; a token reads one workspace and stops when revoked or when its maker is no longer an owner or admin there;
-- one workspace's people can't see or revoke another's tokens. Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  a uuid := gen_random_uuid(); ad uuid := gen_random_uuid(); m uuid := gen_random_uuid(); bo uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; ka text; kad text; kb text; ida uuid; n int;
  as_user text := 'set local role authenticated';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner-a@shop.test', now(), now(), now(), '{}', '{}'),
    (inst, ad, 'authenticated', 'authenticated', 'admin-a@shop.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member-a@shop.test', now(), now(), now(), '{}', '{}'),
    (inst, bo, 'authenticated', 'authenticated', 'owner-b@shop.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (ad, 'email'), (m, 'email'), (bo, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w1, 'Lucky Leaf Tea', now(), a, a, '{}'), (w2, 'Quiet Noodle', now(), bo, bo, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w1, a, 'owner'), (w1, ad, 'admin'), (w1, m, 'member'), (w2, bo, 'owner');

  execute as_user;
  -- the owner makes one with every scope, the admin one with two
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.mcp_token_create(w1, 'Claude at HQ', null);
  ka := j->>'token'; ida := (j->>'id')::uuid;
  res := res || jsonb_build_object('a token is plc_mcp_ with its prefix', ka ~ ('^plc_mcp_' || (j->>'prefix') || '_[0-9a-f]{48}$'));
  begin perform public.mcp_token_create(w1, 'x', array['status', 'write']); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an unknown scope is refused', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  kad := public.mcp_token_create(w1, 'ChatGPT', array['plan', 'status', 'plan'])->>'token';
  select count(*) into n from public.mcp_token_list(w1);
  res := res || jsonb_build_object('an admin makes one too and lists both', n = 2,
    'the token itself is never listed', not exists (select 1 from public.mcp_token_list(w1) t where t.prefix is null or t.label is null)
      and (select to_jsonb(array_agg(t)) from public.mcp_token_list(w1) t)::text !~ 'plc_mcp_[0-9a-f]{8}_[0-9a-f]{48}',
    'scopes are kept sorted and once', (select t.scopes from public.mcp_token_list(w1) t where t.label = 'ChatGPT') = array['plan', 'status']);
  -- a member, and another workspace's owner
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.mcp_token_create(w1, 'mine', null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t make one', ok);
  begin perform public.mcp_token_list(w1); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t list them', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', bo, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  kb := public.mcp_token_create(w2, 'Claude', null)->>'token';
  begin perform public.mcp_token_list(w1); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace''s owner can''t list them', ok);
  begin perform public.mcp_token_revoke(ida); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace''s owner can''t revoke one', ok);
  begin perform public.mcp_token_create(w1, 'sneaky', null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace''s owner can''t make one for it', ok);
  begin perform public.mcp_token_auth(encode(extensions.digest(ka, 'sha256'), 'hex')); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a signed-in person can''t check tokens', ok);
  begin perform count(*) from public.mcp_tokens; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nobody reads the table directly', ok);

  -- the mcp function (service role)
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  j := public.mcp_token_auth(encode(extensions.digest(ka, 'sha256'), 'hex'));
  res := res || jsonb_build_object('a live token reads its own workspace', (j->>'workspace_id')::uuid = w1 and j->>'role' = 'owner' and (j->>'actor_id')::uuid = a,
    'with its scopes', jsonb_array_length(j->'scopes') = 5,
    'workspace B''s token reads B only', (public.mcp_token_auth(encode(extensions.digest(kb, 'sha256'), 'hex'))->>'workspace_id')::uuid = w2,
    'an unknown hash is nothing', public.mcp_token_auth(repeat('0', 64)) is null,
    'a malformed hash is nothing', public.mcp_token_auth('nope') is null,
    'last use is noted', (select last_used_at is not null from public.mcp_tokens where id = ida),
    'only the hash is stored', not exists (select 1 from public.mcp_tokens where token_hash = ka or prefix = ka));
  -- the admin is made a member: their token stops
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.workspace_members set role = 'member' where workspace_id = w1 and user_id = ad;
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  res := res || jsonb_build_object('a token stops when its maker is no longer an owner or admin', public.mcp_token_auth(encode(extensions.digest(kad, 'sha256'), 'hex')) is null);
  -- the owner revokes theirs: it stops at once, and both events are in the audit trail
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute as_user;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.mcp_token_revoke(ida);
  perform public.mcp_token_revoke(ida);   -- twice is fine
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  res := res || jsonb_build_object('a revoked token stops at once', public.mcp_token_auth(encode(extensions.digest(ka, 'sha256'), 'hex')) is null);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('making and revoking are audited',
    (select count(*) from public.audit_log where workspace_id = w1 and action->>'en' in ('Made an AI assistant token', 'Revoked an AI assistant token')) = 3,
    'the audit names the prefix, never the token', not exists (select 1 from public.audit_log where object::text like '%' || ka || '%'));
  raise exception 'TEST_RESULTS %', res;
end $test$;
