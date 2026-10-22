-- Growth mechanics inside the existing plans: modules added to a plan, filings past the allowance under a hard monthly
-- cap the owner sets, contract terms with an online cancel and a renewal notice, and the brand plan headquarters rolls
-- out with one invite per location. Nothing here charges anyone: the billing function does, after an owner's approval,
-- through the service-role helpers below. Safe to run twice.

/* ------------------------------ billing: modules, the cap, the term ------------------------------ */

alter table public.billing add column if not exists modules text[] not null default '{}';
alter table public.billing add column if not exists modules_requested text[] not null default '{}';
-- The hard monthly cap on filings past the allowance, in cents. 0 (the default): nothing past the allowance is charged.
alter table public.billing add column if not exists filing_cap_cents int not null default 0;
alter table public.billing drop constraint if exists billing_filing_cap_check;
alter table public.billing add constraint billing_filing_cap_check check (filing_cap_cents between 0 and 500000);
alter table public.billing add column if not exists term_years int not null default 1;
alter table public.billing drop constraint if exists billing_term_years_check;
alter table public.billing add constraint billing_term_years_check check (term_years between 1 and 3);
alter table public.billing add column if not exists term_started date;
alter table public.billing add column if not exists auto_renew boolean not null default true;
alter table public.billing add column if not exists auto_renew_off_at timestamptz;
-- the renewal day the last renewal notice was sent for, so it goes once per renewal
alter table public.billing add column if not exists renewal_notice_for date;
-- set when a headquarters' brand plan pays for this workspace (hq_cover_apply); null when the workspace pays itself
alter table public.billing add column if not exists hq_paid_by text;

create or replace function public.growth_modules() returns text[]
language sql immutable set search_path = '' as $$
  select array['entity', 'sales_tax', 'alcohol', 'imports', 'abroad', 'security'];
$$;

-- The monthly cap: owners only, whole dollars from $0 to $5,000 (the app's maximum; more goes through the team).
create or replace function public.filing_cap_set(ws uuid, p_cents int) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner(ws) then raise exception 'Only an owner can set the monthly cap.'; end if;
  if p_cents is null or p_cents < 0 or p_cents > 500000 or p_cents % 100 <> 0 then raise exception 'Set the cap in whole dollars, from $0 to $5,000.'; end if;
  insert into public.billing (workspace_id) values (ws) on conflict (workspace_id) do nothing;
  update public.billing set filing_cap_cents = p_cents where workspace_id = ws;
  perform public.audit_team(ws, 'Set the monthly cap on filings past the allowance', '设置了方案外申报的每月上限', '$' || (p_cents / 100)::text);
  return p_cents;
end $$;

/* ------------------------------ filings past the allowance ------------------------------ */

create table if not exists public.filing_charges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ref text not null check (length(ref) between 1 and 120),
  kind text not null check (kind in ('sales_tax', 'entity', 'amendment', 'other')),
  month date not null,
  cents int not null check (cents between 0 and 500000),
  status text not null default 'reserved' check (status in ('allowance', 'reserved', 'charged', 'void')),
  approved_by uuid references auth.users(id) on delete set null,
  stripe_item text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
comment on table public.filing_charges is 'Filings outside a plan''s own licenses: within the monthly allowance (cents 0) or charged after an owner approved the price shown, under the owner''s cap. Written by the billing function only.';
create unique index if not exists filing_charges_once on public.filing_charges(workspace_id, ref, month) where status <> 'void';
create index if not exists filing_charges_ws_month on public.filing_charges(workspace_id, month);
create index if not exists filing_charges_approved_by on public.filing_charges(approved_by);
alter table public.filing_charges enable row level security;
revoke all on public.filing_charges from public, anon, authenticated;
grant select on public.filing_charges to authenticated;
drop policy if exists "the workspace reads its filing charges" on public.filing_charges;
create policy "the workspace reads its filing charges" on public.filing_charges for select to authenticated using (public.can_view(workspace_id));

-- This month's count and charges against the cap, for the app (anyone on the workspace) and the billing function.
create or replace function public.filing_month(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m date := date_trunc('month', now() at time zone 'utc')::date; b public.billing;
begin
  if not (public.can_view(ws) or public.is_staff() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then raise exception 'Not a member of this workspace.'; end if;
  select * into b from public.billing where workspace_id = ws;
  return jsonb_build_object(
    'month', m,
    'locations', coalesce(b.paid_locations, 0),
    'used', (select count(*) from public.filing_charges c where c.workspace_id = ws and c.month = m and c.status <> 'void'),
    'charged_cents', (select coalesce(sum(cents), 0) from public.filing_charges c where c.workspace_id = ws and c.month = m and c.status in ('reserved', 'charged')),
    'cap_cents', coalesce(b.filing_cap_cents, 0),
    'paid', coalesce(b.comped, false) or b.subscription_status in ('active', 'trialing'));
end $$;

-- The billing function's one step: count it within the allowance, or reserve its charge under the cap, atomically (the
-- workspace's billing row is locked, so two approvals at once can't both pass). The same filing twice in a month is
-- the same row. Returns {ok, id, kind: 'allowance' | 'charge', again} or {ok: false, code}.
create or replace function public.filing_charge_reserve(p_ws uuid, p_ref text, p_kind text, p_cents int, p_allow int, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m date := date_trunc('month', now() at time zone 'utc')::date; b public.billing; used int; charged int; had public.filing_charges; nid uuid;
begin
  if p_kind not in ('sales_tax', 'entity', 'amendment', 'other') then return jsonb_build_object('ok', false, 'code', 'bad_kind'); end if;
  if p_cents is null or p_cents <= 0 or p_cents > 500000 then return jsonb_build_object('ok', false, 'code', 'bad_price'); end if;
  select * into b from public.billing where workspace_id = p_ws for update;
  if b.workspace_id is null then return jsonb_build_object('ok', false, 'code', 'no_billing'); end if;
  select * into had from public.filing_charges where workspace_id = p_ws and ref = p_ref and month = m and status <> 'void';
  if had.id is not null then return jsonb_build_object('ok', true, 'id', had.id, 'kind', case when had.status = 'allowance' then 'allowance' else 'charge' end, 'again', true); end if;
  select count(*), coalesce(sum(cents) filter (where status in ('reserved', 'charged')), 0) into used, charged
    from public.filing_charges where workspace_id = p_ws and month = m and status <> 'void';
  if used < greatest(coalesce(p_allow, 0), 0) then
    insert into public.filing_charges (workspace_id, ref, kind, month, cents, status, approved_by, settled_at) values (p_ws, p_ref, p_kind, m, 0, 'allowance', p_user, now()) returning id into nid;
    return jsonb_build_object('ok', true, 'id', nid, 'kind', 'allowance', 'again', false);
  end if;
  if coalesce(b.filing_cap_cents, 0) <= 0 then return jsonb_build_object('ok', false, 'code', 'no_cap'); end if;
  if charged + p_cents > b.filing_cap_cents then return jsonb_build_object('ok', false, 'code', 'over_cap', 'left_cents', greatest(b.filing_cap_cents - charged, 0)); end if;
  insert into public.filing_charges (workspace_id, ref, kind, month, cents, status, approved_by) values (p_ws, p_ref, p_kind, m, p_cents, 'reserved', p_user) returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid, 'kind', 'charge', 'again', false);
end $$;

-- After Stripe answers: charged (with its invoice item) or void (Stripe refused; the reservation is let go).
create or replace function public.filing_charge_settle(p_id uuid, p_ok boolean, p_item text) returns void
language sql security definer set search_path = '' as $$
  update public.filing_charges set status = case when p_ok then 'charged' else 'void' end, stripe_item = nullif(p_item, ''), settled_at = now()
   where id = p_id and status = 'reserved';
$$;

/* ------------------------------ contract: term, online cancel, the renewal notice ------------------------------ */

-- The term a paid checkout chose (from its metadata), recorded by the webhook.
create or replace function public.billing_term_apply(p_ws uuid, p_years int) returns void
language sql security definer set search_path = '' as $$
  update public.billing set term_years = least(greatest(coalesce(p_years, 1), 1), 3), term_started = coalesce(term_started, current_date) where workspace_id = p_ws;
$$;

-- Auto-renew off (the online cancel) or back on, after Stripe agreed; with an audit line either way.
create or replace function public.billing_auto_renew_apply(p_ws uuid, p_on boolean, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.billing set auto_renew = p_on, auto_renew_off_at = case when p_on then null else now() end where workspace_id = p_ws;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (p_ws, 'you', p_user,
    case when p_on then jsonb_build_object('en', 'Turned auto-renew back on', 'zh', '重新开启自动续费') else jsonb_build_object('en', 'Cancelled auto-renew', 'zh', '取消自动续费') end,
    jsonb_build_object('en', 'Plan', 'zh', '方案'));
end $$;

-- The monitor's claim before it sends a renewal notice: true once per renewal day.
create or replace function public.renewal_notice_claim(p_ws uuid, p_for date) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.billing set renewal_notice_for = p_for where workspace_id = p_ws and renewal_notice_for is distinct from p_for and auto_renew;
  get diagnostics n = row_count;
  return n > 0;
end $$;
-- ...and its release when the email couldn't go, so a later run tries again.
create or replace function public.renewal_notice_release(p_ws uuid, p_for date) returns void
language sql security definer set search_path = '' as $$
  update public.billing set renewal_notice_for = null where workspace_id = p_ws and renewal_notice_for = p_for;
$$;

/* ------------------------------ modules ------------------------------ */

-- A module asked for and waiting for the team's quote (a team task), or switched on once Stripe billed it.
create or replace function public.module_apply(p_ws uuid, p_module text, p_on boolean, p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not (p_module = any (public.growth_modules())) then raise exception 'Unknown module.'; end if;
  insert into public.billing (workspace_id) values (p_ws) on conflict (workspace_id) do nothing;
  if p_on then
    update public.billing set modules = array(select distinct x from unnest(modules || p_module) x order by x),
      modules_requested = array_remove(modules_requested, p_module) where workspace_id = p_ws;
  else
    update public.billing set modules_requested = array(select distinct x from unnest(modules_requested || p_module) x order by x)
     where workspace_id = p_ws and not (p_module = any (modules));
    insert into public.team_tasks (kind, workspace_id, title, detail, dedupe)
    values ('quote', p_ws, 'Quote the ' || p_module || ' module', jsonb_build_object('module', p_module, 'by', p_user), 'module:' || p_ws || ':' || p_module)
    on conflict (dedupe) do nothing;
  end if;
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (p_ws, 'you', p_user, case when p_on then jsonb_build_object('en', 'Added a module', 'zh', '添加了模块') else jsonb_build_object('en', 'Asked for a module quote', 'zh', '申请模块报价') end,
    jsonb_build_object('en', p_module, 'zh', p_module));
  return case when p_on then 'on' else 'requested' end;
end $$;

/* ------------------------------ the brand plan ------------------------------ */

create table if not exists public.hq_plans (
  hq_email text primary key check (hq_email = lower(hq_email) and hq_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  brand text check (brand is null or length(brand) between 1 and 120),
  bill_to text not null default 'franchisee' check (bill_to in ('hq', 'franchisee')),
  tier text not null default 'essentials' check (tier in ('essentials', 'pro')),
  stripe_customer_id text, subscription_id text, subscription_status text, current_period_end timestamptz, event_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.hq_plans is 'A headquarters'' brand plan: who pays (headquarters or each franchisee) and, when headquarters pays, its Stripe subscription. Read and written only through the functions below.';
create index if not exists hq_plans_created_by on public.hq_plans(created_by);
alter table public.hq_plans enable row level security;
revoke all on public.hq_plans from public, anon, authenticated;

create table if not exists public.hq_invites (
  id uuid primary key default gen_random_uuid(),
  hq_email text not null references public.hq_plans(hq_email) on delete cascade,
  code_hash text not null unique,
  label text check (label is null or length(label) <= 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  used_by_ws uuid references public.workspaces(id) on delete set null,
  revoked_at timestamptz
);
comment on table public.hq_invites is 'One invite per new location: only a hash of its code is kept. Used once, within 30 days.';
create index if not exists hq_invites_email on public.hq_invites(hq_email);
create index if not exists hq_invites_ws on public.hq_invites(used_by_ws);
alter table public.hq_invites enable row level security;
revoke all on public.hq_invites from public, anon, authenticated;

-- Locations and people across every workspace linked to a headquarters email: what the brand plan's price counts.
-- People are the franchisees' own team members; headquarters' dashboard viewers are never counted.
create or replace function public.hq_counts(p_email text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'workspaces', (select count(distinct l.workspace_id) from public.hq_links l where l.hq_email = p_email and l.revoked_at is null),
    'locations', (select count(*) from public.store_billing s join public.hq_links l on l.workspace_id = s.workspace_id and l.revoked_at is null
                   where l.hq_email = p_email and s.removed_at is null),
    'people', (select count(distinct m.user_id) from public.workspace_members m join public.hq_links l on l.workspace_id = m.workspace_id and l.revoked_at is null
                where l.hq_email = p_email));
$$;

-- The signed-in headquarters (a proven email, two-step when on) sets its brand plan.
create or replace function public.hq_plan_set(p_brand text, p_bill_to text, p_tier text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := public.my_email(); p public.hq_plans;
begin
  if e is null or not public.mfa_ok() then raise exception 'Sign in with a confirmed email first.'; end if;
  if p_bill_to not in ('hq', 'franchisee') or p_tier not in ('essentials', 'pro') then raise exception 'Choose who pays and a plan.'; end if;
  select * into p from public.hq_plans where hq_email = e for update;
  if p.hq_email is not null and p.bill_to = 'hq' and p_bill_to <> 'hq' and p.subscription_status in ('active', 'trialing', 'past_due') then
    raise exception 'Headquarters is paying now. Cancel that plan in billing first, then switch who pays.';
  end if;
  insert into public.hq_plans as h (hq_email, brand, bill_to, tier, created_by) values (e, nullif(left(trim(coalesce(p_brand, '')), 120), ''), p_bill_to, p_tier, auth.uid())
  on conflict (hq_email) do update set brand = excluded.brand, bill_to = excluded.bill_to, tier = excluded.tier, updated_at = now();
  perform public.hq_cover_apply(e);
  return public.hq_plan_view();
end $$;

-- What the headquarters sees about its plan: the plan, the counts, and its invites (never their codes).
create or replace function public.hq_plan_view() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e text := public.my_email(); p public.hq_plans;
begin
  if e is null or not public.mfa_ok() then return null; end if;
  select * into p from public.hq_plans where hq_email = e;
  return jsonb_build_object(
    'plan', case when p.hq_email is null then null else jsonb_build_object('brand', p.brand, 'bill_to', p.bill_to, 'tier', p.tier,
      'status', p.subscription_status, 'period_end', p.current_period_end) end,
    'counts', public.hq_counts(e),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'label', i.label, 'created_at', i.created_at, 'expires_at', i.expires_at,
        'used_at', i.used_at, 'workspace', w.name, 'revoked', i.revoked_at is not null) order by i.created_at desc), '[]'::jsonb)
      from (select * from public.hq_invites where hq_email = e order by created_at desc limit 200) i left join public.workspaces w on w.id = i.used_by_ws));
end $$;

-- One invite for one new location. The code is returned this once; only its hash is kept.
create or replace function public.hq_invite_create(p_label text) returns text
language plpgsql security definer set search_path = '' as $$
declare e text := public.my_email(); code text;
begin
  if e is null or not public.mfa_ok() then raise exception 'Sign in with a confirmed email first.'; end if;
  if not exists (select 1 from public.hq_plans where hq_email = e) then raise exception 'Set up the brand plan first.'; end if;
  if (select count(*) from public.hq_invites where hq_email = e and used_at is null and revoked_at is null and expires_at > now()) >= 200 then
    raise exception 'Up to 200 open invites. Revoke some first.';
  end if;
  code := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.hq_invites (hq_email, code_hash, label) values (e, encode(sha256(convert_to(code, 'UTF8')), 'hex'), nullif(left(trim(coalesce(p_label, '')), 120), ''));
  return code;
end $$;

create or replace function public.hq_invite_revoke(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.hq_invites set revoked_at = now() where id = p_id and hq_email = public.my_email() and used_at is null and revoked_at is null;
end $$;

-- A franchisee's owner joins the brand with the code: the workspace shares its stores' status with headquarters (the
-- same link Settings makes), the invite is used up, and when headquarters pays, the workspace is covered.
create or replace function public.hq_invite_redeem(ws uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.hq_invites; p public.hq_plans;
begin
  if not public.is_owner(ws) then raise exception 'Only an owner can join a brand plan.'; end if;
  select * into i from public.hq_invites where code_hash = encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex') for update;
  if i.id is null or i.revoked_at is not null or i.expires_at < now() then raise exception 'This invite is not valid. Ask headquarters for a new one.'; end if;
  if i.used_at is not null and i.used_by_ws is distinct from ws then raise exception 'This invite was already used. Ask headquarters for a new one.'; end if;
  select * into p from public.hq_plans where hq_email = i.hq_email;
  perform public.hq_share(ws, i.hq_email, p.brand);
  update public.hq_invites set used_at = coalesce(used_at, now()), used_by_ws = ws where id = i.id;
  perform public.hq_cover_apply(i.hq_email);
  return jsonb_build_object('hq_email', i.hq_email, 'brand', p.brand, 'bill_to', p.bill_to);
end $$;

-- When headquarters pays: every linked workspace that doesn't pay for itself is on the plan, with its own store count,
-- through the same billing columns the rest of the app reads. Coverage ends when the link, the plan or its payment does.
-- A workspace with its own subscription is never touched.
create or replace function public.hq_cover_apply(p_email text) returns int
language plpgsql security definer set search_path = '' as $$
declare p public.hq_plans; n int := 0; live boolean;
begin
  select * into p from public.hq_plans where hq_email = p_email;
  -- never null: a plan with no payment yet is not live
  live := coalesce(p.hq_email is not null and p.bill_to = 'hq' and p.subscription_status in ('active', 'trialing', 'past_due'), false);
  -- end coverage that no longer applies
  update public.billing b set subscription_status = null, subscription_plan = null, paid_locations = 0, current_period_end = null, hq_paid_by = null
   where b.hq_paid_by = p_email and b.subscription_id is null
     and (not live or not exists (select 1 from public.hq_links l where l.workspace_id = b.workspace_id and l.hq_email = p_email and l.revoked_at is null));
  if not live then return 0; end if;
  insert into public.billing (workspace_id) select distinct l.workspace_id from public.hq_links l where l.hq_email = p_email and l.revoked_at is null
  on conflict (workspace_id) do nothing;
  update public.billing b set subscription_status = p.subscription_status, subscription_plan = case when p.tier = 'pro' then 'pro' else 'locations' end,
      current_period_end = p.current_period_end, hq_paid_by = p_email,
      paid_locations = (select count(*) from public.store_billing s where s.workspace_id = b.workspace_id and s.removed_at is null)
   where b.subscription_id is null and (b.hq_paid_by is null or b.hq_paid_by = p_email)
     and exists (select 1 from public.hq_links l where l.workspace_id = b.workspace_id and l.hq_email = p_email and l.revoked_at is null);
  get diagnostics n = row_count;
  return n;
end $$;

-- The webhook's write for a headquarters subscription, ignoring events older than the last one applied.
create or replace function public.hq_subscription_apply(p_email text, p_event_at timestamptz, p_customer text, p_subscription text, p_status text, p_period_end timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.hq_plans set stripe_customer_id = coalesce(nullif(p_customer, ''), stripe_customer_id), subscription_id = p_subscription,
      subscription_status = p_status, current_period_end = p_period_end, event_at = p_event_at, updated_at = now()
   where hq_email = lower(p_email) and (event_at is null or event_at <= p_event_at);
  get diagnostics n = row_count;
  if n > 0 then perform public.hq_cover_apply(lower(p_email)); end if;
  return n > 0;
end $$;

-- A link revoked (a franchisee leaves, or headquarters is unshared): coverage follows at once.
create or replace function public.hq_links_cover() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.hq_cover_apply(new.hq_email);
  return new;
end $$;
drop trigger if exists hq_links_cover on public.hq_links;
create trigger hq_links_cover after update of revoked_at on public.hq_links for each row when (new.revoked_at is not null and old.revoked_at is null)
  execute function public.hq_links_cover();

/* ------------------------------ who may call what ------------------------------ */

revoke execute on function public.growth_modules(), public.filing_cap_set(uuid, int), public.filing_month(uuid),
  public.filing_charge_reserve(uuid, text, text, int, int, uuid), public.filing_charge_settle(uuid, boolean, text),
  public.billing_term_apply(uuid, int), public.billing_auto_renew_apply(uuid, boolean, uuid), public.renewal_notice_claim(uuid, date), public.renewal_notice_release(uuid, date),
  public.module_apply(uuid, text, boolean, uuid), public.hq_counts(text), public.hq_plan_set(text, text, text), public.hq_plan_view(),
  public.hq_invite_create(text), public.hq_invite_revoke(uuid), public.hq_invite_redeem(uuid, text), public.hq_cover_apply(text),
  public.hq_subscription_apply(text, timestamptz, text, text, text, timestamptz), public.hq_links_cover() from public, anon, authenticated;
grant execute on function public.growth_modules(), public.filing_cap_set(uuid, int), public.filing_month(uuid), public.hq_plan_set(text, text, text), public.hq_plan_view(),
  public.hq_invite_create(text), public.hq_invite_revoke(uuid), public.hq_invite_redeem(uuid, text) to authenticated;
grant execute on function public.growth_modules(), public.filing_month(uuid), public.filing_charge_reserve(uuid, text, text, int, int, uuid), public.filing_charge_settle(uuid, boolean, text),
  public.billing_term_apply(uuid, int), public.billing_auto_renew_apply(uuid, boolean, uuid), public.renewal_notice_claim(uuid, date), public.renewal_notice_release(uuid, date),
  public.module_apply(uuid, text, boolean, uuid), public.hq_counts(text), public.hq_cover_apply(text), public.hq_subscription_apply(text, timestamptz, text, text, text, timestamptz) to service_role;
