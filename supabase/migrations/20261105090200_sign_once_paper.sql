-- Sign once, and paper without the owner (supabase/functions/file/signing.ts, src/SignOnce.tsx, src/esignDisclosure.ts).
--
-- 1. signer_signatures: the signature a signer adopted once (typed, or drawn on the phone), kept in the vault, one live
--    per signer per workspace, with its consent record in the ESIGN Act / UETA pattern: the disclosure version they were
--    shown, their consent to electronic records, their adoption of the signature with intent to sign, their consent to
--    Placetta applying it to the agency forms they approve (or that their Autopilot authorization covers), whether they
--    opened the disclosure electronically, when, from which IP and browser, and how to withdraw. Written only by
--    signature_adopt and signature_withdraw. The image itself never leaves the vault except to the signer (signature_mine)
--    and to Placetta's server (signature_for), never to another member.
-- 2. signature_stamps: every place the adopted signature went on, append-only (which signature, which filing and form,
--    a hash of the stamped PDF, who asked: the owner's tap on the approval card or Autopilot). UETA section 9: the record
--    of the procedure that shows the signature is the signer's act.
-- 3. paper_pieces: every letter (Lob) and fax (Telnyx) Placetta sends, to the agency or as a signing kit to the owner, so
--    the providers' webhooks put each tracking event and fax status on the right filing's timeline.
-- Safe to run twice.

/* The disclosure the signer reads before adopting a signature (src/esignDisclosure.ts DISCLOSURE_VERSION). */
create or replace function public.current_esign_disclosure() returns text
language sql immutable set search_path = '' as $$ select '2026-11-05'::text $$;

create table if not exists public.signer_signatures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  signer_name text not null check (char_length(signer_name) between 2 and 120),
  signer_title text check (signer_title is null or char_length(signer_title) <= 120),
  kind text not null check (kind in ('typed', 'drawn')),
  secret_id uuid not null,
  image_sha256 text not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  disclosure_version text not null,
  consent_records boolean not null check (consent_records),
  consent_sign boolean not null check (consent_sign),
  consent_apply boolean not null check (consent_apply),
  demonstrated boolean not null default false,
  ip text,
  user_agent text,
  adopted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_why text
);
comment on table public.signer_signatures is 'Sign once: a signer''s adopted signature (in the vault) and its ESIGN/UETA consent record. Placetta applies it only where the agency accepts an electronic or reproduced signature, on forms the signer approves or their Autopilot authorization covers. Written only by signature_adopt and signature_withdraw.';
create unique index if not exists signer_signatures_one_live on public.signer_signatures(workspace_id, user_id) where withdrawn_at is null;
create index if not exists signer_signatures_ws on public.signer_signatures(workspace_id, adopted_at desc);
alter table public.signer_signatures enable row level security;
revoke all on public.signer_signatures from public, anon, authenticated;
-- members see that a signature exists and its consent record, never the vault id
grant select (id, workspace_id, user_id, signer_name, signer_title, kind, image_sha256, disclosure_version, consent_records, consent_sign, consent_apply,
  demonstrated, ip, user_agent, adopted_at, withdrawn_at, withdrawn_why) on public.signer_signatures to authenticated;
grant all on public.signer_signatures to service_role;
drop policy if exists "members read their signers' consent records" on public.signer_signatures;
create policy "members read their signers' consent records" on public.signer_signatures for select to authenticated using (public.can_view(workspace_id));

create table if not exists public.signature_stamps (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  signature_id uuid not null references public.signer_signatures(id),
  filing_id uuid references public.filings(id) on delete set null,
  form text not null check (char_length(form) between 1 and 80),
  pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  asked_by text not null check (asked_by in ('owner_tap', 'autopilot')),
  at timestamptz not null default now()
);
comment on table public.signature_stamps is 'Every agency PDF an adopted signature was placed on, append-only: which signature, filing and form, the stamped PDF''s hash, and whose act asked for it.';
create index if not exists signature_stamps_ws on public.signature_stamps(workspace_id, at desc);
alter table public.signature_stamps enable row level security;
revoke all on public.signature_stamps from public, anon, authenticated, service_role;
grant select on public.signature_stamps to authenticated;
grant select, insert on public.signature_stamps to service_role;
grant usage on sequence public.signature_stamps_id_seq to service_role;
drop policy if exists "members read their signature stamps" on public.signature_stamps;
create policy "members read their signature stamps" on public.signature_stamps for select to authenticated using (public.can_view(workspace_id));
create or replace function public.signature_stamps_append_only() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception 'signature_stamps is append-only'; end $$;
revoke execute on function public.signature_stamps_append_only() from public, anon, authenticated;
drop trigger if exists signature_stamps_append_only on public.signature_stamps;
create trigger signature_stamps_append_only before update or delete on public.signature_stamps for each row execute function public.signature_stamps_append_only();

create table if not exists public.paper_pieces (
  id text primary key check (char_length(id) between 3 and 120),
  provider text not null check (provider in ('lob', 'telnyx')),
  purpose text not null check (purpose in ('filing', 'sign_kit')),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  filing_id uuid not null references public.filings(id) on delete cascade,
  status text,
  last_event_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.paper_pieces is 'Letters (Lob) and faxes (Telnyx) Placetta sent for a filing, to the agency or as a signing kit to the owner: how a provider webhook finds its filing. Server writes only.';
create index if not exists paper_pieces_filing on public.paper_pieces(filing_id);
alter table public.paper_pieces enable row level security;
revoke all on public.paper_pieces from public, anon, authenticated;
grant select on public.paper_pieces to authenticated;
grant all on public.paper_pieces to service_role;
drop policy if exists "members read their paper" on public.paper_pieces;
create policy "members read their paper" on public.paper_pieces for select to authenticated using (public.can_view(workspace_id));

/** What the app may know about a workspace's adopted signatures: who, the kind, when, the disclosure version. */
create or replace function public.signature_mirror(s public.signer_signatures) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('id', s.id, 'user', s.user_id, 'by', s.signer_name, 'title', s.signer_title, 'kind', s.kind, 'at', s.adopted_at,
    'version', s.disclosure_version, 'demonstrated', s.demonstrated, 'withdrawnAt', s.withdrawn_at));
$$;
revoke execute on function public.signature_mirror(public.signer_signatures) from public, anon, authenticated;

/** A signer adopts their signature once (Sign once, or Autopilot): their name, a typed or drawn signature, the
    disclosure version they read and the three consents. Any live signature of theirs in this workspace is replaced.
    Only an owner signs for the business. Returns the mirror. */
create or replace function public.signature_adopt(p_ws uuid, p_name text, p_title text, p_kind text, p_signature text, p_version text,
  p_records boolean, p_sign boolean, p_apply boolean, p_demonstrated boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c record; s public.signer_signatures; nm text := trim(coalesce(p_name, '')); body text; secret uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.is_owner(p_ws) then raise exception 'Only an owner can adopt a signature for the business.' using errcode = '42501'; end if;
  if p_version is distinct from public.current_esign_disclosure() then
    raise exception 'esign_version' using hint = public.current_esign_disclosure(), detail = 'The electronic records disclosure was updated. Reload to read the current version.';
  end if;
  if p_records is distinct from true or p_sign is distinct from true or p_apply is distinct from true then
    raise exception 'esign_consent: tick each box to adopt your signature.';
  end if;
  if char_length(nm) < 2 or char_length(nm) > 120 then raise exception 'esign_name: type your full name.'; end if;
  if p_kind not in ('typed', 'drawn') then raise exception 'esign_kind: a typed or drawn signature.'; end if;
  if p_kind = 'drawn' and (p_signature is null or p_signature !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or char_length(p_signature) > 400000) then
    raise exception 'esign_drawn: the drawn signature didn''t come through. Draw it again.';
  end if;
  body := case when p_kind = 'drawn' then p_signature else nm end;
  select * into c from public.request_client();
  update public.signer_signatures set withdrawn_at = now(), withdrawn_why = 'replaced' where workspace_id = p_ws and user_id = auth.uid() and withdrawn_at is null;
  secret := vault.create_secret(body, 'adopted_signature:' || p_ws::text || ':' || gen_random_uuid()::text);
  insert into public.signer_signatures (workspace_id, user_id, signer_name, signer_title, kind, secret_id, image_sha256, disclosure_version,
    consent_records, consent_sign, consent_apply, demonstrated, ip, user_agent)
  values (p_ws, auth.uid(), nm, nullif(left(trim(coalesce(p_title, '')), 120), ''), p_kind, secret, encode(sha256(convert_to(body, 'UTF8')), 'hex'), p_version,
    true, true, true, coalesce(p_demonstrated, false), c.ip, c.user_agent)
  returning * into s;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (p_ws, 'you', auth.uid(), jsonb_build_object('en', 'Adopted a signature', 'zh', '采用了签名'),
    jsonb_build_object('en', nm || ' (' || p_kind || ')', 'zh', nm || '（' || case when p_kind = 'drawn' then '手写' else '打字' end || '）'),
    jsonb_build_object('en', format('Electronic records disclosure %s; from %s', p_version, coalesce(c.ip, 'an unknown address')),
                       'zh', format('电子记录披露 %s 版；IP %s', p_version, coalesce(c.ip, '未知'))));
  update public.workspaces set state = jsonb_set(coalesce(state, '{}'::jsonb), '{controls}', coalesce(state -> 'controls', '{}'::jsonb) || jsonb_build_object('signature', public.signature_mirror(s)))
   where id = p_ws;
  return public.signature_mirror(s);
end $$;
revoke execute on function public.signature_adopt(uuid, text, text, text, text, text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.signature_adopt(uuid, text, text, text, text, text, boolean, boolean, boolean, boolean) to authenticated;

/** Withdraw consent: the signer (or an owner) ends the adopted signature. Placetta stops applying it at once; anything
    already signed stays signed. */
create or replace function public.signature_withdraw(p_ws uuid, p_why text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not public.is_member(p_ws) then raise exception 'Not a member of this workspace.' using errcode = '42501'; end if;
  update public.signer_signatures set withdrawn_at = now(), withdrawn_why = left(coalesce(nullif(trim(p_why), ''), 'withdrawn'), 200)
   where workspace_id = p_ws and withdrawn_at is null and (user_id = auth.uid() or public.is_owner(p_ws));
  get diagnostics n = row_count;
  if n > 0 then
    update public.workspaces set state = jsonb_set(coalesce(state, '{}'::jsonb), '{controls}', coalesce(state -> 'controls', '{}'::jsonb) - 'signature') where id = p_ws;
    insert into public.audit_log (workspace_id, actor, actor_id, action, object)
    values (p_ws, 'you', auth.uid(), jsonb_build_object('en', 'Withdrew the adopted signature', 'zh', '撤回了已采用的签名'), jsonb_build_object('en', 'Placetta no longer applies it', 'zh', '快哉不再使用该签名'));
  end if;
  return n > 0;
end $$;
revoke execute on function public.signature_withdraw(uuid, text) from public, anon;
grant execute on function public.signature_withdraw(uuid, text) to authenticated;

/** The signer's own live signature, for the one-tap approval card. Only the signer, never another member. */
create or replace function public.signature_mine(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.signer_signatures; img text;
begin
  if auth.uid() is null or not public.is_member(p_ws) then return null; end if;
  select * into s from public.signer_signatures where workspace_id = p_ws and user_id = auth.uid() and withdrawn_at is null;
  if s.id is null then return null; end if;
  select decrypted_secret into img from vault.decrypted_secrets where id = s.secret_id;
  return public.signature_mirror(s) || jsonb_build_object('image', case when s.kind = 'drawn' then img end);
end $$;
revoke execute on function public.signature_mine(uuid) from public, anon;
grant execute on function public.signature_mine(uuid) to authenticated;

/** The workspace's live adopted signature for Placetta's server to place: the given signer's, or else the most recent
    owner's. Service role only. Null when there is none, or its consent was withdrawn. */
create or replace function public.signature_for(p_ws uuid, p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.signer_signatures; img text;
begin
  select x.* into s from public.signer_signatures x
   where x.workspace_id = p_ws and x.withdrawn_at is null and x.consent_apply
     and (p_user is null or x.user_id = p_user)
     and exists (select 1 from public.workspace_members m where m.workspace_id = p_ws and m.user_id = x.user_id and m.role = 'owner')
   order by x.adopted_at desc limit 1;
  if s.id is null then return null; end if;
  select decrypted_secret into img from vault.decrypted_secrets where id = s.secret_id;
  return public.signature_mirror(s) || jsonb_build_object('image', case when s.kind = 'drawn' then img end, 'sha', s.image_sha256);
end $$;
revoke execute on function public.signature_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.signature_for(uuid, uuid) to service_role;

/** Records one placement of an adopted signature. From the app (the owner's tap on the approval card, their own
    signature only) or from Placetta's server (service role, the owner's tap or Autopilot). */
create or replace function public.signature_stamp_log(p_ws uuid, p_signature uuid, p_filing uuid, p_form text, p_pdf_sha256 text, p_asked_by text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare s public.signer_signatures; n bigint;
begin
  select * into s from public.signer_signatures where id = p_signature;
  if s.id is null or s.workspace_id <> p_ws then raise exception 'esign_scope: no such signature in this workspace'; end if;
  if s.withdrawn_at is not null then raise exception 'esign_withdrawn: the signer withdrew this signature'; end if;
  if auth.uid() is not null and s.user_id <> auth.uid() then raise exception 'esign_scope: only the signer places their own signature' using errcode = '42501'; end if;
  if p_asked_by not in ('owner_tap', 'autopilot') then raise exception 'esign_scope: who asked for it?'; end if;
  if p_filing is not null and not exists (select 1 from public.filings f where f.id = p_filing and f.workspace_id = p_ws) then raise exception 'esign_scope: no such filing in this workspace'; end if;
  insert into public.signature_stamps (workspace_id, signature_id, filing_id, form, pdf_sha256, asked_by)
  values (p_ws, s.id, p_filing, left(coalesce(p_form, '?'), 80), lower(nullif(p_pdf_sha256, '')), p_asked_by) returning id into n;
  return n;
end $$;
revoke execute on function public.signature_stamp_log(uuid, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.signature_stamp_log(uuid, uuid, uuid, text, text, text) to authenticated, service_role;
