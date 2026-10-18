-- Team review (migration 20261018120000_team_review): comments, assignments, mention notices and headquarters' review
-- table, as each kind of user. Above all: a franchisee never sees another franchisee's rows, and headquarters sees only
-- what hq_summary already allows. Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); b1 uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  h2 uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  wa uuid := gen_random_uuid(); wb uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; n int; j jsonb; t text; c1 uuid; c2 uuid; cshared uuid; cb uuid; lid uuid; msg text;
  inst uuid := '00000000-0000-0000-0000-000000000000';
  sta jsonb := jsonb_build_object(
    'stores', jsonb_build_array(
      jsonb_build_object('id', 'flushing', 'name', jsonb_build_object('en', 'Flushing, Main St', 'zh', '法拉盛店'), 'stage', 'open', 'address', 'Main St, Flushing, NY',
        'permits', jsonb_build_array(jsonb_build_object('name', jsonb_build_object('en', 'Food Service Establishment permit', 'zh', '餐饮许可'), 'expires', (current_date + 40)::text)),
        'certs', jsonb_build_array(jsonb_build_object('id', 'c1', 'person', 'Wen Secretname', 'kind', jsonb_build_object('en', 'Food Protection Certificate', 'zh', '食品保护证书'), 'expires', (current_date - 3)::text)),
        'apps', jsonb_build_array('a-sign')),
      jsonb_build_object('id', 'sanjose', 'name', jsonb_build_object('en', 'San Jose, First St', 'zh', '圣何塞店'), 'stage', 'opening', 'address', '100 N First St, San Jose, CA 95113',
        'plannedOpen', (current_date + 150)::text, 'apps', jsonb_build_array('a-fse'))),
    'apps', jsonb_build_array(
      jsonb_build_object('id', 'a-fse', 'name', jsonb_build_object('en', 'Health permit', 'zh', '卫生许可'), 'level', 'county', 'status', 'draft', 'official', 'scc-health-permit',
        'fields', jsonb_build_array(jsonb_build_object('id', 'f1', 'label', jsonb_build_object('en', 'EIN', 'zh', 'EIN'), 'value', 'SECRET-FIELD-123')),
        'checklist', jsonb_build_array(jsonb_build_object('id', 'lease', 'label', jsonb_build_object('en', 'Lease', 'zh', '租约'), 'state', 'missing'))),
      jsonb_build_object('id', 'a-sign', 'name', jsonb_build_object('en', 'Sign permit', 'zh', '招牌许可'), 'level', 'city', 'status', 'approved', 'checklist', '[]'::jsonb),
      jsonb_build_object('id', 'a-ein', 'name', jsonb_build_object('en', 'EIN', 'zh', 'EIN'), 'level', 'federal', 'status', 'approved', 'checklist', '[]'::jsonb)),
    'deadlines', jsonb_build_array(
      jsonb_build_object('id', 'd1', 'date', (current_date + 10)::text, 'kind', 'due', 'title', jsonb_build_object('en', 'File the health permit', 'zh', '提交卫生许可'), 'app', 'a-fse'),
      jsonb_build_object('id', 'd2', 'date', (current_date + 30)::text, 'kind', 'renewal', 'title', jsonb_build_object('en', 'Renew the sign permit', 'zh', '续办招牌许可'), 'app', 'a-sign')),
    'docs', jsonb_build_array(jsonb_build_object('id', 'd-lease', 'name', 'lease.pdf')),
    'jobs', jsonb_build_array(jsonb_build_object('id', 'job-1', 'title', jsonb_build_object('en', 'Get Flushing ready', 'zh', '让法拉盛店准备好'))));
  stb jsonb := jsonb_build_object(
    'stores', jsonb_build_array(jsonb_build_object('id', 'austin', 'name', jsonb_build_object('en', 'Austin, Congress Ave', 'zh', '奥斯汀店'), 'stage', 'opening', 'address', 'Congress Ave, Austin, TX')),
    'apps', jsonb_build_array(jsonb_build_object('id', 'b-pto', 'name', jsonb_build_object('en', 'Food establishment permit', 'zh', '食品经营许可'), 'level', 'city', 'status', 'needs', 'checklist', '[]'::jsonb)));
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a1, 'authenticated', 'authenticated', 'owner-a@r.test', now(), now(), now(), '{}', '{}'),
    (inst, a2, 'authenticated', 'authenticated', 'member-a@r.test', now(), now(), now(), '{}', '{}'),
    (inst, b1, 'authenticated', 'authenticated', 'owner-b@r.test', now(), now(), now(), '{}', '{}'),
    (inst, h, 'authenticated', 'authenticated', 'HQ@Brand.test', now(), now(), now(), '{}', '{}'),
    (inst, h2, 'authenticated', 'authenticated', 'hq2@brand.test', now(), now(), now(), '{}', '{}'),
    (inst, s, 'authenticated', 'authenticated', 'stranger@r.test', now(), now(), now(), '{}', '{}');
  -- hq2 signed in with a provider that doesn't prove the email: never headquarters
  insert into auth.identities (user_id, provider) values (a1, 'email'), (a2, 'email'), (b1, 'email'), (h, 'email'), (h2, 'azure'), (s, 'email');
  insert into public.workspaces (id, name, state, authorized_at, authorized_by, created_by) values (wa, 'Franchisee A', sta, now(), a1, a1), (wb, 'Franchisee B', stb, now(), b1, b1);
  insert into public.workspace_members (workspace_id, user_id, role) values (wa, a1, 'owner'), (wa, a2, 'member'), (wb, b1, 'owner');
  insert into public.hq_links (workspace_id, hq_email, brand, created_by) values (wa, 'hq@brand.test', 'Brand', a1), (wb, 'hq@brand.test', 'Brand', b1), (wa, 'hq2@brand.test', 'Brand', a1);
  -- the team submitted the health permit: headquarters sees it as in review, as the app does
  alter table public.filings disable trigger filings_guard;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by, status) values (wa, 'a-fse', '{"en":"Health permit","zh":"卫生许可"}', '{}', a1, 'submitted');
  alter table public.filings enable trigger filings_guard;

  execute 'set local role authenticated';

  /* ---------------- franchisee A's owner ---------------- */
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.comment_post(wa, 'app', 'a-fse', 'Who has the lease? @member-a', jsonb_build_array(jsonb_build_object('kind', 'member', 'user_id', a2)));
  c1 := (j->>'id')::uuid;
  res := res || jsonb_build_object('a member comments on a permit and mentions a teammate',
    c1 is not null and not (j->>'odelia')::boolean and not (j->>'shared_hq')::boolean and j->'mentions' = jsonb_build_array(jsonb_build_object('kind', 'member', 'user_id', a2)));
  j := public.comment_post(wa, 'app', 'a-fse', '@Odelia prepare this and tell me what is missing', '[{"kind": "odelia"}]');
  c2 := (j->>'id')::uuid;
  res := res || jsonb_build_object('@Odelia on a permit, by a member, starts her', (j->>'odelia')::boolean and (j->>'asked_odelia')::boolean);
  j := public.comment_post(wa, 'job', 'job-1', '@Odelia keep going', '[{"kind": "odelia"}]');
  res := res || jsonb_build_object('@Odelia only starts work from a permit', not (j->>'odelia')::boolean and j->'mentions' = '[]'::jsonb);
  j := public.comment_post(wa, 'doc', 'd-lease', 'This lease is the signed one.');
  res := res || jsonb_build_object('comments go on documents too', j->>'item_kind' = 'doc');
  begin perform public.comment_post(wa, 'app', 'no-such-app', 'x'); ok := false; exception when others then ok := sqlerrm like '%gone%'; end;
  res := res || jsonb_build_object('a comment on an item that isn''t there is refused', ok);
  begin perform public.comment_post(wa, 'app', 'a-fse', '   '); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an empty comment is refused', ok);
  begin perform public.comment_post(wa, 'app', 'a-fse', 'hi', jsonb_build_array(jsonb_build_object('kind', 'member', 'user_id', b1))); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('mentioning someone from another franchisee is refused', ok);
  begin perform public.comment_post(wa, 'doc', 'd-lease', 'hq look', '[{"kind": "hq", "email": "hq@brand.test"}]'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('headquarters can''t be mentioned on a document (it never sees documents)', ok);
  begin perform public.comment_post(wa, 'app', 'a-fse', 'hq look', '[{"kind": "hq", "email": "boss@elsewhere.test"}]'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('only a headquarters email the workspace shares with can be mentioned', ok);
  j := public.comment_post(wa, 'app', 'a-sign', 'Renewal is on us this year @HQ', '[{"kind": "hq", "email": "HQ@brand.test"}]');
  cshared := (j->>'id')::uuid;
  res := res || jsonb_build_object('mentioning headquarters shares the comment with it', (j->>'shared_hq')::boolean and not (j->>'from_hq')::boolean);
  j := public.assign_item(wa, 'app', 'a-fse', a2);
  res := res || jsonb_build_object('an owner assigns a permit to a teammate', j->>'assignee' = a2::text);
  perform public.assign_item(wa, 'job', 'job-1', a1);
  begin perform public.assign_item(wa, 'app', 'a-fse', b1); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('assigning someone from another franchisee is refused', ok);
  begin perform public.assign_item(wa, 'doc', 'd-lease', a2); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('only applications and jobs are assigned', ok);
  res := res || jsonb_build_object('the owner reads every comment in the workspace', (select count(*) from public.comments) = 5,
    'the owner reads the assignments', (select count(*) from public.assignments) = 2,
    'the owner''s own mention isn''t a notice to them', (select count(*) from public.mention_notices) = 0);
  begin insert into public.comments (workspace_id, item_kind, item_id, body) values (wa, 'app', 'a-fse', 'direct'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nobody writes comments directly', ok);
  begin update public.comments set body = 'edited' where id = c1; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nobody edits comments directly', ok);
  begin insert into public.assignments (workspace_id, item_kind, item_id, assignee) values (wa, 'app', 'a-sign', a1); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nobody writes assignments directly', ok);
  begin update public.mention_notices set read_at = now(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nobody writes notices directly', ok);

  /* ---------------- franchisee A's member ---------------- */
  perform set_config('request.jwt.claims', json_build_object('sub', a2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('the teammate reads the workspace''s comments', (select count(*) from public.comments) = 5,
    'the teammate gets the mention and the assignment as notices', (select count(*) from public.mention_notices where kind in ('mention', 'assigned')) = 2
      and (select title->>'en' from public.mention_notices where kind = 'mention') = 'owner-a@r.test mentioned you: Health permit');
  n := public.notices_read(array(select id from public.mention_notices));
  res := res || jsonb_build_object('notices_read marks them read', n = 2 and not exists (select 1 from public.mention_notices where read_at is null));
  j := public.comment_resolve(c1, true);
  res := res || jsonb_build_object('a member resolves a comment', j->>'resolved_at' is not null and j->>'resolved_by' = a2::text);
  j := public.comment_resolve(c1, false);
  res := res || jsonb_build_object('and reopens it', j->>'resolved_at' is null);
  perform public.comment_resolve(c1, true);

  /* ---------------- franchisee B: never sees A ---------------- */
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.comment_post(wb, 'app', 'b-pto', 'Our own note');
  cb := (j->>'id')::uuid;
  res := res || jsonb_build_object('franchisee B reads only its own comments', (select count(*) from public.comments) = 1 and (select id from public.comments) = cb,
    'franchisee B reads none of A''s assignments', (select count(*) from public.assignments) = 0,
    'franchisee B reads none of A''s notices', (select count(*) from public.mention_notices) = 0,
    'franchisee B gets no review table', (select count(*) from public.hq_review()) = 0);
  begin perform public.comment_post(wa, 'app', 'a-fse', 'peek'); ok := false; exception when others then ok := sqlerrm like '%Not your workspace%'; end;
  res := res || jsonb_build_object('franchisee B can''t comment in A', ok);
  begin perform public.comment_resolve(c2, true); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('franchisee B can''t resolve A''s comments', ok);
  begin perform public.assign_item(wa, 'app', 'a-fse', b1); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('franchisee B can''t assign in A', ok);
  begin perform * from public.hq_comments(wa, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('franchisee B can''t read A''s shared thread', ok);
  begin perform public.hq_remind(wa, '["a-fse"]', current_date + 3); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('franchisee B can''t set reminders on A', ok);
  begin perform public.hq_ask(jsonb_build_array(jsonb_build_object('workspace_id', wa, 'app_id', 'a-fse')), 'hi'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('franchisee B can''t ask about A''s permits', ok);
  n := public.notices_read(array(select id from public.mention_notices));
  res := res || jsonb_build_object('franchisee B can''t mark A''s notices read', n = 0);

  /* ---------------- headquarters ---------------- */
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('headquarters reads nothing from the tables directly', (select count(*) from public.comments) = 0 and (select count(*) from public.assignments) = 0);
  select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb) into j from public.hq_review() r;
  t := j::text;
  res := res || jsonb_build_object('the review table covers both franchisees', jsonb_array_length(j) = 2,
    'stores as rows, with the business''s own registrations as a whole-business row',
      (select string_agg(x->>'id', ',' order by ord) from jsonb_array_elements(j->0->'stores') with ordinality x(x, ord)) = 'flushing,sanjose,_business',
    'the team''s filing sets the status headquarters sees', (j->0->'stores'->1->'apps'->0->>'status') = 'review',
    'a missing document shows as a status', (j->0->'stores'->1->'apps'->0->>'missing')::boolean,
    'the next date and the renewal come through', (j->0->'stores'->1->'apps'->0->>'due') = (current_date + 10)::text and (j->0->'stores'->0->'apps'->0->>'renews') = (current_date + 30)::text,
    'shared open comments are counted per permit', (j->0->'stores'->0->'apps'->0->>'comments')::int = 1 and (j->0->'stores'->1->'apps'->0->>'comments')::int = 0,
    'permits on file and certificates come with their expiry', (j->0->'stores'->0->'permits'->0->>'expires') = (current_date + 40)::text and (j->0->'stores'->0->'certs'->0->>'expires') = (current_date - 3)::text,
    'never who holds a certificate', position('Secretname' in t) = 0,
    'never a form line', position('SECRET-FIELD-123' in t) = 0,
    'never a document', position('lease.pdf' in t) = 0,
    'never a comment''s words', position('Who has the lease' in t) = 0);
  select count(*) into n from public.hq_comments(wa, null);
  res := res || jsonb_build_object('headquarters reads only the thread shared with it', n = 1);
  select count(*) into n from public.hq_comments(wa, null) x where x.author is null and not x.from_hq and x.mentions_hq;
  res := res || jsonb_build_object('without who on the franchisee''s team wrote it', n = 1);
  j := public.comment_post(wa, 'app', 'a-fse', 'When will this be filed? @Odelia do it', '[{"kind": "odelia"}]');
  res := res || jsonb_build_object('headquarters comments on a permit, in the shared thread', (j->>'from_hq')::boolean and (j->>'shared_hq')::boolean,
    'headquarters can''t start Odelia in a franchisee''s workspace', not (j->>'odelia')::boolean and not (j->>'asked_odelia')::boolean);
  begin perform public.comment_post(wa, 'doc', 'd-lease', 'show me'); ok := false; exception when others then ok := sqlerrm like '%permits only%'; end;
  res := res || jsonb_build_object('headquarters can''t comment on a document', ok);
  begin perform public.comment_post(wa, 'job', 'job-1', 'show me'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('headquarters can''t comment on a job', ok);
  begin perform public.comment_post(wa, 'app', 'a-fse', 'hi', jsonb_build_array(jsonb_build_object('kind', 'member', 'user_id', a2))); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('headquarters can''t mention the franchisee''s staff by name', ok);
  begin perform public.assign_item(wa, 'app', 'a-fse', a2); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('headquarters can''t assign the franchisee''s work', ok);
  res := res || jsonb_build_object('headquarters reads the mention as its own notice', (select count(*) from public.mention_notices where email = 'hq@brand.test' and kind = 'mention') = 1
      and (select title->>'en' from public.mention_notices where kind = 'mention') = 'Franchisee A mentioned you: Sign permit');
  n := public.hq_ask(jsonb_build_array(jsonb_build_object('workspace_id', wa, 'app_id', 'a-fse'), jsonb_build_object('workspace_id', wa, 'app_id', 'a-sign'), jsonb_build_object('workspace_id', wb, 'app_id', 'b-pto')), 'Please have Odelia prepare these.');
  res := res || jsonb_build_object('headquarters asks about three permits at once', n = 3);
  n := public.hq_remind(wa, '["a-fse"]', current_date + 7, 'Check the lease');
  res := res || jsonb_build_object('headquarters sets itself a reminder', n = 1 and (select remind_on from public.mention_notices where kind = 'reminder') = current_date + 7);
  begin perform public.hq_remind(wa, '["a-fse"]', current_date - 1); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a reminder in the past is refused', ok);
  j := public.comment_resolve(cshared, true);
  res := res || jsonb_build_object('headquarters resolves a comment in the shared thread', j->>'resolved_at' is not null);
  begin perform public.comment_resolve(c1, false); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('headquarters can''t touch a comment that wasn''t shared', ok);

  /* ---------------- back to A: what headquarters did ---------------- */
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('the owner is told headquarters commented', (select count(*) from public.mention_notices where kind = 'hq' and title->>'en' = 'Headquarters commented: Health permit') = 1,
    'one notice for the whole bulk question', (select count(*) from public.mention_notices where kind = 'hq' and title->>'en' = 'Headquarters asked about 2 permits') = 1,
    'the owner never reads headquarters'' reminders', (select count(*) from public.mention_notices where kind = 'reminder') = 0,
    'the owner reads headquarters'' comments', (select count(*) from public.comments where from_hq) = 3);

  /* ---------------- headquarters with an unproven email, and a stranger ---------------- */
  perform set_config('request.jwt.claims', json_build_object('sub', h2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform * from public.hq_comments(wa, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an email that isn''t proven is never headquarters', ok and (select count(*) from public.hq_review()) = 0);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.comment_post(wa, 'app', 'a-fse', 'hello'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a stranger sees and writes nothing', ok and (select count(*) from public.comments) = 0 and (select count(*) from public.mention_notices) = 0
    and (select count(*) from public.assignments) = 0 and (select count(*) from public.hq_review()) = 0);
  execute 'reset role';

  /* ---------------- two-step, leaving, revoking ---------------- */
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values (gen_random_uuid(), a2, 'test', 'totp', 'verified', now(), now());
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('two-step holds for comments, assignments and notices',
    (select count(*) from public.comments) = 0 and (select count(*) from public.assignments) = 0 and (select count(*) from public.mention_notices) = 0);
  perform set_config('request.jwt.claims', json_build_object('sub', a2, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('with the code, they''re back', (select count(*) from public.comments) > 0);
  execute 'reset role';
  delete from public.workspace_members where workspace_id = wa and user_id = a2;
  res := res || jsonb_build_object('leaving a workspace drops your assignments there', not exists (select 1 from public.assignments where assignee = a2));
  update public.hq_links set revoked_at = now() where workspace_id = wa and hq_email = 'hq@brand.test';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', h, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform * from public.hq_comments(wa, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('when the owner stops sharing, headquarters loses the thread and the rows', ok
    and (select count(*) from public.hq_review()) = 1 and (select count(*) from public.mention_notices where workspace_id = wa) = 0);
  execute 'reset role';

  /* ---------------- the audit trail and grants ---------------- */
  res := res || jsonb_build_object('every comment is in the audit trail', (select count(*) from public.audit_log where workspace_id = wa and action->>'en' in ('Commented', 'Commented and asked Odelia', 'Headquarters commented')) = 8,
    'resolving and reopening are in the audit trail', (select count(*) from public.audit_log where workspace_id = wa and action->>'en' in ('Resolved a comment', 'Reopened a comment')) = 4,
    'every assignment is in the audit trail', (select count(*) from public.audit_log where workspace_id = wa and action->>'en' = 'Assigned') = 2,
    'the audit row names the item and the words', exists (select 1 from public.audit_log where workspace_id = wa and action->>'en' = 'Commented' and object->>'en' = 'Health permit' and detail->>'en' = 'Who has the lease? @member-a'));
  res := res || jsonb_build_object('visitors can''t call any of it', not has_function_privilege('anon', 'public.comment_post(uuid, text, text, text, jsonb, boolean)', 'execute')
      and not has_function_privilege('anon', 'public.hq_review()', 'execute') and not has_function_privilege('anon', 'public.assign_item(uuid, text, text, uuid)', 'execute'),
    'the helpers aren''t callable from the app', not has_function_privilege('authenticated', 'public.notice_add(uuid, text, uuid, uuid, text, text, text, jsonb, jsonb, date)', 'execute')
      and not has_function_privilege('authenticated', 'public.hq_review_of(uuid, jsonb)', 'execute') and not has_function_privilege('authenticated', 'public.item_title(uuid, text, text)', 'execute'),
    'visitors read none of the tables', not has_table_privilege('anon', 'public.comments', 'select') and not has_table_privilege('anon', 'public.mention_notices', 'select')
      and not has_table_privilege('anon', 'public.assignments', 'select'));

  raise exception 'TEST_RESULTS %', res;
end $test$;
