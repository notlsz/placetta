-- The payments switch: with payments off everything is open; with them on, plans apply. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); res jsonb := '{}'::jsonb; ok boolean;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (inst, a, 'authenticated', 'authenticated', 'pay@t.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'P', now(), a, a), (w2, 'Q', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w2, a, 'owner');
  insert into public.billing (workspace_id) values (w);
  insert into public.billing (workspace_id, comped) values (w2, true);

  res := res || jsonb_build_object(
    'payments start off', not public.payments_on(),
    'off: no plan still gets the agent', public.plan_of(w) = 'monthly',
    'off: no plan can file', public.can_file(w));

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('users can read the switch', (select payments_on from public.app_settings) = false);
  begin
    update public.app_settings set payments_on = true; ok := false;
  exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('users cannot flip the switch', ok and not public.payments_on());
  execute 'reset role';

  update public.app_settings set payments_on = true;
  res := res || jsonb_build_object(
    'on: no plan is blocked', public.plan_of(w) = 'none' and not public.can_file(w),
    'on: pilot workspace keeps access', public.plan_of(w2) = 'monthly');
  update public.billing set subscription_status = 'active' where workspace_id = w;
  res := res || jsonb_build_object('on: paid workspace has access', public.plan_of(w) = 'monthly' and public.can_file(w));
  raise exception 'TEST_RESULTS %', res;
end $test$;
