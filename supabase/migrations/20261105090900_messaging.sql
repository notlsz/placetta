-- Odelia by text, the way Instinct does it (supabase/functions/odelia-sms, src/textApprove.ts, _shared/deliver.ts):
--
-- 1. phone_links.imessage: whether the person's phone takes iMessage, as Linq last reported (iMessage, or RCS/SMS for
--    Android). Updates go by iMessage when it does (Linq's flat fee) and by Telnyx SMS when it doesn't.
-- 2. odelia_messages.verdict: an incoming text the injection rules flagged or quarantined (_shared/injection.ts).
-- 3. odelia_outbox.approval_id: the card a queued text asks the owner to approve, so the text carries its code.
-- 4. Approving a filing by text. Each text that asks for an approval carries a 4-digit code minted for that owner and
--    that card (text_approval_set; only a bcrypt hash is kept, for 48 hours). "YES 4821" from the owner's verified
--    number takes it once (text_approval_take; five wrong codes in a day lock texts approvals for a day), and
--    text_approve_file puts the filing in with the same gates as the app's Approve: an owner, the updated Terms
--    accepted, a second owner when a business rule wants one, the plan or the license paid, one open filing per
--    application; and the fee within the owner's Autopilot caps when Autopilot is on (per filing, and the month's
--    Autopilot and text approvals together), else within the text cap Odelia's server passes (ODELIA_TEXT_APPROVE_MAX).
-- 5. filings.approved_via = 'text' marks those filings; a customer's own insert can't set it and nobody changes it.
-- Every new table has row-level security and no client grants. Safe to run twice.

alter table public.phone_links add column if not exists imessage boolean;
comment on column public.phone_links.imessage is 'Whether the phone takes iMessage, as Linq last reported; null until known.';
-- via: how they last wrote, so the answer goes back the same way. 'sms' is Odelia's Telnyx number (before, a text to it
-- was answered from an iMessage line whenever Linq was on: a different number than the one they wrote to).
alter table public.phone_links drop constraint if exists phone_links_via_check;
alter table public.phone_links add constraint phone_links_via_check check (via is null or via in ('whatsapp', 'sms'));

alter table public.odelia_messages add column if not exists verdict text;
alter table public.odelia_messages drop constraint if exists odelia_messages_verdict_check;
alter table public.odelia_messages add constraint odelia_messages_verdict_check check (verdict is null or verdict in ('flagged', 'quarantined'));

alter table public.odelia_outbox add column if not exists approval_id text check (approval_id is null or char_length(approval_id) between 1 and 200);

alter table public.filings add column if not exists approved_via text;
alter table public.filings drop constraint if exists filings_approved_via_check;
alter table public.filings add constraint filings_approved_via_check check (approved_via is null or approved_via = 'text');

create or replace function public.filings_via_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.approved_via := null; end if;
    return new;
  end if;
  if new.approved_via is distinct from old.approved_via then raise exception 'How a filing was approved can''t be changed.'; end if;
  return new;
end $$;
revoke execute on function public.filings_via_guard() from public, anon, authenticated;
drop trigger if exists filings_via_guard on public.filings;
create trigger filings_via_guard before insert or update on public.filings for each row execute function public.filings_via_guard();

create table if not exists public.text_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  approval_id text not null check (char_length(approval_id) between 1 and 200),
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
comment on table public.text_approvals is 'Codes that let an owner approve one card by text ("YES 4821"), kept only as bcrypt hashes, 48 hours, once. Server only.';
create unique index if not exists text_approvals_one on public.text_approvals(user_id, workspace_id, approval_id);
create index if not exists text_approvals_open on public.text_approvals(user_id, expires_at) where used_at is null;
alter table public.text_approvals enable row level security;
revoke all on public.text_approvals from public, anon, authenticated;
grant all on public.text_approvals to service_role;

create table if not exists public.text_approval_misses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
comment on table public.text_approval_misses is 'Wrong approval codes texted, for the lockout (five a day). Server only.';
create index if not exists text_approval_misses_user on public.text_approval_misses(user_id, at desc);
alter table public.text_approval_misses enable row level security;
revoke all on public.text_approval_misses from public, anon, authenticated;
grant all on public.text_approval_misses to service_role;

/** A code for one owner and one card, replacing any earlier one for it. Only an owner of the workspace gets one. */
create or replace function public.text_approval_set(p_user uuid, p_ws uuid, p_approval text, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_code !~ '^[0-9]{4}$' or coalesce(p_approval, '') = '' then raise exception 'bad_request: a 4-digit code and a card'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_ws and m.user_id = p_user and m.role = 'owner') then return false; end if;
  insert into public.text_approvals (user_id, workspace_id, approval_id, code_hash, expires_at)
  values (p_user, p_ws, left(p_approval, 200), extensions.crypt(p_code, extensions.gen_salt('bf', 6)), now() + interval '48 hours')
  on conflict (user_id, workspace_id, approval_id) do update set code_hash = excluded.code_hash, created_at = now(), expires_at = excluded.expires_at, used_at = null;
  return true;
end $$;
revoke execute on function public.text_approval_set(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.text_approval_set(uuid, uuid, text, text) to service_role;

/** The card a texted code approves, once: ok (with the workspace and card), wrong, locked or none. */
create or replace function public.text_approval_take(p_user uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.text_approvals; misses int;
begin
  select count(*) into misses from public.text_approval_misses where user_id = p_user and at > now() - interval '24 hours';
  if misses >= 5 then return jsonb_build_object('result', 'locked'); end if;
  if not exists (select 1 from public.text_approvals where user_id = p_user and used_at is null and expires_at > now()) then return jsonb_build_object('result', 'none'); end if;
  select * into r from public.text_approvals a
   where a.user_id = p_user and a.used_at is null and a.expires_at > now() and p_code ~ '^[0-9]{4}$' and a.code_hash = extensions.crypt(p_code, a.code_hash)
   order by a.created_at desc limit 1 for update;
  if r.id is null then
    insert into public.text_approval_misses (user_id) values (p_user);
    return jsonb_build_object('result', case when misses + 1 >= 5 then 'locked' else 'wrong' end);
  end if;
  update public.text_approvals set used_at = now() where id = r.id;
  return jsonb_build_object('result', 'ok', 'workspace_id', r.workspace_id, 'approval_id', r.approval_id);
end $$;
revoke execute on function public.text_approval_take(uuid, text) from public, anon, authenticated;
grant execute on function public.text_approval_take(uuid, text) to service_role;

/** The filing an owner approved by text, with the app's gates; see the header. Returns {result: filed|waiting|refused}. */
create or replace function public.text_approve_file(p_ws uuid, p_user uuid, p_approval text, p_app_id text, p_title jsonb, p_agency jsonb, p_portal_url text,
  p_fee numeric, p_payload jsonb, p_cap numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cur text := public.current_terms_version(); g public.autopilot_grants; spent numeric; owners int; fid uuid;
begin
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_ws and m.user_id = p_user and m.role = 'owner') then
    return jsonb_build_object('result', 'refused', 'why', 'owner_only: only an owner of this workspace approves a filing');
  end if;
  if not (exists (select 1 from public.terms_acceptances a where a.user_id = p_user and a.doc = 'terms' and a.version = cur)
      and exists (select 1 from public.terms_acceptances a where a.user_id = p_user and a.doc = 'privacy' and a.version = cur)) then
    return jsonb_build_object('result', 'refused', 'why', 'terms_version: accept the updated Terms in Placetta first, then approve');
  end if;
  if p_fee is null or p_fee < 0 then return jsonb_build_object('result', 'refused', 'why', 'text_cap: the fee isn''t known, so approve it in the app'); end if;
  select * into g from public.autopilot_grants a where a.workspace_id = p_ws and a.revoked_at is null and a.expires_at > now() limit 1;
  if g.id is not null then
    if p_fee > g.cap_per_filing then
      return jsonb_build_object('result', 'refused', 'why', format('text_cap: the fee ($%s) is over your $%s Autopilot cap, so approve it in the app', p_fee, g.cap_per_filing));
    end if;
    select coalesce(sum(x.fee_estimate), 0) into spent from public.filings x
     where x.workspace_id = p_ws and (x.autopilot_grant is not null or x.approved_via = 'text') and x.status <> 'canceled' and x.approved_at >= date_trunc('month', now());
    if spent + p_fee > g.cap_monthly then
      return jsonb_build_object('result', 'refused', 'why', format('text_cap: this month''s fees would be $%s, over your $%s Autopilot monthly cap, so approve it in the app', spent + p_fee, g.cap_monthly));
    end if;
  elsif p_fee > coalesce(p_cap, 0) then
    return jsonb_build_object('result', 'refused', 'why', format('text_cap: fees over $%s are approved in the app', coalesce(p_cap, 0)));
  end if;
  if public.needs_two_owners(p_ws, p_fee) then
    insert into public.owner_approvals (workspace_id, app_id, user_id) values (p_ws, left(p_app_id, 200), p_user) on conflict do nothing;
    select count(distinct a.user_id) into owners from public.owner_approvals a
      join public.workspace_members m on m.workspace_id = a.workspace_id and m.user_id = a.user_id and m.role = 'owner'
     where a.workspace_id = p_ws and a.app_id = left(p_app_id, 200) and a.at > now() - interval '30 days';
    if owners < 2 then
      insert into public.audit_log (workspace_id, actor, actor_id, action, object)
      values (p_ws, 'you', p_user, '{"en": "Approved by text, one of two owners", "zh": "通过短信批准（两位所有者之一）"}'::jsonb, p_title);
      return jsonb_build_object('result', 'waiting');
    end if;
  end if;
  if not public.can_file_app(p_ws, p_app_id) then
    return jsonb_build_object('result', 'refused', 'why', 'plan_required: this filing is paid for in the app first');
  end if;
  begin
    insert into public.filings (workspace_id, app_id, title, agency, portal_url, fee_estimate, payload, approved_by, approved_via)
    values (p_ws, left(p_app_id, 200), p_title, p_agency, p_portal_url, p_fee, p_payload, p_user, 'text')
    returning id into fid;
  exception when unique_violation then
    return jsonb_build_object('result', 'refused', 'why', 'already_filed: this application already has a filing in progress');
  end;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (p_ws, 'you', p_user, '{"en": "Approved by text", "zh": "通过短信批准"}'::jsonb, p_title,
    jsonb_build_object('en', format('From the verified phone, card %s, fee $%s', left(p_approval, 60), p_fee), 'zh', format('来自已验证的手机，批准项 %s，费用 $%s', left(p_approval, 60), p_fee)));
  return jsonb_build_object('result', 'filed', 'id', fid);
end $$;
revoke execute on function public.text_approve_file(uuid, uuid, text, text, jsonb, jsonb, text, numeric, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.text_approve_file(uuid, uuid, text, text, jsonb, jsonb, text, numeric, jsonb, numeric) to service_role;
