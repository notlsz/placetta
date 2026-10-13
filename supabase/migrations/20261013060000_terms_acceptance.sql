-- Clickwrap proof: who accepted which version of the Terms of Service, the Privacy Policy and the Filing Authorization,
-- and when. People accept by checking an unchecked "I agree" box (sign-up and onboarding) or by pressing Accept on the
-- "We've updated our Terms" notice in the app; the app then calls accept_terms with the version it showed. A version
-- that isn't current is refused, so a stale page can't record assent to text it didn't show. Each row keeps the
-- account, the version, the time and, when PostgREST passes them, the IP address and browser. Rows have no foreign key
-- and outlive the account (the Privacy Policy says they're kept 6 years after it ends), so the agreement can still be
-- proved. The Filing Authorization is still granted by create_workspace (workspaces.authorized_at); a trigger also
-- writes it here with the version. Safe to run twice.

-- The version people accept: UPDATED in src/legal.ts. Change both together (npm run legal and npm run test:agent check).
create or replace function public.current_terms_version() returns text
language sql immutable set search_path = '' as $$ select '2026-10-13'::text $$;

create table if not exists public.terms_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null,   -- no foreign key: the record must survive the account
  workspace_id uuid,       -- no foreign key either: it survives the workspace
  doc text not null check (doc in ('terms', 'privacy', 'authorization')),
  version text not null,
  accepted_at timestamptz not null default now(),
  ip text,
  user_agent text
);
comment on table public.terms_acceptances is 'Append-only proof that a person accepted a version of the Terms of Service, Privacy Policy or Filing Authorization. Written only by accept_terms and the workspace trigger; kept 6 years after the account ends.';
create index if not exists terms_acceptances_user on public.terms_acceptances(user_id, doc, accepted_at desc);
alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from public, anon, authenticated;

-- The caller's IP address and browser, from the headers PostgREST passes in (null outside an API request).
create or replace function public.request_client() returns table (ip text, user_agent text)
language plpgsql stable set search_path = '' as $$
declare h jsonb;
begin
  begin h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then h := null; end;
  return query select
    nullif(left(trim(split_part(coalesce(h->>'x-forwarded-for', h->>'x-real-ip', ''), ',', 1)), 64), ''),
    nullif(left(coalesce(h->>'user-agent', ''), 512), '');
end $$;
revoke execute on function public.request_client() from public, anon, authenticated;

create or replace function public.terms_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cur text := public.current_terms_version(); v text; ok boolean;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select a.version into v from public.terms_acceptances a
   where a.user_id = auth.uid() and a.doc = 'terms' order by a.accepted_at desc, a.id desc limit 1;
  ok := exists (select 1 from public.terms_acceptances a where a.user_id = auth.uid() and a.doc = 'terms' and a.version = cur)
    and exists (select 1 from public.terms_acceptances a where a.user_id = auth.uid() and a.doc = 'privacy' and a.version = cur);
  return jsonb_build_object('accepted', ok, 'version', v, 'current', cur);
end $$;

create or replace function public.accept_terms(p_version text, p_workspace uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cur text := public.current_terms_version(); c record; d text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_version is distinct from cur then
    raise exception 'terms_version' using hint = cur, detail = 'These terms have been updated. Reload to read the current version.';
  end if;
  if p_workspace is not null and not exists (
    select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = auth.uid()
  ) then raise exception 'Not your workspace.' using errcode = '42501'; end if;
  select * into c from public.request_client();
  foreach d in array array['terms', 'privacy'] loop
    insert into public.terms_acceptances(user_id, workspace_id, doc, version, ip, user_agent)
    select auth.uid(), p_workspace, d, cur, c.ip, c.user_agent
    where not exists (
      select 1 from public.terms_acceptances a
       where a.user_id = auth.uid() and a.doc = d and a.version = cur and a.workspace_id is not distinct from p_workspace
    );
  end loop;
  return public.terms_status();
end $$;

revoke execute on function public.terms_status(), public.accept_terms(text, uuid), public.current_terms_version() from public, anon;
grant execute on function public.terms_status(), public.accept_terms(text, uuid), public.current_terms_version() to authenticated;

-- The Filing Authorization, granted with each new workspace, recorded with its version.
create or replace function public.terms_authorization_track() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if new.authorized_at is not null and new.authorized_by is not null
     and (tg_op = 'INSERT' or old.authorized_at is distinct from new.authorized_at) then
    select * into c from public.request_client();
    insert into public.terms_acceptances(user_id, workspace_id, doc, version, accepted_at, ip, user_agent)
    values (new.authorized_by, new.id, 'authorization', public.current_terms_version(), new.authorized_at, c.ip, c.user_agent);
  end if;
  return new;
end $$;
revoke execute on function public.terms_authorization_track() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'terms_authorization_track' and tgrelid = 'public.workspaces'::regclass) then
    create trigger terms_authorization_track after insert or update of authorized_at on public.workspaces
      for each row execute function public.terms_authorization_track();
  end if;
end $$;
