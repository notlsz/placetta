-- Vanta's two growth engines, for Placetta: the Trust Center (a store's status page) and the auditor channel (partners).
--
-- A. Status pages (20261031160000_trust_pages.sql), finished:
--   * "Fully licensed" only when every license in the store's plan is active (in force, or in force with its renewal
--     due). Worked out as the page is read, from the expiry even when the owner hides the date (kept as _exp, never
--     returned), so a lapsed license can't hide behind a switch.
--   * The owner chooses whether the store's name shows (a new switch, on by default), as with the address.
--   * A link may have no end date, and may have a password (bcrypt; tries are rate-limited per link; a locked page counts
--     no view and says nothing about the store).
--   * Each link carries a short public ref for its footer ("Licenses managed by Placetta. Get your store licensed."). A
--     business that signs up through it within 90 days is recorded against the link (first touch wins), so the owner
--     sees how many stores their page brought in. Nothing about the viewer is kept but the view count.
--   * The caller's address is used only as a SHA-256 in the rate-limit keys, never as itself.
--
-- B. Partners (20261017210100_partners.sql), finished:
--   * Three more kinds: bookkeepers, Chinese chambers of commerce, market-entry consultancies.
--   * Commission terms as a setting: 15% of the plan and 10% of license fees by default, for each referral's first
--     share_months (12) months; the team can change the defaults or set them per partner. A ledger of license-fee
--     commissions next to the plan's (partner_revenue). Stored only: payouts stay manual and nothing moves money.
--   * With the business's consent, a partner sees each referred store's licensing status and what's due (the same
--     summary headquarters gets, without the address). A consent given before this asked for less, so it shares only
--     what it covered until the owner says yes to the store view (consent_scope 2).
-- Tested in supabase/tests/trust_partners.sql. Safe to run twice.

/* ================================================================== A. status pages */

alter table public.trust_links alter column expires_at drop not null;
alter table public.trust_links add column if not exists password_hash text check (password_hash is null or password_hash ~ '^\$2[aby]\$');
alter table public.trust_links add column if not exists ref text unique check (ref is null or ref ~ '^[a-z2-9]{10}$');
alter table public.trust_links alter column show set default '{"name": true, "address": true, "agency": true, "expiry": true, "verified": true, "numbers": false, "docs": false}'::jsonb;

-- A link's public ref: 10 characters without look-alikes, for the footer's sign-up link. Not a key to anything.
create or replace function public.trust_ref_new() returns text
language plpgsql volatile set search_path = '' as $$
declare abc text := 'abcdefghjkmnpqrstuvwxyz23456789'; c text; b bytea;
begin
  loop
    b := extensions.gen_random_bytes(10); c := '';
    for i in 0..9 loop c := c || substr(abc, (get_byte(b, i) % 31) + 1, 1); end loop;
    exit when not exists (select 1 from public.trust_links where ref = c);
  end loop;
  return c;
end $$;
revoke execute on function public.trust_ref_new() from public, anon, authenticated;
update public.trust_links set ref = public.trust_ref_new() where ref is null;

-- The address, only as a hash, for rate limits.
create or replace function public.trust_caller() returns text
language sql stable set search_path = '' as $$
  select left(encode(extensions.digest(coalesce(nullif(split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1), ''), 'unknown'), 'sha256'), 'hex'), 32)
$$;
revoke execute on function public.trust_caller() from public, anon, authenticated;

-- The choices: seven switches. Name, address, agency, expiry and verified are on unless turned off; numbers and
-- document requests are off unless turned on.
create or replace function public.trust_show(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'name', not coalesce(p -> 'name' = 'false'::jsonb, false),
    'address', not coalesce(p -> 'address' = 'false'::jsonb, false), 'agency', not coalesce(p -> 'agency' = 'false'::jsonb, false),
    'expiry', not coalesce(p -> 'expiry' = 'false'::jsonb, false), 'verified', not coalesce(p -> 'verified' = 'false'::jsonb, false),
    'numbers', public.trust_on(p -> 'numbers'), 'docs', public.trust_on(p -> 'docs'))
$$;
revoke execute on function public.trust_show(jsonb) from public, anon, authenticated;

-- The page's content, cut to the link's choices. Anything not named here is dropped. _exp is the expiry kept for
-- working out standing whatever the owner shows; trust_page never returns it.
create or replace function public.trust_clean(p jsonb, p_show jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare rows jsonb := '[]'::jsonb; r jsonb; o jsonb; n int := 0;
  s_name boolean := not coalesce(p_show -> 'name' = 'false'::jsonb, false);
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
        'confirmed', public.trust_on(r -> 'confirmed'), 'shared', public.trust_on(r -> 'shared'),
        '_exp', coalesce(public.trust_day(r -> '_exp'), public.trust_day(r -> 'expires')));
      if s_agency then
        o := o || jsonb_build_object('agency', public.trust_bi(r -> 'agency', 160),
          'source', case when public.trust_str(r -> 'source', 400) ~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/|$)' then public.trust_str(r -> 'source', 400) end);
      end if;
      if s_exp then o := o || jsonb_build_object('expires', coalesce(public.trust_day(r -> 'expires'), public.trust_day(r -> '_exp')), 'renews', public.trust_day(r -> 'renews'), 'approved_on', public.trust_day(r -> 'approved_on')); end if;
      if s_num then o := o || jsonb_build_object('number', case when public.trust_str(r -> 'number', 60) ~ '^[A-Za-z0-9 .#/-]{1,60}$' then public.trust_str(r -> 'number', 60) end); end if;
      if s_docs then o := o || jsonb_build_object('proof', public.trust_on(r -> 'proof')); end if;
      rows := rows || jsonb_strip_nulls(o);
      n := n + 1;
    end loop;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'business', public.trust_bi(p -> 'business', 160), 'store', case when s_name then public.trust_bi(p -> 'store', 160) end,
    'address', case when s_addr then public.trust_str(p -> 'address', 200) end,
    'stage', case when p ->> 'stage' in ('open', 'opening') then p ->> 'stage' end,
    'as_of', public.trust_day(p -> 'as_of'), 'rows', rows));
end $$;
revoke execute on function public.trust_clean(jsonb, jsonb) from public, anon, authenticated;

-- A password for a page: 6 to 72 characters, kept as bcrypt only. Null or blank: none.
create or replace function public.trust_pw_hash(p text) returns text
language plpgsql volatile set search_path = '' as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  if length(p) < 6 or length(p) > 72 then raise exception 'A page password is 6 to 72 characters.' using errcode = '22023'; end if;
  return extensions.crypt(p, extensions.gen_salt('bf', 8));
end $$;
revoke execute on function public.trust_pw_hash(text) from public, anon, authenticated;

drop function if exists public.trust_link_create(uuid, text, text, jsonb, int, jsonb);
-- p_days: 1 to 366, or 0 for a link with no end date (null: 90).
create or replace function public.trust_link_create(ws uuid, p_store text, p_label text default null, p_show jsonb default null, p_days int default 90,
  p_snapshot jsonb default '{}'::jsonb, p_password text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k text; pre text; lid uuid; sh jsonb; lab text; d int; st jsonb; ex timestamptz; pw text;
begin
  if not public.is_owner(ws) or not public.mfa_ok() then raise exception 'Only an owner of this workspace can share a status page.' using errcode = '42501'; end if;
  select w.state into st from public.workspaces w where w.id = ws;
  if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(st -> 'stores') = 'array' then st -> 'stores' else '[]'::jsonb end) s where s.value ->> 'id' = p_store) then
    raise exception 'That store isn''t in this workspace.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.trust_links t where t.workspace_id = ws and t.revoked_at is null and (t.expires_at is null or t.expires_at > now())) >= 25 then
    raise exception 'Up to 25 status links at a time. Revoke one first.';
  end if;
  d := case when p_days = 0 then null else least(greatest(coalesce(p_days, 90), 1), 366) end;
  ex := case when d is null then null else now() + make_interval(days => d) end;
  sh := public.trust_show(coalesce(p_show, '{}'::jsonb));
  lab := left(btrim(coalesce(p_label, '')), 80);
  pw := public.trust_pw_hash(p_password);
  loop
    k := encode(extensions.gen_random_bytes(24), 'hex');
    pre := left(k, 8);
    exit when not exists (select 1 from public.trust_links t where t.token_hash = encode(extensions.digest(k, 'sha256'), 'hex'));
  end loop;
  insert into public.trust_links (workspace_id, store_id, label, prefix, token_hash, show, snapshot, snapshot_at, created_by, expires_at, password_hash, ref)
  values (ws, p_store, lab, pre, encode(extensions.digest(k, 'sha256'), 'hex'), sh, public.trust_clean(coalesce(p_snapshot, '{}'::jsonb), sh), now(), auth.uid(), ex, pw, public.trust_ref_new())
  returning id into lid;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object)
  values (ws, 'you', auth.uid(), jsonb_build_object('en', 'Shared a status page', 'zh', '共享了状态页'),
    jsonb_build_object('en', coalesce(nullif(lab, ''), 'Status link') || ' (' || pre || ', ' || coalesce(d || ' days', 'no end date') || case when pw is null then '' else ', with a password' end || ')',
                       'zh', coalesce(nullif(lab, ''), '状态链接') || '（' || pre || '，' || coalesce(d || ' 天', '长期有效') || case when pw is null then '' else '，设有密码' end || '）'));
  return jsonb_build_object('id', lid, 'prefix', pre, 'token', k, 'expires_at', ex);
end $$;

drop function if exists public.trust_link_list(uuid);
create or replace function public.trust_link_list(ws uuid) returns table (id uuid, store_id text, label text, prefix text, show jsonb, snapshot_at timestamptz, created_at timestamptz,
  expires_at timestamptz, revoked_at timestamptz, views int, last_viewed_at timestamptz, open_requests int, locked boolean, signups int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_view(ws) then raise exception 'Not your workspace.' using errcode = '42501'; end if;
  return query select t.id, t.store_id, t.label, t.prefix, public.trust_show(t.show), t.snapshot_at, t.created_at, t.expires_at, t.revoked_at, t.views, t.last_viewed_at,
    (select count(*)::int from public.trust_requests q where q.link_id = t.id and q.status = 'open'),
    t.password_hash is not null,
    (select count(*)::int from public.trust_signups g where g.link_id = t.id)
    from public.trust_links t where t.workspace_id = ws
    order by (t.revoked_at is null and (t.expires_at is null or t.expires_at > now())) desc, t.created_at desc limit 100;
end $$;

-- Set, change or take off a page's password. Owners only.
create or replace function public.trust_link_password(p_id uuid, p_password text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.trust_links; pw text;
begin
  select * into l from public.trust_links t where t.id = p_id;
  if l.id is null or not public.is_owner(l.workspace_id) or not public.mfa_ok() then raise exception 'Only an owner of this workspace can change a status page.' using errcode = '42501'; end if;
  if l.revoked_at is not null then raise exception 'That link was revoked. Make a new one.'; end if;
  pw := public.trust_pw_hash(p_password);
  update public.trust_links t set password_hash = pw where t.id = p_id;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object)
  values (l.workspace_id, 'you', auth.uid(), case when pw is null then jsonb_build_object('en', 'Took the password off a status page', 'zh', '取消了状态页密码')
    else jsonb_build_object('en', 'Set a status page password', 'zh', '设置了状态页密码') end, jsonb_build_object('en', l.prefix, 'zh', l.prefix));
  return true;
end $$;

create or replace function public.trust_refresh(ws uuid, p_store text, p_snapshot jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_member(ws) then raise exception 'Not your workspace.' using errcode = '42501'; end if;
  if octet_length(coalesce(p_snapshot, '{}'::jsonb)::text) > 200000 then raise exception 'Too large.'; end if;
  update public.trust_links t set snapshot = public.trust_clean(p_snapshot, t.show), snapshot_at = now()
   where t.workspace_id = ws and t.store_id = p_store and t.revoked_at is null and (t.expires_at is null or t.expires_at > now());
  get diagnostics n = row_count;
  return n;
end $$;

-- Whether a link's password lets this caller in: no password, or the right one (tries limited per link).
create or replace function public.trust_unlocked(l public.trust_links, p_password text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if l.password_hash is null then return true; end if;
  if coalesce(p_password, '') = '' then return false; end if;
  if not public.rate_hit('trust_pw:' || l.id::text, 30, 3600) then raise exception 'Too many tries. Try again later.' using errcode = '54000'; end if;
  return extensions.crypt(p_password, l.password_hash) = l.password_hash;
end $$;
revoke execute on function public.trust_unlocked(public.trust_links, text) from public, anon, authenticated;

-- The page, for anyone with the link (and its password, when it has one). Standing is worked out as it's read, from
-- the expiry whether or not it shows: past it, expired; within 30 days, renewing; the agency's own record (the monitor's
-- daily check) saying expired, denied or withdrawn, attention. "Fully licensed" (licensed) only when there is at least
-- one license and every one is active or renewing. verified: the day Placetta last read the agency's record.
drop function if exists public.trust_page(text);
create or replace function public.trust_page(p_token text, p_password text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.trust_links; s jsonb; r jsonb; o jsonb; rows jsonb := '[]'::jsonb; v_norm text; v_checked timestamptz; v_filing text; exp date;
  good int := 0; total int := 0; att int := 0; s_exp boolean;
begin
  if not public.rate_hit('trust_page:all', 3000, 60) or not public.rate_hit('trust_page:' || public.trust_caller(), 60, 60) then
    raise exception 'Too many requests. Try again in a minute.' using errcode = '54000';
  end if;
  l := public.trust_link_of(p_token);
  if l.id is null then return jsonb_build_object('status', 'gone'); end if;
  if not public.trust_unlocked(l, p_password) then return jsonb_build_object('status', 'locked', 'wrong', coalesce(p_password, '') <> ''); end if;
  update public.trust_links x set views = x.views + 1, last_viewed_at = now() where x.id = l.id;
  s_exp := public.trust_on(l.show -> 'expiry');
  s := public.trust_clean(l.snapshot, l.show);
  for r in select value from jsonb_array_elements(coalesce(s -> 'rows', '[]'::jsonb)) loop
    o := r - '_exp';
    exp := coalesce(public.trust_day(r -> '_exp'), case when s_exp then public.trust_day(r -> 'expires') end)::date;
    v_norm := null; v_checked := null; v_filing := null;
    select f.status, ft.agency_norm, ft.last_checked_at into v_filing, v_norm, v_checked
      from public.filings f left join public.filing_tracking ft on ft.filing_id = f.id
     where f.workspace_id = l.workspace_id and f.app_id = r ->> 'id' and f.status <> 'canceled' order by f.updated_at desc limit 1;
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
    if o ->> 'standing' in ('good', 'renewing') then good := good + 1; end if;
    if o ->> 'standing' in ('expired', 'attention') then att := att + 1; end if;
    rows := rows || o;
  end loop;
  return jsonb_build_object('status', 'ok', 'page', s || jsonb_build_object('rows', rows), 'counts', jsonb_build_object('good', good, 'total', total, 'attention', att),
    'licensed', total > 0 and good = total, 'snapshot_at', l.snapshot_at, 'expires_at', l.expires_at, 'requests', public.trust_on(l.show -> 'docs'), 'ref', l.ref);
end $$;

drop function if exists public.trust_request(text, text, text, text, text);
create or replace function public.trust_request(p_token text, p_name text, p_email text, p_org text default '', p_note text default '', p_password text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.trust_links; qid uuid; who text;
begin
  if not public.rate_hit('trust_request:' || public.trust_caller(), 5, 3600) then raise exception 'Too many requests. Try again later.' using errcode = '54000'; end if;
  l := public.trust_link_of(p_token);
  if l.id is null then return jsonb_build_object('status', 'gone'); end if;
  if not public.trust_unlocked(l, p_password) then return jsonb_build_object('status', 'locked'); end if;
  if not public.trust_on(l.show -> 'docs') then raise exception 'This page doesn''t take document requests.' using errcode = '42501'; end if;
  if not public.rate_hit('trust_request:link:' || l.id, 20, 86400) then raise exception 'Too many requests. Try again later.' using errcode = '54000'; end if;
  insert into public.trust_requests (workspace_id, link_id, name, email, org, note)
  values (l.workspace_id, l.id, left(btrim(coalesce(p_name, '')), 120), lower(btrim(coalesce(p_email, ''))), left(btrim(coalesce(p_org, '')), 120), left(btrim(coalesce(p_note, '')), 1000))
  returning id into qid;
  who := left(btrim(p_name), 60) || case when btrim(coalesce(p_org, '')) <> '' then ' (' || left(btrim(p_org), 60) || ')' else '' end;
  insert into public.updates (workspace_id, kind, title, body, dedupe)
  values (l.workspace_id, 'team',
    jsonb_build_object('en', who || ' asked for documents', 'zh', who || ' 申请查看文件'),
    jsonb_build_object('en', 'From your status page ' || coalesce(nullif(l.label, ''), l.prefix) || '. Nothing was sent. Open Stores, Status pages to send or decline.',
                       'zh', '来自状态页 ' || coalesce(nullif(l.label, ''), l.prefix) || '。尚未发送任何文件。请在「门店」的「状态页」中发送或拒绝。'),
    'trust-request:' || qid);
  return jsonb_build_object('status', 'ok');
end $$;

/* ---------------- the footer's sign-up link: stores a page brought in ---------------- */

create table if not exists public.trust_signups (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  link_id uuid references public.trust_links(id) on delete set null,
  from_workspace uuid references public.workspaces(id) on delete cascade,
  touched_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table public.trust_signups is 'A workspace that started through a status page''s footer link (first touch, within 90 days). Counted for the page''s owner; nothing else is shared either way.';
create index if not exists trust_signups_link on public.trust_signups(link_id);
create index if not exists trust_signups_from on public.trust_signups(from_workspace);
alter table public.trust_signups enable row level security;
revoke all on public.trust_signups from public, anon, authenticated;

-- Record the status page a new workspace came through: its owner, within a day of creating it, from a touch in the
-- last 90 days. The first page recorded stays; a workspace never counts for its own pages. An unknown ref is quiet.
create or replace function public.trust_signup_claim(ws uuid, p_ref text, p_touched_at timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
declare w record; l public.trust_links; n int;
begin
  if not public.is_owner(ws) then raise exception 'Only an owner can do this.' using errcode = '42501'; end if;
  select id, created_at into w from public.workspaces where id = ws for update;
  if w.created_at < now() - interval '1 day' then return false; end if;
  if p_touched_at is null or p_touched_at < now() - interval '90 days' or p_touched_at > now() + interval '5 minutes' then return false; end if;
  select * into l from public.trust_links t where t.ref = lower(btrim(coalesce(p_ref, '')));
  if l.id is null or l.workspace_id = ws or public.is_member(l.workspace_id) then return false; end if;
  insert into public.trust_signups (workspace_id, link_id, from_workspace, touched_at) values (ws, l.id, l.workspace_id, p_touched_at)
  on conflict (workspace_id) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke execute on function public.trust_link_create(uuid, text, text, jsonb, int, jsonb, text), public.trust_link_list(uuid), public.trust_link_password(uuid, text),
  public.trust_refresh(uuid, text, jsonb), public.trust_signup_claim(uuid, text, timestamptz) from public, anon;
grant execute on function public.trust_link_create(uuid, text, text, jsonb, int, jsonb, text), public.trust_link_list(uuid), public.trust_link_password(uuid, text),
  public.trust_refresh(uuid, text, jsonb), public.trust_signup_claim(uuid, text, timestamptz) to authenticated;
revoke execute on function public.trust_page(text, text), public.trust_request(text, text, text, text, text, text) from public;
grant execute on function public.trust_page(text, text), public.trust_request(text, text, text, text, text, text) to anon, authenticated;

/* ================================================================== B. partners */

alter table public.partners drop constraint if exists partners_kind_check;
alter table public.partners add constraint partners_kind_check
  check (kind in ('franchisor', 'master_franchisee', 'broker', 'landlord', 'investor', 'accountant', 'bookkeeper', 'chamber', 'consultancy', 'other'));
alter table public.partners add column if not exists fee_pct numeric(5, 2) check (fee_pct is null or (fee_pct >= 0 and fee_pct <= 50));
comment on column public.partners.share_pct is 'This partner''s share of plan revenue; null: the default in partner_terms.';
comment on column public.partners.fee_pct is 'This partner''s share of license fees; null: the default in partner_terms.';

create or replace function public.partner_kind_ok(k text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(k, '') in ('franchisor', 'master_franchisee', 'broker', 'landlord', 'investor', 'accountant', 'bookkeeper', 'chamber', 'consultancy', 'other')
$$;
revoke execute on function public.partner_kind_ok(text) from public, anon, authenticated;

-- The default commission: one row. 15% of what the business pays for its plan and 10% of its license fees, for the
-- partner's share_months (12 by default) from the month it was referred. The team changes it; a partner's own
-- share_pct or fee_pct, when set, wins.
create table if not exists public.partner_terms (
  id boolean primary key default true check (id),
  plan_pct numeric(5, 2) not null default 15 check (plan_pct >= 0 and plan_pct <= 50),
  fee_pct numeric(5, 2) not null default 10 check (fee_pct >= 0 and fee_pct <= 50),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
comment on table public.partner_terms is 'Default partner commission (one row): plan_pct of plan revenue and fee_pct of license fees, for each referral''s first share_months. Stored only; payouts are made by hand.';
insert into public.partner_terms (id) values (true) on conflict (id) do nothing;
alter table public.partner_terms enable row level security;
revoke all on public.partner_terms from public, anon, authenticated;

-- A partner's terms as they apply: their own, else the default.
create or replace function public.partner_terms_for(p public.partners) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('plan_pct', coalesce(p.share_pct, t.plan_pct), 'fee_pct', coalesce(p.fee_pct, t.fee_pct), 'months', p.share_months,
    'plan_default', p.share_pct is null, 'fee_default', p.fee_pct is null)
  from public.partner_terms t where t.id
$$;
revoke execute on function public.partner_terms_for(public.partners) from public, anon, authenticated;

create or replace function public.partner_terms_get() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return (select jsonb_build_object('plan_pct', plan_pct, 'fee_pct', fee_pct, 'updated_at', updated_at) from public.partner_terms where id);
end $$;

create or replace function public.partner_terms_set(p_plan_pct numeric, p_fee_pct numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if p_plan_pct is null or p_plan_pct < 0 or p_plan_pct > 50 or p_fee_pct is null or p_fee_pct < 0 or p_fee_pct > 50 then
    raise exception 'Each share is a percentage from 0 to 50.';
  end if;
  update public.partner_terms set plan_pct = round(p_plan_pct, 2), fee_pct = round(p_fee_pct, 2), updated_at = now(), updated_by = auth.uid() where id;
  return public.partner_terms_get();
end $$;

-- License-fee commissions, one per paid license charge of a referred business inside the share's months.
create table if not exists public.partner_fee_commissions (
  charge_id uuid primary key references public.license_charges(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  fee_usd numeric(12, 2) not null check (fee_usd >= 0),
  pct numeric(5, 2) not null,
  amount_usd numeric(12, 2) not null check (amount_usd >= 0),
  computed_at timestamptz not null default now()
);
comment on table public.partner_fee_commissions is 'The license-fee side of the partner ledger (the plan side is partner_revenue). Written by partner_revenue_sweep only; nothing is paid from here.';
create index if not exists partner_fee_commissions_partner on public.partner_fee_commissions(partner_id, month);
alter table public.partner_fee_commissions enable row level security;
revoke all on public.partner_fee_commissions from public, anon, authenticated;

-- Once a day: the plan side (as before, now with the default when a partner has no share of their own) and the fee
-- side: each license charge paid in the share's months, at the fee share. A charge let go (void) before its month
-- closes comes off; closed months stay as they closed.
create or replace function public.partner_revenue_sweep(p_today date default current_date) returns int
language plpgsql security definer set search_path = '' as $$
declare mo date := date_trunc('month', p_today)::date; n int; m int; t public.partner_terms;
begin
  select * into t from public.partner_terms where id;
  insert into public.partner_revenue as pr (workspace_id, month, partner_id, revenue_usd, share_pct, share_usd, computed_at)
  select r.workspace_id, mo, p.id, round(public.ai_plan_revenue(b, mo), 2), coalesce(p.share_pct, t.plan_pct),
         round(public.ai_plan_revenue(b, mo) * coalesce(p.share_pct, t.plan_pct) / 100, 2), now()
    from public.workspace_referrals r
    join public.partners p on p.id = r.partner_id and p.status in ('approved', 'paused')
    join public.billing b on b.workspace_id = r.workspace_id
   where mo >= date_trunc('month', r.attributed_at)::date
     and mo < (date_trunc('month', r.attributed_at) + make_interval(months => p.share_months))::date
  on conflict (workspace_id, month) do update set
    revenue_usd = greatest(pr.revenue_usd, excluded.revenue_usd),
    share_pct = excluded.share_pct,
    share_usd = round(greatest(pr.revenue_usd, excluded.revenue_usd) * coalesce(excluded.share_pct, 0) / 100, 2),
    computed_at = now();
  get diagnostics n = row_count;

  delete from public.partner_fee_commissions fc using public.license_charges c
   where c.id = fc.charge_id and c.status = 'void' and fc.month >= mo;
  insert into public.partner_fee_commissions (charge_id, workspace_id, partner_id, month, fee_usd, pct, amount_usd)
  select c.id, c.workspace_id, p.id, date_trunc('month', coalesce(c.paid_at, c.created_at))::date, round(c.cents / 100.0, 2), coalesce(p.fee_pct, t.fee_pct),
         round(c.cents / 100.0 * coalesce(p.fee_pct, t.fee_pct) / 100, 2)
    from public.license_charges c
    join public.workspace_referrals r on r.workspace_id = c.workspace_id
    join public.partners p on p.id = r.partner_id and p.status in ('approved', 'paused')
   where c.status in ('paid', 'used') and c.cents > 0
     and coalesce(c.paid_at, c.created_at) >= r.attributed_at
     and coalesce(c.paid_at, c.created_at) < r.attributed_at + make_interval(months => p.share_months)
     and coalesce(c.paid_at, c.created_at) < (mo + interval '1 month')
  on conflict (charge_id) do nothing;
  get diagnostics m = row_count;
  return n + m;
end $$;
revoke execute on function public.partner_revenue_sweep(date) from public, anon, authenticated;
grant execute on function public.partner_revenue_sweep(date) to service_role;

create or replace function public.partner_apply(p_org text, p_kind text, p_contact text default null, p_website text default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); cur public.partners; site text := nullif(trim(coalesce(p_website, '')), '');
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if not public.email_proven(me) or not public.mfa_ok() then raise exception 'Confirm your email (and two-step sign-in, if it''s on) first.'; end if;
  if length(trim(coalesce(p_org, ''))) not between 1 and 120 then raise exception 'Add your organization''s name.'; end if;
  if not public.partner_kind_ok(p_kind) then raise exception 'Pick what kind of partner you are.'; end if;
  if site is not null and site !~* '^https?://' then site := 'https://' || site; end if;
  select * into cur from public.partners where user_id = me for update;
  if cur.status in ('approved', 'paused') then raise exception 'This account is already a Placetta partner.'; end if;
  if cur.id is null then
    insert into public.partners(user_id, org_name, kind, contact_name, website, note)
    values (me, left(trim(p_org), 120), p_kind, nullif(left(trim(coalesce(p_contact, '')), 120), ''), left(site, 300), nullif(left(trim(coalesce(p_note, '')), 1000), ''))
    returning * into cur;
  else
    update public.partners set org_name = left(trim(p_org), 120), kind = p_kind, contact_name = nullif(left(trim(coalesce(p_contact, '')), 120), ''),
      website = left(site, 300), note = nullif(left(trim(coalesce(p_note, '')), 1000), ''), status = 'pending'
    where id = cur.id returning * into cur;
  end if;
  return public.partner_me();
end $$;

-- The signed-in person's partner account, with the commission terms that apply to them.
create or replace function public.partner_me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'org_name', p.org_name, 'kind', p.kind, 'contact_name', p.contact_name, 'website', p.website, 'status', p.status,
    'code', case when p.status = 'approved' then p.code end, 'share_pct', p.share_pct, 'share_months', p.share_months,
    'created_at', p.created_at, 'approved_at', p.approved_at, 'terms', public.partner_terms_for(p))
  from public.partners p where p.user_id = auth.uid() and public.mfa_ok();
$$;

/* ---------------- what a consenting business shares: its stores' licensing status and what's due ---------------- */

alter table public.workspace_referrals add column if not exists consent_scope smallint not null default 1 check (consent_scope in (1, 2));
alter table public.workspace_referrals add column if not exists stores jsonb check (stores is null or jsonb_typeof(stores) = 'array');
comment on column public.workspace_referrals.consent_scope is '1: business name, stage, permits approved, opening date. 2: also each store''s licensing status and what''s due.';
alter table public.workspace_referrals drop constraint if exists workspace_referrals_private;
alter table public.workspace_referrals add constraint workspace_referrals_private check (consent or (business_name is null and stage is null and permits_done is null
  and permits_total is null and opening_date is null and stores is null));
grant select (stores, consent_scope) on public.workspace_referrals to authenticated;

-- Per store, from the headquarters summary: name, stage, the counts, the earliest item due and whether it's fully
-- licensed (nothing pending, nothing overdue, at least one license current). No address, documents or people.
create or replace function public.referral_stores(st jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s->'id', 'name', s->'name', 'stage', s->'stage', 'status', s->'status',
      'current', s->'current', 'due_30', s->'due_30', 'overdue', s->'overdue', 'pending', s->'pending', 'next', s->'next',
      'licensed', (s->>'pending')::int = 0 and (s->>'overdue')::int = 0 and ((s->>'current')::int + (s->>'due_30')::int) > 0)), '[]'::jsonb)
  from jsonb_array_elements(public.hq_summary(st)) s
$$;
revoke execute on function public.referral_stores(jsonb) from public, anon, authenticated;

create or replace function public.referral_snapshot(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare w record; p jsonb;
begin
  select name, state into w from public.workspaces where id = ws;
  if w.name is null then return; end if;
  p := public.referral_progress(w.state);
  update public.workspace_referrals r set
    business_name = case when r.consent then left(w.name, 120) end,
    stage = case when r.consent then p->>'stage' end,
    permits_done = case when r.consent then (p->>'permits_done')::int end,
    permits_total = case when r.consent then (p->>'permits_total')::int end,
    opening_date = case when r.consent then (p->>'opening_date')::date end,
    stores = case when r.consent and r.consent_scope >= 2 then public.referral_stores(w.state) end,
    progress_at = case when r.consent then now() end
  where r.workspace_id = ws;
end $$;
revoke execute on function public.referral_snapshot(uuid) from public, anon, authenticated;

-- As before; a consent given now covers the store view.
create or replace function public.referral_claim(ws uuid, p_code text, p_touched_at timestamptz, p_consent boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.partners; w record; n int;
begin
  if not public.is_owner(ws) then raise exception 'Only an owner can do this.'; end if;
  select id, created_at into w from public.workspaces where id = ws for update;
  if w.created_at < now() - interval '1 day' then raise exception 'A partner can only be added when the workspace is created.'; end if;
  if p_touched_at is null or p_touched_at < now() - interval '90 days' or p_touched_at > now() + interval '5 minutes' then
    raise exception 'This referral link is more than 90 days old.';
  end if;
  select * into p from public.partners where code = upper(trim(coalesce(p_code, ''))) and status = 'approved';
  if p.id is null then return null; end if;
  if p.user_id = auth.uid() or exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = p.user_id) then
    raise exception 'A partner can''t refer their own business.';
  end if;
  insert into public.workspace_referrals(workspace_id, partner_id, code, touched_at, consent, consent_asked_at, consent_at, consent_by, consent_scope)
  values (ws, p.id, p.code, p_touched_at, coalesce(p_consent, false), now(), now(), auth.uid(), 2)
  on conflict (workspace_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return public.referral_for(ws); end if;
  perform public.referral_snapshot(ws);
  perform public.audit_team(ws,
    case when coalesce(p_consent, false) then 'Started through ' || p.org_name || ', and shared progress with them (stage, permits approved, opening date, each store''s licensing status)' else 'Started through ' || p.org_name || ', without sharing progress' end,
    case when coalesce(p_consent, false) then '经由 ' || p.org_name || ' 开始使用，并与其共享进展（阶段、已批准许可、开业日期、各门店执照状态）' else '经由 ' || p.org_name || ' 开始使用，未共享进展' end,
    p.org_name);
  return public.referral_for(ws);
end $$;

create or replace function public.referral_for(ws uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.is_member(ws) then (
    select jsonb_build_object('org_name', p.org_name, 'kind', p.kind, 'consent', r.consent, 'consent_at', r.consent_at, 'attributed_at', r.attributed_at, 'scope', r.consent_scope)
      from public.workspace_referrals r join public.partners p on p.id = r.partner_id where r.workspace_id = ws) end;
$$;

-- An owner turns sharing on (which now includes the store view) or off. Off empties the partner's copy at once.
create or replace function public.referral_consent_set(ws uuid, p_consent boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare org text;
begin
  if not public.is_owner(ws) then raise exception 'Only an owner can change what the partner sees.'; end if;
  select p.org_name into org from public.workspace_referrals r join public.partners p on p.id = r.partner_id where r.workspace_id = ws for update of r;
  if org is null then raise exception 'This workspace has no partner.'; end if;
  update public.workspace_referrals set consent = coalesce(p_consent, false), consent_at = now(), consent_by = auth.uid(),
    consent_scope = case when coalesce(p_consent, false) then 2 else consent_scope end,
    business_name = null, stage = null, permits_done = null, permits_total = null, opening_date = null, stores = null, progress_at = null
  where workspace_id = ws;
  if coalesce(p_consent, false) then perform public.referral_snapshot(ws); end if;
  perform public.audit_team(ws,
    case when coalesce(p_consent, false) then 'Shared progress with ' || org else 'Stopped sharing progress with ' || org end,
    case when coalesce(p_consent, false) then '与 ' || org || ' 共享进展' else '停止与 ' || org || ' 共享进展' end, org);
  return public.referral_for(ws);
end $$;

-- The statement: plan and license-fee commissions per month, all referrals together (no single business's billing).
create or replace function public.partner_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.partners; mo date := date_trunc('month', now())::date; earned numeric; closed numeric; paid numeric;
begin
  select * into p from public.partners where user_id = auth.uid();
  if p.id is null or not public.mfa_ok() then return null; end if;
  select coalesce(sum(share_usd), 0) + coalesce((select sum(amount_usd) from public.partner_fee_commissions where partner_id = p.id), 0) into earned
    from public.partner_revenue where partner_id = p.id;
  select coalesce(sum(share_usd), 0) + coalesce((select sum(amount_usd) from public.partner_fee_commissions where partner_id = p.id and month < mo), 0) into closed
    from public.partner_revenue where partner_id = p.id and month < mo;
  select coalesce(sum(amount_usd), 0) into paid from public.partner_payouts where partner_id = p.id;
  return jsonb_build_object(
    'partner', public.partner_me(),
    'referred', (select count(*) from public.workspace_referrals where partner_id = p.id),
    'sharing', (select count(*) from public.workspace_referrals where partner_id = p.id and consent),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'paying', m.paying, 'share_usd', m.share_usd, 'fee_usd', m.fee_usd,
        'total_usd', m.share_usd + m.fee_usd, 'closed', m.month < mo) order by m.month desc), '[]'::jsonb)
      from (select x.month, coalesce(max(x.paying), 0) as paying, coalesce(sum(x.share_usd), 0) as share_usd, coalesce(sum(x.fee_usd), 0) as fee_usd
              from (select month, count(*) filter (where revenue_usd > 0) as paying, sum(share_usd) as share_usd, 0::numeric as fee_usd
                      from public.partner_revenue where partner_id = p.id group by month
                    union all
                    select month, null, 0, sum(amount_usd) from public.partner_fee_commissions where partner_id = p.id group by month) x
             group by x.month) m),
    'earned_usd', earned, 'paid_usd', paid, 'owed_usd', greatest(closed - paid, 0),
    'payouts', (select coalesce(jsonb_agg(jsonb_build_object('amount_usd', x.amount_usd, 'paid_on', x.paid_on, 'reference', x.reference) order by x.paid_on desc), '[]'::jsonb)
      from public.partner_payouts x where x.partner_id = p.id));
end $$;

create or replace function public.partner_admin_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'email', u.email, 'org_name', p.org_name, 'kind', p.kind, 'contact_name', p.contact_name,
      'website', p.website, 'note', p.note, 'status', p.status, 'code', p.code, 'share_pct', p.share_pct, 'fee_pct', p.fee_pct, 'share_months', p.share_months,
      'terms', public.partner_terms_for(p), 'created_at', p.created_at, 'approved_at', p.approved_at,
      'referred', (select count(*) from public.workspace_referrals r where r.partner_id = p.id),
      'sharing', (select count(*) from public.workspace_referrals r where r.partner_id = p.id and r.consent),
      'earned_usd', (select coalesce(sum(share_usd), 0) from public.partner_revenue x where x.partner_id = p.id)
                    + (select coalesce(sum(amount_usd), 0) from public.partner_fee_commissions x where x.partner_id = p.id),
      'paid_usd', (select coalesce(sum(amount_usd), 0) from public.partner_payouts x where x.partner_id = p.id))
    order by case p.status when 'pending' then 0 when 'approved' then 1 when 'paused' then 2 else 3 end, p.created_at), '[]'::jsonb)
    from public.partners p left join auth.users u on u.id = p.user_id);
end $$;

-- Approve, decline or pause a partner, and set their own terms (null keeps what they have; -1 goes back to the default).
drop function if exists public.partner_admin_set(uuid, text, numeric, int);
create or replace function public.partner_admin_set(p_id uuid, p_status text, p_share_pct numeric default null, p_share_months int default null, p_fee_pct numeric default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.partners;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if p_status not in ('pending', 'approved', 'declined', 'paused') then raise exception 'Unknown status.'; end if;
  if p_share_pct is not null and p_share_pct <> -1 and (p_share_pct < 0 or p_share_pct > 50) then raise exception 'The share is a percentage from 0 to 50.'; end if;
  if p_fee_pct is not null and p_fee_pct <> -1 and (p_fee_pct < 0 or p_fee_pct > 50) then raise exception 'The share is a percentage from 0 to 50.'; end if;
  if p_share_months is not null and (p_share_months < 1 or p_share_months > 60) then raise exception 'The share runs 1 to 60 months.'; end if;
  update public.partners set status = p_status,
    code = case when p_status = 'approved' then coalesce(code, public.partner_code_new()) else code end,
    approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
    approved_by = case when p_status = 'approved' and approved_by is null then auth.uid() else approved_by end,
    share_pct = case when p_share_pct = -1 then null else coalesce(p_share_pct, share_pct) end,
    fee_pct = case when p_fee_pct = -1 then null else coalesce(p_fee_pct, fee_pct) end,
    share_months = coalesce(p_share_months, share_months)
  where id = p_id returning * into p;
  if p.id is null then raise exception 'No such partner.'; end if;
  return jsonb_build_object('id', p.id, 'status', p.status, 'code', p.code, 'share_pct', p.share_pct, 'fee_pct', p.fee_pct, 'share_months', p.share_months, 'terms', public.partner_terms_for(p));
end $$;

revoke execute on function public.partner_apply(text, text, text, text, text), public.partner_me(), public.referral_claim(uuid, text, timestamptz, boolean),
  public.referral_for(uuid), public.referral_consent_set(uuid, boolean), public.partner_dashboard(), public.partner_admin_list(),
  public.partner_admin_set(uuid, text, numeric, int, numeric), public.partner_terms_get(), public.partner_terms_set(numeric, numeric) from public, anon;
grant execute on function public.partner_apply(text, text, text, text, text), public.partner_me(), public.referral_claim(uuid, text, timestamptz, boolean),
  public.referral_for(uuid), public.referral_consent_set(uuid, boolean), public.partner_dashboard(), public.partner_admin_list(),
  public.partner_admin_set(uuid, text, numeric, int, numeric), public.partner_terms_get(), public.partner_terms_set(numeric, numeric) to authenticated;
