-- Settings PIN: a 6-digit PIN that locks sensitive settings until it's entered (unlock lasts 15 minutes).
-- Stored as a bcrypt hash, reachable only through these functions; 5 wrong tries lock it for 15 minutes.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.account_pins (
  user_id uuid primary key references auth.users on delete cascade,
  pin_hash text not null,
  fails int not null default 0,
  locked_until timestamptz,
  unlocked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.account_pins enable row level security;
revoke all on public.account_pins from anon, authenticated;

create or replace function public.pin_status() returns json
language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'on', exists (select 1 from account_pins where user_id = auth.uid()),
    'unlocked_until', (select unlocked_until from account_pins where user_id = auth.uid() and unlocked_until > now()),
    'locked_until', (select locked_until from account_pins where user_id = auth.uid() and locked_until > now()));
$$;

create or replace function public.pin_ok() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select not exists (select 1 from account_pins where user_id = auth.uid() and (unlocked_until is null or unlocked_until <= now()));
$$;

-- Checks a PIN, counting failures. Returns null when right; raises when wrong or locked.
create or replace function public.pin_check(p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare r account_pins;
begin
  select * into r from account_pins where user_id = auth.uid() for update;
  if not found then return; end if;
  if r.locked_until is not null and r.locked_until > now() then raise exception 'pin_locked' using hint = r.locked_until::text; end if;
  if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
    update account_pins set fails = 0, locked_until = null, unlocked_until = now() + interval '15 minutes', updated_at = now() where user_id = auth.uid();
    return;
  end if;
  if r.fails + 1 >= 5 then
    update account_pins set fails = 0, locked_until = now() + interval '15 minutes', unlocked_until = null, updated_at = now() where user_id = auth.uid();
    raise exception 'pin_locked' using hint = (now() + interval '15 minutes')::text;
  end if;
  update account_pins set fails = r.fails + 1, updated_at = now() where user_id = auth.uid();
  raise exception 'pin_wrong' using hint = (4 - r.fails)::text;
end $$;

create or replace function public.pin_unlock(p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  perform pin_check(p_pin);
  return pin_status();
end $$;

create or replace function public.pin_set(p_pin text, p_current text default null) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_pin !~ '^[0-9]{6}$' then raise exception 'pin_format'; end if;
  if exists (select 1 from account_pins where user_id = auth.uid()) then perform pin_check(p_current); end if;
  insert into account_pins (user_id, pin_hash, unlocked_until) values (auth.uid(), crypt(p_pin, gen_salt('bf', 10)), now() + interval '15 minutes')
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, fails = 0, locked_until = null, unlocked_until = excluded.unlocked_until, updated_at = now();
  return pin_status();
end $$;

create or replace function public.pin_clear(p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  perform pin_check(p_pin);
  delete from account_pins where user_id = auth.uid();
  return pin_status();
end $$;

create or replace function public.pin_lock() returns json
language sql security definer set search_path = public, extensions as $$
  update account_pins set unlocked_until = null, updated_at = now() where user_id = auth.uid();
  select pin_status();
$$;

revoke all on function public.pin_status(), public.pin_ok(), public.pin_check(text), public.pin_unlock(text), public.pin_set(text, text), public.pin_clear(text), public.pin_lock() from public, anon;
grant execute on function public.pin_status(), public.pin_ok(), public.pin_unlock(text), public.pin_set(text, text), public.pin_clear(text), public.pin_lock() to authenticated;
