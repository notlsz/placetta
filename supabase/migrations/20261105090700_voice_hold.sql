-- Hold parking for agency calls (supabase/functions/_shared/voice_hold.ts, odelia-voice/calls.ts).
--   voice_calls.hold          the call's hold state machine: phase (talk, parked, resuming, ended), time held and talked,
--                             holds, keys pressed on hold menus, the brains tried, the limits. Changed by odelia-voice only,
--                             by compare and set on hold->>'v'.
--   voice_calls.held_seconds  minutes the agency had Odelia on hold with the brain let go (carrier and hold listener only)
--   voice_calls.talk_seconds  minutes with the brain on the line; held + talk is the call, so the cost estimate in
--                             voice_brain.ts (callCost) can be checked against real calls
--   voice_calls.holds         how many times the call was parked
--   voice_calls.outcome       done, retry (a hold or talk limit was reached, or every brain failed) or failed
--   voice_calls.retry_at      when a retry is due; retried_at once it was placed; retry_of the first call of the chain
--   voice_hold_due()          whether the per-minute sweep has anything to do: a live agency call past a limit, or a
--                             retry that is due. The sweep (odelia-voice {action: "hold_sweep"}) runs only then.
-- Safe to run twice. Written 2026-10-28, not applied to the live database.

alter table public.voice_calls add column if not exists hold jsonb check (hold is null or jsonb_typeof(hold) = 'object');
alter table public.voice_calls add column if not exists held_seconds int not null default 0 check (held_seconds between 0 and 86400);
alter table public.voice_calls add column if not exists talk_seconds int not null default 0 check (talk_seconds between 0 and 86400);
alter table public.voice_calls add column if not exists holds int not null default 0 check (holds between 0 and 1000);
alter table public.voice_calls add column if not exists outcome text check (outcome is null or outcome in ('done', 'retry', 'failed'));
alter table public.voice_calls add column if not exists retry_at timestamptz;
alter table public.voice_calls add column if not exists retried_at timestamptz;
alter table public.voice_calls add column if not exists retry_of uuid references public.voice_calls(id) on delete set null;
create index if not exists voice_calls_retry_due on public.voice_calls(retry_at) where outcome = 'retry' and retried_at is null;
create index if not exists voice_calls_retry_of on public.voice_calls(retry_of) where retry_of is not null;
comment on column public.voice_calls.hold is 'Agency call hold machine (voice_hold.ts). Server writes only; members read it with the call (RLS on voice_calls).';
comment on column public.voice_calls.held_seconds is 'Seconds parked on hold: carrier leg and hold listener only, no voice brain.';
comment on column public.voice_calls.talk_seconds is 'Seconds with the voice brain on the line.';

-- voice_calls keeps its row-level security (members and team read, only the server writes); the new columns ride on it.
alter table public.voice_calls enable row level security;

-- Anything for the sweep: a live agency call past its hold or talk limit (read from its hold state), or a retry due.
create or replace function public.voice_hold_due() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.voice_calls v
     where v.kind = 'agency_phone' and v.status = 'live' and v.hold is not null and v.hold->>'phase' in ('talk', 'parked', 'resuming') and v.hold->'wrap' is null
       and (
         (v.hold->>'phase' = 'parked' and coalesce((v.hold->>'heldMs')::numeric, 0) + extract(epoch from now()) * 1000 - coalesce((v.hold->>'since')::numeric, 0) >= coalesce((v.hold->'limits'->>'holdMaxMs')::numeric, 3600000))
         or (v.hold->>'phase' in ('talk', 'resuming') and coalesce((v.hold->>'talkMs')::numeric, 0) + extract(epoch from now()) * 1000 - coalesce((v.hold->>'since')::numeric, 0) >= coalesce((v.hold->'limits'->>'talkMaxMs')::numeric, 900000))
       )
  ) or exists (
    select 1 from public.voice_calls v where v.outcome = 'retry' and v.retried_at is null and v.retry_at <= now()
  );
$$;
revoke execute on function public.voice_hold_due() from public, anon, authenticated;
grant execute on function public.voice_hold_due() to service_role;

-- The per-minute sweep, only while something is due (the same pattern as placetta-send-hold).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; Telnyx''s own time limit on each agency call (hold and talk limits plus two minutes) still ends it.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-voice-hold';
  perform cron.schedule('placetta-voice-hold', '* * * * *', $job$
    select net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/odelia-voice',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)),
      body := '{"action": "hold_sweep"}'::jsonb,
      timeout_milliseconds := 60000
    )
    where public.voice_hold_due();
  $job$);
end $$;
