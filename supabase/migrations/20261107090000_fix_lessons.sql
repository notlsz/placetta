-- Odelia learns from her own slips (src/selfLearn.ts): when a check refuses what she gave it and a later call in the
-- same run is accepted, the pair becomes a "fix" lesson for that form or tool. Fix lessons are written from Placetta's
-- own words (the form's labels and choices, the checker's note, the shape of a value, never the value), so they go live
-- on their first confirmation and retire the usual way when they keep losing.
alter table public.odelia_lessons drop constraint if exists odelia_lessons_kind_check;
alter table public.odelia_lessons add constraint odelia_lessons_kind_check check (kind in ('place', 'agency', 'form', 'pitfall', 'fix'));

-- A fix stays live after the run that taught it is gone (a probe workspace is deleted, and its vote with it): it rests
-- on Placetta's own check, not on that business. It retires when businesses contradict it or it keeps losing. Every
-- other kind keeps the rule from 20261022190000_agent_security: two different businesses, an official link alone isn't
-- enough.
create or replace function public.lesson_recount(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c int; x int;
begin
  select count(*) filter (where vote = 1), count(*) filter (where vote = -1) into c, x from public.odelia_lesson_votes where lesson_id = p_id;
  update public.odelia_lessons l set
    confirms = case when l.kind = 'fix' then greatest(c, l.confirms) else c end, contradicts = x, businesses = c + x, updated_at = now(),
    status = case
      when l.pinned is not null then l.pinned
      when x >= 2 and x > c then 'retired'
      when l.losses >= 4 and l.wins * 3 < l.losses then 'retired'
      when l.kind = 'fix' and l.official then 'live'
      when c >= 2 and c > x then 'live'
      else 'candidate' end
  where l.id = p_id;
end $$;
revoke execute on function public.lesson_recount(uuid) from public, anon, authenticated;
