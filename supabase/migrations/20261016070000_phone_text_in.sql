-- Link a phone by texting Odelia, instead of Odelia texting a code first.
-- iMessage providers (Linq's free tier, Sendblue, LoopMessage) only let a line answer people who wrote first, and a line
-- that opens conversations is the pattern Apple flags (Lindy's lesson). So Settings shows a 6-digit code and the owner
-- texts it to Odelia from the phone they're linking: the text proves they hold that number, and the code proves it's
-- the signed-in person who asked. Same rate limits, same consent disclosure (shown before the code), same PIN.
--   phone_link_text_in(number, tz, lang)  the app: start linking; returns phone_status() plus {text_code, expires_at}
--   phone_link_inbound(number, code, line) odelia-sms: a text of the code arrived from that number on that line
alter table public.phone_codes drop constraint if exists phone_codes_purpose_check;
alter table public.phone_codes add constraint phone_codes_purpose_check check (purpose in ('link', 'call', 'link_in'));

create or replace function public.phone_link_text_in(p_number text, p_tz text default null, p_lang text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n text := btrim(coalesce(p_number, '')); recent int; code text; exp timestamptz := now() + interval '30 minutes';
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not public.mfa_ok() then raise exception 'mfa_required'; end if;
  if not public.pin_ok() then raise exception 'pin_required'; end if;
  if n !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'phone_format'; end if;
  if exists (select 1 from public.phone_links where number = n and verified_at is not null and user_id <> uid) then raise exception 'phone_taken'; end if;
  select count(*) into recent from public.phone_codes where user_id = uid and purpose in ('link', 'link_in') and created_at > now() - interval '1 hour';
  if recent >= 5 then raise exception 'phone_rate_limited'; end if;

  insert into public.phone_links as l (user_id, number, tz, lang)
  values (uid, n, coalesce(public.phone_tz(p_tz), 'America/Los_Angeles'), case when p_lang = 'zh' then 'zh' else 'en' end)
  on conflict (user_id) do update set
    number = excluded.number,
    verified_at = case when l.number = excluded.number then l.verified_at else null end,
    opted_out_at = case when l.number = excluded.number then l.opted_out_at else null end,
    tz = coalesce(public.phone_tz(p_tz), l.tz),
    lang = case when p_lang in ('en', 'zh') then p_lang else l.lang end,
    last_error = null, updated_at = now();

  -- One live code at a time, of either kind. The code exists in the clear only in this answer, to this person.
  update public.phone_codes set expires_at = least(expires_at, now()) where user_id = uid and purpose in ('link', 'link_in') and used_at is null;
  code := lpad(((('x' || lpad(encode(extensions.gen_random_bytes(4), 'hex'), 16, '0'))::bit(64)::bigint) % 1000000)::text, 6, '0');
  insert into public.phone_codes (user_id, purpose, number, code_hash, expires_at)
  values (uid, 'link_in', n, extensions.crypt(code, extensions.gen_salt('bf', 8)), exp);
  return public.phone_status() || jsonb_build_object('text_code', code, 'text_code_expires_at', exp);
end $$;

-- A text that is just a code, from a number. ok: linked (and that line becomes theirs); wrong, locked, expired; none:
-- no one is linking this number, so it's an ordinary text. Wrong tries count against the code like typed ones.
create or replace function public.phone_link_inbound(p_number text, p_code text, p_line text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.phone_codes; l public.phone_links; c text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
begin
  select * into l from public.phone_links where number = p_number and verified_at is null order by updated_at desc limit 1;
  if l.user_id is null then return jsonb_build_object('result', 'none'); end if;
  select * into r from public.phone_codes where user_id = l.user_id and purpose = 'link_in' and number = p_number and used_at is null
   order by created_at desc limit 1 for update;
  if r.id is null then return jsonb_build_object('result', 'none'); end if;
  if r.expires_at <= now() then return jsonb_build_object('result', 'expired', 'user_id', l.user_id, 'lang', l.lang); end if;
  if r.attempts >= 5 then return jsonb_build_object('result', 'locked', 'user_id', l.user_id, 'lang', l.lang); end if;
  if r.code_hash <> extensions.crypt(c, r.code_hash) then
    update public.phone_codes set attempts = attempts + 1 where id = r.id;
    return jsonb_build_object('result', case when r.attempts + 1 >= 5 then 'locked' else 'wrong' end, 'user_id', l.user_id, 'lang', l.lang);
  end if;
  if exists (select 1 from public.phone_links where number = p_number and verified_at is not null and user_id <> l.user_id) then
    return jsonb_build_object('result', 'taken', 'user_id', l.user_id, 'lang', l.lang);
  end if;
  update public.phone_codes set used_at = now() where id = r.id;
  update public.phone_links set verified_at = now(), last_error = null, opted_out_at = null,
    line = case when p_line ~ '^\+[1-9][0-9]{7,14}$' then p_line else line end, updated_at = now()
   where user_id = l.user_id;
  return jsonb_build_object('result', 'ok', 'user_id', l.user_id, 'lang', l.lang);
end $$;

revoke execute on function public.phone_link_text_in(text, text, text), public.phone_link_inbound(text, text, text) from public, anon, authenticated;
grant execute on function public.phone_link_text_in(text, text, text) to authenticated;
grant execute on function public.phone_link_inbound(text, text, text) to service_role;

-- phone_status: a code waiting to be texted in counts as a code pending.
create or replace function public.phone_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.phone_links;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not public.mfa_ok() then raise exception 'mfa_required'; end if;
  select * into r from public.phone_links where user_id = uid;
  return jsonb_build_object(
    'link', case when r.user_id is null then null else jsonb_build_object(
      'number', r.number, 'verified', r.verified_at is not null, 'verified_at', r.verified_at,
      'texts_on', r.texts_on, 'calls_on', r.calls_on,
      'quiet_start', to_char(r.quiet_start, 'HH24:MI'), 'quiet_end', to_char(r.quiet_end, 'HH24:MI'),
      'tz', r.tz, 'lang', r.lang, 'opted_out', r.opted_out_at is not null, 'last_error', r.last_error, 'line', r.line,
      'code_pending', exists (select 1 from public.phone_codes c where c.user_id = uid and c.purpose = 'link' and c.number = r.number
                                and c.used_at is null and c.expires_at > now()),
      'text_in_pending', exists (select 1 from public.phone_codes c where c.user_id = uid and c.purpose = 'link_in' and c.number = r.number
                                and c.used_at is null and c.expires_at > now())) end,
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'direction', m.direction, 'channel', m.channel, 'kind', m.kind,
                                                         'body', m.body, 'service', m.service, 'created_at', m.created_at) order by m.created_at desc)
                       from (select * from public.odelia_messages where user_id = uid order by created_at desc limit 30) m), '[]'::jsonb));
end $$;
