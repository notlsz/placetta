-- Phone codes and SMS pumping: allowed countries, the per-number and hourly caps, and call-code tries across calls.
-- Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; i int; r text;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'phone@p.test', now(), now(), now(), '{}', '{}'),
    (inst, c, 'authenticated', 'authenticated', 'caller@p.test', now(), now(), now(), '{}', '{}');

  res := res || jsonb_build_object(
    'US numbers are allowed', public.phone_sms_allowed('+14155550134', '{1,86}'),
    'Canadian numbers are allowed', public.phone_sms_allowed('+16045550134', '{1,86}'),
    'Puerto Rico is allowed', public.phone_sms_allowed('+17875550134', '{1,86}'),
    'Jamaica on +1 is not', not public.phone_sms_allowed('+18765550134', '{1,86}'),
    'the Dominican Republic on +1 is not', not public.phone_sms_allowed('+18095550134', '{1,86}'),
    'a malformed +1 number is not', not public.phone_sms_allowed('+11155550134', '{1,86}'),
    'China mobiles are allowed', public.phone_sms_allowed('+8613812345678', '{1,86}'),
    'China landlines are not', not public.phone_sms_allowed('+861012345678', '{1,86}'),
    'the UK is not by default', not public.phone_sms_allowed('+447700900123', '{1,86}'),
    'the UK is when listed', public.phone_sms_allowed('+447700900123', '{1,86,44}'),
    'China is not when left out', not public.phone_sms_allowed('+8613812345678', '{1}'));

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.phone_link_start('+447700900123', 'Europe/London', 'en'); ok := false; exception when others then ok := sqlerrm like '%phone_country%'; end;
  res := res || jsonb_build_object('linking a number abroad is refused', ok);
  -- 3 codes a day to one number, then refused.
  for i in 1..3 loop perform public.phone_link_start('+14155550134', 'America/Los_Angeles', 'en'); end loop;
  begin perform public.phone_link_start('+14155550134', 'America/Los_Angeles', 'en'); ok := false; exception when others then ok := sqlerrm like '%phone_rate_limited%'; end;
  res := res || jsonb_build_object('a fourth code to one number in a day is refused', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('each allowed code asked odelia-sms to text it', (select count(*) from net.http_request_queue where body->>'action' = 'send_code') >= 3);

  -- The hourly cap for everyone.
  update public.app_settings set phone_codes_per_hour = 4;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.phone_link_start('+16045550134', 'America/Vancouver', 'en');
  begin perform public.phone_link_start('+16045550135', 'America/Vancouver', 'en'); ok := false; exception when others then ok := sqlerrm like '%phone_busy%'; end;
  res := res || jsonb_build_object('past the hourly cap for everyone, codes stop', ok);
  begin perform public.phone_code_issue(c, 'call', '+16045550134', '1234', 10); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('customers cannot issue call codes', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.app_settings set phone_codes_per_hour = 100;

  -- Call codes: wrong tries count per number across calls.
  perform public.phone_code_issue(c, 'call', '+12125550100', '1111', 10);
  r := public.phone_code_check(c, 'call', '0000', '+12125550100');
  r := public.phone_code_check(c, 'call', '0000', '+12125550100');
  r := public.phone_code_check(c, 'call', '0000', '+12125550100');
  perform public.phone_code_issue(c, 'call', '+12125550100', '2222', 10);   -- the next call
  r := public.phone_code_check(c, 'call', '0000', '+12125550100');
  res := res || jsonb_build_object('a wrong try on the next call still counts', r = 'wrong');
  r := public.phone_code_check(c, 'call', '0000', '+12125550100');
  res := res || jsonb_build_object('the fifth wrong try in an hour locks', r = 'locked');
  r := public.phone_code_check(c, 'call', '2222', '+12125550100');
  res := res || jsonb_build_object('even the right code is refused once locked', r = 'locked');
  begin perform public.phone_code_issue(c, 'call', '+12125550100', '3333', 10); ok := false; exception when others then ok := sqlerrm like '%phone_rate_limited%'; end;
  res := res || jsonb_build_object('no more call codes for that number this hour', ok);
  perform public.phone_code_issue(c, 'call', '+12125550101', '4444', 10);
  res := res || jsonb_build_object('another number is unaffected', public.phone_code_check(c, 'call', '4444', '+12125550101') = 'ok');
  raise exception 'TEST_RESULTS %', res;
end $test$;
