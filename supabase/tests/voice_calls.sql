-- Voice (migration 20261030120000_voice_calls): calls are read only by their own workspace, phone calls on the timeline,
-- numbers the team adds only from government pages, the caps tied to the AI allowance, pricing into ai_events once,
-- retention clearing transcripts and recordings, and the migration run twice. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); z uuid := gen_random_uuid(); s uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); w3 uuid := gen_random_uuid();
  f uuid; c uuid; c2 uuid; old uuid; g jsonb; n int; ok boolean; j jsonb;
  inst uuid := '00000000-0000-0000-0000-000000000000';
  res jsonb := '{}'::jsonb;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@voice.test', now(), now(), now(), '{}', '{}'),
    (inst, z, 'authenticated', 'authenticated', 'other@voice.test', now(), now(), now(), '{}', '{}'),
    (inst, v, 'authenticated', 'authenticated', 'viewer@voice.test', now(), now(), now(), '{}', '{}'),
    (inst, s, 'authenticated', 'authenticated', 'staff@voice.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (z, 'email'), (v, 'email'), (s, 'email');
  insert into public.staff_emails (email) values ('staff@voice.test') on conflict do nothing;
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w, 'Lucky Leaf Tea', now(), a, a, '{}'), (w2, 'Other', now(), z, z, '{}'), (w3, 'No plan', now(), a, a, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, v, 'viewer'), (w2, z, 'owner'), (w3, a, 'owner');
  insert into public.billing (workspace_id, subscription_status, subscription_plan, paid_locations, price_model) values (w, 'active', 'locations', 1, 'simple'), (w2, 'active', 'locations', 1, 'simple');
  insert into public.filings (workspace_id, app_id, title, payload, approved_by, status, confirmation_number)
    values (w, 'app-cdtfa', '{"en":"Seller''s permit","zh":"销售许可证"}', '{"official":"ca-cdtfa"}', a, 'submitted', '0-123-456') returning id into f;

  -- a call and its timeline event
  insert into public.voice_calls (workspace_id, user_id, filing_id, kind, direction, brain, agency_key, number, lang, status, consent, recording_path, transcript, summary)
    values (w, a, f, 'agency_phone', 'out', 'openai', 'cdtfa', '+18004007115', 'en', 'live', 'announced', w || '/' || gen_random_uuid() || '.wav',
            '[{"who":"agency","at":2,"text":"It is in review."}]', '{"en":"In review","zh":"审核中"}') returning id into c;
  begin
    insert into public.filing_events (workspace_id, filing_id, kind, status, title, source, confidence, dedupe, call_id)
    values (w, f, 'agency', 'in review', '{"en":"CDTFA said by phone: in review","zh":"电话答复：审核中"}', 'phone_call', 0.8, 'call:' || c, c);
    ok := true;
  exception when others then ok := false; end;
  res := res || jsonb_build_object('the timeline takes a phone call, linked to its call', ok);
  begin insert into public.filing_events (workspace_id, filing_id, kind, title, source) values (w, f, 'agency', '{"en":"x"}', 'voicemail'); ok := false;
  exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a source not built is still refused', ok);
  begin insert into public.voice_calls (workspace_id, kind, brain, recording_path) values (w, 'app_talk', 'openai', 'elsewhere/../x.wav'); ok := false;
  exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a recording path is only ever <workspace>/<call>.wav', ok);
  begin insert into public.voice_calls (workspace_id, kind, brain, number) values (w, 'agency_phone', 'openai', '555-0100'); ok := false;
  exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a number is E.164', ok);

  -- tenancy: the owner reads it, with the timeline; another workspace's owner and anon see nothing
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.voice_calls where id = c;
  res := res || jsonb_build_object('the workspace reads its call', n = 1);
  j := public.filing_timeline(f);
  res := res || jsonb_build_object('the timeline shows the call and links it', exists (select 1 from jsonb_array_elements(j->'events') e where e->>'source' = 'phone_call' and (e->>'call_id')::uuid = c));
  begin update public.voice_calls set summary = '{"en":"changed"}' where id = c; get diagnostics n = row_count; ok := n = 0;
  exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a member can''t rewrite a call', ok);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.voice_calls where id = c;
  res := res || jsonb_build_object('a viewer can listen back', n = 1);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', z, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.voice_calls where workspace_id = w;
  res := res || jsonb_build_object('another workspace sees none of its calls', n = 0);
  begin perform public.filing_timeline(f); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor its timeline', ok);
  begin perform public.agency_phone_add('cdtfa', '+18004007115', 'https://www.cdtfa.ca.gov/contact.htm'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('only the team adds an agency number', ok);
  begin perform public.voice_gate(w2, z, 'app_talk', null, 0.05); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a person can''t call the gate', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin select count(*) into n from public.voice_calls; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anon reads no calls', ok);
  execute 'reset role';
  res := res || jsonb_build_object('the recordings bucket is private', exists (select 1 from storage.buckets where id = 'call-recordings' and not public));

  -- numbers the team verified: government pages only
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin perform public.agency_phone_add('sf-dph', '+14152520000', 'https://www.sf.gov/departments/public-health'); ok := true; exception when others then ok := false; end;
  res := res || jsonb_build_object('the team adds a number from a .gov page', ok);
  begin perform public.agency_phone_add('fake', '+14155550100', 'https://permits-help.example.com/contact'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('but not from any other site', ok);
  begin perform public.agency_phone_add('fake', '+14155550100', 'https://evil.com/x.gov'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('nor a .gov hidden in a path', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- the gate: a plan, the allowance, voice's half, the rate limits
  g := public.voice_gate(w3, a, 'app_talk', null, 0.05);
  res := res || jsonb_build_object('no plan, no voice', g->>'code' = 'plan_required');
  g := public.voice_gate(w, a, 'app_talk', null, 0.035);
  res := res || jsonb_build_object('a store plan may talk, 20 minutes a session at most', (g->>'ok')::boolean and (g->>'max_minutes')::int = 20);
  g := public.voice_gate(w, a, 'agency_phone', f, 0.093);
  res := res || jsonb_build_object('an agency call, 30 minutes at most', (g->>'ok')::boolean and (g->>'max_minutes')::int = 30);
  insert into public.voice_calls (workspace_id, filing_id, kind, brain, status, started_at) values (w, f, 'agency_phone', 'openai', 'ended', now() - interval '1 hour'), (w, f, 'agency_phone', 'openai', 'ended', now() - interval '90 minutes');
  g := public.voice_gate(w, a, 'agency_phone', f, 0.093);
  res := res || jsonb_build_object('two agency calls a filing a day', g->>'code' = 'rate_limited');
  update public.voice_calls set status = 'live' where workspace_id = w and kind = 'agency_phone';
  g := public.voice_gate(w, a, 'app_talk', null, 0.035);
  res := res || jsonb_build_object('three calls at once at most', g->>'code' = 'rate_limited');
  update public.voice_calls set status = 'ended' where workspace_id = w;
  update public.voice_calls set cost_usd = 22 where id = c;
  g := public.voice_gate(w, a, 'app_talk', null, 0.035);
  res := res || jsonb_build_object('voice stops at half the store''s $44 allowance', g->>'code' = 'voice_budget');
  update public.voice_calls set cost_usd = 0 where id = c;

  -- pricing: once, into ai_events, so the allowance counts it
  insert into public.voice_calls (workspace_id, user_id, kind, brain, status) values (w, a, 'app_talk', 'openai_mini', 'live') returning id into c2;
  perform public.voice_finish(c2, 125, 0.105);
  perform public.voice_finish(c2, 999, 9.99);
  select count(*) into n from public.ai_events where workspace_id = w and model = 'voice:openai_mini';
  res := res || jsonb_build_object('a call is priced once, into the AI allowance', n = 1 and (select cost_usd from public.voice_calls where id = c2) = 0.105
    and (select seconds from public.voice_calls where id = c2) = 125 and (select status from public.voice_calls where id = c2) = 'ended');
  res := res || jsonb_build_object('with its vendor', (select provider from public.ai_events where workspace_id = w and model = 'voice:openai_mini') = 'openai');

  -- retention: a workspace's period clears transcripts, summaries and recordings (queued for deletion from storage)
  insert into public.voice_calls (workspace_id, kind, brain, status, started_at, recording_path, transcript, summary)
    values (w, 'owner_phone', 'openai_mini', 'ended', now() - interval '40 days', w || '/' || gen_random_uuid() || '.wav', '[{"who":"owner","at":0,"text":"hi"}]', '{"en":"x"}') returning id into old;
  insert into public.workspace_retention (workspace_id, run_days) values (w, 30);
  perform public.retention_purge();
  res := res || jsonb_build_object('past the period, the call keeps no words or recording',
    (select transcript = '[]'::jsonb and summary is null and recording_path is null from public.voice_calls where id = old));
  res := res || jsonb_build_object('its file is queued for deletion', exists (select 1 from public.voice_purge where path like w || '/%'));
  res := res || jsonb_build_object('a recent call is untouched', (select recording_path is not null and summary is not null from public.voice_calls where id = c));
  -- with no period, recordings go after a year
  insert into public.voice_calls (workspace_id, kind, brain, status, started_at, recording_path, summary)
    values (w2, 'owner_phone', 'openai_mini', 'ended', now() - interval '400 days', w2 || '/' || gen_random_uuid() || '.wav', '{"en":"kept"}') returning id into old;
  perform public.purge_expired();
  res := res || jsonb_build_object('no period: the recording goes after 365 days, the summary stays',
    (select recording_path is null and summary->>'en' = 'kept' from public.voice_calls where id = old));

  -- the migration runs twice
  begin
    create table if not exists public.voice_calls (id uuid primary key);
    alter table public.filing_events add column if not exists call_id uuid references public.voice_calls(id) on delete set null;
    alter table public.filing_events drop constraint if exists filing_events_source_check;
    alter table public.filing_events add constraint filing_events_source_check
      check (source in ('team', 'owner', 'placetta', 'open_data', 'agency_page', 'odelia', 'phone_call'));
    insert into storage.buckets (id, name, public, file_size_limit) values ('call-recordings', 'call-recordings', false, 104857600) on conflict (id) do update set public = false;
    create table if not exists public.agency_phone_numbers (agency_key text);
    ok := (select count(*) from public.voice_calls where id = c) = 1 and exists (select 1 from public.filing_events where call_id = c)
      and exists (select 1 from public.agency_phone_numbers where agency_key = 'sf-dph');
  exception when others then ok := false; end;
  res := res || jsonb_build_object('running it twice keeps every call, event and number', ok);
  delete from public.workspaces where id = w2;
  res := res || jsonb_build_object('a deleted workspace leaves no calls', not exists (select 1 from public.voice_calls where workspace_id = w2));
  raise exception 'TEST_RESULTS %', res;
end $test$;
