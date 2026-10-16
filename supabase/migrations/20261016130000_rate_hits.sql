-- A small rate limit for server functions that don't spend AI (Odelia's own limits are in ai_budget): at most p_limit
-- hits for a key in a sliding window of p_window_seconds. The forms proxy uses it per person. Safe to run twice.
--   rate_hit(key, limit, window_seconds) -> true when this hit is allowed (and counted), false when over the limit

create table if not exists public.rate_hits (
  key text not null check (length(key) between 1 and 200),
  at timestamptz not null default now()
);
comment on table public.rate_hits is 'One row per allowed hit, per rate-limit key. Old rows are dropped as the key is used. Server only.';
create index if not exists rate_hits_key_at on public.rate_hits(key, at desc);
alter table public.rate_hits enable row level security;
revoke all on public.rate_hits from public, anon, authenticated;

create or replace function public.rate_hit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int; win interval := make_interval(secs => greatest(coalesce(p_window_seconds, 60), 1));
begin
  if coalesce(p_key, '') = '' then raise exception 'rate_hit: key is required'; end if;
  -- One caller per key at a time, so two requests can't both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended('rate_hit:' || p_key, 0));
  delete from public.rate_hits where key = p_key and at <= now() - win;
  select count(*) into n from public.rate_hits where key = p_key;
  if n >= greatest(coalesce(p_limit, 0), 0) then return false; end if;
  insert into public.rate_hits(key) values (p_key);
  return true;
end $$;
revoke execute on function public.rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_hit(text, int, int) to service_role;
