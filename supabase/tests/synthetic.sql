-- Synthetic workspaces (20261030090000): only the service role marks one; a member can't make theirs synthetic or
-- turn it off; and the network learns nothing from a synthetic workspace's agency decisions.
-- Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); w uuid := gen_random_uuid(); s uuid := gen_random_uuid(); f uuid; g uuid;
  res jsonb := '{}'::jsonb; ok boolean;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@synthetic.test', now(), now(), now(), '{}', '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Real Tea', now(), o, o);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner');
  insert into public.billing (workspace_id, comped) values (w, true);

  -- the service role makes a synthetic workspace
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  execute 'set local role service_role';
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, synthetic) values (s, 'Probe Tea', now(), o, o, true);
  execute 'reset role';
  insert into public.workspace_members (workspace_id, user_id, role) values (s, o, 'owner');
  res := res || jsonb_build_object('the service role marks a workspace synthetic', (select synthetic from public.workspaces where id = s));

  -- a member can't
  perform set_config('request.jwt.claims', jsonb_build_object('sub', o, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.workspaces set synthetic = true where id = w; ok := false;
  exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t make their workspace synthetic', ok);
  begin
    update public.workspaces set synthetic = false where id = s; ok := false;
  exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t turn synthetic off', ok);
  begin
    insert into public.workspaces (name, authorized_at, authorized_by, created_by, synthetic) values ('Sneaky', now(), o, o, true); ok := false;
  exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t create a synthetic workspace', ok);
  begin
    update public.workspaces set name = 'Real Tea Co' where id = w; ok := true;
  exception when others then ok := false; end;
  res := res || jsonb_build_object('a member still renames their workspace', ok);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- learning: a real agency decision is queued, a synthetic one isn't
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'bl', '{"en":"License","zh":"执照"}', '{"official":"nyc-dcwp-license"}', o) returning id into f;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (s, 'bl', '{"en":"License","zh":"执照"}', '{"official":"nyc-dcwp-license"}', o) returning id into g;
  update public.filings set status = 'in_progress', requirements_checked = true where id in (f, g);
  update public.filings set status = 'submitted' where id in (f, g);
  update public.filings set status = 'accepted' where id in (f, g);
  res := res || jsonb_build_object(
    'a real agency decision teaches the network', exists (select 1 from public.learning_queue where filing_id = f),
    'a synthetic one teaches it nothing', not exists (select 1 from public.learning_queue where filing_id = g));
  raise exception 'TEST_RESULTS %', res;
end $test$;
