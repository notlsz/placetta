-- Placetta app: customer workspaces, the filing queue the Placetta team works from, private documents,
-- an append-only audit log, billing state written only by Stripe, and agent usage.

create table public.staff_emails (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
comment on table public.staff_emails is 'Placetta team members. Anyone who signs in with one of these emails sees the filing queue. Add with: insert into staff_emails values (''name@placetta.com'');';
alter table public.staff_emails enable row level security;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_emails s join auth.users u on lower(u.email) = s.email
    where u.id = auth.uid()
  );
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  state jsonb not null default '{}'::jsonb check (pg_column_size(state) < 4000000),
  authorized_at timestamptz,
  authorized_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.workspaces.state is 'The workspace the app shows: applications, checklists, filled fields, deadlines, facts, approvals. Audit entries live in audit_log.';

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user on public.workspace_members(user_id);

create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create table public.billing (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text,
  entry_markets int not null default 0 check (entry_markets >= 0),
  entry_paid_at timestamptz,
  subscription_id text,
  subscription_status text,
  current_period_end timestamptz,
  comped boolean not null default false,
  updated_at timestamptz not null default now()
);

create or replace function public.plan_of(ws uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when b.comped or b.subscription_status in ('active', 'trialing') then 'monthly'
      when b.entry_markets > 0 then 'entry'
      else 'none' end
    from public.billing b where b.workspace_id = ws
  ), 'none');
$$;

create or replace function public.can_file(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.plan_of(ws) = 'monthly'
     and exists (select 1 from public.workspaces w where w.id = ws and w.authorized_at is not null);
$$;

create table public.filings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_id text not null,
  title jsonb not null,
  agency jsonb,
  portal_url text,
  fee_estimate numeric(10, 2) not null default 0,
  payload jsonb not null,
  status text not null default 'requested'
    check (status in ('requested', 'in_progress', 'submitted', 'accepted', 'needs_info', 'rejected', 'canceled')),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  assigned_to uuid references auth.users(id),
  requirements_checked boolean not null default false,
  confirmation_number text,
  fee_paid numeric(10, 2),
  receipt_path text,
  note text,
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index filings_workspace on public.filings(workspace_id);
create index filings_open on public.filings(status) where status in ('requested', 'in_progress', 'needs_info', 'submitted');
create unique index filings_one_open_per_app on public.filings(workspace_id, app_id) where status in ('requested', 'in_progress', 'needs_info', 'submitted');

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
    end if;
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;

  if new.workspace_id <> old.workspace_id or new.app_id <> old.app_id or new.payload is distinct from old.payload
     or new.approved_by <> old.approved_by or new.approved_at <> old.approved_at or new.created_at <> old.created_at then
    raise exception 'What the customer approved can''t be changed. Ask them to approve a new filing.';
  end if;

  if customer then
    if not (old.status = 'requested' and new.status = 'canceled') then
      raise exception 'Only a request the Placetta team hasn''t started can be canceled.';
    end if;
    if (new.assigned_to, new.requirements_checked, new.confirmation_number, new.fee_paid, new.receipt_path, new.note,
        new.title, new.agency, new.portal_url, new.fee_estimate, new.submitted_at, new.decided_at)
       is distinct from
       (old.assigned_to, old.requirements_checked, old.confirmation_number, old.fee_paid, old.receipt_path, old.note,
        old.title, old.agency, old.portal_url, old.fee_estimate, old.submitted_at, old.decided_at) then
      raise exception 'Only the Placetta team can change a filing.';
    end if;
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
create trigger filings_guard before insert or update on public.filings for each row execute function public.filings_guard();

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_id text,
  filing_id uuid references public.filings(id) on delete set null,
  name text not null check (length(name) between 1 and 200),
  path text not null unique,
  size bigint not null default 0,
  mime text,
  source text not null default 'customer' check (source in ('customer', 'agent', 'team', 'agency')),
  uploaded_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index documents_workspace on public.documents(workspace_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id text,
  actor text not null check (actor in ('you', 'agent', 'team', 'agency')),
  actor_id uuid default auth.uid(),
  action jsonb not null,
  object jsonb not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_workspace on public.audit_log(workspace_id, created_at desc);
create unique index audit_log_client on public.audit_log(workspace_id, client_id) where client_id is not null;

create or replace function public.filings_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (new.workspace_id, 'you', new.approved_by,
            '{"en": "Approved for filing by the Placetta team", "zh": "批准并交由快哉团队提交"}'::jsonb, new.title,
            case when new.fee_estimate > 0 then jsonb_build_object('en', 'Estimated agency fee $' || new.fee_estimate, 'zh', '预估机构费用 $' || new.fee_estimate) end);
  elsif new.status is distinct from old.status then
    insert into public.audit_log(workspace_id, actor, actor_id, action, object, detail)
    values (new.workspace_id, case when new.status = 'canceled' then 'you' else 'team' end, auth.uid(),
      case new.status
        when 'in_progress' then '{"en": "Started the filing", "zh": "开始办理"}'::jsonb
        when 'submitted' then '{"en": "Submitted to the agency", "zh": "已提交至机构"}'::jsonb
        when 'accepted' then '{"en": "Approved by the agency", "zh": "机构已批准"}'::jsonb
        when 'needs_info' then '{"en": "Needs information from you", "zh": "需要您补充信息"}'::jsonb
        when 'rejected' then '{"en": "Returned by the agency", "zh": "被机构退回"}'::jsonb
        when 'canceled' then '{"en": "Canceled the filing request", "zh": "取消提交请求"}'::jsonb
        else '{"en": "Updated the filing", "zh": "更新申请"}'::jsonb end,
      new.title,
      case
        when new.status = 'submitted' and new.confirmation_number is not null
          then jsonb_build_object('en', 'Confirmation ' || new.confirmation_number, 'zh', '确认号 ' || new.confirmation_number)
        when new.status in ('needs_info', 'rejected') and new.note is not null
          then jsonb_build_object('en', new.note, 'zh', new.note)
      end);
  end if;
  return null;
end $$;
create trigger filings_audit after insert or update on public.filings for each row execute function public.filings_audit();

create table public.agent_usage (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  day date not null default current_date,
  calls int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  tts_chars bigint not null default 0,
  primary key (workspace_id, day)
);

create or replace function public.track_usage(ws uuid, p_calls int, p_in bigint, p_out bigint, p_tts bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.agent_usage as u (workspace_id, day, calls, input_tokens, output_tokens, tts_chars)
  values (ws, current_date, p_calls, p_in, p_out, p_tts)
  on conflict (workspace_id, day) do update set
    calls = u.calls + excluded.calls, input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens, tts_chars = u.tts_chars + excluded.tts_chars;
$$;

create or replace function public.touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger workspaces_touch before update on public.workspaces for each row execute function public.touch();
create trigger billing_touch before update on public.billing for each row execute function public.touch();

create or replace function public.create_workspace(p_name text, p_state jsonb, p_authorized boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare wid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not coalesce(p_authorized, false) then raise exception 'Authorize Placetta to prepare and submit the filings you approve first.'; end if;
  if (select count(*) from public.workspace_members where user_id = auth.uid()) >= 20 then raise exception 'Too many workspaces on this account.'; end if;
  insert into public.workspaces(name, state, authorized_at, authorized_by, created_by)
  values (left(trim(p_name), 120), coalesce(p_state, '{}'::jsonb), now(), auth.uid(), auth.uid())
  returning id into wid;
  insert into public.workspace_members(workspace_id, user_id, role) values (wid, auth.uid(), 'owner');
  insert into public.billing(workspace_id) values (wid);
  insert into public.audit_log(workspace_id, actor, actor_id, action, object)
  values (wid, 'you', auth.uid(),
    '{"en": "Created the workspace and authorized Placetta to prepare and submit the filings you approve", "zh": "创建工作区，并授权快哉准备和提交您批准的申请"}'::jsonb,
    jsonb_build_object('en', left(trim(p_name), 120), 'zh', left(trim(p_name), 120)));
  return wid;
end $$;

create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', u.id, 'email', u.email, 'staff', public.is_staff())
  from auth.users u where u.id = auth.uid();
$$;

create or replace function public.filing_queue() returns table (
  id uuid, workspace_id uuid, business text, approver_email text, app_id text, title jsonb, agency jsonb, portal_url text,
  fee_estimate numeric, payload jsonb, status text, approved_at timestamptz, assigned_to uuid, assignee_email text,
  requirements_checked boolean, confirmation_number text, fee_paid numeric, receipt_path text, note text,
  submitted_at timestamptz, decided_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return query
    select f.id, f.workspace_id, w.name, ua.email::text, f.app_id, f.title, f.agency, f.portal_url, f.fee_estimate, f.payload,
           f.status, f.approved_at, f.assigned_to, us.email::text, f.requirements_checked, f.confirmation_number, f.fee_paid,
           f.receipt_path, f.note, f.submitted_at, f.decided_at, f.updated_at
    from public.filings f
    join public.workspaces w on w.id = f.workspace_id
    left join auth.users ua on ua.id = f.approved_by
    left join auth.users us on us.id = f.assigned_to
    order by case f.status when 'requested' then 0 when 'in_progress' then 1 when 'needs_info' then 2 when 'submitted' then 3 else 4 end,
             f.approved_at;
end $$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.billing enable row level security;
alter table public.filings enable row level security;
alter table public.documents enable row level security;
alter table public.audit_log enable row level security;
alter table public.agent_usage enable row level security;

create policy "members and team read workspaces" on public.workspaces for select to authenticated
  using (public.is_member(id) or public.is_staff());
create policy "members edit their workspace" on public.workspaces for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

create policy "see your memberships" on public.workspace_members for select to authenticated
  using (user_id = auth.uid() or public.is_member(workspace_id) or public.is_staff());

create policy "members and team read billing" on public.billing for select to authenticated
  using (public.is_member(workspace_id) or public.is_staff());

create policy "members and team read filings" on public.filings for select to authenticated
  using (public.is_member(workspace_id) or public.is_staff());
create policy "members request filings they can file" on public.filings for insert to authenticated
  with check (public.is_member(workspace_id) and public.can_file(workspace_id));
create policy "members cancel, team works filings" on public.filings for update to authenticated
  using (public.is_member(workspace_id) or public.is_staff()) with check (public.is_member(workspace_id) or public.is_staff());

create policy "members and team read documents" on public.documents for select to authenticated
  using (public.is_member(workspace_id) or public.is_staff());
create policy "members and team add documents" on public.documents for insert to authenticated
  with check ((public.is_member(workspace_id) and source in ('customer', 'agent')) or public.is_staff());

create policy "members and team read the audit log" on public.audit_log for select to authenticated
  using (public.is_member(workspace_id) or public.is_staff());
create policy "members log their own actions, team logs theirs" on public.audit_log for insert to authenticated
  with check (
    (public.is_member(workspace_id) and actor in ('you', 'agent') and actor_id = auth.uid())
    or (public.is_staff() and actor in ('team', 'agency') and actor_id = auth.uid())
  );

create policy "members and team read usage" on public.agent_usage for select to authenticated
  using (public.is_member(workspace_id) or public.is_staff());

revoke all on public.workspaces, public.workspace_members, public.billing, public.filings, public.documents,
              public.audit_log, public.agent_usage, public.staff_emails from anon;
revoke insert, update, delete on public.workspaces, public.workspace_members, public.billing, public.agent_usage, public.staff_emails from authenticated;
revoke select on public.staff_emails from authenticated;
grant update (name, state) on public.workspaces to authenticated;
revoke update, delete on public.audit_log from authenticated;
revoke delete on public.filings, public.documents from authenticated;

revoke execute on function public.create_workspace(text, jsonb, boolean), public.whoami(), public.filing_queue(),
  public.track_usage(uuid, int, bigint, bigint, bigint), public.is_staff(), public.is_member(uuid), public.plan_of(uuid), public.can_file(uuid)
  from public, anon;
grant execute on function public.create_workspace(text, jsonb, boolean), public.whoami(), public.filing_queue(),
  public.is_staff(), public.is_member(uuid), public.plan_of(uuid), public.can_file(uuid) to authenticated;
revoke execute on function public.track_usage(uuid, int, bigint, bigint, bigint) from authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;

create or replace function public.can_use_folder(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() or exists (
    select 1 from public.workspace_members m
    where m.user_id = auth.uid() and m.workspace_id::text = (storage.foldername(object_name))[1]
  );
$$;
revoke execute on function public.can_use_folder(text) from public, anon;
grant execute on function public.can_use_folder(text) to authenticated;

create policy "placetta: read workspace files" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_use_folder(name));
create policy "placetta: add workspace files" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_use_folder(name));
