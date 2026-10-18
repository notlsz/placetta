-- The filled form's short link (20261018090000_form_links.sql): only a member of its workspace opens it, only while
-- it's fresh, and nobody reads or writes the table from the app. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  r record; res jsonb := '{}'::jsonb; ok boolean;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'fl1@t.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'fl2@t.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (b, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w1, 'F1', now(), a, a), (w2, 'F2', now(), b, b);
  insert into public.workspace_members (workspace_id, user_id, role) values (w1, a, 'member'), (w2, b, 'owner');

  insert into public.form_links (token, workspace_id, app_id, version, path, name) values
    ('Fresh0000000001', w1, 'edd', 2, w1::text || '/x/DE 1, filled, version 2.pdf', 'DE 1, filled, version 2.pdf'),
    ('Stale0000000001', w1, 'edd', 1, w1::text || '/x/DE 1, filled, version 1.pdf', 'DE 1, filled, version 1.pdf');
  update public.form_links set expires_at = now() - interval '1 hour' where token = 'Stale0000000001';
  begin insert into public.form_links (token, workspace_id, app_id, version, path) values ('Other0000000001', w1, 'edd', 1, w2::text || '/x/a.pdf'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a link only points at its own workspace''s files', ok);
  begin insert into public.form_links (token, workspace_id, app_id, version, path) values ('short', w1, 'edd', 1, w1::text || '/x/a.pdf'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a token is long enough not to be guessed', ok);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select * into r from public.open_form_link('Fresh0000000001');
  res := res || jsonb_build_object('a member opens a fresh link: the form and its version', r.app_id = 'edd' and r.version = 2 and r.path like w1::text || '/%' and not r.expired);
  select * into r from public.open_form_link('Stale0000000001');
  res := res || jsonb_build_object('an expired link says so and gives no file', r.expired and r.path is null);
  begin perform count(*) from public.form_links; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('the app can''t read the links table', ok);
  begin insert into public.form_links (token, workspace_id, app_id, version, path) values ('Typed0000000001', w1, 'edd', 1, w1::text || '/x/a.pdf'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor write one', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform * from public.open_form_link('Fresh0000000001'); ok := false; exception when no_data_found then ok := true; end;
  res := res || jsonb_build_object('someone outside the workspace gets nothing, as for a token that doesn''t exist', ok);
  begin perform * from public.open_form_link('Nothing00000001'); ok := false; exception when no_data_found then ok := true; end;
  res := res || jsonb_build_object('a made-up token gets nothing', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  update public.form_links set expires_at = now() - interval '40 days' where token = 'Stale0000000001';
  res := res || jsonb_build_object('the sweep clears links long expired, and keeps fresh ones', public.form_links_sweep() = 1 and exists (select 1 from public.form_links where token = 'Fresh0000000001'));
  delete from public.workspaces where id = w1;
  res := res || jsonb_build_object('a deleted workspace takes its links with it', not exists (select 1 from public.form_links where workspace_id = w1));
  raise exception 'TEST_RESULTS %', res;
end $test$;
