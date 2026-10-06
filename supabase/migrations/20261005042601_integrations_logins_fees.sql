-- Integrations, the agency-login vault, calendar feeds, and the "customer pays the agency" step.
-- Nothing is dropped: "payment due" is a needs_info filing that carries the agency's payment link.

alter table public.filings add column if not exists payment_url text, add column if not exists customer_paid_at timestamptz;

create or replace function public.filings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  customer boolean := auth.uid() is not null and not public.is_staff();
begin
  if tg_op = 'INSERT' then
    if customer then
      new.status := 'requested'; new.approved_by := auth.uid(); new.approved_at := now();
      new.assigned_to := null; new.requirements_checked := false; new.confirmation_number := null;
      new.fee_paid := null; new.receipt_path := null; new.note := null; new.submitted_at := null; new.decided_at := null;
      new.payment_url := null; new.customer_paid_at := null;
    end if;
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;

  if new.workspace_id <> old.workspace_id or new.app_id <> old.app_id or new.payload is distinct from old.payload
     or new.approved_by <> old.approved_by or new.approved_at <> old.approved_at or new.created_at <> old.created_at then
    raise exception 'What the customer approved can''t be changed. Ask them to approve a new filing.';
  end if;

  if customer then
    if old.status = 'requested' and new.status = 'canceled' then
      null;
    elsif old.status = 'needs_info' and old.payment_url is not null and new.status = 'in_progress' then
      new.customer_paid_at := now();
    else
      raise exception 'Only the Placetta team can change a filing at this stage.';
    end if;
    if (new.assigned_to, new.requirements_checked, new.confirmation_number, new.fee_paid, new.receipt_path, new.note,
        new.title, new.agency, new.portal_url, new.fee_estimate, new.submitted_at, new.decided_at, new.payment_url)
       is distinct from
       (old.assigned_to, old.requirements_checked, old.confirmation_number, old.fee_paid, old.receipt_path, old.note,
        old.title, old.agency, old.portal_url, old.fee_estimate, old.submitted_at, old.decided_at, old.payment_url) then
      raise exception 'Only the Placetta team can change a filing.';
    end if;
  end if;

  if new.payment_url is not null and new.payment_url !~ '^https://' then
    raise exception 'The agency payment link must start with https://';
  end if;
  if new.status = 'submitted' and old.status <> 'submitted' then
    if not new.requirements_checked then
      raise exception 'Check the application against the agency''s current requirements before marking it submitted.';
    end if;
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  if new.status in ('accepted', 'rejected') and old.status not in ('accepted', 'rejected') then
    new.decided_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.filings_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (new.workspace_id, 'you', new.approved_by,
            '{"en": "Approved for filing by the Placetta team", "zh": "批准并交由快哉团队提交"}'::jsonb, new.title,
            case when new.fee_estimate > 0 then jsonb_build_object('en', 'Estimated agency fee $' || new.fee_estimate || ', paid by you to the agency', 'zh', '预估机构费用 $' || new.fee_estimate || '，由您直接支付给机构') end);
  elsif new.status is distinct from old.status then
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (new.workspace_id,
      case when new.status = 'canceled' or new.customer_paid_at is distinct from old.customer_paid_at then 'you' else 'team' end, auth.uid(),
      case
        when new.customer_paid_at is distinct from old.customer_paid_at then '{"en": "Paid the agency fee", "zh": "已支付机构费用"}'::jsonb
        when new.status = 'in_progress' then '{"en": "Started the filing", "zh": "开始办理"}'::jsonb
        when new.status = 'needs_info' and new.payment_url is not null then '{"en": "Asked you to pay the agency fee", "zh": "请您支付机构费用"}'::jsonb
        when new.status = 'submitted' then '{"en": "Submitted to the agency", "zh": "已提交至机构"}'::jsonb
        when new.status = 'accepted' then '{"en": "Approved by the agency", "zh": "机构已批准"}'::jsonb
        when new.status = 'needs_info' then '{"en": "Needs information from you", "zh": "需要您补充信息"}'::jsonb
        when new.status = 'rejected' then '{"en": "Returned by the agency", "zh": "被机构退回"}'::jsonb
        when new.status = 'canceled' then '{"en": "Canceled the filing request", "zh": "取消提交请求"}'::jsonb
        else '{"en": "Updated the filing", "zh": "更新申请"}'::jsonb end,
      new.title,
      case
        when new.status = 'submitted' and new.confirmation_number is not null
          then jsonb_build_object('en', 'Confirmation ' || new.confirmation_number, 'zh', '确认号 ' || new.confirmation_number)
        when new.status = 'needs_info' and new.payment_url is not null and new.fee_paid is not null
          then jsonb_build_object('en', '$' || new.fee_paid || ' to the agency', 'zh', '应付机构 $' || new.fee_paid)
        when new.status in ('needs_info', 'rejected') and new.note is not null
          then jsonb_build_object('en', new.note, 'zh', new.note)
      end);
  end if;
  return null;
end $$;

create or replace function public.filing_queue_v2() returns table (
  id uuid, workspace_id uuid, business text, approver_email text, app_id text, title jsonb, agency jsonb, portal_url text,
  fee_estimate numeric, payload jsonb, status text, approved_at timestamptz, assigned_to uuid, assignee_email text,
  requirements_checked boolean, confirmation_number text, fee_paid numeric, receipt_path text, note text,
  payment_url text, customer_paid_at timestamptz, submitted_at timestamptz, decided_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return query
    select f.id, f.workspace_id, w.name, ua.email::text, f.app_id, f.title, f.agency, f.portal_url, f.fee_estimate, f.payload,
           f.status, f.approved_at, f.assigned_to, us.email::text, f.requirements_checked, f.confirmation_number, f.fee_paid,
           f.receipt_path, f.note, f.payment_url, f.customer_paid_at, f.submitted_at, f.decided_at, f.updated_at
    from public.filings f
    join public.workspaces w on w.id = f.workspace_id
    left join auth.users ua on ua.id = f.approved_by
    left join auth.users us on us.id = f.assigned_to
    order by case f.status when 'requested' then 0 when 'in_progress' then 1 when 'needs_info' then 2 when 'submitted' then 3 else 4 end,
             f.approved_at;
end $$;
revoke execute on function public.filing_queue_v2() from public, anon;
grant execute on function public.filing_queue_v2() to authenticated;

create or replace function public.vault_put(p_secret text, p_name text, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if p_id is null then
    return vault.create_secret(p_secret, p_name || ':' || gen_random_uuid()::text);
  end if;
  perform vault.update_secret(p_id, p_secret);
  return p_id;
end $$;

create or replace function public.vault_get(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_id;
$$;

create or replace function public.vault_drop(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from vault.secrets where id = p_id;
$$;

revoke execute on function public.vault_put(text, text, uuid), public.vault_get(uuid), public.vault_drop(uuid) from public, anon, authenticated;

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack')),
  account text,
  scopes text,
  status text not null default 'connected' check (status in ('connected', 'error')),
  error text,
  secret_id uuid,
  meta jsonb not null default '{}'::jsonb,
  connected_by uuid references auth.users(id),
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (workspace_id, kind)
);
alter table public.integrations enable row level security;
create policy "members and team see integrations" on public.integrations for select to authenticated
  using (public.is_member(workspace_id) or public.is_staff());
revoke all on public.integrations from anon;
revoke insert, update, delete on public.integrations from authenticated;
revoke select on public.integrations from authenticated;
grant select (id, workspace_id, kind, account, scopes, status, error, meta, connected_by, connected_at, last_used_at) on public.integrations to authenticated;

create table public.agency_logins (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agency text not null check (length(agency) between 1 and 160),
  url text,
  username text not null check (length(username) between 1 and 200),
  note text,
  secret_id uuid not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz,
  last_opened_by uuid references auth.users(id)
);
create index agency_logins_workspace on public.agency_logins(workspace_id);
alter table public.agency_logins enable row level security;
create policy "members and team see saved logins" on public.agency_logins for select to authenticated
  using (public.is_member(workspace_id) or public.is_staff());
revoke all on public.agency_logins from anon;
revoke insert, update, delete on public.agency_logins from authenticated;
revoke select on public.agency_logins from authenticated;
grant select (id, workspace_id, agency, url, username, note, created_by, created_at, updated_at, last_opened_at, last_opened_by) on public.agency_logins to authenticated;

create table public.calendar_feeds (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;

create or replace function public.calendar_token(ws uuid, p_rotate boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if not public.is_member(ws) then raise exception 'Not your workspace.'; end if;
  if p_rotate then delete from public.calendar_feeds where workspace_id = ws; end if;
  select token into t from public.calendar_feeds where workspace_id = ws;
  if t is null then
    t := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.calendar_feeds(workspace_id, token) values (ws, t);
  end if;
  return t;
end $$;
revoke execute on function public.calendar_token(uuid, boolean) from public, anon;
grant execute on function public.calendar_token(uuid, boolean) to authenticated;

create extension if not exists pg_net with schema extensions;
