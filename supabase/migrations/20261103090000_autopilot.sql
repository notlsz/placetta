-- Autopilot (src/autopilot.ts, the Filing Authorization's "Autopilot" section in src/legal.ts): one standing authorization
-- an owner signs once, in place of approving each filing, within limits the database enforces.
--
-- 1. autopilot_grants: the signed authorization. Who signed (typed name, title), when, from which IP and browser, the
--    version of the Filing Authorization they read, the scope (stores, agencies, filing types), a per-filing and a
--    monthly agency-fee cap, and the expiry (12 months from signing). The signature they adopted (typed, or drawn as a
--    PNG) is kept in the vault, encrypted, never in the row. One live grant per workspace: signing again replaces it.
--    Revoking is one call and takes effect at once.
-- 2. autopilot_file: the only way a filing goes in without an owner's tap. Odelia's server (service role) asks; the
--    database checks the grant is live and the filing is inside it (store, agency, form, the fee within both caps, no
--    business rule wanting two owners, the monthly plan, no SSN or ITIN in the payload) and writes the filing as
--    approved by the owner who signed, marked with the grant. Every one is in the audit trail and the owner's Updates.
-- 3. A filing under a grant that has since been revoked or has expired can't be submitted: writing submit_clicked_at
--    (or marking it submitted) is refused, whoever tries (the dispatcher, the portal worker, the team). Revoking also
--    stops every Autopilot filing that hasn't left Placetta yet.
-- 4. A customer can't mark their own insert as Autopilot, and nobody can change the mark afterwards.
-- 5. The Filing Authorization's version moves to 2026-10-27 (the Autopilot section). COUNSEL REVIEW REQUIRED BEFORE THIS
--    SHIPS. Everyone is asked to review and accept the updated terms in the app, as with every version.
-- Safe to run twice.

create or replace function public.current_terms_version() returns text
language sql immutable set search_path = '' as $$ select '2026-10-27'::text $$;

alter table public.terms_acceptances drop constraint if exists terms_acceptances_doc_check;
alter table public.terms_acceptances add constraint terms_acceptances_doc_check check (doc in ('terms', 'privacy', 'authorization', 'autopilot'));

create table if not exists public.autopilot_grants (
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
  scope jsonb not null,
  cap_per_filing numeric(10, 2) not null check (cap_per_filing >= 0 and cap_per_filing <= 10000),
  cap_monthly numeric(10, 2) not null check (cap_monthly >= 0 and cap_monthly <= 50000),
  signature_kind text not null check (signature_kind in ('typed', 'drawn')),
  signature_secret_id uuid,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoked_why text,
  check (cap_monthly >= cap_per_filing),
  check (expires_at > signed_at)
);
comment on table public.autopilot_grants is 'Autopilot: an owner''s standing authorization for Placetta to prepare and submit the filings in its scope without approving each, within its fee caps, for 12 months or until revoked. The adopted signature is in the vault (signature_secret_id). Written only by autopilot_grant and autopilot_revoke.';
create index if not exists autopilot_grants_ws on public.autopilot_grants(workspace_id, signed_at desc);
create unique index if not exists autopilot_grants_one_live on public.autopilot_grants(workspace_id) where revoked_at is null;
alter table public.autopilot_grants enable row level security;
revoke all on public.autopilot_grants from public, anon, authenticated;
-- members see the authorization (the vault id stays with the server)
grant select (id, workspace_id, granted_by, signer_name, signer_title, signed_at, expires_at, ip, terms_version, scope, cap_per_filing, cap_monthly,
  signature_kind, revoked_at, revoked_by, revoked_why) on public.autopilot_grants to authenticated;
grant all on public.autopilot_grants to service_role;
drop policy if exists "members read their autopilot grants" on public.autopilot_grants;
create policy "members read their autopilot grants" on public.autopilot_grants for select to authenticated using (public.can_view(workspace_id));

alter table public.filings add column if not exists autopilot_grant uuid references public.autopilot_grants(id);
create index if not exists filings_autopilot on public.filings(autopilot_grant) where autopilot_grant is not null;

/** A grant that still lets Placetta file: not revoked, not expired. */
create or replace function public.autopilot_live(p_grant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.autopilot_grants g where g.id = p_grant and g.revoked_at is null and g.expires_at > now());
$$;
revoke execute on function public.autopilot_live(uuid) from public, anon, authenticated;
grant execute on function public.autopilot_live(uuid) to service_role;

/** The scope as clean lists of short strings: what the owner ticked, nothing else. */
create or replace function public.autopilot_list(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce((select jsonb_agg(distinct left(trim(v), 160)) from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) v
                    where trim(v) <> ''), '[]'::jsonb);
$$;
create or replace function public.autopilot_scope_clean(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('stores', public.autopilot_list(p -> 'stores'), 'agencies', public.autopilot_list(p -> 'agencies'), 'forms', public.autopilot_list(p -> 'forms'));
$$;
revoke execute on function public.autopilot_list(jsonb), public.autopilot_scope_clean(jsonb) from public, anon, authenticated;

/** What the workspace's own state shows about the grant (controls.autopilot): the app and Odelia read it there; the
    database checks the row itself before anything is filed. */
create or replace function public.autopilot_mirror(g public.autopilot_grants) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('id', g.id, 'by', g.signer_name, 'title', g.signer_title, 'at', g.signed_at, 'expires', g.expires_at,
    'ip', g.ip, 'version', g.terms_version, 'scope', g.scope, 'capFiling', g.cap_per_filing, 'capMonth', g.cap_monthly, 'sig', g.signature_kind,
    'revokedAt', g.revoked_at));
$$;
revoke execute on function public.autopilot_mirror(public.autopilot_grants) from public, anon, authenticated;

/** An owner signs the standing authorization (the app's Autopilot sheet): the typed name, the box ticked, the version
    of the Filing Authorization they were shown, the scope and the caps, and the signature they adopt (typed, or a
    drawn PNG as a data URL). Any live grant is replaced. Recorded with the time, IP and browser, in the audit trail and
    as an acceptance of the Autopilot terms. Returns the workspace's mirror of the new grant. */
create or replace function public.autopilot_grant(p_ws uuid, p_name text, p_title text, p_agree boolean, p_version text, p_scope jsonb,
  p_cap_filing numeric, p_cap_month numeric, p_sig_kind text, p_signature text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c record; g public.autopilot_grants; sc jsonb := public.autopilot_scope_clean(p_scope); secret uuid; nm text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.is_owner(p_ws) then raise exception 'Only an owner can turn on Autopilot.' using errcode = '42501'; end if;
  if p_agree is distinct from true then raise exception 'autopilot_agree: tick the box to sign the authorization.'; end if;
  if p_version is distinct from public.current_terms_version() then
    raise exception 'terms_version' using hint = public.current_terms_version(), detail = 'The Filing Authorization has been updated. Reload to read the current version.';
  end if;
  if char_length(nm) < 2 or char_length(nm) > 120 then raise exception 'autopilot_name: type your full name to sign.'; end if;
  if p_sig_kind not in ('typed', 'drawn') then raise exception 'autopilot_signature: a typed or drawn signature.'; end if;
  if p_sig_kind = 'drawn' and (p_signature is null or p_signature !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or char_length(p_signature) > 400000) then
    raise exception 'autopilot_signature: the drawn signature didn''t come through. Draw it again.';
  end if;
  if jsonb_array_length(sc -> 'stores') = 0 or jsonb_array_length(sc -> 'agencies') = 0 or jsonb_array_length(sc -> 'forms') = 0 then
    raise exception 'autopilot_scope: pick at least one store, agency and filing.';
  end if;
  if p_cap_filing is null or p_cap_month is null or p_cap_filing < 0 or p_cap_month < p_cap_filing or p_cap_filing > 10000 or p_cap_month > 50000 then
    raise exception 'autopilot_caps: the monthly cap must be at least the per-filing cap (at most $10,000 a filing and $50,000 a month).';
  end if;
  select * into c from public.request_client();
  -- the one live grant is replaced: the old one ends now
  update public.autopilot_grants set revoked_at = now(), revoked_by = auth.uid(), revoked_why = 'replaced'
   where workspace_id = p_ws and revoked_at is null;
  secret := vault.create_secret(case when p_sig_kind = 'drawn' then p_signature else nm end, 'autopilot_signature:' || p_ws::text || ':' || gen_random_uuid()::text);
  insert into public.autopilot_grants (workspace_id, granted_by, signer_name, signer_title, signed_at, expires_at, ip, user_agent, terms_version, scope,
    cap_per_filing, cap_monthly, signature_kind, signature_secret_id)
  values (p_ws, auth.uid(), nm, nullif(left(trim(coalesce(p_title, '')), 120), ''), now(), now() + interval '12 months', c.ip, c.user_agent, p_version, sc,
    round(p_cap_filing, 2), round(p_cap_month, 2), p_sig_kind, secret)
  returning * into g;
  insert into public.terms_acceptances (user_id, workspace_id, doc, version, ip, user_agent) values (auth.uid(), p_ws, 'autopilot', p_version, c.ip, c.user_agent);
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (p_ws, 'you', auth.uid(), jsonb_build_object('en', 'Signed the Autopilot authorization', 'zh', '签署了自动驾驶授权'),
    jsonb_build_object('en', nm || ', until ' || to_char(g.expires_at, 'YYYY-MM-DD'), 'zh', nm || '，有效至 ' || to_char(g.expires_at, 'YYYY-MM-DD')),
    jsonb_build_object('en', format('%s stores, %s agencies, %s filings; up to $%s a filing and $%s a month; from %s', jsonb_array_length(sc -> 'stores'), jsonb_array_length(sc -> 'agencies'), jsonb_array_length(sc -> 'forms'), g.cap_per_filing, g.cap_monthly, coalesce(c.ip, 'an unknown address')),
                       'zh', format('%s 家门店、%s 个机构、%s 项申报；每项最多 $%s，每月最多 $%s；IP %s', jsonb_array_length(sc -> 'stores'), jsonb_array_length(sc -> 'agencies'), jsonb_array_length(sc -> 'forms'), g.cap_per_filing, g.cap_monthly, coalesce(c.ip, '未知'))));
  -- the workspace's own copy, which Odelia reads, and the dial on Autopilot (the owner-controls trigger lets an owner write it)
  update public.workspaces set state = jsonb_set(coalesce(state, '{}'::jsonb), '{controls}',
      coalesce(state -> 'controls', '{}'::jsonb) || jsonb_build_object('autopilot', public.autopilot_mirror(g), 'autonomy', 'autopilot'))
   where id = p_ws;
  return public.autopilot_mirror(g);
end $$;
revoke execute on function public.autopilot_grant(uuid, text, text, boolean, text, jsonb, numeric, numeric, text, text) from public, anon;
grant execute on function public.autopilot_grant(uuid, text, text, boolean, text, jsonb, numeric, numeric, text, text) to authenticated;

/** One tap: Autopilot off. The grant ends now, every Autopilot filing that hasn't left Placetta is stopped, and the
    workspace goes back to asking each time. Any owner may revoke, not only the one who signed. */
create or replace function public.autopilot_revoke(p_ws uuid, p_why text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.autopilot_grants; n int := 0; f record; me uuid := auth.uid(); claims text; sub text;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.is_owner(p_ws) then raise exception 'Only an owner can turn off Autopilot.' using errcode = '42501'; end if;
  update public.autopilot_grants set revoked_at = now(), revoked_by = me, revoked_why = left(coalesce(p_why, 'revoked'), 200)
   where workspace_id = p_ws and revoked_at is null returning * into g;
  -- Stopping a filing is Placetta's step, not a customer's edit (filings_guard lets a customer cancel only a request
  -- nobody started): the stops below run as Placetta, then the caller's identity comes back for the audit lines.
  claims := current_setting('request.jwt.claims', true); sub := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
  for f in select x.id from public.filings x join public.autopilot_grants a on a.id = x.autopilot_grant
            where x.workspace_id = p_ws and a.workspace_id = p_ws and x.submit_clicked_at is null and x.status in ('requested', 'in_progress', 'needs_info') loop
    update public.filings set status = 'canceled', agent_state = case when agent_state is null then null else 'failed' end, handoff_url = null, provider_ref = null,
      agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'stopped',
        'en', 'Stopped before anything was sent: Autopilot was turned off. Ask Odelia to put it up for your approval.',
        'zh', '已在发送前停止：自动驾驶已关闭。如需提交，请让 Odelia 交给您批准。', 'ref', 'autopilot_revoked'))
     where id = f.id;
    n := n + 1;
  end loop;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true); perform set_config('request.jwt.claim.sub', coalesce(sub, ''), true);
  if g.id is not null then
    insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
    values (p_ws, 'you', me, jsonb_build_object('en', 'Turned off Autopilot', 'zh', '关闭了自动驾驶'), jsonb_build_object('en', g.signer_name, 'zh', g.signer_name),
      jsonb_build_object('en', format('%s filing%s not yet sent stopped', n, case when n = 1 then '' else 's' end), 'zh', format('停止了 %s 项尚未发送的申报', n)));
    update public.workspaces set state = jsonb_set(coalesce(state, '{}'::jsonb), '{controls}',
        coalesce(state -> 'controls', '{}'::jsonb) || jsonb_build_object('autopilot', public.autopilot_mirror(g))
          || case when state -> 'controls' ->> 'autonomy' = 'autopilot' then '{"autonomy":"usual"}'::jsonb else '{}'::jsonb end)
     where id = p_ws;
  end if;
  return jsonb_build_object('revoked', g.id is not null, 'stopped', n);
end $$;
revoke execute on function public.autopilot_revoke(uuid, text) from public, anon;
grant execute on function public.autopilot_revoke(uuid, text) to authenticated;

/** Odelia's server files one application under the workspace's live grant: every limit checked here, whatever the app or
    the model said. Returns the new filing's id. Service role only. */
create or replace function public.autopilot_file(p_ws uuid, p_grant uuid, p_app_id text, p_title jsonb, p_agency jsonb, p_portal_url text, p_fee numeric,
  p_payload jsonb, p_store text, p_form text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare g public.autopilot_grants; spent numeric; fid uuid; ag text := lower(trim(coalesce(p_agency ->> 'en', '')));
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
  if p_fee is null or p_fee < 0 then raise exception 'autopilot_cap: the fee isn''t known, so it can''t be held to the cap'; end if;
  if p_fee > g.cap_per_filing then raise exception 'autopilot_cap: the fee ($%) is over the $% per-filing cap', p_fee, g.cap_per_filing; end if;
  select coalesce(sum(x.fee_estimate), 0) into spent from public.filings x
   where x.workspace_id = p_ws and x.autopilot_grant is not null and x.status <> 'canceled' and x.approved_at >= date_trunc('month', now());
  if spent + p_fee > g.cap_monthly then raise exception 'autopilot_cap: this month''s Autopilot fees would be $%, over the $% monthly cap', spent + p_fee, g.cap_monthly; end if;
  if public.needs_two_owners(p_ws, p_fee) then raise exception 'second_owner: a business rule wants two owners to approve this filing'; end if;
  if not public.can_file(p_ws) then raise exception 'plan_required: filing for the business is part of the monthly plan'; end if;
  -- an SSN or ITIN never goes in, wherever it hides in the payload
  if p_payload::text ~ '\m\d{3}-\d{2}-\d{4}\M' or p_payload::text ~ '\m9\d{2}-?[78]\d-?\d{4}\M' then raise exception 'autopilot_secret: the filing holds what looks like an SSN or ITIN'; end if;
  insert into public.filings (workspace_id, app_id, title, agency, portal_url, fee_estimate, payload, approved_by, autopilot_grant)
  values (p_ws, left(p_app_id, 200), p_title, p_agency, p_portal_url, p_fee, p_payload, g.granted_by, g.id)
  returning id into fid;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (p_ws, 'agent', null, jsonb_build_object('en', 'Filed for you under Autopilot', 'zh', '在自动驾驶下为您提交'), p_title,
    jsonb_build_object('en', format('Within %s''s authorization of %s; fee $%s of the $%s cap', g.signer_name, to_char(g.signed_at, 'YYYY-MM-DD'), p_fee, g.cap_per_filing),
                       'zh', format('在 %s 于 %s 签署的授权范围内；费用 $%s，单项上限 $%s', g.signer_name, to_char(g.signed_at, 'YYYY-MM-DD'), p_fee, g.cap_per_filing)));
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

/** The adopted signature, for Odelia's server to place on a form the authorization lets it sign. Service role only. */
create or replace function public.autopilot_signature(p_grant uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from public.autopilot_grants g join vault.decrypted_secrets s on s.id = g.signature_secret_id
   where g.id = p_grant and g.revoked_at is null and g.expires_at > now();
$$;
revoke execute on function public.autopilot_signature(uuid) from public, anon, authenticated;
grant execute on function public.autopilot_signature(uuid) to service_role;

/** The marks stay honest: a customer's own insert is never an Autopilot filing, nobody moves a filing onto or off a
    grant, and nothing under a grant that was revoked or has expired is submitted. */
create or replace function public.filings_autopilot_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.autopilot_grant := null; end if;
    return new;
  end if;
  if new.autopilot_grant is distinct from old.autopilot_grant then raise exception 'The Autopilot mark on a filing can''t be changed.'; end if;
  if new.autopilot_grant is not null and not public.autopilot_live(new.autopilot_grant)
     and ((old.submit_clicked_at is null and new.submit_clicked_at is not null) or (old.status <> 'submitted' and new.status = 'submitted')) then
    raise exception 'filing_stopped: Autopilot was turned off or expired before this was sent';
  end if;
  return new;
end $$;
revoke execute on function public.filings_autopilot_guard() from public, anon, authenticated;
drop trigger if exists filings_autopilot_guard on public.filings;
create trigger filings_autopilot_guard before insert or update on public.filings for each row execute function public.filings_autopilot_guard();
