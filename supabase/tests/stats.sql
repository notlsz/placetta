-- filing_stats: aggregates only, 3 or more decided filings. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid(); res jsonb := '{}'::jsonb; r record; ok boolean;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (inst, a, 'authenticated', 'authenticated', 's@t.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'S', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner');
  alter table public.filings disable trigger filings_guard;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by, status, requirements_checked, submitted_at, decided_at) values
    (w, 'a1', '{"en":"x","zh":"x"}', '{"official":"irs-ss4"}', a, 'accepted', true, now() - interval '20 days', now() - interval '16 days'),
    (w, 'a2', '{"en":"x","zh":"x"}', '{"official":"irs-ss4"}', a, 'accepted', true, now() - interval '20 days', now() - interval '14 days'),
    (w, 'a3', '{"en":"x","zh":"x"}', '{"official":"irs-ss4"}', a, 'rejected', true, now() - interval '20 days', now() - interval '10 days'),
    (w, 'b1', '{"en":"x","zh":"x"}', '{"official":"ca-llc1"}', a, 'accepted', true, now() - interval '5 days', now()),
    (w, 'b2', '{"en":"x","zh":"x"}', '{"official":"ca-llc1"}', a, 'accepted', true, now() - interval '5 days', now());
  alter table public.filings enable trigger filings_guard;
  insert into public.billing (workspace_id) values (w) on conflict do nothing;
  res := res || jsonb_build_object('stores charged start empty', (select charged_store_ids = '{}' from public.billing where workspace_id = w));

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select * into r from public.filing_stats() where form = 'irs-ss4';
  res := res || jsonb_build_object('stats for a form with 3 filings', r.n = 3 and r.median_days = 6 and r.p90_days >= 9 and r.rejected_pct = 33,
    'forms with fewer than 3 are hidden', not exists (select 1 from public.filing_stats() where form = 'ca-llc1'));
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform public.filing_stats(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anonymous visitors cannot read stats', ok);
  execute 'reset role';
  raise exception 'TEST_RESULTS %', res;
end $test$;
