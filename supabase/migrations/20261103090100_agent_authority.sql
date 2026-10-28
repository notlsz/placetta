-- "Placetta as your agent" (src/agentPacket.ts, src/forms/agentAuthority.ts, the Filing Authorization's agent section in
-- src/legal.ts): the packet an owner signs once, in one session, so Placetta (its named agent of record, a person, never
-- Odelia) may act as the business's agent where the agency lets an agent, and the zero-touch fee path behind a flag.
--
-- 1. agent_authorizations: the signed packet. Who signed, when, from which IP and browser, the Filing Authorization
--    version, the agencies and filings it covers, each signed item (Placetta's authorization, each agency's own form,
--    each owner signature made in the session) with its stored copy, Placetta's agent of record at signing, the
--    accounts-payable email for agency bills, and the expiry (12 months). One live packet per workspace.
-- 2. agent_acts: every act as agent, append-only (who acted, for which agency and filing, under which packet). Nobody
--    edits or deletes a row, the service role included.
-- 3. A filing marked as sent by Placetta as agent (filings.agent_auth) goes in only when agent_act_ok passes: the packet
--    is this workspace's, live, and covers the agency and the filing, and an agency form with a time limit (San José's
--    Section C: 12 months) is still inside it. It can't be submitted once the packet is revoked or expired.
-- 4. Revoking stops everything: agent_revoke, and autopilot_revoke (replaced here) now ends the agent packet too and stops
--    every filing under either that hasn't left Placetta.
-- 5. Fees: app_settings.issuing_on (off until Stripe approves Issuing and the founder turns it on). With it on, an
--    Autopilot filing whose fee the agency states later may go in: the single-use card can't spend past the per-filing
--    cap, and the cap is reserved toward the month. autopilot_spend_ok checks a card purchase against the grant.
-- 6. The Filing Authorization's version moves to 2026-10-28 (the agent section). COUNSEL REVIEW REQUIRED BEFORE THIS
--    SHIPS. Everyone is asked to accept the updated terms, as with every version.
-- Safe to run twice.

create or replace function public.current_terms_version() returns text
language sql immutable set search_path = '' as $$ select '2026-10-28'::text $$;

alter table public.terms_acceptances drop constraint if exists terms_acceptances_doc_check;
alter table public.terms_acceptances add constraint terms_acceptances_doc_check check (doc in ('terms', 'privacy', 'authorization', 'autopilot', 'agent'));

/* Placetta's agent of record (SETUP.md "Agent of record"): the named person who signs as agent and is the IRS designee.
   Set by the founder; until it is, no packet that names an agent can be signed. issuing_on: single-use cards. */
alter table public.app_settings add column if not exists agent_of_record jsonb
  check (agent_of_record is null or (char_length(coalesce(agent_of_record ->> 'name', '')) between 2 and 120 and char_length(coalesce(agent_of_record ->> 'email', '')) between 5 and 200));
alter table public.app_settings add column if not exists issuing_on boolean not null default false;

create table if not exists public.agent_authorizations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  signer_name text not null check (char_length(signer_name) between 2 and 120),
  signer_title text check (signer_title is null or char_length(signer_title) <= 120),
  signed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip text,
  user_agent text,
  terms_version text not null,
  agent_name text not null,
  agencies jsonb not null,
  forms jsonb not null,
  items jsonb not null,
  ap_email text check (ap_email is null or ap_email ~* '^[^\s@<>()",;:]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$'),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoked_why text,
  check (expires_at > signed_at)
);
comment on table public.agent_authorizations is 'Placetta as your agent: the packet an owner signed once (Placetta''s authorization, each agency''s own form, the owner''s signatures made in the same session), what it covers and until when. Written only by agent_authorize and agent_revoke.';
create index if not exists agent_authorizations_ws on public.agent_authorizations(workspace_id, signed_at desc);
create unique index if not exists agent_authorizations_one_live on public.agent_authorizations(workspace_id) where revoked_at is null;
alter table public.agent_authorizations enable row level security;
revoke all on public.agent_authorizations from public, anon, authenticated;
grant select on public.agent_authorizations to authenticated;
grant all on public.agent_authorizations to service_role;
drop policy if exists "members read their agent authorizations" on public.agent_authorizations;
create policy "members read their agent authorizations" on public.agent_authorizations for select to authenticated using (public.can_view(workspace_id));

create table if not exists public.agent_acts (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  authorization_id uuid not null references public.agent_authorizations(id),
  filing_id uuid references public.filings(id) on delete set null,
  form text not null,
  agency text not null,
  act text not null check (act in ('queued', 'submitted', 'answered', 'refused')),
  actor text not null check (actor in ('team', 'odelia', 'database')),
  actor_name text,
  detail text,
  at timestamptz not null default now()
);
comment on table public.agent_acts is 'Every act Placetta took as a business''s agent, append-only: who, what, for which agency and filing, under which packet.';
create index if not exists agent_acts_ws on public.agent_acts(workspace_id, at desc);
alter table public.agent_acts enable row level security;
revoke all on public.agent_acts from public, anon, authenticated, service_role;
grant select on public.agent_acts to authenticated;
grant select, insert on public.agent_acts to service_role;
grant usage on sequence public.agent_acts_id_seq to service_role;
drop policy if exists "members read their agent acts" on public.agent_acts;
create policy "members read their agent acts" on public.agent_acts for select to authenticated using (public.can_view(workspace_id));
create or replace function public.agent_acts_append_only() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception 'agent_acts is append-only'; end $$;
revoke execute on function public.agent_acts_append_only() from public, anon, authenticated;
drop trigger if exists agent_acts_append_only on public.agent_acts;
create trigger agent_acts_append_only before update or delete on public.agent_acts for each row execute function public.agent_acts_append_only();

alter table public.filings add column if not exists agent_auth uuid references public.agent_authorizations(id);
create index if not exists filings_agent_auth on public.filings(agent_auth) where agent_auth is not null;

alter table public.spend_policies add column if not exists ap_email text;
alter table public.purchases add column if not exists autopilot_grant uuid references public.autopilot_grants(id);

-- a team task to send a filing as the business's agent: added to whatever kinds the constraint already allows (other
-- migrations add their own), never replacing them
do $$
declare d text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c where c.conname = 'team_tasks_kind_check' and c.conrelid = 'public.team_tasks'::regclass;
  if d is not null and d not like '%send_as_agent%' and d like '%ARRAY[%' then
    execute 'alter table public.team_tasks drop constraint team_tasks_kind_check';
    execute 'alter table public.team_tasks add constraint team_tasks_kind_check ' || replace(d, 'ARRAY[', 'ARRAY[''send_as_agent''::text, ');
  end if;
end $$;

/** The workspace's copy of the packet (controls.agent): the app and Odelia read it there; the database checks the row. */
create or replace function public.agent_mirror(a public.agent_authorizations) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('id', a.id, 'by', a.signer_name, 'at', a.signed_at, 'expires', a.expires_at, 'version', a.terms_version,
    'agencies', a.agencies, 'forms', a.forms, 'items', a.items, 'agent', a.agent_name, 'apEmail', a.ap_email, 'revokedAt', a.revoked_at));
$$;
revoke execute on function public.agent_mirror(public.agent_authorizations) from public, anon, authenticated;

/** Is this act as agent covered, now? Raises with the reason when not (agent_scope, agent_revoked, agent_expired,
    agent_item_expired); true when it is. */
create or replace function public.agent_act_ok(p_ws uuid, p_auth uuid, p_form text, p_agency text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare a public.agent_authorizations; ag text := lower(trim(coalesce(p_agency, ''))); it jsonb;
begin
  select * into a from public.agent_authorizations where id = p_auth;
  if a.id is null or a.workspace_id <> p_ws then raise exception 'agent_scope: no such agent authorization for this workspace'; end if;
  if a.revoked_at is not null then raise exception 'agent_revoked: the owner revoked Placetta as their agent'; end if;
  if a.expires_at <= now() then raise exception 'agent_expired: the agent authorization expired on %', to_char(a.expires_at, 'YYYY-MM-DD'); end if;
  if coalesce(p_form, '') = '' or not (a.forms ? p_form) then raise exception 'agent_scope: this filing isn''t in the agent authorization'; end if;
  if ag = '' or not exists (select 1 from jsonb_array_elements_text(a.agencies) x where lower(trim(x)) = ag) then
    raise exception 'agent_scope: this agency isn''t in the agent authorization';
  end if;
  for it in select * from jsonb_array_elements(a.items) loop
    if it ->> 'form' = p_form and it ? 'expires' and (it ->> 'expires')::timestamptz <= now() then
      raise exception 'agent_item_expired: % is past the time the agency honors it', coalesce(it ->> 'id', 'an agency form');
    end if;
  end loop;
  return true;
end $$;
revoke execute on function public.agent_act_ok(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.agent_act_ok(uuid, uuid, text, text) to service_role;

/** An owner signs the packet in the one session (the app's "Sign once" sheet): their typed name, the box, the version,
    what it covers, each signed item (an e-signed page or a photo of a hand-signed one, stored in the workspace's own
    folder), and where agency bills go. Any live packet is replaced. Returns the workspace's mirror. */
create or replace function public.agent_authorize(p_ws uuid, p_name text, p_title text, p_agree boolean, p_version text, p_agencies jsonb, p_forms jsonb,
  p_items jsonb, p_ap_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c record; a public.agent_authorizations; nm text := trim(coalesce(p_name, '')); ar jsonb; items jsonb := '[]'::jsonb; it jsonb; names_agent boolean := false;
  ags jsonb := public.autopilot_list(p_agencies); fs jsonb := public.autopilot_list(p_forms); doc text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.is_owner(p_ws) then raise exception 'Only an owner can make Placetta the business''s agent.' using errcode = '42501'; end if;
  if p_agree is distinct from true then raise exception 'agent_agree: tick the box to sign.'; end if;
  if p_version is distinct from public.current_terms_version() then
    raise exception 'terms_version' using hint = public.current_terms_version(), detail = 'The Filing Authorization has been updated. Reload to read the current version.';
  end if;
  if char_length(nm) < 2 or char_length(nm) > 120 then raise exception 'agent_name: type your full name to sign.'; end if;
  if jsonb_array_length(ags) = 0 or jsonb_array_length(fs) = 0 then raise exception 'agent_scope: the packet covers no agency or filing.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then raise exception 'agent_items: nothing was signed.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(it ->> 'sig', '') not in ('esign', 'hand') or char_length(coalesce(it ->> 'id', '')) not between 2 and 80 then raise exception 'agent_items: an item isn''t a signed page.'; end if;
    doc := it ->> 'doc';
    -- a hand-signed page is its photo or scan; every stored copy is in this workspace's own folder, with no way out of it
    if it ->> 'sig' = 'hand' and doc is null then raise exception 'agent_items: add the photo of the page you signed by hand (%).', it ->> 'id'; end if;
    if doc is not null and (left(doc, char_length(p_ws::text) + 1) <> p_ws::text || '/' or doc ~ '(^|/)\.\.?(/|$)') then raise exception 'agent_items: that page isn''t in this workspace.'; end if;
    if (it ->> 'names_agent')::boolean is true then names_agent := true; end if;
    items := items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', left(it ->> 'id', 80), 'form', left(it ->> 'form', 80), 'agency', left(it ->> 'agency', 160),
      'sig', it ->> 'sig', 'at', now(), 'doc', doc,
      'expires', case when (it ->> 'months') ~ '^\d{1,2}$' then (now() + make_interval(months => (it ->> 'months')::int)) end)));
  end loop;
  select agent_of_record into ar from public.app_settings where id;
  if names_agent and (ar is null or coalesce(ar ->> 'name', '') = '') then raise exception 'agent_of_record: Placetta hasn''t named its agent of record yet.'; end if;
  select * into c from public.request_client();
  update public.agent_authorizations set revoked_at = now(), revoked_by = auth.uid(), revoked_why = 'replaced' where workspace_id = p_ws and revoked_at is null;
  insert into public.agent_authorizations (workspace_id, granted_by, signer_name, signer_title, expires_at, ip, user_agent, terms_version, agent_name, agencies, forms, items, ap_email)
  values (p_ws, auth.uid(), nm, nullif(left(trim(coalesce(p_title, '')), 120), ''), now() + interval '12 months', c.ip, c.user_agent, p_version,
    coalesce(ar ->> 'name', 'Placetta'), ags, fs, items, nullif(lower(trim(coalesce(p_ap_email, ''))), ''))
  returning * into a;
  if a.ap_email is not null then
    insert into public.spend_policies (workspace_id, policy, ap_email, updated_by) values (p_ws, '{}'::jsonb, a.ap_email, auth.uid())
    on conflict (workspace_id) do update set ap_email = excluded.ap_email, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into public.terms_acceptances (user_id, workspace_id, doc, version, ip, user_agent) values (auth.uid(), p_ws, 'agent', p_version, c.ip, c.user_agent);
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (p_ws, 'you', auth.uid(), jsonb_build_object('en', 'Signed Placetta as your agent', 'zh', '签署了“快哉作为您的代理人”'),
    jsonb_build_object('en', nm || ', until ' || to_char(a.expires_at, 'YYYY-MM-DD'), 'zh', nm || '，有效至 ' || to_char(a.expires_at, 'YYYY-MM-DD')),
    jsonb_build_object('en', format('%s signed in one session; %s agencies, %s filings; agent of record %s; from %s', jsonb_array_length(items), jsonb_array_length(ags), jsonb_array_length(fs), a.agent_name, coalesce(c.ip, 'an unknown address')),
                       'zh', format('一次签署 %s 份；%s 个机构、%s 项申报；代理人 %s；IP %s', jsonb_array_length(items), jsonb_array_length(ags), jsonb_array_length(fs), a.agent_name, coalesce(c.ip, '未知'))));
  update public.workspaces set state = jsonb_set(coalesce(state, '{}'::jsonb), '{controls}', coalesce(state -> 'controls', '{}'::jsonb) || jsonb_build_object('agent', public.agent_mirror(a)))
   where id = p_ws;
  return public.agent_mirror(a);
end $$;
revoke execute on function public.agent_authorize(uuid, text, text, boolean, text, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.agent_authorize(uuid, text, text, boolean, text, jsonb, jsonb, jsonb, text) to authenticated;

/** Stops, as Placetta, every filing in the workspace marked for Autopilot or for Placetta as agent that hasn't left. */
create or replace function public.agent_stop_unsent(p_ws uuid, p_why text, p_ref text default 'agent_revoked') returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; f record; claims text := current_setting('request.jwt.claims', true); sub text := current_setting('request.jwt.claim.sub', true);
begin
  perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
  for f in select x.id from public.filings x
            where x.workspace_id = p_ws and (x.autopilot_grant is not null or x.agent_auth is not null) and x.submit_clicked_at is null and x.status in ('requested', 'in_progress', 'needs_info') loop
    update public.filings set status = 'canceled', agent_state = case when agent_state is null then null else 'failed' end, handoff_url = null, provider_ref = null,
      agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'stopped',
        'en', 'Stopped before anything was sent: ' || p_why || '. Ask Odelia to put it up for your approval.',
        'zh', '已在发送前停止：授权已撤销。如需提交，请让 Odelia 交给您批准。', 'ref', p_ref))
     where id = f.id;
    n := n + 1;
  end loop;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true); perform set_config('request.jwt.claim.sub', coalesce(sub, ''), true);
  return n;
end $$;
revoke execute on function public.agent_stop_unsent(uuid, text, text) from public, anon, authenticated;

/** One tap: Placetta is no longer the business's agent. Every act as agent stops at once. */
create or replace function public.agent_revoke(p_ws uuid, p_why text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.agent_authorizations; n int := 0; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.is_owner(p_ws) then raise exception 'Only an owner can revoke it.' using errcode = '42501'; end if;
  update public.agent_authorizations set revoked_at = now(), revoked_by = me, revoked_why = left(coalesce(p_why, 'revoked'), 200)
   where workspace_id = p_ws and revoked_at is null returning * into a;
  if a.id is not null then
    n := public.agent_stop_unsent(p_ws, 'Placetta is no longer your agent');
    insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
    values (p_ws, 'you', me, jsonb_build_object('en', 'Revoked Placetta as your agent', 'zh', '撤销了快哉的代理权限'), jsonb_build_object('en', a.signer_name, 'zh', a.signer_name),
      jsonb_build_object('en', format('%s filing%s not yet sent stopped', n, case when n = 1 then '' else 's' end), 'zh', format('停止了 %s 项尚未发送的申报', n)));
    update public.workspaces set state = jsonb_set(coalesce(state, '{}'::jsonb), '{controls}', coalesce(state -> 'controls', '{}'::jsonb) || jsonb_build_object('agent', public.agent_mirror(a)))
     where id = p_ws;
  end if;
  return jsonb_build_object('revoked', a.id is not null, 'stopped', n);
end $$;
revoke execute on function public.agent_revoke(uuid, text) from public, anon;
grant execute on function public.agent_revoke(uuid, text) to authenticated;

/** Autopilot off now ends the agent packet too: the owner's revocation stops everything. (Replaces 20261103090000's.) */
create or replace function public.autopilot_revoke(p_ws uuid, p_why text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.autopilot_grants; a public.agent_authorizations; n int := 0; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.is_owner(p_ws) then raise exception 'Only an owner can turn off Autopilot.' using errcode = '42501'; end if;
  update public.autopilot_grants set revoked_at = now(), revoked_by = me, revoked_why = left(coalesce(p_why, 'revoked'), 200)
   where workspace_id = p_ws and revoked_at is null returning * into g;
  update public.agent_authorizations set revoked_at = now(), revoked_by = me, revoked_why = 'Autopilot turned off'
   where workspace_id = p_ws and revoked_at is null returning * into a;
  n := public.agent_stop_unsent(p_ws, 'Autopilot was turned off', 'autopilot_revoked');
  if g.id is not null then
    insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
    values (p_ws, 'you', me, jsonb_build_object('en', 'Turned off Autopilot', 'zh', '关闭了自动驾驶'), jsonb_build_object('en', g.signer_name, 'zh', g.signer_name),
      jsonb_build_object('en', format('%s filing%s not yet sent stopped%s', n, case when n = 1 then '' else 's' end, case when a.id is not null then '; Placetta is no longer your agent' else '' end),
                         'zh', format('停止了 %s 项尚未发送的申报%s', n, case when a.id is not null then '；快哉不再是您的代理人' else '' end)));
    update public.workspaces set state = jsonb_set(coalesce(state, '{}'::jsonb), '{controls}',
        coalesce(state -> 'controls', '{}'::jsonb) || jsonb_build_object('autopilot', public.autopilot_mirror(g))
          || case when a.id is not null then jsonb_build_object('agent', public.agent_mirror(a)) else '{}'::jsonb end
          || case when state -> 'controls' ->> 'autonomy' = 'autopilot' then '{"autonomy":"usual"}'::jsonb else '{}'::jsonb end)
     where id = p_ws;
  end if;
  return jsonb_build_object('revoked', g.id is not null, 'stopped', n);
end $$;
revoke execute on function public.autopilot_revoke(uuid, text) from public, anon;
grant execute on function public.autopilot_revoke(uuid, text) to authenticated;

/** The agent mark stays honest, as the Autopilot mark does: a customer's own insert is never marked; a marked insert
    passes agent_act_ok and is logged; nobody moves a filing onto or off a packet; nothing under a revoked or expired
    packet is submitted, and each submission as agent is logged. */
create or replace function public.filings_agent_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.agent_auth := null; return new; end if;
    if new.agent_auth is not null then
      perform public.agent_act_ok(new.workspace_id, new.agent_auth, new.payload ->> 'official', new.agency ->> 'en');
      insert into public.agent_acts (workspace_id, authorization_id, filing_id, form, agency, act, actor, actor_name, detail)
      values (new.workspace_id, new.agent_auth, null, coalesce(new.payload ->> 'official', ''), coalesce(new.agency ->> 'en', ''), 'queued', 'odelia', null, left(new.title ->> 'en', 300));
    end if;
    return new;
  end if;
  if new.agent_auth is distinct from old.agent_auth then raise exception 'The agent mark on a filing can''t be changed.'; end if;
  if new.agent_auth is not null and ((old.submit_clicked_at is null and new.submit_clicked_at is not null) or (old.status <> 'submitted' and new.status = 'submitted')) then
    begin ok := public.agent_act_ok(new.workspace_id, new.agent_auth, new.payload ->> 'official', new.agency ->> 'en');
    exception when others then raise exception 'filing_stopped: %', sqlerrm; end;
    insert into public.agent_acts (workspace_id, authorization_id, filing_id, form, agency, act, actor, actor_name)
    values (new.workspace_id, new.agent_auth, new.id, coalesce(new.payload ->> 'official', ''), coalesce(new.agency ->> 'en', ''), 'submitted', 'team', new.payload -> 'agent' ->> 'by');
  end if;
  return new;
end $$;
revoke execute on function public.filings_agent_guard() from public, anon, authenticated;
drop trigger if exists filings_agent_guard on public.filings;
create trigger filings_agent_guard before insert or update on public.filings for each row execute function public.filings_agent_guard();

/** Odelia's server files under Autopilot (replaces 20261103090000's): the same checks, and with single-use cards on, a fee
    the agency states later may go in, its per-filing cap reserved toward the month (the card can't spend past it). */
create or replace function public.autopilot_file(p_ws uuid, p_grant uuid, p_app_id text, p_title jsonb, p_agency jsonb, p_portal_url text, p_fee numeric,
  p_payload jsonb, p_store text, p_form text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare g public.autopilot_grants; spent numeric; fid uuid; ag text := lower(trim(coalesce(p_agency ->> 'en', ''))); cards boolean; fee numeric;
begin
  select * into g from public.autopilot_grants where id = p_grant for share;
  if g.id is null or g.workspace_id <> p_ws then raise exception 'autopilot_scope: no such authorization for this workspace'; end if;
  if g.revoked_at is not null then raise exception 'autopilot_revoked: Autopilot was turned off'; end if;
  if g.expires_at <= now() then raise exception 'autopilot_expired: the Autopilot authorization expired on %', to_char(g.expires_at, 'YYYY-MM-DD'); end if;
  if coalesce(p_form, '') = '' or not (g.scope -> 'forms') ? p_form then raise exception 'autopilot_scope: this filing type isn''t in the authorization'; end if;
  if coalesce(p_store, '') = '' or not (g.scope -> 'stores') ? p_store then raise exception 'autopilot_scope: this store isn''t in the authorization'; end if;
  if ag = '' or not exists (select 1 from jsonb_array_elements_text(g.scope -> 'agencies') a where lower(trim(a)) = ag) then
    raise exception 'autopilot_scope: this agency isn''t in the authorization';
  end if;
  select coalesce(issuing_on, false) into cards from public.app_settings where id;
  if (p_fee is null or p_fee < 0) and not coalesce(cards, false) then raise exception 'autopilot_cap: the fee isn''t known, so it can''t be held to the cap'; end if;
  fee := case when p_fee is null or p_fee < 0 then g.cap_per_filing else p_fee end;
  if fee > g.cap_per_filing then raise exception 'autopilot_cap: the fee ($%) is over the $% per-filing cap', fee, g.cap_per_filing; end if;
  select coalesce(sum(x.fee_estimate), 0) into spent from public.filings x
   where x.workspace_id = p_ws and x.autopilot_grant is not null and x.status <> 'canceled' and x.approved_at >= date_trunc('month', now());
  if spent + fee > g.cap_monthly then raise exception 'autopilot_cap: this month''s Autopilot fees would be $%, over the $% monthly cap', spent + fee, g.cap_monthly; end if;
  if public.needs_two_owners(p_ws, fee) then raise exception 'second_owner: a business rule wants two owners to approve this filing'; end if;
  if not public.can_file(p_ws) then raise exception 'plan_required: filing for the business is part of the monthly plan'; end if;
  if p_payload::text ~ '\m\d{3}-\d{2}-\d{4}\M' or p_payload::text ~ '\m9\d{2}-?[78]\d-?\d{4}\M' then raise exception 'autopilot_secret: the filing holds what looks like an SSN or ITIN'; end if;
  insert into public.filings (workspace_id, app_id, title, agency, portal_url, fee_estimate, payload, approved_by, autopilot_grant, agent_auth)
  values (p_ws, left(p_app_id, 200), p_title, p_agency, p_portal_url, fee, case when p_fee is null or p_fee < 0 then p_payload || '{"fee_held_by_card": true}'::jsonb else p_payload end, g.granted_by, g.id,
    case when p_payload -> 'agent' ->> 'auth' ~ '^[0-9a-f-]{36}$' then (p_payload -> 'agent' ->> 'auth')::uuid end)
  returning id into fid;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (p_ws, 'agent', null, jsonb_build_object('en', 'Filed for you under Autopilot', 'zh', '在自动驾驶下为您提交'), p_title,
    jsonb_build_object('en', format('Within %s''s authorization of %s; fee %s of the $%s cap', g.signer_name, to_char(g.signed_at, 'YYYY-MM-DD'), coalesce('$' || p_fee::text, 'to be stated by the agency, held by a single-use card'), g.cap_per_filing),
                       'zh', format('在 %s 于 %s 签署的授权范围内；费用 %s，单项上限 $%s', g.signer_name, to_char(g.signed_at, 'YYYY-MM-DD'), coalesce('$' || p_fee::text, '待机构确定，由一次性卡限额'), g.cap_per_filing)));
  insert into public.updates (workspace_id, kind, title, body, app_id, dedupe)
  values (p_ws, 'filing', jsonb_build_object('en', 'Filed for you: ' || coalesce(p_title ->> 'en', 'a filing'), 'zh', '已为您提交：' || coalesce(p_title ->> 'zh', '一项申报')),
    jsonb_build_object('en', 'Odelia is sending it under your Autopilot authorization. Until it leaves Placetta you can undo it from the filing. After that, withdrawing it is up to the agency, and Odelia can draft the request.',
                       'zh', 'Odelia 正依据您的自动驾驶授权提交。在发出快哉之前，您可以在该申报中撤销；发出之后能否撤回由机构决定，Odelia 可以帮您起草撤回申请。'),
    left(p_app_id, 200), 'autopilot:' || fid::text)
  on conflict (workspace_id, dedupe) do nothing;
  return fid;
end $$;
revoke execute on function public.autopilot_file(uuid, uuid, text, jsonb, jsonb, text, numeric, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.autopilot_file(uuid, uuid, text, jsonb, jsonb, text, numeric, jsonb, text, text) to service_role;

/** May a single-use card pay this agency fee under the workspace's live Autopilot grant? Cards on, the grant live and
    this workspace's, the amount within the per-filing cap and, with this month's card payments under the grant, the
    monthly cap. Raises with the reason; true when it may. Service role only (the spend function). */
create or replace function public.autopilot_spend_ok(p_ws uuid, p_grant uuid, p_cents int) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare g public.autopilot_grants; spent bigint; cards boolean;
begin
  select coalesce(issuing_on, false) into cards from public.app_settings where id;
  if not coalesce(cards, false) then raise exception 'cards_off: single-use cards aren''t switched on'; end if;
  select * into g from public.autopilot_grants where id = p_grant;
  if g.id is null or g.workspace_id <> p_ws then raise exception 'autopilot_scope: no such authorization for this workspace'; end if;
  if g.revoked_at is not null then raise exception 'autopilot_revoked: Autopilot was turned off'; end if;
  if g.expires_at <= now() then raise exception 'autopilot_expired: the Autopilot authorization expired'; end if;
  if p_cents is null or p_cents <= 0 then raise exception 'autopilot_cap: no amount'; end if;
  if p_cents > round(g.cap_per_filing * 100) then raise exception 'autopilot_cap: $% is over the $% per-filing cap', p_cents / 100.0, g.cap_per_filing; end if;
  select coalesce(sum(amount_cents), 0) into spent from public.purchases
   where workspace_id = p_ws and autopilot_grant = g.id and status in ('approved', 'paid') and created_at >= date_trunc('month', now());
  if spent + p_cents > round(g.cap_monthly * 100) then raise exception 'autopilot_cap: this month''s card payments would pass the $% monthly cap', g.cap_monthly; end if;
  return true;
end $$;
revoke execute on function public.autopilot_spend_ok(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.autopilot_spend_ok(uuid, uuid, int) to service_role;
