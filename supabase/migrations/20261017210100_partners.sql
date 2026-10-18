-- Partners: the franchisors, master franchisees, commercial real-estate brokers, landlords, investors and accountants
-- who bring Chinese brands to the US. A partner signs up, the Placetta team approves them, and they get a referral
-- code. A business that arrives through the code (first touch, within 90 days) has the partner recorded on its new
-- workspace. During onboarding the business is asked, once, whether the partner may see its progress: business name,
-- stage, permits approved out of the total and the opening date. Nothing else. The owner can change that in Settings.
-- Partners read only consenting referrals, through row-level security on a snapshot that is empty without consent.
-- A revenue share is worked out from billing every day (the percentage is set per partner by the team); payouts are
-- made by hand and recorded here. Approved partners can make API keys (only a hash is kept) for a read-only API.
-- Safe to run twice.

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  org_name text not null check (length(org_name) between 1 and 120),
  kind text not null check (kind in ('franchisor', 'master_franchisee', 'broker', 'landlord', 'investor', 'accountant', 'other')),
  contact_name text check (contact_name is null or length(contact_name) <= 120),
  website text check (website is null or (length(website) <= 300 and website ~* '^https?://')),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'paused')),
  code text unique check (code is null or code ~ '^[A-Z2-9]{8}$'),
  share_pct numeric(5, 2) check (share_pct is null or (share_pct >= 0 and share_pct <= 50)),
  share_months int not null default 12 check (share_months between 1 and 60),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.partners is 'Partner accounts that refer businesses. The team approves them and sets share_pct (null until set). Read through the partner_* functions.';
alter table public.partners enable row level security;
revoke all on public.partners from public, anon, authenticated;

create table if not exists public.workspace_referrals (
  id uuid not null default gen_random_uuid() unique,
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  code text not null,
  touched_at timestamptz not null,
  attributed_at timestamptz not null default now(),
  consent boolean not null default false,
  consent_asked_at timestamptz,
  consent_at timestamptz,
  consent_by uuid references auth.users(id) on delete set null,
  -- what the partner may see: filled only while consent is on, emptied the moment it's turned off
  business_name text,
  stage text check (stage is null or stage in ('opening', 'open')),
  permits_done int,
  permits_total int,
  opening_date date,
  progress_at timestamptz,
  constraint workspace_referrals_private check (consent or (business_name is null and stage is null and permits_done is null and permits_total is null and opening_date is null))
);
comment on table public.workspace_referrals is 'The partner a workspace came through (first touch, within 90 days), and what that partner may see while the business consents.';
create index if not exists workspace_referrals_partner on public.workspace_referrals(partner_id);
alter table public.workspace_referrals enable row level security;
revoke all on public.workspace_referrals from public, anon, authenticated;

create table if not exists public.partner_revenue (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  partner_id uuid not null references public.partners(id) on delete cascade,
  revenue_usd numeric(12, 2) not null default 0 check (revenue_usd >= 0),
  share_pct numeric(5, 2),
  share_usd numeric(12, 2) not null default 0 check (share_usd >= 0),
  computed_at timestamptz not null default now(),
  primary key (workspace_id, month)
);
comment on table public.partner_revenue is 'Each referred workspace''s plan revenue per month while the partner''s share runs, from billing (ai_plan_revenue), and the partner''s share of it. Written by partner_revenue_sweep only.';
create index if not exists partner_revenue_partner on public.partner_revenue(partner_id, month);
alter table public.partner_revenue enable row level security;
revoke all on public.partner_revenue from public, anon, authenticated;

create table if not exists public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  amount_usd numeric(12, 2) not null check (amount_usd > 0),
  paid_on date not null,
  reference text check (reference is null or length(reference) <= 120),
  note text check (note is null or length(note) <= 500),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.partner_payouts is 'Payouts the team made by hand (bank transfer, check). Recorded for the partner''s statement; nothing is paid from here.';
create index if not exists partner_payouts_partner on public.partner_payouts(partner_id, paid_on);
alter table public.partner_payouts enable row level security;
revoke all on public.partner_payouts from public, anon, authenticated;

create table if not exists public.partner_api_keys (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  label text not null default 'API key' check (length(label) between 1 and 60),
  prefix text not null unique check (prefix ~ '^[0-9a-f]{8}$'),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
comment on table public.partner_api_keys is 'Partner API keys. Only the SHA-256 of each key is kept; the key itself is shown once, when it is made.';
create index if not exists partner_api_keys_partner on public.partner_api_keys(partner_id) where revoked_at is null;
alter table public.partner_api_keys enable row level security;
revoke all on public.partner_api_keys from public, anon, authenticated;

drop trigger if exists partners_touch on public.partners;
create trigger partners_touch before update on public.partners for each row execute function public.touch();

/* ---------------------------- who is asking ---------------------------- */

-- The signed-in person's approved partner account, or null. Two-step sign-in counts when it's on for them.
create or replace function public.my_partner_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.partners p where p.user_id = auth.uid() and p.status = 'approved' and public.mfa_ok();
$$;
revoke execute on function public.my_partner_id() from public, anon;
grant execute on function public.my_partner_id() to authenticated;

-- Partners read their consenting referrals straight from the table: these columns, these rows, nothing else.
grant select (id, partner_id, attributed_at, consent, business_name, stage, permits_done, permits_total, opening_date, progress_at)
  on public.workspace_referrals to authenticated;
drop policy if exists "partners read consenting referrals" on public.workspace_referrals;
create policy "partners read consenting referrals" on public.workspace_referrals for select to authenticated
  using (consent and partner_id = public.my_partner_id());

/* ---------------------------- progress, from the workspace ---------------------------- */

-- The three things a consenting business shares, read from its saved state: stage (open once every store is open),
-- permits approved out of all its applications, and the opening date (the earliest store still opening, by its
-- projected date, else its planned date; for a business already open, the first opening on file).
create or replace function public.referral_progress(st jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  with stores as (
    select s.value as s from jsonb_array_elements(case when jsonb_typeof(st->'stores') = 'array' then st->'stores' else '[]'::jsonb end) s
     where jsonb_typeof(s.value) = 'object'
  ),
  apps as (
    select coalesce(a.value->>'status', '') as status from jsonb_array_elements(case when jsonb_typeof(st->'apps') = 'array' then st->'apps' else '[]'::jsonb end) a
     where jsonb_typeof(a.value) = 'object'
  )
  select jsonb_build_object(
    'stage', case when exists (select 1 from stores) and not exists (select 1 from stores where coalesce(s->>'stage', '') <> 'open') then 'open' else 'opening' end,
    'permits_done', (select count(*) from apps where status = 'approved'),
    'permits_total', (select count(*) from apps),
    'opening_date', coalesce(
      (select min(coalesce(public.hq_date(s->>'projectedOpen'), public.hq_date(s->>'plannedOpen'))) from stores where coalesce(s->>'stage', '') <> 'open'),
      (select min(public.hq_date(s->>'opened')) from stores where s->>'stage' = 'open')));
$$;
revoke execute on function public.referral_progress(jsonb) from public, anon, authenticated;

-- Fill (consent on) or empty (consent off) one referral's snapshot from its workspace.
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
    progress_at = case when r.consent then now() end
  where r.workspace_id = ws;
end $$;
revoke execute on function public.referral_snapshot(uuid) from public, anon, authenticated;

-- Every save of a consenting workspace refreshes what its partner sees. Workspaces with no referral return at once.
create or replace function public.referral_on_save() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.workspace_referrals r where r.workspace_id = new.id and r.consent) then
    perform public.referral_snapshot(new.id);
  end if;
  return null;
end $$;
revoke execute on function public.referral_on_save() from public, anon, authenticated;
drop trigger if exists referral_on_save on public.workspaces;
create trigger referral_on_save after update of state, name on public.workspaces for each row execute function public.referral_on_save();

/* ---------------------------- signing up and the code ---------------------------- */

-- An 8-character code with no look-alike characters (no 0, O, 1 or I).
create or replace function public.partner_code_new() returns text
language plpgsql volatile set search_path = '' as $$
declare abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; b bytea;
begin
  loop
    b := extensions.gen_random_bytes(8); c := '';
    for i in 0..7 loop c := c || substr(abc, (get_byte(b, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.partners where code = c);
  end loop;
  return c;
end $$;
revoke execute on function public.partner_code_new() from public, anon, authenticated;

-- Ask to become a partner: one account per person. A pending or declined request can be sent again with new answers.
create or replace function public.partner_apply(p_org text, p_kind text, p_contact text default null, p_website text default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); cur public.partners; site text := nullif(trim(coalesce(p_website, '')), '');
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if not public.email_proven(me) or not public.mfa_ok() then raise exception 'Confirm your email (and two-step sign-in, if it''s on) first.'; end if;
  if length(trim(coalesce(p_org, ''))) not between 1 and 120 then raise exception 'Add your organization''s name.'; end if;
  if coalesce(p_kind, '') not in ('franchisor', 'master_franchisee', 'broker', 'landlord', 'investor', 'accountant', 'other') then raise exception 'Pick what kind of partner you are.'; end if;
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

-- The signed-in person's partner account, as they see it (null when they haven't applied).
create or replace function public.partner_me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'org_name', p.org_name, 'kind', p.kind, 'contact_name', p.contact_name, 'website', p.website, 'status', p.status,
    'code', case when p.status = 'approved' then p.code end, 'share_pct', p.share_pct, 'share_months', p.share_months,
    'created_at', p.created_at, 'approved_at', p.approved_at)
  from public.partners p where p.user_id = auth.uid() and public.mfa_ok();
$$;

-- A code's partner name, for the "Placetta, with <partner>" line a referred business sees. Approved partners only.
create or replace function public.partner_lookup(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('org_name', p.org_name, 'kind', p.kind)
  from public.partners p where p.code = upper(trim(coalesce(p_code, ''))) and p.status = 'approved';
$$;

/* ---------------------------- the referred business ---------------------------- */

-- Record the partner on a workspace just created: the owner, within a day of creating it, with a first touch from
-- the last 90 days. The first partner recorded stays. Nobody refers their own business. The consent answer from
-- onboarding is recorded with when it was asked.
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
  insert into public.workspace_referrals(workspace_id, partner_id, code, touched_at, consent, consent_asked_at, consent_at, consent_by)
  values (ws, p.id, p.code, p_touched_at, coalesce(p_consent, false), now(), now(), auth.uid())
  on conflict (workspace_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return public.referral_for(ws); end if;
  perform public.referral_snapshot(ws);
  perform public.audit_team(ws,
    case when coalesce(p_consent, false) then 'Started through ' || p.org_name || ', and shared progress with them (stage, permits approved, opening date)' else 'Started through ' || p.org_name || ', without sharing progress' end,
    case when coalesce(p_consent, false) then '经由 ' || p.org_name || ' 开始使用，并与其共享进展（阶段、已批准许可、开业日期）' else '经由 ' || p.org_name || ' 开始使用，未共享进展' end,
    p.org_name);
  return public.referral_for(ws);
end $$;

-- What a member sees about their workspace's partner: who, and whether they share.
create or replace function public.referral_for(ws uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.is_member(ws) then (
    select jsonb_build_object('org_name', p.org_name, 'kind', p.kind, 'consent', r.consent, 'consent_at', r.consent_at, 'attributed_at', r.attributed_at)
      from public.workspace_referrals r join public.partners p on p.id = r.partner_id where r.workspace_id = ws) end;
$$;

-- An owner turns sharing on or off. Off empties the partner's copy at once.
create or replace function public.referral_consent_set(ws uuid, p_consent boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare org text;
begin
  if not public.is_owner(ws) then raise exception 'Only an owner can change what the partner sees.'; end if;
  select p.org_name into org from public.workspace_referrals r join public.partners p on p.id = r.partner_id where r.workspace_id = ws for update of r;
  if org is null then raise exception 'This workspace has no partner.'; end if;
  update public.workspace_referrals set consent = coalesce(p_consent, false), consent_at = now(), consent_by = auth.uid(),
    business_name = null, stage = null, permits_done = null, permits_total = null, opening_date = null, progress_at = null
  where workspace_id = ws;
  if coalesce(p_consent, false) then perform public.referral_snapshot(ws); end if;
  perform public.audit_team(ws,
    case when coalesce(p_consent, false) then 'Shared progress with ' || org else 'Stopped sharing progress with ' || org end,
    case when coalesce(p_consent, false) then '与 ' || org || ' 共享进展' else '停止与 ' || org || ' 共享进展' end, org);
  return public.referral_for(ws);
end $$;

/* ---------------------------- the revenue share ---------------------------- */

-- Once a day: each referral's plan revenue this month, from billing (the same estimate the margin report uses), while
-- the partner's share runs (share_months from the month it was referred). Within a month the figure only goes up, so
-- a business that paid this month and then canceled still counts for it. Past months are left as they closed.
create or replace function public.partner_revenue_sweep(p_today date default current_date) returns int
language plpgsql security definer set search_path = '' as $$
declare mo date := date_trunc('month', p_today)::date; n int;
begin
  insert into public.partner_revenue as pr (workspace_id, month, partner_id, revenue_usd, share_pct, share_usd, computed_at)
  select r.workspace_id, mo, p.id, round(public.ai_plan_revenue(b, mo), 2), p.share_pct,
         round(public.ai_plan_revenue(b, mo) * coalesce(p.share_pct, 0) / 100, 2), now()
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
  return n;
end $$;
revoke execute on function public.partner_revenue_sweep(date) from public, anon, authenticated;
grant execute on function public.partner_revenue_sweep(date) to service_role;

-- A partner's statement: how many businesses they referred and how many share progress, the share earned per month
-- (all referrals together: no single business's billing is shown), what was paid out, and what's owed for months
-- that have closed.
create or replace function public.partner_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.partners; mo date := date_trunc('month', now())::date; earned numeric; closed numeric; paid numeric;
begin
  select * into p from public.partners where user_id = auth.uid();
  if p.id is null or not public.mfa_ok() then return null; end if;
  select coalesce(sum(share_usd), 0) into earned from public.partner_revenue where partner_id = p.id;
  select coalesce(sum(share_usd), 0) into closed from public.partner_revenue where partner_id = p.id and month < mo;
  select coalesce(sum(amount_usd), 0) into paid from public.partner_payouts where partner_id = p.id;
  return jsonb_build_object(
    'partner', public.partner_me(),
    'referred', (select count(*) from public.workspace_referrals where partner_id = p.id),
    'sharing', (select count(*) from public.workspace_referrals where partner_id = p.id and consent),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'paying', m.paying, 'share_usd', m.share_usd, 'closed', m.month < mo) order by m.month desc), '[]'::jsonb)
      from (select month, count(*) filter (where revenue_usd > 0) as paying, sum(share_usd) as share_usd from public.partner_revenue where partner_id = p.id group by month) m),
    'earned_usd', earned, 'paid_usd', paid, 'owed_usd', greatest(closed - paid, 0),
    'payouts', (select coalesce(jsonb_agg(jsonb_build_object('amount_usd', x.amount_usd, 'paid_on', x.paid_on, 'reference', x.reference) order by x.paid_on desc), '[]'::jsonb)
      from public.partner_payouts x where x.partner_id = p.id));
end $$;

/* ---------------------------- API keys ---------------------------- */

-- A new key for an approved partner: shown once, kept only as its SHA-256. Up to five live keys.
create or replace function public.partner_key_create(p_label text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pid uuid := public.my_partner_id(); pre text; k text; kid uuid;
begin
  if pid is null then raise exception 'API keys are for approved partners.'; end if;
  perform 1 from public.partners where id = pid for update;
  if (select count(*) from public.partner_api_keys where partner_id = pid and revoked_at is null) >= 5 then
    raise exception 'Up to 5 API keys at a time. Revoke one first.';
  end if;
  loop
    pre := encode(extensions.gen_random_bytes(4), 'hex');
    exit when not exists (select 1 from public.partner_api_keys where prefix = pre);
  end loop;
  k := 'plk_' || pre || '_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.partner_api_keys(partner_id, label, prefix, key_hash)
  values (pid, coalesce(nullif(left(trim(coalesce(p_label, '')), 60), ''), 'API key'), pre, encode(extensions.digest(k, 'sha256'), 'hex'))
  returning id into kid;
  return jsonb_build_object('id', kid, 'prefix', pre, 'key', k);
end $$;

create or replace function public.partner_keys() returns table (id uuid, label text, prefix text, created_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select k.id, k.label, k.prefix, k.created_at, k.last_used_at, k.revoked_at
    from public.partner_api_keys k join public.partners p on p.id = k.partner_id
   where p.user_id = auth.uid() and public.mfa_ok()
   order by k.revoked_at nulls first, k.created_at desc;
$$;

create or replace function public.partner_key_revoke(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.partner_api_keys k set revoked_at = now()
   where k.id = p_id and k.revoked_at is null
     and k.partner_id in (select p.id from public.partners p where p.user_id = auth.uid() and public.mfa_ok());
  if not found then raise exception 'No such key.'; end if;
end $$;

-- The partner API (the partner-api function, with the service key): the partner a key's hash belongs to, when the key
-- is live and the partner approved; last use is noted at most once a minute.
create or replace function public.partner_api_auth(p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare k record;
begin
  select k2.id, k2.partner_id, k2.last_used_at into k
    from public.partner_api_keys k2 join public.partners p on p.id = k2.partner_id
   where k2.key_hash = lower(coalesce(p_hash, '')) and k2.revoked_at is null and p.status = 'approved';
  if k.id is null then return null; end if;
  if k.last_used_at is null or k.last_used_at < now() - interval '1 minute' then
    update public.partner_api_keys set last_used_at = now() where id = k.id;
  end if;
  return k.partner_id;
end $$;

-- The partner API's one answer: that partner's consenting referrals, the same fields the dashboard shows.
create or replace function public.partner_api_referrals(p_partner uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('referral_id', r.id, 'business_name', r.business_name, 'stage', r.stage,
      'permits_done', r.permits_done, 'permits_total', r.permits_total, 'opening_date', r.opening_date,
      'referred_at', r.attributed_at, 'updated_at', r.progress_at) order by r.attributed_at desc), '[]'::jsonb)
  from public.workspace_referrals r
  where r.partner_id = p_partner and r.consent
    and exists (select 1 from public.partners p where p.id = p_partner and p.status = 'approved');
$$;

/* ---------------------------- the Placetta team ---------------------------- */

create or replace function public.partner_admin_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'email', u.email, 'org_name', p.org_name, 'kind', p.kind, 'contact_name', p.contact_name,
      'website', p.website, 'note', p.note, 'status', p.status, 'code', p.code, 'share_pct', p.share_pct, 'share_months', p.share_months,
      'created_at', p.created_at, 'approved_at', p.approved_at,
      'referred', (select count(*) from public.workspace_referrals r where r.partner_id = p.id),
      'sharing', (select count(*) from public.workspace_referrals r where r.partner_id = p.id and r.consent),
      'earned_usd', (select coalesce(sum(share_usd), 0) from public.partner_revenue x where x.partner_id = p.id),
      'paid_usd', (select coalesce(sum(amount_usd), 0) from public.partner_payouts x where x.partner_id = p.id))
    order by case p.status when 'pending' then 0 when 'approved' then 1 when 'paused' then 2 else 3 end, p.created_at), '[]'::jsonb)
    from public.partners p left join auth.users u on u.id = p.user_id);
end $$;

-- Approve, decline or pause a partner, and set their share. Approving gives them a code (kept if they had one).
create or replace function public.partner_admin_set(p_id uuid, p_status text, p_share_pct numeric default null, p_share_months int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.partners;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if p_status not in ('pending', 'approved', 'declined', 'paused') then raise exception 'Unknown status.'; end if;
  if p_share_pct is not null and (p_share_pct < 0 or p_share_pct > 50) then raise exception 'The share is a percentage from 0 to 50.'; end if;
  if p_share_months is not null and (p_share_months < 1 or p_share_months > 60) then raise exception 'The share runs 1 to 60 months.'; end if;
  update public.partners set status = p_status,
    code = case when p_status = 'approved' then coalesce(code, public.partner_code_new()) else code end,
    approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
    approved_by = case when p_status = 'approved' and approved_by is null then auth.uid() else approved_by end,
    share_pct = coalesce(p_share_pct, share_pct), share_months = coalesce(p_share_months, share_months)
  where id = p_id returning * into p;
  if p.id is null then raise exception 'No such partner.'; end if;
  return jsonb_build_object('id', p.id, 'status', p.status, 'code', p.code, 'share_pct', p.share_pct, 'share_months', p.share_months);
end $$;

create or replace function public.partner_payout_add(p_partner uuid, p_amount numeric, p_paid_on date, p_reference text default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount paid.'; end if;
  if p_paid_on is null or p_paid_on > current_date then raise exception 'Enter the day it was paid.'; end if;
  insert into public.partner_payouts(partner_id, amount_usd, paid_on, reference, note, recorded_by)
  values (p_partner, round(p_amount, 2), p_paid_on, nullif(left(trim(coalesce(p_reference, '')), 120), ''), nullif(left(trim(coalesce(p_note, '')), 500), ''), auth.uid())
  returning id into pid;
  return pid;
end $$;

revoke execute on function public.partner_apply(text, text, text, text, text), public.partner_me(), public.referral_claim(uuid, text, timestamptz, boolean),
  public.referral_for(uuid), public.referral_consent_set(uuid, boolean), public.partner_dashboard(), public.partner_key_create(text), public.partner_keys(),
  public.partner_key_revoke(uuid), public.partner_admin_list(), public.partner_admin_set(uuid, text, numeric, int), public.partner_payout_add(uuid, numeric, date, text, text)
  from public, anon;
grant execute on function public.partner_apply(text, text, text, text, text), public.partner_me(), public.referral_claim(uuid, text, timestamptz, boolean),
  public.referral_for(uuid), public.referral_consent_set(uuid, boolean), public.partner_dashboard(), public.partner_key_create(text), public.partner_keys(),
  public.partner_key_revoke(uuid), public.partner_admin_list(), public.partner_admin_set(uuid, text, numeric, int), public.partner_payout_add(uuid, numeric, date, text, text)
  to authenticated;
revoke execute on function public.partner_lookup(text) from public;
grant execute on function public.partner_lookup(text) to anon, authenticated;
revoke execute on function public.partner_api_auth(text), public.partner_api_referrals(uuid) from public, anon, authenticated;
grant execute on function public.partner_api_auth(text), public.partner_api_referrals(uuid) to service_role;

-- Every day: the revenue share for the month so far.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; run select public.partner_revenue_sweep() once a day.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-partner-revenue';
  perform cron.schedule('placetta-partner-revenue', '40 12 * * *', 'select public.partner_revenue_sweep()');
end $$;
