-- Proof of consent for texts and calls (TCPA; the FCC's 2024 ruling that AI voices are "artificial" voices, and its
-- 2025 revocation rule). Every change to a person's phone consent is written to an append-only ledger: linking a
-- number, turning texts or calls on or off, STOP and START, and unlinking. Each row keeps the number, what changed, the
-- version of the disclosure the person saw in Settings, and when. Rows outlive the account (the id stays, unlinked) so
-- consent can still be shown if a call is ever challenged; they're kept 5 years. Safe to run twice.

-- The version of the consent text shown in Settings, "Text and call Odelia" (src/Settings.tsx). Change both together.
create or replace function public.phone_consent_version() returns text
language sql immutable set search_path = '' as $$ select '2026-10-13'::text $$;

create table if not exists public.phone_consent_log (
  id bigint generated always as identity primary key,
  user_id uuid,   -- no foreign key: the record must survive the account (and be written while it's being deleted)
  number text not null,
  event text not null check (event in ('linked', 'texts_on', 'texts_off', 'calls_on', 'calls_off', 'stop', 'start', 'unlinked')),
  disclosure_version text not null,
  at timestamptz not null default now()
);
comment on table public.phone_consent_log is 'Append-only record of consent to texts and calls from Odelia, kept 5 years. Written only by the trigger on phone_links and by odelia-sms for numbers without an account.';
create index if not exists phone_consent_log_number on public.phone_consent_log(number, at);
create index if not exists phone_consent_log_user on public.phone_consent_log(user_id);
alter table public.phone_consent_log enable row level security;
revoke all on public.phone_consent_log from public, anon, authenticated;

create or replace function public.phone_consent_track() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v text := public.phone_consent_version();
begin
  if tg_op = 'DELETE' then
    if old.verified_at is not null then
      insert into public.phone_consent_log(user_id, number, event, disclosure_version) values (old.user_id, old.number, 'unlinked', v);
    end if;
    return old;
  end if;
  -- consent starts when the number is verified (the person saw the disclosure and confirmed the code)
  if new.verified_at is not null and (tg_op = 'INSERT' or old.verified_at is null or old.number is distinct from new.number) then
    insert into public.phone_consent_log(user_id, number, event, disclosure_version) values (new.user_id, new.number, 'linked', v);
    if new.texts_on then insert into public.phone_consent_log(user_id, number, event, disclosure_version) values (new.user_id, new.number, 'texts_on', v); end if;
    if new.calls_on then insert into public.phone_consent_log(user_id, number, event, disclosure_version) values (new.user_id, new.number, 'calls_on', v); end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.verified_at is not null then
    if new.texts_on is distinct from old.texts_on then
      insert into public.phone_consent_log(user_id, number, event, disclosure_version) values (new.user_id, new.number, case when new.texts_on then 'texts_on' else 'texts_off' end, v);
    end if;
    if new.calls_on is distinct from old.calls_on then
      insert into public.phone_consent_log(user_id, number, event, disclosure_version) values (new.user_id, new.number, case when new.calls_on then 'calls_on' else 'calls_off' end, v);
    end if;
    if new.opted_out_at is distinct from old.opted_out_at then
      insert into public.phone_consent_log(user_id, number, event, disclosure_version) values (new.user_id, new.number, case when new.opted_out_at is null then 'start' else 'stop' end, v);
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.phone_consent_track() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'phone_consent_track' and tgrelid = 'public.phone_links'::regclass) then
    create trigger phone_consent_track after insert or update or delete on public.phone_links for each row execute function public.phone_consent_track();
  end if;
end $$;

-- STOP and START from a number with no account are recorded too.
create or replace function public.phone_consent_stranger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.opted_out_at is not null
     or tg_op = 'UPDATE' and new.opted_out_at is distinct from old.opted_out_at then
    insert into public.phone_consent_log(user_id, number, event, disclosure_version)
    values (null, new.number, case when new.opted_out_at is null then 'start' else 'stop' end, public.phone_consent_version());
  end if;
  return new;
end $$;
revoke execute on function public.phone_consent_stranger() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'phone_consent_stranger' and tgrelid = 'public.odelia_strangers'::regclass) then
    create trigger phone_consent_stranger after insert or update on public.odelia_strangers for each row execute function public.phone_consent_stranger();
  end if;
end $$;
