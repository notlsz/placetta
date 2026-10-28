-- Carry to approval: after a filing goes in, Odelia takes it the rest of the way with nobody touching it, the way
-- Devin and Town keep going until a task is done and Instinct follows up before anyone asks. What already existed and
-- is reused: the daily status check (filing_tracking, filing_checks, filing_events), odelia_chases for people's
-- documents, the agency status call (voice_calls), the appeal playbooks (src/appeals), inspection bookings
-- (state.bookings), the undo window (filing_hold) and Placetta as the business's agent (agent_authorizations,
-- agent_act_ok, agent_acts). What this adds:
--
-- 1. portal_status_jobs: for a submitted portal filing with a saved login, the portal worker signs in on a schedule (the
--    monitor queues a job only inside the portal's hours and at most once per PORTAL_STATUS_EVERY_HOURS), reads the status
--    page with the model, matches the receipt's confirmation number, and reports. The worker reaches it only through the
--    filer_status_* functions, with a run token for the one filing (filer_runs), like a filing run. A license PDF it
--    downloads lands in the filing's receipts folder (filer_save_doc).
-- 2. agency_mail: mail an agency sent to the workspace or Odelia's address, matched to its filing (confirmation number,
--    thread, or the agency's own domain), classified, and what was done with it.
-- 3. agency_outbox: what Odelia sends an agency as the business's agent (an answer to a deficiency or a request for
--    information, a status inquiry, an inspection booking or its new time). Only under a live agent authorization that
--    covers the filing's form and agency (agent_act_ok, checked when it is added and again when it leaves), and every
--    one waits out the undo window first (SEND_HOLD_MINUTES), with Undo for the owner. Every act is in agent_acts.
-- 4. agency_chases: the stale chase, past the agency's published time: an email to the agency first, then a call, at
--    most once per step per filing per day, with a daily cap the monitor holds.
-- 5. filings.license_*: the issued license, stored, with its number and expiry (the owner's first look at it is an event
--    on the timeline, so the moment isn't repeated).
-- 6. filing_timeline also returns the license, the sends waiting or sent, and the agency's mail.
-- Safe to run twice.

/* ------------------------------ 5. the license on the filing ------------------------------ */

alter table public.filings add column if not exists license_path text check (license_path is null or length(license_path) <= 500);
alter table public.filings add column if not exists license_number text check (license_number is null or length(license_number) <= 80);
alter table public.filings add column if not exists license_expires date;
comment on column public.filings.license_path is 'The issued license as the agency gave it (a PDF in Documents), downloaded by Placetta.';

/* ------------------------------ 1. portal status checks ------------------------------ */

create table if not exists public.portal_status_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  filing_id uuid not null references public.filings(id) on delete cascade,
  host text not null check (host ~ '^[a-z0-9.-]+\.[a-z]{2,}$' and length(host) <= 200),
  tenant text check (tenant is null or length(tenant) <= 200),
  start_url text check (start_url is null or (start_url ~ '^https://' and length(start_url) <= 600)),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error text check (error is null or length(error) <= 300),
  acted_at timestamptz
);
comment on table public.portal_status_jobs is 'A portal status check: the worker signs in with the saved login, reads the status page, and reports what it shows. Queued by the monitor within the portal''s hours and rate limit.';
create unique index if not exists portal_status_jobs_open on public.portal_status_jobs(filing_id) where status in ('queued', 'running');
create index if not exists portal_status_jobs_queue on public.portal_status_jobs(queued_at) where status = 'queued';
create index if not exists portal_status_jobs_unacted on public.portal_status_jobs(finished_at) where status = 'done' and acted_at is null;
alter table public.portal_status_jobs enable row level security;
revoke all on public.portal_status_jobs from public, anon, authenticated;
grant select on public.portal_status_jobs to authenticated;
grant all on public.portal_status_jobs to service_role;
drop policy if exists "members read their portal status checks" on public.portal_status_jobs;
create policy "members read their portal status checks" on public.portal_status_jobs for select to authenticated using (public.can_view(workspace_id));

-- The worker takes the oldest queued check whose filing is still with the agency. A check left running for an hour (a
-- worker that died) goes back to the queue.
create or replace function public.filer_claim_status_job()
returns table (job_id uuid, filing_id uuid, workspace_id uuid, host text, tenant text, start_url text, official text, title jsonb, agency jsonb, confirmation_number text, submitted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare j public.portal_status_jobs;
begin
  update public.portal_status_jobs set status = 'queued', claimed_at = null where status = 'running' and claimed_at < now() - interval '1 hour';
  select * into j from public.portal_status_jobs q
   where q.status = 'queued' and exists (select 1 from public.filings f where f.id = q.filing_id and f.status in ('submitted', 'needs_info', 'in_progress'))
   order by q.queued_at for update skip locked limit 1;
  if j.id is null then return; end if;
  update public.portal_status_jobs set status = 'running', claimed_at = now() where id = j.id;
  return query select j.id, f.id, f.workspace_id, j.host, j.tenant, j.start_url, f.payload ->> 'official', f.title, f.agency, f.confirmation_number, f.submitted_at
    from public.filings f where f.id = j.filing_id;
end $$;

-- A run token for the check's one filing (the same filer_runs as a filing run): the saved login, the license download
-- and the report all need it.
create or replace function public.filer_status_begin(p_job uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare j public.portal_status_jobs; t text;
begin
  select * into j from public.portal_status_jobs where id = p_job;
  if j.id is null or j.status <> 'running' then raise exception 'status_job_not_running'; end if;
  update public.filer_runs set ended_at = now() where filing_id = j.filing_id and ended_at is null;
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.filer_runs (token_hash, filing_id, expires_at) values (encode(sha256(convert_to(t, 'UTF8')), 'hex'), j.filing_id, now() + interval '20 minutes');
  return t;
end $$;

create or replace function public.filer_status_logins(p_job uuid)
returns table (id uuid, agency text, url text, username text)
language sql stable security definer set search_path = '' as $$
  select l.id, l.agency, l.url, l.username
  from public.portal_status_jobs j join public.agency_logins l on l.workspace_id = j.workspace_id
  where j.id = p_job and j.status = 'running' and public.filer_run_ok(j.filing_id)
  order by l.created_at
$$;

-- The password, in the call that writes the audit entry first (as filer_open_login).
create or replace function public.filer_status_open_login(p_job uuid, p_login uuid)
returns table (username text, password text)
language plpgsql security definer set search_path = '' as $$
declare j public.portal_status_jobs; f public.filings; l public.agency_logins; pw text;
begin
  select * into j from public.portal_status_jobs where id = p_job;
  if j.id is null or j.status <> 'running' then raise exception 'status_job_not_running'; end if;
  if not public.filer_run_ok(j.filing_id) then raise exception 'run_token_invalid'; end if;
  select * into f from public.filings where id = j.filing_id;
  select * into l from public.agency_logins where id = p_login and workspace_id = j.workspace_id;
  if l.id is null then raise exception 'login_not_in_workspace'; end if;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object)
    values (j.workspace_id, 'agent', null,
            jsonb_build_object('en', 'Placetta signed in to ' || l.agency || ' to check the status', 'zh', '快哉登录 ' || l.agency || ' 查询办理状态'), f.title);
  update public.agency_logins set last_opened_at = now(), last_opened_by = null where id = l.id;
  pw := public.vault_get(l.secret_id);
  if pw is null then raise exception 'login_unreadable'; end if;
  return query select l.username, pw;
end $$;

-- What the page showed, as the worker read it: { state, status, matched, confirmation, license_path, license_number,
-- expires, asks[], due, fee, inspection, url, confidence }. The monitor acts on it (carry.ts); the timeline gets it now.
create or replace function public.filer_status_report(p_job uuid, p_result jsonb, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.portal_status_jobs; st text := coalesce(p_result ->> 'state', 'unknown'); conf numeric;
begin
  select * into j from public.portal_status_jobs where id = p_job;
  if j.id is null or j.status <> 'running' then raise exception 'status_job_not_running'; end if;
  if not public.filer_run_ok(j.filing_id) then raise exception 'run_token_invalid'; end if;
  if p_result is not null and jsonb_typeof(p_result) <> 'object' then raise exception 'bad_result'; end if;
  conf := least(1, greatest(0, coalesce((p_result ->> 'confidence')::numeric, 0)));
  update public.portal_status_jobs set status = case when p_error is null then 'done' else 'failed' end, finished_at = now(),
    result = p_result, error = left(p_error, 300) where id = p_job;
  insert into public.filing_checks (workspace_id, filing_id, source, url, content_hash, status_seen, changed, confidence, model_used, run_id, cost_usd, error)
    values (j.workspace_id, j.filing_id, 'agency_page', case when (p_result ->> 'url') ~ '^https://' then left(p_result ->> 'url', 600) end, null,
            left(p_result ->> 'status', 120), false, case when p_error is null then conf end, true, null, 0, left(p_error, 200));
  if p_error is null and st <> 'unknown' then
    insert into public.filing_events (workspace_id, filing_id, kind, status, title, source, confidence, url, dedupe)
    values (j.workspace_id, j.filing_id, 'agency', left(p_result ->> 'status', 120),
      jsonb_build_object('en', 'Signed in to the agency''s site: ' || coalesce(left(p_result ->> 'status', 120), st), 'zh', '登录机构网站查询：' || coalesce(left(p_result ->> 'status', 120), st)),
      'agency_page', conf, case when (p_result ->> 'url') ~ '^https://' then left(p_result ->> 'url', 600) end,
      left('portal:' || st || ':' || coalesce(p_result ->> 'status', '') || ':' || to_char(now(), 'YYYY-MM-DD'), 200))
    on conflict do nothing;
  end if;
end $$;

-- The filer's end of the check, never anything else.
create or replace function public.filer_status_end(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.portal_status_jobs;
begin
  select * into j from public.portal_status_jobs where id = p_job;
  if j.id is null then return; end if;
  update public.filer_runs set ended_at = now() where filing_id = j.filing_id and ended_at is null
    and token_hash = encode(sha256(convert_to(coalesce(public.filer_run_token(), ''), 'UTF8')), 'hex');
end $$;

revoke execute on function public.filer_claim_status_job(), public.filer_status_begin(uuid), public.filer_status_logins(uuid),
  public.filer_status_open_login(uuid, uuid), public.filer_status_report(uuid, jsonb, text), public.filer_status_end(uuid) from public, anon, authenticated;
grant execute on function public.filer_claim_status_job(), public.filer_status_begin(uuid), public.filer_status_logins(uuid),
  public.filer_status_open_login(uuid, uuid), public.filer_status_report(uuid, jsonb, text), public.filer_status_end(uuid) to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'grant execute on function public.filer_claim_status_job(), public.filer_status_begin(uuid), public.filer_status_logins(uuid),
      public.filer_status_open_login(uuid, uuid), public.filer_status_report(uuid, jsonb, text), public.filer_status_end(uuid) to placetta_filer';
  end if;
end $$;

/* ------------------------------ 2. the agency's mail ------------------------------ */

create table if not exists public.agency_mail (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  filing_id uuid references public.filings(id) on delete set null,
  message_id text not null unique check (length(message_id) <= 400),
  from_addr text not null check (length(from_addr) <= 320),
  subject text check (subject is null or length(subject) <= 300),
  snippet text check (snippet is null or length(snippet) <= 1200),
  kind text not null check (kind in ('approved', 'deficiency', 'rfi', 'fee_due', 'inspection_scheduled', 'denied', 'other')),
  matched_by text check (matched_by is null or matched_by in ('confirmation', 'thread', 'domain')),
  confidence numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  held boolean not null default false,
  action text check (action is null or length(action) <= 300),
  files int not null default 0 check (files >= 0),
  created_at timestamptz not null default now()
);
comment on table public.agency_mail is 'Mail an agency sent about a filing, matched to it, classified, and what Odelia did with it. The text is the agency''s, kept as data.';
create index if not exists agency_mail_filing on public.agency_mail(filing_id, created_at desc);
alter table public.agency_mail enable row level security;
revoke all on public.agency_mail from public, anon, authenticated;
grant select on public.agency_mail to authenticated;
grant all on public.agency_mail to service_role;
drop policy if exists "members read their agency mail" on public.agency_mail;
create policy "members read their agency mail" on public.agency_mail for select to authenticated using (public.can_view(workspace_id));

/* ------------------------------ 3. what Odelia sends an agency as the business's agent ------------------------------ */

create table if not exists public.agency_outbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  filing_id uuid not null references public.filings(id) on delete cascade,
  kind text not null check (kind in ('rfi_answer', 'status_inquiry', 'inspection_booking', 'inspection_reschedule')),
  to_addr text not null check (to_addr ~* '^[^\s@<>()",;:]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$'),
  subject text not null check (length(subject) between 1 and 300),
  body text not null check (length(body) between 1 and 8000),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10),
  in_reply_to text check (in_reply_to is null or length(in_reply_to) <= 400),
  agent_auth uuid not null references public.agent_authorizations(id),
  status text not null default 'held' check (status in ('held', 'sending', 'sent', 'undone', 'failed')),
  send_after timestamptz not null,
  sent_at timestamptz,
  provider_id text check (provider_id is null or length(provider_id) <= 300),
  undone_at timestamptz,
  undone_by uuid references auth.users(id),
  error text check (error is null or length(error) <= 300),
  dedupe text not null unique check (length(dedupe) <= 300),
  created_at timestamptz not null default now()
);
comment on table public.agency_outbox is 'What Odelia sends an agency as the business''s agent: held for the undo window, then sent, only while the agent authorization covers it.';
create index if not exists agency_outbox_due on public.agency_outbox(send_after) where status = 'held';
create index if not exists agency_outbox_filing on public.agency_outbox(filing_id, created_at desc);
alter table public.agency_outbox enable row level security;
revoke all on public.agency_outbox from public, anon, authenticated;
grant select on public.agency_outbox to authenticated;
grant all on public.agency_outbox to service_role;
drop policy if exists "members read their agency outbox" on public.agency_outbox;
create policy "members read their agency outbox" on public.agency_outbox for select to authenticated using (public.can_view(workspace_id));

-- Odelia's server adds a send: only for a filing in this workspace that went in under the business's live agent
-- authorization (agent_act_ok raises with the reason when it doesn't cover the form or the agency). It waits p_minutes
-- (the undo window, 1 to 1440) and is on the timeline, the audit trail, agent_acts and the owner's Updates at once.
-- Returns the row's id, or null when the same send (dedupe) is already there.
create or replace function public.agency_outbox_add(p_ws uuid, p_filing uuid, p_kind text, p_to text, p_subject text, p_body text,
  p_attachments jsonb, p_in_reply_to text, p_minutes int, p_dedupe text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare f public.filings; new_id uuid; m int := least(greatest(coalesce(p_minutes, 10), 1), 1440);
  what jsonb := case p_kind when 'rfi_answer' then '{"en": "the answer to the agency''s request", "zh": "对机构要求的答复"}'::jsonb
    when 'status_inquiry' then '{"en": "a status inquiry", "zh": "进度查询"}'::jsonb
    when 'inspection_booking' then '{"en": "the inspection booking request", "zh": "检查预约请求"}'::jsonb
    else '{"en": "the request for a new inspection time", "zh": "改约检查时间的请求"}'::jsonb end;
begin
  select * into f from public.filings where id = p_filing and workspace_id = p_ws;
  if f.id is null then raise exception 'No such filing.'; end if;
  if f.status = 'canceled' then raise exception 'filing_stopped: the owner stopped this filing'; end if;
  if f.agent_auth is null then raise exception 'agent_scope: this filing didn''t go in under the agent authorization'; end if;
  perform public.agent_act_ok(p_ws, f.agent_auth, f.payload ->> 'official', f.agency ->> 'en');
  insert into public.agency_outbox (workspace_id, filing_id, kind, to_addr, subject, body, attachments, in_reply_to, agent_auth, send_after, dedupe)
  values (p_ws, p_filing, p_kind, lower(trim(p_to)), left(p_subject, 300), left(p_body, 8000), coalesce(p_attachments, '[]'::jsonb), left(p_in_reply_to, 400), f.agent_auth,
          now() + make_interval(mins => m), left(p_dedupe, 300))
  on conflict (dedupe) do nothing returning agency_outbox.id into new_id;
  if new_id is null then return null; end if;
  insert into public.agent_acts (workspace_id, authorization_id, filing_id, form, agency, act, actor, detail)
  values (p_ws, f.agent_auth, f.id, coalesce(f.payload ->> 'official', ''), coalesce(f.agency ->> 'en', ''), case when p_kind = 'rfi_answer' then 'answered' else 'queued' end, 'odelia',
          format('%s to %s, held %s minutes', p_kind, lower(trim(p_to)), m));
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (p_ws, 'agent', null, jsonb_build_object('en', 'Wrote ' || (what ->> 'en') || ' as your agent', 'zh', '以您的代理人身份撰写了' || (what ->> 'zh')), f.title,
          jsonb_build_object('en', format('Sending to %s in %s minutes unless you undo it', lower(trim(p_to)), m), 'zh', format('%s 分钟后发送至 %s，在此之前可以撤销', m, lower(trim(p_to)))));
  insert into public.filing_events (workspace_id, filing_id, kind, status, title, source, confidence, dedupe)
  values (p_ws, f.id, 'note', null, jsonb_build_object('en', 'Odelia wrote ' || (what ->> 'en') || '. Sending in ' || m || ' minutes; you can undo it', 'zh', 'Odelia 撰写了' || (what ->> 'zh') || '，' || m || ' 分钟后发送，可以撤销'),
          'odelia', 1, left('outbox:' || new_id::text, 200))
  on conflict do nothing;
  insert into public.updates (workspace_id, kind, app_id, title, body, dedupe)
  values (p_ws, 'filing', f.app_id, jsonb_build_object('en', 'Odelia is answering for you: ' || coalesce(f.title ->> 'en', 'a filing'), 'zh', 'Odelia 正在代您答复：' || coalesce(f.title ->> 'zh', '一项申请')),
          jsonb_build_object('en', format('She wrote %s as your agent. It goes to %s in %s minutes; open the filing to read it or undo it.', what ->> 'en', lower(trim(p_to)), m),
                             'zh', format('她以您的代理人身份撰写了%s，%s 分钟后发送至 %s；打开该申请即可查看或撤销。', what ->> 'zh', m, lower(trim(p_to)))),
          left('outbox:' || new_id::text, 300))
  on conflict (workspace_id, dedupe) do nothing;
  return new_id;
end $$;

-- Undo, by an owner or admin, only while it's still held (the send takes the row under the same lock).
create or replace function public.agency_outbox_undo(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o public.agency_outbox;
begin
  select * into o from public.agency_outbox where id = p_id for update;
  if o.id is null or not (public.is_owner(o.workspace_id) or public.is_admin(o.workspace_id)) then raise exception 'No such send.'; end if;
  if o.status <> 'held' then return false; end if;
  update public.agency_outbox set status = 'undone', undone_at = now(), undone_by = auth.uid() where id = p_id;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (o.workspace_id, 'you', auth.uid(), '{"en": "Undid a message to the agency before it went", "zh": "在发出前撤销了给机构的消息"}'::jsonb, to_jsonb(o.subject), null);
  insert into public.filing_events (workspace_id, filing_id, kind, status, title, source, confidence, dedupe)
  values (o.workspace_id, o.filing_id, 'note', null, '{"en": "You undid the message before it went", "zh": "您在发出前撤销了该消息"}'::jsonb, 'owner', 1, left('outbox-undo:' || o.id::text, 200))
  on conflict do nothing;
  return true;
end $$;

-- The sender takes what's due: held, past its window, and still covered by the authorization (a revoked or expired one,
-- or one that no longer covers the agency, fails the row with the reason and nothing goes).
create or replace function public.agency_outbox_claim(p_limit int default 20) returns setof public.agency_outbox
language plpgsql security definer set search_path = '' as $$
declare o public.agency_outbox; f public.filings;
begin
  for o in select * from public.agency_outbox where status = 'held' and send_after <= now() order by send_after for update skip locked limit least(greatest(coalesce(p_limit, 20), 1), 100) loop
    select * into f from public.filings where id = o.filing_id;
    begin
      if f.status = 'canceled' then raise exception 'filing_stopped'; end if;
      perform public.agent_act_ok(o.workspace_id, o.agent_auth, f.payload ->> 'official', f.agency ->> 'en');
    exception when others then
      update public.agency_outbox set status = 'failed', error = left(sqlerrm, 300) where id = o.id;
      continue;
    end;
    update public.agency_outbox set status = 'sending' where id = o.id returning * into o;
    return next o;
  end loop;
end $$;

-- After the send: on the timeline and in agent_acts when it went; a failure is kept with its reason for the team.
create or replace function public.agency_outbox_done(p_id uuid, p_ok boolean, p_provider text, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.agency_outbox; f public.filings;
begin
  select * into o from public.agency_outbox where id = p_id for update;
  if o.id is null or o.status <> 'sending' then return; end if;
  select * into f from public.filings where id = o.filing_id;
  if p_ok then
    update public.agency_outbox set status = 'sent', sent_at = now(), provider_id = left(p_provider, 300) where id = p_id;
    insert into public.agent_acts (workspace_id, authorization_id, filing_id, form, agency, act, actor, detail)
    values (o.workspace_id, o.agent_auth, o.filing_id, coalesce(f.payload ->> 'official', ''), coalesce(f.agency ->> 'en', ''), 'submitted', 'odelia', format('%s sent to %s', o.kind, o.to_addr));
    insert into public.filing_events (workspace_id, filing_id, kind, status, title, source, confidence, dedupe)
    values (o.workspace_id, o.filing_id, 'note', null, jsonb_build_object('en', 'Sent to ' || o.to_addr || ': ' || o.subject, 'zh', '已发送至 ' || o.to_addr || '：' || o.subject), 'odelia', 1, left('outbox-sent:' || o.id::text, 200))
    on conflict do nothing;
  else
    update public.agency_outbox set status = 'failed', error = left(coalesce(p_error, 'send failed'), 300) where id = p_id;
  end if;
end $$;

revoke execute on function public.agency_outbox_add(uuid, uuid, text, text, text, text, jsonb, text, int, text), public.agency_outbox_claim(int),
  public.agency_outbox_done(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.agency_outbox_add(uuid, uuid, text, text, text, text, jsonb, text, int, text), public.agency_outbox_claim(int),
  public.agency_outbox_done(uuid, boolean, text, text) to service_role;
revoke execute on function public.agency_outbox_undo(uuid) from public, anon;
grant execute on function public.agency_outbox_undo(uuid) to authenticated;

/* ------------------------------ 4. the stale chase ------------------------------ */

create table if not exists public.agency_chases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  filing_id uuid not null references public.filings(id) on delete cascade,
  step text not null check (step in ('email', 'call')),
  day date not null,
  outbox_id uuid references public.agency_outbox(id) on delete set null,
  call_id uuid,
  outcome text check (outcome is null or length(outcome) <= 500),
  created_at timestamptz not null default now(),
  unique (filing_id, step, day)
);
comment on table public.agency_chases is 'The stale chase: past the agency''s published time, an email to the agency, then a call, each claimed here before it goes.';
create index if not exists agency_chases_day on public.agency_chases(day);
alter table public.agency_chases enable row level security;
revoke all on public.agency_chases from public, anon, authenticated;
grant select on public.agency_chases to authenticated;
grant all on public.agency_chases to service_role;
drop policy if exists "members read their agency chases" on public.agency_chases;
create policy "members read their agency chases" on public.agency_chases for select to authenticated using (public.can_view(workspace_id));

/* ------------------------------ 5. the license, set by the server ------------------------------ */

create or replace function public.filing_license_set(p_filing uuid, p_path text, p_number text, p_expires date) returns boolean
language plpgsql security definer set search_path = '' as $$
declare f public.filings;
begin
  select * into f from public.filings where id = p_filing for update;
  if f.id is null then return false; end if;
  if p_path is not null and p_path not like f.workspace_id::text || '/%' then raise exception 'path_outside_workspace'; end if;
  update public.filings set license_path = coalesce(p_path, license_path), license_number = coalesce(left(p_number, 80), license_number),
    license_expires = coalesce(p_expires, license_expires) where id = p_filing;
  return f.license_path is distinct from coalesce(p_path, f.license_path);
end $$;
-- The owner saw "Your license is approved": an event on the timeline, once, so the moment isn't repeated. (A customer
-- can't update a filing row; the filings guard allows only a cancel.)
create or replace function public.filing_license_seen(p_filing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  select workspace_id into ws from public.filings where id = p_filing;
  if ws is null or not public.is_member(ws) then raise exception 'No such filing.'; end if;
  insert into public.filing_events (workspace_id, filing_id, kind, status, title, source, confidence, dedupe)
  values (ws, p_filing, 'note', null, '{"en": "You opened your approved license", "zh": "您查看了已获批准的执照"}'::jsonb, 'owner', 1, 'license-shown')
  on conflict do nothing;
end $$;
revoke execute on function public.filing_license_set(uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.filing_license_set(uuid, text, text, date) to service_role;
revoke execute on function public.filing_license_seen(uuid) from public, anon;
grant execute on function public.filing_license_seen(uuid) to authenticated;

-- The license columns are written by the server only: the filings guard already stops a customer changing a filing's
-- team columns; these join them.
create or replace function public.filings_license_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.license_path, new.license_number, new.license_expires) is distinct from (old.license_path, old.license_number, old.license_expires)
     and auth.uid() is not null and not public.is_staff() then
    raise exception 'Only Placetta records the license.';
  end if;
  return new;
end $$;
revoke all on function public.filings_license_guard() from public, anon, authenticated;
drop trigger if exists filings_license_guard on public.filings;
create trigger filings_license_guard before update of license_path, license_number, license_expires on public.filings for each row execute function public.filings_license_guard();

/* ------------------------------ 6. the timeline, with the license and the sends ------------------------------ */

create or replace function public.filing_timeline(p_filing uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid; f public.filings;
begin
  select * into f from public.filings where id = p_filing;
  ws := f.workspace_id;
  if ws is null or not (public.is_member(ws) or public.is_staff()) then raise exception 'No such filing.'; end if;
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'status', e.status, 'title', e.title, 'source', e.source,
      'confidence', e.confidence, 'url', e.url) order by e.at desc) from (select * from public.filing_events where filing_id = p_filing order by at desc limit 50) e), '[]'::jsonb),
    'tracking', (select jsonb_build_object('last_checked_at', t.last_checked_at, 'next_check_at', t.next_check_at, 'agency_status', t.agency_status,
      'agency_norm', t.agency_norm, 'last_movement_at', t.last_movement_at, 'escalated_at', t.escalated_at) from public.filing_tracking t where t.filing_id = p_filing),
    'license', case when f.license_path is not null or f.status = 'accepted' then jsonb_build_object('path', f.license_path, 'number', f.license_number,
      'expires', f.license_expires, 'decided_at', f.decided_at,
      'shown_at', (select e.at from public.filing_events e where e.filing_id = p_filing and e.dedupe = 'license-shown' limit 1)) end,
    'outbox', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'to', o.to_addr, 'subject', o.subject, 'body', o.body, 'status', o.status,
      'send_after', o.send_after, 'sent_at', o.sent_at) order by o.created_at desc) from (select * from public.agency_outbox where filing_id = p_filing order by created_at desc limit 10) o), '[]'::jsonb),
    'mail', coalesce((select jsonb_agg(jsonb_build_object('at', m.created_at, 'kind', m.kind, 'from', m.from_addr, 'subject', m.subject, 'action', m.action) order by m.created_at desc)
      from (select * from public.agency_mail where filing_id = p_filing order by created_at desc limit 10) m), '[]'::jsonb));
end $$;
revoke execute on function public.filing_timeline(uuid) from public, anon;
grant execute on function public.filing_timeline(uuid) to authenticated;

/* ------------------------------ the per-minute send ------------------------------ */

-- Held agency sends whose undo window is over go out within the minute (the monitor's "outbox" action), and so do the
-- portal status checks waiting on a sleeping worker (the file sweep wakes it).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; held agency sends go out at the monitor''s daily run.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-agency-outbox';
  perform cron.schedule('placetta-agency-outbox', '* * * * *', $job$
    select net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/monitor',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)),
      body := '{"action": "outbox"}'::jsonb,
      timeout_milliseconds := 60000
    )
    where exists (select 1 from public.agency_outbox where status = 'held' and send_after <= now());
  $job$);
end $$;
