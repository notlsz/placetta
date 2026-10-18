-- What Odelia did this month (20261017200000_odelia_metrics): the run clock, one workspace's numbers with their lists,
-- headquarters' and the team's views across workspaces, and who may read which. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); s uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  r1 uuid; r2 uuid; r3 uuid; r4 uuid;
  inst uuid := '00000000-0000-0000-0000-000000000000';
  res jsonb := '{}'::jsonb; m jsonb; x jsonb; ok boolean;
  mo date := date_trunc('month', current_date)::date;
  st jsonb;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@metrics.test', now(), now(), now(), '{}', '{}'),
    (inst, s, 'authenticated', 'authenticated', 'staff@metrics.test', now(), now(), now(), '{}', '{}'),
    (inst, h, 'authenticated', 'authenticated', 'hq@metrics.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (s, 'email'), (h, 'email');
  insert into public.staff_emails (email) values ('staff@metrics.test') on conflict do nothing;
  st := jsonb_build_object(
    'firstPlan', jsonb_build_object('at', now(), 'what', 'Milk tea shop', 'where', 'Flushing, NY', 'apps', 3, 'ms', 2400),
    'apps', jsonb_build_array(
      jsonb_build_object('id', 'a1', 'name', jsonb_build_object('en', 'EIN', 'zh', 'EIN'), 'status', 'ready', 'fields', jsonb_build_array(jsonb_build_object('id', 'x', 'value', 'Lucky Leaf'))),
      jsonb_build_object('id', 'a2', 'name', jsonb_build_object('en', 'Food permit', 'zh', '食品许可'), 'status', 'draft', 'fields', jsonb_build_array(jsonb_build_object('id', 'x', 'value', 'TBD'))),
      jsonb_build_object('id', 'a3', 'name', jsonb_build_object('en', 'Sign permit', 'zh', '招牌许可'), 'status', 'todo', 'fields', '[]'::jsonb)),
    'approvals', jsonb_build_array(
      jsonb_build_object('id', 'ap1', 'kind', 'file', 'title', jsonb_build_object('en', 'File the EIN', 'zh', '提交 EIN'), 'at', '2026-10-15T10:00:00.000Z'),
      jsonb_build_object('id', 'pay1', 'kind', 'pay', 'title', jsonb_build_object('en', 'Pay', 'zh', '付款'))),
    'deadlines', jsonb_build_array(
      jsonb_build_object('id', 'r1', 'kind', 'renewal', 'date', to_char(current_date + 90, 'YYYY-MM-DD'), 'title', jsonb_build_object('en', 'Renew', 'zh', '续期')),
      jsonb_build_object('id', 'r0', 'kind', 'renewal', 'date', to_char(current_date - 30, 'YYYY-MM-DD'), 'title', jsonb_build_object('en', 'Lapsed', 'zh', '已过期')),
      jsonb_build_object('id', 'd1', 'kind', 'due', 'date', to_char(current_date + 10, 'YYYY-MM-DD'), 'title', jsonb_build_object('en', 'Due', 'zh', '到期'))));
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values (w1, 'Lucky Leaf', now(), a, a, st), (w2, 'Other shop', now(), a, a, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w1, a, 'owner'), (w2, a, 'owner');

  -- 1. the run clock: the database stamps the first words and the finish, only while the run is live
  insert into public.agent_runs (workspace_id, created_by, prompt, created_at) values (w1, a, 'first', now() - interval '30 seconds') returning id into r1;
  insert into public.agent_runs (workspace_id, created_by, prompt, created_at) values (w1, a, 'second', now() - interval '20 seconds') returning id into r2;
  insert into public.agent_runs (workspace_id, created_by, prompt, created_at) values (w1, a, 'stopped', now() - interval '10 seconds') returning id into r3;
  insert into public.agent_runs (workspace_id, created_by, kind, prompt, created_at) values (w1, null, 'watch', 'Weekly check', now() - interval '5 seconds') returning id into r4;
  update public.agent_runs set steps = '[{"x":1}]'::jsonb where id = r1;
  res := res || jsonb_build_object('no words yet, no first_text_at', (select first_text_at is null and done_at is null from public.agent_runs where id = r1));
  update public.agent_runs set draft = 'Two permits' where id = r1;
  res := res || jsonb_build_object('the first draft stamps first_text_at', (select first_text_at is not null and done_at is null from public.agent_runs where id = r1));
  update public.agent_runs set first_text_at = created_at + interval '1 second', draft = 'Two permits are ready' where id = r1;   -- the test sets exact times from here
  update public.agent_runs set status = 'done', reply = '{"text":[]}'::jsonb, draft = null where id = r1;
  res := res || jsonb_build_object('done stamps done_at and keeps first_text_at', (select done_at is not null and first_text_at = created_at + interval '1 second' from public.agent_runs where id = r1));
  update public.agent_runs set done_at = created_at + interval '9 seconds' where id = r1;
  update public.agent_runs set seen_at = now() where id = r1;
  res := res || jsonb_build_object('a later save (a poll) moves neither time', (select done_at = created_at + interval '9 seconds' from public.agent_runs where id = r1));
  update public.agent_runs set status = 'done', reply = '{"text":[]}'::jsonb where id = r2;
  res := res || jsonb_build_object('an answer with no draft: first words when done', (select first_text_at = done_at from public.agent_runs where id = r2));
  update public.agent_runs set first_text_at = created_at + interval '3 seconds', done_at = created_at + interval '21 seconds' where id = r2;
  update public.agent_runs set status = 'stopped', draft = 'Hal' where id = r3;
  update public.agent_runs set first_text_at = created_at + interval '2 seconds' where id = r3;
  update public.agent_runs set status = 'done', draft = 'No changes.' where id = r4;
  res := res || jsonb_build_object('a stopped run has no done time', (select done_at is null from public.agent_runs where id = r3));

  -- 2. one workspace: the numbers and the lists behind them
  insert into public.filings (workspace_id, app_id, title, payload, status, approved_by, submitted_at, decided_at) values
    (w1, 'a1', '{"en":"EIN","zh":"EIN"}', '{"fields":[],"checklist":[]}', 'submitted', a, mo + 1, null),
    (w1, 'a2', '{"en":"Food permit","zh":"食品许可"}', '{"fields":[],"checklist":[]}', 'accepted', a, mo - 20, mo + 2),
    (w1, 'a3', '{"en":"Sign permit","zh":"招牌许可"}', '{"fields":[],"checklist":[]}', 'accepted', a, mo - 60, mo - 30);
  m := public.odelia_month_of(w1, current_date);
  res := res || jsonb_build_object('the month and the time to plan', m->>'month' = to_char(mo, 'YYYY-MM-DD') and (m->>'plan_ms')::int = 2400 and (m->>'plan_apps')::int = 3);
  res := res || jsonb_build_object('this month''s requests, not the weekly check', (m->>'runs_count')::int = 3 and jsonb_array_length(m->'runs') = 3);
  res := res || jsonb_build_object('median first words: 1, 2 and 3 s gives 2 s', (m->>'median_first_ms')::int = 2000);
  res := res || jsonb_build_object('median done: 9 and 21 s gives 15 s (the stopped run has none)', (m->>'median_done_ms')::int = 15000);
  res := res || jsonb_build_object('three permits mapped, one filled ("TBD" is blank; no lines is not filled)', jsonb_array_length(m->'mapped') = 3 and jsonb_array_length(m->'filled') = 1 and m->'filled'->0->>'id' = 'a1');
  res := res || jsonb_build_object('approvals waiting with when they were asked, payments left out', jsonb_array_length(m->'waiting') = 1 and m->'waiting'->0->>'at' = '2026-10-15T10:00:00.000Z');
  res := res || jsonb_build_object('submitted and approved this month', jsonb_array_length(m->'submitted') = 1 and jsonb_array_length(m->'approved') = 1 and m->'approved'->0->'title'->>'en' = 'Food permit');
  res := res || jsonb_build_object('renewals caught before they lapse', jsonb_array_length(m->'renewals') = 1 and m->'renewals'->0->>'id' = 'r1');
  res := res || jsonb_build_object('no hours saved: nothing documents a time per task', not (m ? 'hours_saved'));
  res := res || jsonb_build_object('an empty workspace has zeros, not guesses', (public.odelia_month_of(w2, current_date)->>'runs_count')::int = 0 and public.odelia_month_of(w2, current_date)->>'median_first_ms' is null and public.odelia_month_of(w2, current_date)->>'plan_ms' is null);

  -- 3 and 4. across workspaces: counts only, medians over every run
  x := public.odelia_month_across(array[w1, w2], current_date);
  res := res || jsonb_build_object('across: a row each, busiest first', (x->>'workspaces')::int = 2 and x->'rows'->0->>'name' = 'Lucky Leaf' and (x->'rows'->0->>'submitted')::int = 1);
  res := res || jsonb_build_object('across: totals', (x->'totals'->>'runs')::int = 3 and (x->'totals'->>'median_first_ms')::int = 2000 and (x->'totals'->>'mapped')::int = 3 and (x->'totals'->>'median_plan_ms')::int = 2400);
  res := res || jsonb_build_object('across: never a prompt or a title', x::text !~ '"(first|second|stopped)"' and x::text !~ '(Food permit|File the EIN)');

  -- who may read what
  insert into public.hq_links (workspace_id, hq_email, brand, created_by) values (w1, 'hq@metrics.test', 'Lucky', a);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('an owner reads their workspace', (public.odelia_month_detail(w1, current_date)->>'runs_count')::int = 3);
  begin perform public.odelia_month_company(current_date); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an owner cannot read the company''s numbers', ok);
  begin perform public.odelia_month_of(w1, current_date); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor call the unchecked helper', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  x := public.odelia_month_hq(current_date);
  res := res || jsonb_build_object('headquarters reads the franchisee that shared, counts only', (x->>'workspaces')::int = 1 and x->'rows'->0->>'name' = 'Lucky Leaf' and x::text !~ '"(first|second|stopped)"' and x::text !~ 'Food permit');
  begin perform public.odelia_month_detail(w1, current_date); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('headquarters cannot read the workspace itself', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  x := public.odelia_month_company(current_date);
  res := res || jsonb_build_object('the team reads every workspace', (x->>'workspaces')::int >= 2 and (x->'totals'->>'runs')::int >= 3);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.odelia_month_company(current_date); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('but only after two-step sign-in', ok);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  res := res || jsonb_build_object('the server reads it too', (public.odelia_month_detail(w1, current_date)->>'runs_count')::int = 3);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  raise exception 'TEST_RESULTS %', res;
end $test$;
