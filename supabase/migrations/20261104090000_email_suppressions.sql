-- Email suppressions: addresses Placetta never mails again, by any provider (supabase/functions/_shared/email.ts and
-- suppression.ts). Amazon SES's bounce and complaint notifications reach odelia-mail over SNS; a permanent bounce (no
-- such mailbox or domain) or a spam complaint adds the address here. Soft bounces are not kept: SES retries those.
--
-- An email address and why, nothing else. The server writes it with the service role; staff can read it (to answer
-- "why didn't I get the email?") and lift a suppression by deleting the row. Customers never see it.
-- Safe to run twice. Not applied to the live database by this commit.

create table if not exists public.email_suppressions (
  email text primary key check (email = lower(email) and length(email) between 3 and 320 and position('@' in email) > 1),
  reason text not null check (reason in ('bounce', 'complaint', 'manual')),
  provider text not null default 'ses' check (provider in ('ses', 'postmark', 'resend', 'staff')),
  detail text check (detail is null or length(detail) <= 300),
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
comment on table public.email_suppressions is 'Addresses that hard-bounced or complained: never mailed again. Server writes; staff read and lift.';
alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from public, anon, authenticated;
grant select, delete on public.email_suppressions to authenticated;
drop policy if exists "staff read suppressions" on public.email_suppressions;
create policy "staff read suppressions" on public.email_suppressions for select to authenticated using (public.is_staff());
drop policy if exists "staff lift suppressions" on public.email_suppressions;
create policy "staff lift suppressions" on public.email_suppressions for delete to authenticated using (public.is_staff());
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.email_suppressions to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'revoke all on public.email_suppressions from placetta_filer';
  end if;
end $$;
