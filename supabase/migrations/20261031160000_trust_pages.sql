-- Status pages: a store's licenses and permits in good standing, shared by link with a landlord, a franchisor, an
-- insurer, a lender or a delivery platform (src/trust.ts, src/TrustPage.tsx, src/TrustShare.tsx).
--
-- Copied from Vanta's and Drata's Trust Center: a page anyone with the link opens, showing live status, never the
-- documents themselves; a viewer asks for a document and the owner approves each request by hand. The owner chooses
-- what shows, can change it at any time (the page follows at once), and revokes the link in one tap.
--
-- The rules, enforced here and tested in supabase/tests/trust_pages.sql:
--   * Only an owner of the workspace makes, changes or revokes a link, and only for a store that is in the workspace.
--   * The token is 48 random hex characters, shown once. Only its SHA-256 is kept, so a database read can't open pages.
--   * Nobody reads these tables from the app or the page: everything goes through the functions below.
--   * What a page can ever show is cut down twice: when it's written (trust_clean, with the link's choices) and again
--     when it's read (the choices as they are now). Fees, form answers, people, files and paths never get in at all.
--   * A revoked, expired or made-up token gets the same answer, "gone", so a token can't be probed.
--   * The page is rate-limited per address; a document request needs the owner to have allowed requests, is limited
--     per address and per link, and only lands in the owner's Updates.

create table if not exists public.trust_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  store_id text not null check (length(store_id) between 1 and 120),
  label text not null default '' check (length(label) <= 80),
  prefix text not null check (prefix ~ '^[0-9a-f]{8}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  show jsonb not null default '{"address": true, "agency": true, "expiry": true, "verified": true, "numbers": false, "docs": false}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb check (octet_length(snapshot::text) <= 200000),
  snapshot_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  views int not null default 0 check (views >= 0),
  last_viewed_at timestamptz
);
create index if not exists trust_links_ws on public.trust_links(workspace_id, store_id);
comment on table public.trust_links is 'Shared status pages: one per link, token kept as SHA-256 only. Read and written only through the trust_* functions.';
alter table public.trust_links enable row level security;
revoke all on public.trust_links from public, anon, authenticated;

create table if not exists public.trust_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.trust_links(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  email text not null check (length(email) <= 200 and email ~* '^[^@\s<>]+@[^@\s<>]+\.[a-z]{2,}$'),
  org text not null default '' check (length(org) <= 120),
  note text not null default '' check (length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'sent', 'declined')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists trust_requests_ws on public.trust_requests(workspace_id, created_at desc);
alter table public.trust_requests enable row level security;
revoke all on public.trust_requests from public, anon, authenticated;

/* ------------------------------------------------------------------ what a page may hold */

-- A short string from untrusted JSON: text only, trimmed, capped.
create or replace function public.trust_str(v jsonb, n int) returns text
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'string' then nullif(left(btrim(v #>> '{}'), n), '') end
$$;
-- Bilingual words: {en, zh}, each capped; null when neither is there.
create or replace function public.trust_bi(v jsonb, n int) returns jsonb
language sql immutable set search_path = '' as $$
  select case when public.trust_str(v -> 'en', n) is null and public.trust_str(v -> 'zh', n) is null then null
    else jsonb_build_object('en', coalesce(public.trust_str(v -> 'en', n), public.trust_str(v -> 'zh', n)), 'zh', coalesce(public.trust_str(v -> 'zh', n), public.trust_str(v -> 'en', n))) end
$$;
-- A real calendar day (YYYY-MM-DD), or null: 2026-13-45 is not one.
create or replace function public.trust_day(v jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare x text := public.trust_str(v, 10);
begin
  if x !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return to_char(x::date, 'YYYY-MM-DD');
exception when others then return null;
end $$;
-- A switch: true only for JSON true.
create or replace function public.trust_on(v jsonb) returns boolean
language sql immutable set search_path = '' as $$ select coalesce(v = 'true'::jsonb, false) $$;

-- The page's content, cut to the link's choices. Anything not named here is dropped.
create or replace function public.trust_clean(p jsonb, p_show jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare rows jsonb := '[]'::jsonb; r jsonb; o jsonb; n int := 0;
  s_addr boolean := public.trust_on(p_show -> 'address'); s_agency boolean := public.trust_on(p_show -> 'agency');
  s_exp boolean := public.trust_on(p_show -> 'expiry'); s_num boolean := public.trust_on(p_show -> 'numbers');
  s_docs boolean := public.trust_on(p_show -> 'docs');
begin
  if jsonb_typeof(p -> 'rows') = 'array' then
    for r in select value from jsonb_array_elements(p -> 'rows') loop
      exit when n >= 200;
      continue when jsonb_typeof(r) <> 'object' or public.trust_bi(r -> 'name', 160) is null;
      continue when coalesce(r ->> 'status', '') not in ('approved', 'held', 'review', 'filing', 'ready', 'needs', 'draft', 'waiting', 'todo');
      o := jsonb_build_object('id', coalesce(public.trust_str(r -> 'id', 120), 'row' || n), 'name', public.trust_bi(r -> 'name', 160), 'status', r ->> 'status',
        'level', case when r ->> 'level' in ('federal', 'state', 'county', 'city') then r ->> 'level' end,
        'confirmed', public.trust_on(r -> 'confirmed'), 'shared', public.trust_on(r -> 'shared'));
      if s_agency then
        o := o || jsonb_build_object('agency', public.trust_bi(r -> 'agency', 160),
          'source', case when public.trust_str(r -> 'source', 400) ~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/|$)' then public.trust_str(r -> 'source', 400) end);
      end if;
      if s_exp then o := o || jsonb_build_object('expires', public.trust_day(r -> 'expires'), 'renews', public.trust_day(r -> 'renews'), 'approved_on', public.trust_day(r -> 'approved_on')); end if;
      if s_num then o := o || jsonb_build_object('number', case when public.trust_str(r -> 'number', 60) ~ '^[A-Za-z0-9 .#/-]{1,60}$' then public.trust_str(r -> 'number', 60) end); end if;
      if s_docs then o := o || jsonb_build_object('proof', public.trust_on(r -> 'proof')); end if;
      rows := rows || jsonb_strip_nulls(o);
      n := n + 1;
    end loop;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'business', public.trust_bi(p -> 'business', 160), 'store', public.trust_bi(p -> 'store', 160),
    'address', case when s_addr then public.trust_str(p -> 'address', 200) end,
    'stage', case when p ->> 'stage' in ('open', 'opening') then p ->> 'stage' end,
    'as_of', public.trust_day(p -> 'as_of'), 'rows', rows));
end $$;
revoke execute on function public.trust_str(jsonb, int), public.trust_bi(jsonb, int), public.trust_day(jsonb), public.trust_on(jsonb), public.trust_clean(jsonb, jsonb) from public, anon, authenticated;

-- The choices: six switches, each true or false, nothing else.
create or replace function public.trust_show(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  -- address, agency, expiry and verified are on unless turned off; numbers and document requests are off unless turned on
  select jsonb_build_object(
    'address', not coalesce(p -> 'address' = 'false'::jsonb, false), 'agency', not coalesce(p -> 'agency' = 'false'::jsonb, false),
    'expiry', not coalesce(p -> 'expiry' = 'false'::jsonb, false), 'verified', not coalesce(p -> 'verified' = 'false'::jsonb, false),
    'numbers', public.trust_on(p -> 'numbers'), 'docs', public.trust_on(p -> 'docs'))
$$;
revoke execute on function public.trust_show(jsonb) from public, anon, authenticated;

/* ------------------------------------------------------------------ the owner's side */

create or replace function public.trust_link_create(ws uuid, p_store text, p_label text default null, p_show jsonb default null, p_days int default 90, p_snapshot jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k text; pre text; lid uuid; sh jsonb; lab text; d int; st jsonb;
begin
  if not public.is_owner(ws) or not public.mfa_ok() then raise exception 'Only an owner of this workspace can share a status page.' using errcode = '42501'; end if;
  select w.state into st from public.workspaces w where w.id = ws;
  if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(st -> 'stores') = 'array' then st -> 'stores' else '[]'::jsonb end) s where s.value ->> 'id' = p_store) then
    raise exception 'That store isn''t in this workspace.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.trust_links t where t.workspace_id = ws and t.revoked_at is null and t.expires_at > now()) >= 25 then
    raise exception 'Up to 25 status links at a time. Revoke one first.';
  end if;
  d := least(greatest(coalesce(p_days, 90), 1), 366);
  sh := public.trust_show(coalesce(p_show, '{}'::jsonb));
  lab := left(btrim(coalesce(p_label, '')), 80);
  loop
    k := encode(extensions.gen_random_bytes(24), 'hex');
    pre := left(k, 8);
    exit when not exists (select 1 from public.trust_links t where t.token_hash = encode(extensions.digest(k, 'sha256'), 'hex'));
  end loop;
  insert into public.trust_links (workspace_id, store_id, label, prefix, token_hash, show, snapshot, snapshot_at, created_by, expires_at)
  values (ws, p_store, lab, pre, encode(extensions.digest(k, 'sha256'), 'hex'), sh, public.trust_clean(coalesce(p_snapshot, '{}'::jsonb), sh), now(), auth.uid(), now() + make_interval(days => d))
  returning id into lid;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object)
  values (ws, 'you', auth.uid(), jsonb_build_object('en', 'Shared a status page', 'zh', '共享了状态页'),
    jsonb_build_object('en', coalesce(nullif(lab, ''), 'Status link') || ' (' || pre || ', ' || d || ' days)', 'zh', coalesce(nullif(lab, ''), '状态链接') || '（' || pre || '，' || d || ' 天）'));
  return jsonb_build_object('id', lid, 'prefix', pre, 'token', k, 'expires_at', now() + make_interval(days => d));
end $$;

create or replace function public.trust_link_list(ws uuid) returns table (id uuid, store_id text, label text, prefix text, show jsonb, snapshot_at timestamptz, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, views int, last_viewed_at timestamptz, open_requests int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_view(ws) then raise exception 'Not your workspace.' using errcode = '42501'; end if;
  return query select t.id, t.store_id, t.label, t.prefix, t.show, t.snapshot_at, t.created_at, t.expires_at, t.revoked_at, t.views, t.last_viewed_at,
    (select count(*)::int from public.trust_requests q where q.link_id = t.id and q.status = 'open')
    from public.trust_links t where t.workspace_id = ws order by (t.revoked_at is null and t.expires_at > now()) desc, t.created_at desc limit 100;
end $$;

create or replace function public.trust_link_update(p_id uuid, p_show jsonb default null, p_label text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.trust_links; sh jsonb;
begin
  select * into l from public.trust_links t where t.id = p_id;
  if l.id is null or not public.is_owner(l.workspace_id) or not public.mfa_ok() then raise exception 'Only an owner of this workspace can change a status page.' using errcode = '42501'; end if;
  if l.revoked_at is not null then raise exception 'That link was revoked. Make a new one.'; end if;
  sh := case when p_show is null then l.show else public.trust_show(p_show) end;
  -- what the page holds is cut to the new choices at once, not only when it's next read
  update public.trust_links t set show = sh, label = coalesce(left(btrim(p_label), 80), t.label), snapshot = public.trust_clean(t.snapshot, sh) where t.id = p_id;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object)
  values (l.workspace_id, 'you', auth.uid(), jsonb_build_object('en', 'Changed what a status page shows', 'zh', '更改了状态页显示内容'), jsonb_build_object('en', l.prefix, 'zh', l.prefix));
  return true;
end $$;

create or replace function public.trust_link_revoke(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.trust_links;
begin
  select * into l from public.trust_links t where t.id = p_id;
  if l.id is null or not public.is_owner(l.workspace_id) or not public.mfa_ok() then raise exception 'Only an owner of this workspace can revoke a status page.' using errcode = '42501'; end if;
  update public.trust_links t set revoked_at = coalesce(t.revoked_at, now()), snapshot = '{}'::jsonb where t.id = p_id;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object)
  values (l.workspace_id, 'you', auth.uid(), jsonb_build_object('en', 'Revoked a status page', 'zh', '撤销了状态页'), jsonb_build_object('en', l.prefix, 'zh', l.prefix));
  return true;
end $$;

-- The page's content, written again as the workspace changes (the app, while anyone on the team has it open; the
-- monitor's daily pass does the same). Members write it; it is cut to each link's choices before it's kept.
create or replace function public.trust_refresh(ws uuid, p_store text, p_snapshot jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_member(ws) then raise exception 'Not your workspace.' using errcode = '42501'; end if;
  if octet_length(coalesce(p_snapshot, '{}'::jsonb)::text) > 200000 then raise exception 'Too large.'; end if;
  update public.trust_links t set snapshot = public.trust_clean(p_snapshot, t.show), snapshot_at = now()
   where t.workspace_id = ws and t.store_id = p_store and t.revoked_at is null and t.expires_at > now();
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.trust_requests_for(ws uuid) returns table (id uuid, link_id uuid, prefix text, label text, name text, email text, org text, note text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner(ws) or not public.mfa_ok() then raise exception 'Only an owner sees document requests.' using errcode = '42501'; end if;
  return query select q.id, q.link_id, t.prefix, t.label, q.name, q.email, q.org, q.note, q.status, q.created_at
    from public.trust_requests q join public.trust_links t on t.id = q.link_id where q.workspace_id = ws order by q.status = 'open' desc, q.created_at desc limit 100;
end $$;

create or replace function public.trust_request_close(p_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare q public.trust_requests;
begin
  select * into q from public.trust_requests r where r.id = p_id;
  if q.id is null or not public.is_owner(q.workspace_id) or not public.mfa_ok() then raise exception 'Only an owner answers document requests.' using errcode = '42501'; end if;
  if p_status not in ('sent', 'declined') then raise exception 'sent or declined'; end if;
  update public.trust_requests r set status = p_status, closed_at = now() where r.id = p_id;
  return true;
end $$;

revoke execute on function public.trust_link_create(uuid, text, text, jsonb, int, jsonb), public.trust_link_list(uuid), public.trust_link_update(uuid, jsonb, text),
  public.trust_link_revoke(uuid), public.trust_refresh(uuid, text, jsonb), public.trust_requests_for(uuid), public.trust_request_close(uuid, text) from public, anon;
grant execute on function public.trust_link_create(uuid, text, text, jsonb, int, jsonb), public.trust_link_list(uuid), public.trust_link_update(uuid, jsonb, text),
  public.trust_link_revoke(uuid), public.trust_refresh(uuid, text, jsonb), public.trust_requests_for(uuid), public.trust_request_close(uuid, text) to authenticated;

/* ------------------------------------------------------------------ the public side */

-- The caller's address, for rate limits (the same header the website's plan form uses).
create or replace function public.trust_caller() returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1), ''), 'unknown')
$$;
revoke execute on function public.trust_caller() from public, anon, authenticated;

-- The link's row for a token, or null for a token that is malformed, unknown, revoked or expired (all the same).
create or replace function public.trust_link_of(p_token text) returns public.trust_links
language plpgsql stable security definer set search_path = '' as $$
declare l public.trust_links;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.trust_links t where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if l.id is null or l.revoked_at is not null or l.expires_at <= now() then return null; end if;
  return l;
end $$;
revoke execute on function public.trust_link_of(text) from public, anon, authenticated;

-- The page, for anyone with the link. Status is worked out again as it's read: an expiry that has passed shows as
-- expired, one within 30 days as renewing, and when the agency's own record (the monitor's daily check) says expired,
-- denied or withdrawn, the row says so. "verified" is when Placetta last read the agency's record, if the owner shows it.
create or replace function public.trust_page(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.trust_links; s jsonb; r jsonb; o jsonb; rows jsonb := '[]'::jsonb; v_norm text; v_checked timestamptz; v_filing text; exp date; good int := 0; total int := 0; att int := 0;
begin
  if not public.rate_hit('trust_page:all', 3000, 60) or not public.rate_hit('trust_page:' || public.trust_caller(), 60, 60) then
    raise exception 'Too many requests. Try again in a minute.' using errcode = '54000';
  end if;
  l := public.trust_link_of(p_token);
  if l.id is null then return jsonb_build_object('status', 'gone'); end if;
  update public.trust_links x set views = x.views + 1, last_viewed_at = now() where x.id = l.id;
  s := public.trust_clean(l.snapshot, l.show);
  for r in select value from jsonb_array_elements(coalesce(s -> 'rows', '[]'::jsonb)) loop
    o := r;
    exp := case when public.trust_on(l.show -> 'expiry') then (r ->> 'expires')::date end;
    v_norm := null; v_checked := null; v_filing := null;
    select f.status, ft.agency_norm, ft.last_checked_at into v_filing, v_norm, v_checked
      from public.filings f left join public.filing_tracking ft on ft.filing_id = f.id
     where f.workspace_id = l.workspace_id and f.app_id = r ->> 'id' and f.status <> 'canceled' order by f.updated_at desc limit 1;
    -- approved by the agency since the page was last written: it counts now, not when someone next opens the app
    if (r ->> 'status') not in ('approved', 'held') and v_filing = 'accepted' then o := o || jsonb_build_object('status', 'approved'); end if;
    if (o ->> 'status') in ('approved', 'held') then
      o := o || jsonb_build_object('standing',
        case when v_norm in ('expired', 'denied', 'withdrawn') then 'attention'
             when exp is not null and exp < current_date then 'expired'
             when exp is not null and exp <= current_date + 30 then 'renewing'
             else 'good' end);
    else
      o := o || jsonb_build_object('standing', case when (r ->> 'status') in ('review', 'filing') or v_filing in ('submitted', 'in_progress', 'needs_info') then 'pending' else 'preparing' end);
    end if;
    if public.trust_on(l.show -> 'verified') and v_checked is not null then
      o := o || jsonb_build_object('verified', to_char(v_checked at time zone 'UTC', 'YYYY-MM-DD'));
    end if;
    total := total + 1;
    if o ->> 'standing' = 'good' or o ->> 'standing' = 'renewing' then good := good + 1; end if;
    if o ->> 'standing' in ('expired', 'attention') then att := att + 1; end if;
    rows := rows || o;
  end loop;
  return jsonb_build_object('status', 'ok', 'page', s || jsonb_build_object('rows', rows), 'counts', jsonb_build_object('good', good, 'total', total, 'attention', att),
    'snapshot_at', l.snapshot_at, 'expires_at', l.expires_at, 'requests', public.trust_on(l.show -> 'docs'));
end $$;

-- Ask the owner for a copy of the documents. Only when the owner allowed it; never sends a file.
create or replace function public.trust_request(p_token text, p_name text, p_email text, p_org text default '', p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.trust_links; qid uuid; who text;
begin
  if not public.rate_hit('trust_request:' || public.trust_caller(), 5, 3600) then raise exception 'Too many requests. Try again later.' using errcode = '54000'; end if;
  l := public.trust_link_of(p_token);
  if l.id is null then return jsonb_build_object('status', 'gone'); end if;
  if not public.trust_on(l.show -> 'docs') then raise exception 'This page doesn''t take document requests.' using errcode = '42501'; end if;
  if not public.rate_hit('trust_request:link:' || l.id, 20, 86400) then raise exception 'Too many requests. Try again later.' using errcode = '54000'; end if;
  insert into public.trust_requests (workspace_id, link_id, name, email, org, note)
  values (l.workspace_id, l.id, left(btrim(coalesce(p_name, '')), 120), lower(btrim(coalesce(p_email, ''))), left(btrim(coalesce(p_org, '')), 120), left(btrim(coalesce(p_note, '')), 1000))
  returning id into qid;
  who := left(btrim(p_name), 60) || case when btrim(coalesce(p_org, '')) <> '' then ' (' || left(btrim(p_org), 60) || ')' end;
  insert into public.updates (workspace_id, kind, title, body, dedupe)
  values (l.workspace_id, 'team',
    jsonb_build_object('en', who || ' asked for documents', 'zh', who || ' 申请查看文件'),
    jsonb_build_object('en', 'From your status page ' || coalesce(nullif(l.label, ''), l.prefix) || '. Nothing was sent. Open Stores, Status pages to send or decline.',
                       'zh', '来自状态页 ' || coalesce(nullif(l.label, ''), l.prefix) || '。尚未发送任何文件。请在「门店」的「状态页」中发送或拒绝。'),
    'trust-request:' || qid);
  return jsonb_build_object('status', 'ok');
end $$;

revoke execute on function public.trust_page(text), public.trust_request(text, text, text, text, text) from public;
grant execute on function public.trust_page(text), public.trust_request(text, text, text, text, text) to anon, authenticated;
