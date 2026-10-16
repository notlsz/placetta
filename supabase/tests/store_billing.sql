-- Store billing: what billing charges for comes from store_billing, which a member's edit to the workspace can't
-- lower; the webhook's helpers are atomic and ignore old subscription events. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); w uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; b public.billing; applied boolean;
  inst uuid := '00000000-0000-0000-0000-000000000000';
  st jsonb := '{"business":{"en":"Milk tea shop","zh":"奶茶店"},"stores":[{"id":"s1","name":{"en":"Main St"},"stage":"opening"},{"id":"s2","name":{"en":"Mall"},"stage":"open","kind":"retail"}]}';
  op boolean; k text;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@sb.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@sb.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (m, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values (w, 'SB', now(), a, a, st);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, m, 'member');
  insert into public.billing (workspace_id) values (w);

  select opening, kind into op, k from public.store_billing where workspace_id = w and store_id = 's1';
  res := res || jsonb_build_object('a new workspace''s stores are copied', (select count(*) from public.store_billing where workspace_id = w) = 2,
    'a store without a kind takes it from what the business sells', op and k = 'food');

  -- A member marks the opening store open and calls it retail, and adds a store: the opening fee still applies.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  update public.workspaces set state = jsonb_set(state, '{stores}',
    '[{"id":"s1","name":{"en":"Main St"},"stage":"open","kind":"retail"},{"id":"s2","name":{"en":"Mall"},"stage":"open","kind":"retail"},{"id":"s3","name":{"en":"Pier"},"stage":"opening","kind":"retail"}]')
   where id = w;
  begin perform 1 from public.store_billing; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('members cannot read store_billing', ok);
  begin insert into public.store_billing (workspace_id, store_id, kind, opening) values (w, 'x', 'retail', false); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('members cannot write store_billing', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  select opening, kind into op, k from public.store_billing where workspace_id = w and store_id = 's1';
  res := res || jsonb_build_object('an unpaid opening store stays opening', op,
    'and can''t drop to a cheaper kind', k = 'food',
    'a new store is counted', exists (select 1 from public.store_billing where workspace_id = w and store_id = 's3' and opening));

  -- Once its opening fee is charged, the store may become open.
  update public.billing set charged_store_ids = '{s1,s2}' where workspace_id = w;
  update public.workspaces set state = jsonb_set(state, '{stores,0,name}', '{"en":"Main Street"}') where id = w;
  res := res || jsonb_build_object('a charged store moves to open', not (select opening from public.store_billing where workspace_id = w and store_id = 's1'));
  -- open back to opening always counts
  update public.workspaces set state = jsonb_set(state, '{stores,1,stage}', '"opening"') where id = w;
  res := res || jsonb_build_object('open to opening is taken', (select opening from public.store_billing where workspace_id = w and store_id = 's2'));

  -- Removing a store marks it removed; adding it back revives it.
  update public.workspaces set state = jsonb_set(state, '{stores}', (state->'stores') - 2) where id = w;
  res := res || jsonb_build_object('a removed store is not counted', (select count(*) from public.store_billing where workspace_id = w and removed_at is null) = 2);
  update public.workspaces set state = jsonb_set(state, '{stores}', (state->'stores') || '[{"id":"s3","stage":"open","kind":"retail"}]') where id = w;
  res := res || jsonb_build_object('a store added back is counted again, still opening', (select removed_at is null and opening from public.store_billing where workspace_id = w and store_id = 's3'));
  update public.workspaces set state = jsonb_set(state, '{stores}', '"not a list"') where id = w;
  res := res || jsonb_build_object('a broken list removes nothing it shouldn''t and doesn''t fail', (select count(*) from public.store_billing where workspace_id = w and removed_at is null) = 0);

  -- The webhook's helpers.
  update public.billing set checkout_store_ids = '{s3}', charged_store_ids = '{s1}' where workspace_id = w;
  perform public.billing_checkout_completed(w, 'cus_1', 2, true, true);
  perform public.billing_checkout_completed(w, 'cus_2', 1, false, false);
  select * into b from public.billing where workspace_id = w;
  res := res || jsonb_build_object('entry markets add up', b.entry_markets = 3,
    'the first customer id stays', b.stripe_customer_id = 'cus_1',
    'charged stores are added to, not replaced', b.charged_store_ids = '{s1,s3}',
    'the entry credit is recorded', b.entry_credited_at is not null);
  applied := public.billing_subscription_apply(w, '2026-10-16 10:00+00', 'cus_1', 'sub_1', 'active', 'locations', null, 3);
  res := res || jsonb_build_object('a subscription event applies', applied);
  applied := public.billing_subscription_apply(w, '2026-10-16 09:00+00', 'cus_1', 'sub_1', 'canceled', 'locations', null, 0);
  select * into b from public.billing where workspace_id = w;
  res := res || jsonb_build_object('an older one is ignored', not applied and b.subscription_status = 'active' and b.paid_locations = 3);
  applied := public.billing_subscription_apply(w, '2026-10-16 11:00+00', 'cus_1', 'sub_1', 'past_due', 'locations', null, 0);
  res := res || jsonb_build_object('a newer one applies', applied and (select subscription_status from public.billing where workspace_id = w) = 'past_due');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.billing_checkout_completed(w, 'cus_x', 5, false, false); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('owners cannot call the webhook helpers', ok);
  begin perform public.store_billing_apply(w, '{}'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor rewrite store billing', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
