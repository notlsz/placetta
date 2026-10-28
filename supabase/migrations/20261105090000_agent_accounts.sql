-- "Odelia gets the login" (worker/filer/src/account.ts, supabase/functions/file/accounts.ts). A portal filing that has
-- no saved login used to wait for the owner to make an account on the agency's site. Under the business's agent
-- authority, the worker now makes the business's own account there, verifies it from the business's own inbox at
-- Placetta, and saves the login in the vault like any saved login, so this filing and every later one (and every status
-- check) just signs in. The model never sees the password: the worker makes it, saves it here, and types it with
-- fill_login.
--
-- 1. app_settings.agent_accounts_on (off until the founder turns it on, after counsel reads the agent section's account
--    wording) and agent_inbox_domain (the inbound domain, in.placetta.com).
-- 2. agent_inboxes: one inbound address per workspace, odelia+<token>@in.placetta.com, routed by odelia-mail
--    (SES inbound, the same rule as odelia@in.placetta.com). agent_inbox_mail: what came to it (sender, subject, links,
--    codes; never the whole body), and codes the owner texted Odelia for an account (source owner_sms). Pruned after
--    30 days.
-- 3. portal_accounts: each account Odelia made or is making: where, with which email, which saved login, every terms
--    page accepted (the page, its heading, when, under which agent authorization), and where it stands.
-- 4. agency_logins.made_by / status / verified_at: a login Odelia made is "pending" until the agency's verification is
--    done, then "saved". A pending one is dropped (and its vault secret with it) if the account isn't finished.
-- 5. Terms of use are accepted only under the live agent packet with account making on (account_authority): each
--    acceptance is an agent act (agent_acts 'terms_accepted') and an audit entry; the finished account is one too
--    ('account_created').
-- Safe to run twice.

alter table public.app_settings add column if not exists agent_accounts_on boolean not null default false;
alter table public.app_settings add column if not exists agent_inbox_domain text not null default 'in.placetta.com'
  check (agent_inbox_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$');

-- ---------------------------------------------------------------- the business's inbox at Placetta

create table if not exists public.agent_inboxes (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  token text not null unique check (token ~ '^[a-z0-9]{6,32}$'),
  created_at timestamptz not null default now()
);
comment on table public.agent_inboxes is 'The business''s own inbound address at Placetta (odelia+<token>@<agent_inbox_domain>), the email on accounts Odelia makes on agency sites.';
alter table public.agent_inboxes enable row level security;
revoke all on public.agent_inboxes from public, anon, authenticated;
grant select on public.agent_inboxes to authenticated;
drop policy if exists "members read their inbox" on public.agent_inboxes;
create policy "members read their inbox" on public.agent_inboxes for select to authenticated using (public.can_view(workspace_id));

create table if not exists public.agent_inbox_mail (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source text not null check (source in ('email', 'owner_sms')),
  provider_id text not null unique,
  from_addr text not null check (char_length(from_addr) <= 320),
  from_host text not null default '' check (char_length(from_host) <= 255),
  subject text not null default '' check (char_length(subject) <= 300),
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 40),
  codes jsonb not null default '[]'::jsonb check (jsonb_typeof(codes) = 'array' and jsonb_array_length(codes) <= 5),
  verified boolean not null default false,
  received_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references public.filings(id) on delete set null
);
comment on table public.agent_inbox_mail is 'Mail to the business''s inbox at Placetta (agency verification emails: sender, subject, links and codes only), and codes the owner texted Odelia for an account. Kept 30 days.';
create index if not exists agent_inbox_mail_ws on public.agent_inbox_mail(workspace_id, received_at desc);
alter table public.agent_inbox_mail enable row level security;
revoke all on public.agent_inbox_mail from public, anon, authenticated;
grant select on public.agent_inbox_mail to authenticated;
drop policy if exists "members read their inbox mail" on public.agent_inbox_mail;
create policy "members read their inbox mail" on public.agent_inbox_mail for select to authenticated using (public.can_view(workspace_id));

-- ---------------------------------------------------------------- accounts Odelia makes

alter table public.agency_logins add column if not exists made_by text not null default 'owner' check (made_by in ('owner', 'odelia'));
alter table public.agency_logins add column if not exists status text not null default 'saved' check (status in ('pending', 'saved'));
alter table public.agency_logins add column if not exists verified_at timestamptz;
grant select (made_by, status, verified_at) on public.agency_logins to authenticated;

create table if not exists public.portal_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  filing_id uuid references public.filings(id) on delete set null,
  host text not null check (host ~ '^[a-z0-9.-]{3,255}$'),
  tenant text check (tenant is null or tenant ~ '^/[A-Za-z0-9._-]{1,80}$'),
  agency text not null check (char_length(agency) between 1 and 160),
  email text not null check (char_length(email) between 5 and 320),
  login_id uuid references public.agency_logins(id) on delete set null,
  authorization_id uuid references public.agent_authorizations(id),
  state text not null default 'creating' check (state in ('creating', 'awaiting_email', 'awaiting_code', 'saved', 'handed_back', 'failed')),
  terms jsonb not null default '[]'::jsonb check (jsonb_typeof(terms) = 'array'),
  note text check (note is null or char_length(note) <= 500),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz
);
comment on table public.portal_accounts is 'Each account Odelia made (or is making) for the business on an agency site: the email, the saved login, each terms page accepted (page, heading, time, agent authorization), and its state.';
create index if not exists portal_accounts_ws on public.portal_accounts(workspace_id, host, started_at desc);
alter table public.portal_accounts enable row level security;
revoke all on public.portal_accounts from public, anon, authenticated;
grant select on public.portal_accounts to authenticated;
drop policy if exists "members read their portal accounts" on public.portal_accounts;
create policy "members read their portal accounts" on public.portal_accounts for select to authenticated using (public.can_view(workspace_id));

-- agent acts gain the two account acts, added to whatever the constraint allows
do $$
declare d text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c where c.conname = 'agent_acts_act_check' and c.conrelid = 'public.agent_acts'::regclass;
  if d is not null and d not like '%terms_accepted%' and d like '%ARRAY[%' then
    execute 'alter table public.agent_acts drop constraint agent_acts_act_check';
    execute 'alter table public.agent_acts add constraint agent_acts_act_check ' || replace(d, 'ARRAY[', 'ARRAY[''terms_accepted''::text, ''account_created''::text, ');
  end if;
  -- a team task about an account: whether an agent may make one on a site, or an agency email that never came
  select pg_get_constraintdef(c.oid) into d from pg_constraint c where c.conname = 'team_tasks_kind_check' and c.conrelid = 'public.team_tasks'::regclass;
  if d is not null and d not like '%''account''%' and d like '%ARRAY[%' then
    execute 'alter table public.team_tasks drop constraint team_tasks_kind_check';
    execute 'alter table public.team_tasks add constraint team_tasks_kind_check ' || replace(d, 'ARRAY[', 'ARRAY[''account''::text, ');
  end if;
end $$;

-- ---------------------------------------------------------------- authority

/** The live agent packet that lets Odelia make the business's accounts and accept a site's terms for it, or null:
    account making switched on, and a packet for this workspace that isn't revoked or expired. */
create or replace function public.account_authority(p_ws uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.agent_authorizations a
  where a.workspace_id = p_ws and a.revoked_at is null and a.expires_at > now()
    and coalesce((select s.agent_accounts_on from public.app_settings s where s.id), false)
  order by a.signed_at desc limit 1
$$;

/** The filing is the agent's running one, under this run's token. Returns it. */
create or replace function public.filer_account_filing(p_filing uuid) returns public.filings
language plpgsql stable security definer set search_path = '' as $$
declare f public.filings;
begin
  select * into f from public.filings where id = p_filing;
  if f.id is null or f.agent_state is distinct from 'running' then raise exception 'filing_not_running'; end if;
  if not public.filer_run_ok(p_filing) then raise exception 'run_token_invalid'; end if;
  return f;
end $$;

create or replace function public.filer_account_row(p_filing uuid, p_setup uuid) returns public.portal_accounts
language plpgsql stable security definer set search_path = '' as $$
declare f public.filings := public.filer_account_filing(p_filing); a public.portal_accounts;
begin
  select * into a from public.portal_accounts where id = p_setup and workspace_id = f.workspace_id;
  if a.id is null then raise exception 'account_not_in_workspace'; end if;
  return a;
end $$;

/** Odelia starts making the business's account on a site: the workspace's inbox (made the first time), and the account's
    row (the open one for the same site is reused, so a retried run carries on with the same email and login). */
create or replace function public.filer_account_begin(p_filing uuid, p_host text, p_tenant text, p_agency text)
returns table (setup_id uuid, email text, login_id uuid, state text)
language plpgsql security definer set search_path = '' as $$
declare f public.filings := public.filer_account_filing(p_filing); auth uuid; tok text; dom text; a public.portal_accounts; h text := lower(trim(coalesce(p_host, '')));
begin
  auth := public.account_authority(f.workspace_id);
  if auth is null then raise exception 'account_authority'; end if;
  if h !~ '^[a-z0-9.-]{3,255}$' then raise exception 'bad_host'; end if;
  insert into public.agent_inboxes (workspace_id, token) values (f.workspace_id, left(replace(gen_random_uuid()::text, '-', ''), 12))
    on conflict (workspace_id) do nothing;
  select i.token into tok from public.agent_inboxes i where i.workspace_id = f.workspace_id;
  select s.agent_inbox_domain into dom from public.app_settings s where s.id;
  select * into a from public.portal_accounts p
   where p.workspace_id = f.workspace_id and p.host = h and p.tenant is not distinct from nullif(p_tenant, '')
     and p.state in ('creating', 'awaiting_email', 'awaiting_code') and p.updated_at > now() - interval '2 days'
   order by p.started_at desc limit 1;
  if a.id is null then
    insert into public.portal_accounts (workspace_id, filing_id, host, tenant, agency, email, authorization_id)
    values (f.workspace_id, f.id, h, nullif(p_tenant, ''), left(coalesce(nullif(trim(p_agency), ''), h), 160), 'odelia+' || tok || '@' || coalesce(dom, 'in.placetta.com'), auth)
    returning * into a;
    insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
    values (f.workspace_id, 'agent', null, jsonb_build_object('en', 'Odelia started making the business''s account on ' || a.agency, 'zh', 'Odelia 开始为企业在 ' || a.agency || ' 开设账户'),
      f.title, jsonb_build_object('en', 'Account email ' || a.email, 'zh', '账户邮箱 ' || a.email));
  else
    update public.portal_accounts set filing_id = f.id, authorization_id = auth, updated_at = now() where id = a.id returning * into a;
  end if;
  return query select a.id, a.email, a.login_id, a.state;
end $$;

/** The new account's login, into the vault like every saved login, before the agency's form is sent (so a run that stops
    halfway never loses the password it registered). "pending" until the account is verified. The password is never
    written anywhere else, never logged and never in the audit trail. */
create or replace function public.filer_save_login(p_filing uuid, p_setup uuid, p_url text, p_username text, p_password text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.portal_accounts := public.filer_account_row(p_filing, p_setup); l public.agency_logins; sid uuid;
begin
  if p_password is null or char_length(p_password) < 12 or char_length(p_password) > 200 then raise exception 'bad_password'; end if;
  if p_username is null or char_length(p_username) not between 1 and 200 then raise exception 'bad_username'; end if;
  if p_url is null or p_url !~ '^https://[^/@\s]+(/|$)' then raise exception 'bad_url'; end if;
  if a.state not in ('creating', 'awaiting_email', 'awaiting_code') then raise exception 'account_closed'; end if;
  if a.login_id is not null then
    select * into l from public.agency_logins where id = a.login_id;
    if l.status = 'saved' then raise exception 'login_already_saved'; end if;
    perform public.vault_put(p_password, 'agency_login:' || a.workspace_id::text, l.secret_id);
    update public.agency_logins set username = p_username, url = p_url, updated_at = now() where id = l.id;
    return l.id;
  end if;
  sid := public.vault_put(p_password, 'agency_login:' || a.workspace_id::text);
  insert into public.agency_logins (workspace_id, agency, url, username, note, secret_id, created_by, made_by, status)
  values (a.workspace_id, a.agency, p_url, p_username, 'Made by Odelia for the business, with its inbox at Placetta', sid, null, 'odelia', 'pending')
  returning * into l;
  update public.portal_accounts set login_id = l.id, updated_at = now() where id = a.id;
  return l.id;
end $$;

/** A site's terms of use, accepted for the business: only under the live agent packet with account making on. The page,
    its heading, the box's words and the time go on the account's row, in agent_acts and in the audit trail. */
create or replace function public.filer_account_terms(p_filing uuid, p_setup uuid, p_url text, p_heading text, p_label text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.portal_accounts := public.filer_account_row(p_filing, p_setup); f public.filings; auth uuid; rec jsonb;
begin
  select * into f from public.filings where id = p_filing;
  auth := public.account_authority(a.workspace_id);
  if auth is null then raise exception 'terms_not_covered'; end if;
  if p_url is null or p_url !~ '^https?://' then raise exception 'bad_url'; end if;
  rec := jsonb_build_object('url', left(p_url, 500), 'heading', left(coalesce(p_heading, ''), 200), 'label', left(coalesce(p_label, ''), 300), 'at', now(), 'authorization', auth);
  update public.portal_accounts set terms = terms || jsonb_build_array(rec), updated_at = now() where id = a.id;
  insert into public.agent_acts (workspace_id, authorization_id, filing_id, form, agency, act, actor, actor_name, detail)
  values (a.workspace_id, auth, f.id, coalesce(f.payload ->> 'official', ''), a.agency, 'terms_accepted', 'odelia', 'Odelia', left('Accepted the site''s terms for the business on ' || p_url, 500));
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (a.workspace_id, 'agent', null, jsonb_build_object('en', 'Accepted ' || a.agency || '''s terms of use for the business, as its agent', 'zh', '作为企业的代理人接受了 ' || a.agency || ' 的使用条款'),
    jsonb_build_object('en', left(coalesce(nullif(p_heading, ''), p_url), 200), 'zh', left(coalesce(nullif(p_heading, ''), p_url), 200)),
    jsonb_build_object('en', left(p_url, 300), 'zh', left(p_url, 300)));
  return rec;
end $$;

/** Where the account stands. Given up (handed_back, failed): a pending login is dropped, its vault secret with it. */
create or replace function public.filer_account_state(p_filing uuid, p_setup uuid, p_state text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.portal_accounts := public.filer_account_row(p_filing, p_setup); l public.agency_logins;
begin
  if p_state not in ('creating', 'awaiting_email', 'awaiting_code', 'handed_back', 'failed') then raise exception 'bad_state'; end if;
  if a.state = 'saved' then return; end if;
  if p_state in ('handed_back', 'failed') and a.login_id is not null then
    select * into l from public.agency_logins where id = a.login_id;
    if l.status = 'pending' then
      delete from public.agency_logins where id = l.id;
      perform public.vault_drop(l.secret_id);
    end if;
  end if;
  update public.portal_accounts set state = p_state, note = left(p_note, 500), updated_at = now(),
    login_id = case when p_state in ('handed_back', 'failed') then null else login_id end
   where id = a.id;
end $$;

/** The agency verified the account: the login is saved, and later filings and status checks sign in with it. */
create or replace function public.filer_account_saved(p_filing uuid, p_setup uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.portal_accounts := public.filer_account_row(p_filing, p_setup); f public.filings;
begin
  if a.login_id is null then raise exception 'no_login'; end if;
  select * into f from public.filings where id = p_filing;
  update public.agency_logins set status = 'saved', verified_at = now(), updated_at = now() where id = a.login_id;
  update public.portal_accounts set state = 'saved', verified_at = now(), updated_at = now() where id = a.id;
  if a.state <> 'saved' then
    insert into public.agent_acts (workspace_id, authorization_id, filing_id, form, agency, act, actor, actor_name, detail)
    values (a.workspace_id, a.authorization_id, f.id, coalesce(f.payload ->> 'official', ''), a.agency, 'account_created', 'odelia', 'Odelia', left('Made and verified the business''s account (' || a.email || ')', 500));
    insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
    values (a.workspace_id, 'agent', null, jsonb_build_object('en', 'Made the business''s account on ' || a.agency || ' and saved its login', 'zh', '已为企业在 ' || a.agency || ' 开设账户并保存登录信息'),
      jsonb_build_object('en', a.email, 'zh', a.email), jsonb_build_object('en', 'Verified with the agency''s email; the password is in the vault', 'zh', '已通过机构邮件验证；密码保存在保险库中'));
  end if;
  return a.login_id;
end $$;

-- ---------------------------------------------------------------- reading the inbox

create or replace function public.filer_inbox_mail(p_filing uuid, p_since timestamptz)
returns table (id bigint, source text, from_addr text, from_host text, subject text, links jsonb, codes jsonb, verified boolean, received_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare f public.filings := public.filer_account_filing(p_filing);
begin
  return query select m.id, m.source, m.from_addr, m.from_host, m.subject, m.links, m.codes, m.verified, m.received_at
    from public.agent_inbox_mail m
   where m.workspace_id = f.workspace_id and m.used_at is null and m.received_at >= coalesce(p_since, now()) - interval '1 minute'
   order by m.received_at desc limit 20;
end $$;

create or replace function public.filer_inbox_used(p_filing uuid, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.filings := public.filer_account_filing(p_filing);
begin
  update public.agent_inbox_mail set used_at = now(), used_by = f.id where id = p_id and workspace_id = f.workspace_id and used_at is null;
end $$;

/** odelia-mail: a message to odelia+<token>@: kept (sender, subject, links, codes) when the token is a workspace's. */
create or replace function public.agent_inbox_receive(p_token text, p_provider_id text, p_from text, p_subject text, p_links jsonb, p_codes jsonb, p_verified boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare ws uuid; dom text := lower(split_part(coalesce(p_from, ''), '@', 2));
begin
  select i.workspace_id into ws from public.agent_inboxes i where i.token = lower(coalesce(p_token, ''));
  if ws is null then return false; end if;
  delete from public.agent_inbox_mail where workspace_id = ws and received_at < now() - interval '30 days';
  insert into public.agent_inbox_mail (workspace_id, source, provider_id, from_addr, from_host, subject, links, codes, verified)
  values (ws, 'email', left(p_provider_id, 300), left(lower(coalesce(p_from, '')), 320), left(dom, 255), left(coalesce(p_subject, ''), 300),
    case when jsonb_typeof(p_links) = 'array' then (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(p_links) x limit 40) t) else '[]'::jsonb end,
    case when jsonb_typeof(p_codes) = 'array' then (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(p_codes) x limit 5) t) else '[]'::jsonb end,
    coalesce(p_verified, false))
  on conflict (provider_id) do nothing;
  return true;
end $$;

/** odelia-sms: the owner texted Odelia the code an agency sent to their phone for an account she's making. Kept for the
    waiting run only when the person is a member of the workspace and one of its accounts is waiting on a code. */
create or replace function public.agent_inbox_owner_code(p_user uuid, p_ws uuid, p_code text, p_provider_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_code is null or p_code !~ '^[0-9]{4,8}$' then return false; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_ws and m.user_id = p_user) then return false; end if;
  if not exists (select 1 from public.portal_accounts a where a.workspace_id = p_ws and a.state = 'awaiting_code' and a.updated_at > now() - interval '30 minutes') then return false; end if;
  insert into public.agent_inbox_mail (workspace_id, source, provider_id, from_addr, subject, codes, verified)
  values (p_ws, 'owner_sms', left(coalesce(p_provider_id, 'sms:' || gen_random_uuid()::text), 300), 'owner', 'Code the owner texted', jsonb_build_array(p_code), true)
  on conflict (provider_id) do nothing;
  return true;
end $$;

revoke execute on function public.account_authority(uuid), public.filer_account_filing(uuid), public.filer_account_row(uuid, uuid),
  public.filer_account_begin(uuid, text, text, text), public.filer_save_login(uuid, uuid, text, text, text),
  public.filer_account_terms(uuid, uuid, text, text, text), public.filer_account_state(uuid, uuid, text, text),
  public.filer_account_saved(uuid, uuid), public.filer_inbox_mail(uuid, timestamptz), public.filer_inbox_used(uuid, bigint),
  public.agent_inbox_receive(text, text, text, text, jsonb, jsonb, boolean), public.agent_inbox_owner_code(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.account_authority(uuid), public.filer_account_begin(uuid, text, text, text), public.filer_save_login(uuid, uuid, text, text, text),
  public.filer_account_terms(uuid, uuid, text, text, text), public.filer_account_state(uuid, uuid, text, text),
  public.filer_account_saved(uuid, uuid), public.filer_inbox_mail(uuid, timestamptz), public.filer_inbox_used(uuid, bigint)
  to placetta_filer, service_role;
grant execute on function public.agent_inbox_receive(text, text, text, text, jsonb, jsonb, boolean), public.agent_inbox_owner_code(uuid, uuid, text, text) to service_role;
