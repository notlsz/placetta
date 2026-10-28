-- Law watch (src/lawWatch.ts, supabase/functions/monitor/law_watch.ts): rule changes from official sources, held for the
-- Placetta team before any owner hears about them. Three ways in, all pending until a person decides:
--   register  the Federal Register's feeds for the agencies behind Placetta's federal forms, and official feeds the team
--             adds (RULE_FEEDS), read by the monitor each day
--   sweep     the nightly quality sweep found the words Placetta quotes for a form gone from the agency's page
--             (a drift finding in qa_findings, copied here by the trigger below)
--   odelia    Odelia's weekly check for one business found something (agent-run)
-- The team approves with a headline and a body in English and Chinese and an official https .gov source, or dismisses.
-- Only approved rows are read by the monitor, which gives each affected business one Update (dedupe law:<id>).
-- Staff only: no owner reads this table; owners get the team's words as an Update. Safe to run twice.

create table if not exists public.rule_alerts (
  id uuid primary key default gen_random_uuid(),
  origin text not null check (origin in ('register', 'sweep', 'odelia')),
  -- set: a finding for this one business (the weekly check); null: everyone it affects by form or state
  workspace_id uuid references public.workspaces(id) on delete cascade,
  jurisdiction text not null default 'US' check (jurisdiction ~ '^US(-[A-Z]{2})?$'),
  -- registry form ids it can affect; "fda-*" is every FDA form
  forms text[] not null default '{}' check (cardinality(forms) <= 40),
  source_url text check (source_url is null or length(source_url) <= 1000),
  source_label text check (source_label is null or length(source_label) <= 200),
  title text not null check (length(title) between 1 and 300),
  excerpt text check (excerpt is null or length(excerpt) <= 4000),
  published date,
  dedupe text not null unique check (length(dedupe) between 1 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  -- the team's words for owners, written when it approves
  headline jsonb,
  body jsonb,
  effective date,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now()
);
comment on table public.rule_alerts is 'Rule changes from official sources, held for the Placetta team; only approved rows reach owners, as Updates in the team''s words. Staff only.';
create index if not exists rule_alerts_pending on public.rule_alerts (created_at desc) where status = 'pending';
create index if not exists rule_alerts_approved on public.rule_alerts (decided_at desc) where status = 'approved';
alter table public.rule_alerts enable row level security;
revoke all on public.rule_alerts from public, anon, authenticated;
grant select on public.rule_alerts to authenticated;
drop policy if exists "staff read rule alerts" on public.rule_alerts;
create policy "staff read rule alerts" on public.rule_alerts for select to authenticated using (public.is_staff());

/* An official source, as the database checks it: https on a .gov host. The same rule as official() in src/lawWatch.ts. */
create or replace function public.rule_source_official(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_url ~* '^https://([a-z0-9-]+\.)*[a-z0-9-]+\.gov(:[0-9]+)?(/[^\s]*)?$', false);
$$;
revoke execute on function public.rule_source_official(text) from public, anon;
grant execute on function public.rule_source_official(text) to authenticated, service_role;

/* Candidates in, from the monitor and agent-run (service role). One row per dedupe: seen again, nothing changes.
   Returns how many were new. */
create or replace function public.rule_alert_report(p_alerts jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare a jsonb; n int := 0; got uuid;
begin
  if jsonb_typeof(p_alerts) <> 'array' then raise exception 'alerts must be an array'; end if;
  for a in select * from jsonb_array_elements(p_alerts) limit 200 loop
    if coalesce(a->>'origin', '') not in ('register', 'sweep', 'odelia') or coalesce(a->>'title', '') = '' or coalesce(a->>'dedupe', '') = '' then continue; end if;
    insert into public.rule_alerts (origin, workspace_id, jurisdiction, forms, source_url, source_label, title, excerpt, published, dedupe)
      values (a->>'origin', nullif(a->>'workspace_id', '')::uuid,
        case when coalesce(a->>'jurisdiction', '') ~ '^US(-[A-Z]{2})?$' then a->>'jurisdiction' else 'US' end,
        coalesce((select array_agg(left(x, 60)) from jsonb_array_elements_text(case when jsonb_typeof(a->'forms') = 'array' then a->'forms' else '[]'::jsonb end) x limit 40), '{}'),
        case when public.rule_source_official(a->>'source_url') then left(a->>'source_url', 1000) end,
        left(nullif(a->>'source_label', ''), 200), left(a->>'title', 300), left(nullif(a->>'excerpt', ''), 4000),
        case when coalesce(a->>'published', '') ~ '^\d{4}-\d{2}-\d{2}$' then (a->>'published')::date end, left(a->>'dedupe', 300))
      on conflict (dedupe) do nothing
      returning id into got;
    if got is not null then n := n + 1; got := null; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.rule_alert_report(jsonb) from public, anon, authenticated;
grant execute on function public.rule_alert_report(jsonb) to service_role;

/* The team's queue: what's pending, oldest first, then the last 30 days' decisions. */
create or replace function public.rule_alert_queue() returns setof public.rule_alerts
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return query (select * from public.rule_alerts r where r.status = 'pending' order by r.created_at limit 200)
    union all (select * from public.rule_alerts r where r.status <> 'pending' and r.decided_at > now() - interval '30 days' order by r.decided_at desc limit 100);
end $$;
revoke execute on function public.rule_alert_queue() from public, anon;
grant execute on function public.rule_alert_queue() to authenticated;

/* A decision, once. Approving needs the owner's words in English and Chinese (no dashes, short enough for a text) and an
   official source; the team can give a better source than the feed's. A decided alert can't be changed: an Update may
   already have gone out in its words. */
create or replace function public.rule_alert_decide(p_id uuid, p_status text, p_headline jsonb default null, p_body jsonb default null,
  p_source_url text default null, p_effective date default null, p_note text default null) returns public.rule_alerts
language plpgsql security definer set search_path = '' as $$
declare r public.rule_alerts; src text;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if p_status not in ('approved', 'dismissed') then raise exception 'status must be approved or dismissed'; end if;
  select * into r from public.rule_alerts where id = p_id for update;
  if not found then raise exception 'No such alert.'; end if;
  if r.status <> 'pending' then raise exception 'Already decided.'; end if;
  if p_status = 'approved' then
    src := coalesce(nullif(trim(p_source_url), ''), r.source_url);
    if not public.rule_source_official(src) then raise exception 'An official source is needed: an https page on a .gov site.'; end if;
    if coalesce(trim(p_headline->>'en'), '') = '' or coalesce(trim(p_headline->>'zh'), '') = ''
      or coalesce(trim(p_body->>'en'), '') = '' or coalesce(trim(p_body->>'zh'), '') = '' then
      raise exception 'Write the headline and what changes in English and Chinese.';
    end if;
    if length(p_headline->>'en') > 120 or length(p_headline->>'zh') > 120 or length(p_body->>'en') > 600 or length(p_body->>'zh') > 600 then
      raise exception 'Too long: a headline under 120 characters, what changes under 600.';
    end if;
    if concat(p_headline->>'en', p_headline->>'zh', p_body->>'en', p_body->>'zh') ~ '[–—]' then raise exception 'Use a comma or a period instead of a dash.'; end if;
    update public.rule_alerts set status = 'approved', source_url = src,
      headline = jsonb_build_object('en', trim(p_headline->>'en'), 'zh', trim(p_headline->>'zh')),
      body = jsonb_build_object('en', trim(p_body->>'en'), 'zh', trim(p_body->>'zh')),
      effective = p_effective, decided_by = auth.uid(), decided_at = now(), note = left(nullif(trim(p_note), ''), 2000)
      where id = p_id returning * into r;
  else
    update public.rule_alerts set status = 'dismissed', decided_by = auth.uid(), decided_at = now(), note = left(nullif(trim(p_note), ''), 2000)
      where id = p_id returning * into r;
  end if;
  return r;
end $$;
revoke execute on function public.rule_alert_decide(uuid, text, jsonb, jsonb, text, date, text) from public, anon;
grant execute on function public.rule_alert_decide(uuid, text, jsonb, jsonb, text, date, text) to authenticated;

/* The sweep's drift findings become candidates too: the words Placetta quotes for a form are gone from the agency's page,
   which may be a rule change or only a rewording. The team decides which. */
create or replace function public.rule_alert_from_drift() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'drift' then
    insert into public.rule_alerts (origin, jurisdiction, forms, source_url, source_label, title, excerpt, dedupe)
      values ('sweep', 'US', array[left(new.subject, 60)],
        case when public.rule_source_official(new.source) then left(new.source, 1000) end,
        left(substring(new.source from '^https?://(?:www\.)?([^/]+)'), 200),
        left(format('The page Placetta quotes for %s changed', new.subject), 300), left(new.repro, 4000), left('sweep:' || new.dedupe, 300))
      on conflict (dedupe) do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.rule_alert_from_drift() from public, anon, authenticated;
drop trigger if exists rule_alert_from_drift on public.qa_findings;
create trigger rule_alert_from_drift after insert on public.qa_findings for each row execute function public.rule_alert_from_drift();
