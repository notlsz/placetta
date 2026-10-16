-- SMS pumping: a texted code costs money per message, and a fraudster who links premium-rate numbers abroad gets paid
-- for each one. phone_link_start keeps its signature and now also refuses:
--   * numbers outside the countries Placetta texts: US and Canada (+1, without the Caribbean and Atlantic islands
--     that share +1) and mainland China mobiles (+86 1xx). The list is app_settings.phone_countries (default {1,86});
--     odelia-sms checks ODELIA_SMS_COUNTRIES (same default) again before it texts, so a country is added in both places
--   * more than app_settings.phone_codes_per_hour codes texted in an hour across everyone (default 100)
--   * more than 3 codes a day to one number (was 8)
-- Calls: a caller whose caller ID isn't attested gets a texted code (odelia-voice). Wrong tries now count per number
-- across calls: at most 5 in an hour and 3 call codes an hour to one number. Safe to run twice.

alter table public.app_settings add column if not exists phone_countries text[] not null default '{1,86}';
alter table public.app_settings add column if not exists phone_codes_per_hour int not null default 100 check (phone_codes_per_hour >= 0);

-- Island nations and territories that share +1 with the US and Canada but are billed as international (and are the
-- usual pumping targets). US territories (Puerto Rico, the USVI, Guam, the Northern Marianas, American Samoa) stay in.
create or replace function public.phone_nanp_foreign(p text) returns boolean
language sql immutable set search_path = '' as $$
  select substr(p, 3, 3) = any (array['242','246','264','268','284','345','441','473','649','658','664','721','758','767',
                                      '784','809','829','849','868','869','876']);
$$;

-- A number Placetta may text a code to, given the allowed country codes.
create or replace function public.phone_sms_allowed(p text, p_countries text[]) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p is null or p !~ '^\+[1-9][0-9]{7,14}$' then false
    when p like '+1%' then '1' = any (p_countries) and p ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$' and not public.phone_nanp_foreign(p)
    when p like '+86%' then '86' = any (p_countries) and p ~ '^\+861[3-9][0-9]{9}$'
    else exists (select 1 from unnest(p_countries) c where c ~ '^[0-9]{1,3}$' and c not in ('1', '86') and p like '+' || c || '%')
  end;
$$;
revoke execute on function public.phone_nanp_foreign(text), public.phone_sms_allowed(text, text[]) from public, anon;
grant execute on function public.phone_nanp_foreign(text), public.phone_sms_allowed(text, text[]) to authenticated, service_role;

create or replace function public.phone_link_start(p_number text, p_tz text default null, p_lang text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); n text := btrim(coalesce(p_number, '')); recent int; code_id uuid; key text;
  countries text[]; per_hour int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not public.mfa_ok() then raise exception 'mfa_required'; end if;
  if not public.pin_ok() then raise exception 'pin_required'; end if;
  if n !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'phone_format'; end if;
  select s.phone_countries, s.phone_codes_per_hour into countries, per_hour from public.app_settings s where s.id;
  if not public.phone_sms_allowed(n, coalesce(countries, '{1,86}')) then raise exception 'phone_country'; end if;
  if exists (select 1 from public.phone_links where number = n and verified_at is not null and user_id <> uid) then raise exception 'phone_taken'; end if;
  -- Every code request waits its turn here, so the counts below can't be raced past.
  perform pg_advisory_xact_lock(hashtextextended('phone_codes', 0));
  select count(*) into recent from public.phone_codes where user_id = uid and purpose = 'link' and created_at > now() - interval '1 hour';
  if recent >= 5 then raise exception 'phone_rate_limited'; end if;
  select count(*) into recent from public.phone_codes where number = n and purpose = 'link' and created_at > now() - interval '1 day';
  if recent >= 3 then raise exception 'phone_rate_limited'; end if;
  select count(*) into recent from public.phone_codes where purpose in ('link', 'call') and created_at > now() - interval '1 hour';
  if recent >= coalesce(per_hour, 100) then raise exception 'phone_busy'; end if;

  insert into public.phone_links as l (user_id, number, tz, lang)
  values (uid, n, coalesce(public.phone_tz(p_tz), 'America/Los_Angeles'), case when p_lang = 'zh' then 'zh' else 'en' end)
  on conflict (user_id) do update set
    number = excluded.number,
    verified_at = case when l.number = excluded.number then l.verified_at else null end,
    opted_out_at = case when l.number = excluded.number then l.opted_out_at else null end,
    tz = coalesce(public.phone_tz(p_tz), l.tz),
    lang = case when p_lang in ('en', 'zh') then p_lang else l.lang end,
    last_error = null, updated_at = now();

  -- One live code at a time.
  update public.phone_codes set expires_at = least(expires_at, now()) where user_id = uid and purpose = 'link' and used_at is null;
  insert into public.phone_codes (user_id, purpose, number, expires_at) values (uid, 'link', n, now() + interval '10 minutes') returning id into code_id;

  select decrypted_secret into key from vault.decrypted_secrets where name = 'monitor_key' limit 1;
  perform net.http_post(
    url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/odelia-sms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', key),
    body := jsonb_build_object('action', 'send_code', 'code_id', code_id),
    timeout_milliseconds := 15000
  );
  return public.phone_status();
end $$;

-- odelia-voice issues a code for a call whose caller ID isn't fully attested. Refused (phone_rate_limited) once the
-- number has had 5 wrong tries or 3 call codes in the last hour, or (phone_busy) over the hourly cap for everyone.
create or replace function public.phone_code_issue(p_user uuid, p_purpose text, p_number text, p_code text, p_minutes int default 10) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid; tries int; codes int; per_hour int;
begin
  if coalesce(p_code, '') !~ '^[0-9]{4,8}$' then raise exception 'code_format'; end if;
  if p_purpose = 'call' then
    perform pg_advisory_xact_lock(hashtextextended('phone_codes', 0));
    select coalesce(sum(attempts), 0), count(*) into tries, codes from public.phone_codes
     where number = p_number and purpose = 'call' and created_at > now() - interval '1 hour';
    if tries >= 5 or codes >= 3 then raise exception 'phone_rate_limited'; end if;
    select s.phone_codes_per_hour into per_hour from public.app_settings s where s.id;
    if (select count(*) from public.phone_codes where purpose in ('link', 'call') and created_at > now() - interval '1 hour') >= coalesce(per_hour, 100) then
      raise exception 'phone_busy';
    end if;
  end if;
  update public.phone_codes set expires_at = least(expires_at, now()) where user_id = p_user and purpose = p_purpose and used_at is null;
  insert into public.phone_codes (user_id, purpose, number, code_hash, expires_at)
  values (p_user, p_purpose, p_number, extensions.crypt(p_code, extensions.gen_salt('bf', 8)), now() + make_interval(mins => least(greatest(coalesce(p_minutes, 10), 1), 30)))
  returning phone_codes.id into new_id;
  return new_id;
end $$;

-- Check a code. As before, plus: a call code is locked once its number has had 5 wrong tries in the last hour, across
-- calls. It never raises on a wrong code: raising would roll back the attempt count.
create or replace function public.phone_code_check(p_user uuid, p_purpose text, p_code text, p_number text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.phone_codes; tries int;
begin
  select * into r from public.phone_codes
   where user_id = p_user and purpose = p_purpose and used_at is null and code_hash is not null and (p_number is null or number = p_number)
     and expires_at > now()
   order by created_at desc limit 1 for update;
  if r.id is null then return 'expired'; end if;
  if r.attempts >= 5 then return 'locked'; end if;
  if p_purpose = 'call' then
    select coalesce(sum(attempts), 0) into tries from public.phone_codes
     where number = r.number and purpose = 'call' and created_at > now() - interval '1 hour';
    if tries >= 5 then return 'locked'; end if;
  end if;
  if r.code_hash = extensions.crypt(coalesce(p_code, ''), r.code_hash) then
    update public.phone_codes set used_at = now() where id = r.id;
    return 'ok';
  end if;
  update public.phone_codes set attempts = attempts + 1 where id = r.id;
  return case when r.attempts + 1 >= 5 or (p_purpose = 'call' and tries + 1 >= 5) then 'locked' else 'wrong' end;
end $$;

revoke execute on function public.phone_link_start(text, text, text), public.phone_code_issue(uuid, text, text, text, int),
  public.phone_code_check(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.phone_link_start(text, text, text) to authenticated;
grant execute on function public.phone_code_check(uuid, text, text, text), public.phone_code_issue(uuid, text, text, text, int) to service_role;
