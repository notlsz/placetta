-- The review gate on skills Odelia records for herself (worker/filer/src/skillcheck.ts, run.ts learn). Hermes Agent's
-- self-written skills are its attack surface: one poisoned page and the next unattended run repeats it. A recording that
-- adds a host, a payment step or a recipient line to a portal skill is saved switched off with its reasons, and stays off
-- until the Placetta team reviews it (staff with two-step sign-in). A later run can't switch it back on.
-- No new table; agent_skills keeps its row-level security. Safe to run twice.

alter table public.agent_skills add column if not exists review_why text[] not null default '{}';
comment on column public.agent_skills.review_why is 'Why a recorded skill waits for the team''s review (a new host, a payment step, a new recipient line). Non-empty: the skill stays off until skill_review_clear.';

-- The same save as before, except that a skill waiting for review stays off whoever saves it.
create or replace function public.filer_save_skill(p_key text, p_name text, p_body jsonb, p_uses int, p_last_seconds int, p_best_seconds int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.agent_skills set kind = 'portal', name = p_name, description = 'Recorded from a submitted filing', body = p_body,
    source = 'agent', enabled = (cardinality(review_why) = 0), uses = p_uses, fails_in_a_row = 0, last_seconds = p_last_seconds, best_seconds = p_best_seconds,
    updated_at = now()
  where workspace_id is null and key = p_key;
  if not found then
    insert into public.agent_skills (workspace_id, key, kind, name, description, body, source, enabled, uses, fails_in_a_row, last_seconds, best_seconds)
    values (null, p_key, 'portal', p_name, 'Recorded from a submitted filing', p_body, 'agent', true, p_uses, 0, p_last_seconds, p_best_seconds);
  end if;
end $$;

-- A recording that needs the team first: saved off, with why.
create or replace function public.filer_hold_skill(p_key text, p_name text, p_body jsonb, p_uses int, p_last_seconds int, p_best_seconds int, p_why text[])
returns void language plpgsql security definer set search_path = '' as $$
declare why text[] := coalesce((select array_agg(left(x, 200)) from unnest(coalesce(p_why, '{}')) x where trim(x) <> ''), '{}');
begin
  if cardinality(why) = 0 then why := array['held for review']; end if;
  update public.agent_skills set kind = 'portal', name = p_name, description = 'Recorded from a submitted filing; waiting for review', body = p_body,
    source = 'agent', enabled = false, review_why = why[1:6], uses = p_uses, fails_in_a_row = 0, last_seconds = p_last_seconds, best_seconds = p_best_seconds,
    updated_at = now()
  where workspace_id is null and key = p_key;
  if not found then
    insert into public.agent_skills (workspace_id, key, kind, name, description, body, source, enabled, uses, fails_in_a_row, last_seconds, best_seconds, review_why)
    values (null, p_key, 'portal', p_name, 'Recorded from a submitted filing; waiting for review', p_body, 'agent', false, p_uses, 0, p_last_seconds, p_best_seconds, why[1:6]);
  end if;
end $$;

-- The team's review: staff with two-step sign-in clear the hold and say whether the skill may run on its own.
create or replace function public.skill_review_clear(p_key text, p_enable boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Only Placetta staff with two-step sign-in review recorded skills.' using errcode = '42501'; end if;
  update public.agent_skills set review_why = '{}', enabled = coalesce(p_enable, false), updated_at = now()
   where workspace_id is null and key = p_key and cardinality(review_why) > 0;
  return found;
end $$;

revoke execute on function public.filer_hold_skill(text, text, jsonb, int, int, int, text[]) from public, anon, authenticated;
grant execute on function public.filer_hold_skill(text, text, jsonb, int, int, int, text[]) to placetta_filer, service_role;
revoke execute on function public.skill_review_clear(text, boolean) from public, anon;
grant execute on function public.skill_review_clear(text, boolean) to authenticated;
