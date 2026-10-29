-- Rejection risk and proof pages (2026-10-29).
--   1. filing_risk_flags: what the check before approval found on each filing (src/risk.ts riskFlags: the issue's kind
--      and how serious, never a value), written by the file function when a filing starts. risk_issue_stats() reads it
--      against what the agency then did (the filing's status and its filing_events), live, so every decision teaches
--      the next card: an issue the agency sent back at least half the time over 3 or more filings is High.
--   2. proof_links: a time-limited, revocable link to one filing's proof (what was filed, when, how, the agency's
--      confirmation number, every status change with its source, and, when the owner chooses, the receipts and the
--      agency's documents). Copied from the trust pages (20261031160000_trust_pages.sql): only an owner shares or
--      revokes; the token is 48 random hex characters shown once and kept only as its SHA-256; an unknown, revoked or
--      expired token gets the same answer, "gone". A proof link lasts 1 to 30 days, never longer.
--   proof_page(token) is the public read; proof_doc(token, doc) gives the proof function (supabase/functions/proof) the
--   storage path of a document the link shares, so it can sign a 5-minute URL. Documents the business uploaded
--   (source 'customer': leases, IDs) are never shared by a proof link.
-- RLS is on for every new table. Synthetic (probe) workspaces never teach. Safe to run twice.

/* ------------------------------ 1. what the check found, and what it led to ------------------------------ */

create table if not exists public.filing_risk_flags (
  filing_id uuid not null references public.filings(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form text check (form is null or length(form) <= 120),
  issue text not null check (issue ~ '^[a-z_]{1,40}$'),
  severity text not null check (severity in ('low', 'medium', 'high')),
  overridden boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (filing_id, issue)
);
create index if not exists filing_risk_flags_form on public.filing_risk_flags(form, issue);
comment on table public.filing_risk_flags is 'What the check before approval found on a filing: the issue''s kind and severity only (src/risk.ts riskFlags). Written by the file function; read against the agency''s decision by risk_issue_stats.';
alter table public.filing_risk_flags enable row level security;
revoke all on public.filing_risk_flags from public, anon, authenticated;
grant select on public.filing_risk_flags to authenticated;
grant all on public.filing_risk_flags to service_role;
drop policy if exists "members read their filings' risk flags" on public.filing_risk_flags;
create policy "members read their filings' risk flags" on public.filing_risk_flags for select to authenticated using (public.is_member(workspace_id) or public.is_staff());

-- Per issue, over decided real filings of one form: how many had it, and how many the agency sent back (rejected, or
-- asked for more). Aggregates only, and only issues seen on 3 or more decided filings, so no one filing shows through.
create or replace function public.risk_issue_stats(p_form text) returns table (issue text, n int, sent_back int)
language sql stable security definer set search_path = '' as $$
  select r.issue, count(*)::int,
         count(*) filter (where f.status = 'rejected' or exists (
           select 1 from public.filing_events e where e.filing_id = f.id and e.kind = 'status' and e.status in ('rejected', 'needs_info')))::int
  from public.filing_risk_flags r
  join public.filings f on f.id = r.filing_id
  join public.workspaces w on w.id = f.workspace_id
  where r.form = p_form and not coalesce(w.synthetic, false)
    and (f.status in ('accepted', 'rejected') or exists (
      select 1 from public.filing_events e where e.filing_id = f.id and e.kind = 'status' and e.status in ('accepted', 'rejected', 'needs_info')))
  group by r.issue
  having count(*) >= 3
$$;
revoke execute on function public.risk_issue_stats(text) from public, anon;
grant execute on function public.risk_issue_stats(text) to authenticated, service_role;

/* ------------------------------ 2. proof links ------------------------------ */

create table if not exists public.proof_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  filing_id uuid not null references public.filings(id) on delete cascade,
  label text not null default '' check (length(label) <= 80),
  prefix text not null check (prefix ~ '^[0-9a-f]{8}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  docs boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  views int not null default 0 check (views >= 0),
  last_viewed_at timestamptz,
  check (expires_at <= created_at + interval '30 days 1 minute')
);
create index if not exists proof_links_ws on public.proof_links(workspace_id, filing_id);
comment on table public.proof_links is 'Shared proof of one filing: token kept as SHA-256 only, 30 days at most, revocable. Read and written only through the proof_* functions.';
alter table public.proof_links enable row level security;
revoke all on public.proof_links from public, anon, authenticated;
grant all on public.proof_links to service_role;

create or replace function public.proof_link_create(ws uuid, p_filing uuid, p_days int default 7, p_docs boolean default false, p_label text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k text; pre text; lid uuid; lab text; d int;
begin
  if not public.is_owner(ws) or not public.mfa_ok() then raise exception 'Only an owner of this workspace can share proof of a filing.' using errcode = '42501'; end if;
  if not exists (select 1 from public.filings f where f.id = p_filing and f.workspace_id = ws) then raise exception 'That filing isn''t in this workspace.' using errcode = 'P0002'; end if;
  if (select count(*) from public.proof_links t where t.workspace_id = ws and t.revoked_at is null and t.expires_at > now()) >= 50 then
    raise exception 'Up to 50 proof links at a time. Revoke one first.';
  end if;
  d := least(greatest(coalesce(p_days, 7), 1), 30);
  lab := left(btrim(coalesce(p_label, '')), 80);
  loop
    k := encode(extensions.gen_random_bytes(24), 'hex');
    pre := left(k, 8);
    exit when not exists (select 1 from public.proof_links t where t.token_hash = encode(extensions.digest(k, 'sha256'), 'hex'));
  end loop;
  insert into public.proof_links (workspace_id, filing_id, label, prefix, token_hash, docs, created_by, expires_at)
  values (ws, p_filing, lab, pre, encode(extensions.digest(k, 'sha256'), 'hex'), coalesce(p_docs, false), auth.uid(), now() + make_interval(days => d))
  returning id into lid;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object)
  values (ws, 'you', auth.uid(), jsonb_build_object('en', 'Shared proof of a filing', 'zh', '共享了申报证明'),
    jsonb_build_object('en', coalesce(nullif(lab, ''), 'Proof link') || ' (' || pre || ', ' || d || ' days' || case when p_docs then ', with documents' else '' end || ')',
                       'zh', coalesce(nullif(lab, ''), '证明链接') || '（' || pre || '，' || d || ' 天' || case when p_docs then '，含文件' else '' end || '）'));
  return jsonb_build_object('id', lid, 'prefix', pre, 'token', k, 'expires_at', now() + make_interval(days => d));
end $$;

create or replace function public.proof_link_list(ws uuid) returns table (id uuid, filing_id uuid, label text, prefix text, docs boolean, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, views int, last_viewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(ws) then raise exception 'Not a member of this workspace.' using errcode = '42501'; end if;
  return query select l.id, l.filing_id, l.label, l.prefix, l.docs, l.created_at, l.expires_at, l.revoked_at, l.views, l.last_viewed_at
    from public.proof_links l where l.workspace_id = ws order by l.created_at desc limit 200;
end $$;

create or replace function public.proof_link_revoke(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.proof_links;
begin
  select * into l from public.proof_links t where t.id = p_id;
  if l.id is null or not public.is_owner(l.workspace_id) or not public.mfa_ok() then raise exception 'Only an owner of this workspace can revoke a proof link.' using errcode = '42501'; end if;
  update public.proof_links t set revoked_at = coalesce(t.revoked_at, now()) where t.id = p_id;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object)
  values (l.workspace_id, 'you', auth.uid(), jsonb_build_object('en', 'Revoked a proof link', 'zh', '撤销了证明链接'), jsonb_build_object('en', l.prefix, 'zh', l.prefix));
  return true;
end $$;
revoke execute on function public.proof_link_create(uuid, uuid, int, boolean, text), public.proof_link_list(uuid), public.proof_link_revoke(uuid) from public, anon;
grant execute on function public.proof_link_create(uuid, uuid, int, boolean, text), public.proof_link_list(uuid), public.proof_link_revoke(uuid) to authenticated;

-- The link's row for a token, or null for one that is malformed, unknown, revoked or expired (all the same).
create or replace function public.proof_link_of(p_token text) returns public.proof_links
language plpgsql stable security definer set search_path = '' as $$
declare l public.proof_links;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.proof_links t where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if l.id is null or l.revoked_at is not null or l.expires_at <= now() then return null; end if;
  return l;
end $$;
revoke execute on function public.proof_link_of(text) from public, anon, authenticated;

-- What a shared proof shows: the filing's name and agency, how and when it went, the agency's confirmation number, each
-- status change with its source and time, and the shared documents' names. Never a form answer, a fee, a person or
-- the business's tax ID.
create or replace function public.proof_page(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.proof_links; f public.filings; biz text; evs jsonb; docs jsonb := '[]'::jsonb;
begin
  if not public.rate_hit('proof_page:all', 3000, 60) or not public.rate_hit('proof_page:' || public.trust_caller(), 60, 60) then
    raise exception 'Too many requests. Try again in a minute.' using errcode = '54000';
  end if;
  l := public.proof_link_of(p_token);
  if l.id is null then return jsonb_build_object('status', 'gone'); end if;
  select * into f from public.filings x where x.id = l.filing_id;
  if f.id is null then return jsonb_build_object('status', 'gone'); end if;
  update public.proof_links x set views = x.views + 1, last_viewed_at = now() where x.id = l.id;
  select w.name into biz from public.workspaces w where w.id = f.workspace_id;
  select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'status', e.status, 'title', e.title, 'source', e.source, 'url', e.url) order by e.at), '[]'::jsonb)
    into evs from (select * from public.filing_events e where e.filing_id = f.id and e.kind in ('status', 'agency', 'inspection') order by e.at desc limit 60) e;
  if l.docs then
    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'source', d.source, 'at', d.created_at) order by d.created_at), '[]'::jsonb)
      into docs from public.documents d where d.filing_id = f.id and d.source in ('agent', 'agency', 'team');
  end if;
  return jsonb_build_object('status', 'ok', 'business', biz, 'title', f.title, 'agency', f.agency, 'channel', f.channel, 'filing_status', f.status,
    'approved_at', f.approved_at, 'submitted_at', f.submitted_at, 'decided_at', f.decided_at, 'confirmation', f.confirmation_number,
    'license_expires', f.license_expires, 'events', evs, 'docs', docs, 'expires_at', l.expires_at);
end $$;
revoke execute on function public.proof_page(text) from public;
grant execute on function public.proof_page(text) to anon, authenticated;

-- A shared document's storage path, for the proof function to sign: only for a live link that shares documents, and
-- only a document of that filing that Placetta, the team or the agency made.
create or replace function public.proof_doc(p_token text, p_doc uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare l public.proof_links; p text;
begin
  l := public.proof_link_of(p_token);
  if l.id is null or not l.docs then return null; end if;
  select d.path into p from public.documents d where d.id = p_doc and d.filing_id = l.filing_id and d.workspace_id = l.workspace_id and d.source in ('agent', 'agency', 'team');
  return p;
end $$;
revoke execute on function public.proof_doc(text, uuid) from public, anon, authenticated;
grant execute on function public.proof_doc(text, uuid) to service_role;
