-- The security audit (docs/SECURITY-AUDIT.md): what a customer's browser could read that it shouldn't, and the public
-- doors the website leaves open. Idempotent: every statement can run again.

-- 1. Placetta's own AI cost per run stays with the team. A member could read each run's token counts and cost_usd
--    straight from agent_runs (and the 30-day cost per run from agent_cache_stats); the app never shows them to a
--    customer, only the team's Agent health does (security definer functions, staff only).
revoke select (cache_calls, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, cost_usd, prefix_hash) on public.agent_runs from authenticated;

create or replace function public.agent_cache_stats(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare j jsonb;
begin
  if not (public.is_staff() or public.is_service()) then raise exception 'Placetta team only.'; end if;
  select jsonb_build_object('runs', count(*), 'hit_rate', round(coalesce(sum(cache_read_tokens)::numeric / nullif(sum(coalesce(input_tokens, 0) + coalesce(cache_read_tokens, 0) + coalesce(cache_write_tokens, 0)), 0), 0), 4),
    'cost_per_run', round(coalesce(avg(cost_usd), 0), 6), 'read_tokens', coalesce(sum(cache_read_tokens), 0), 'input_tokens', coalesce(sum(input_tokens), 0))
    into j from public.agent_runs where workspace_id = ws and created_at > now() - interval '30 days' and cache_calls is not null;
  return j;
end $$;
revoke execute on function public.agent_cache_stats(uuid) from public, anon;
grant execute on function public.agent_cache_stats(uuid) to authenticated, service_role;

-- 2. app_settings: the app reads one switch (payments_on). The company's daily AI ceiling, the monitor's last run and
--    the phone limits are the server's.
revoke select on public.app_settings from authenticated;
grant select (id, payments_on) on public.app_settings to authenticated;

-- 3. The website's plan form (anon may only add a row): every text field has a size, the email looks like one, and one
--    address can send at most 5 an hour (the whole form at most 300 an hour), so the table can't be flooded.
alter table public.plan_requests drop constraint if exists plan_requests_sizes_more;
alter table public.plan_requests add constraint plan_requests_sizes_more check (
  coalesce(length(page_lang), 0) <= 20 and coalesce(length(preferred_language), 0) <= 40 and coalesce(length(industry), 0) <= 300
  and coalesce(length(hq), 0) <= 300 and coalesce(length(opening), 0) <= 100 and coalesce(length(locations), 0) <= 100
  and coalesce(length(contact_method), 0) <= 40
  and (email is null or email ~* '^[^@\s<>"]{1,64}@[^@\s<>"]+\.[a-z]{2,}$')
) not valid;

create or replace function public.plan_requests_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ip text;
begin
  -- only the website's callers (anon, or someone signed in) are limited; the service role and the database itself aren't
  if coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated') then return new; end if;
  select c.ip into ip from public.request_client() c;
  if not public.rate_hit('plan_requests:all', 300, 3600) then raise exception 'Too many requests. Try again later.' using errcode = '54000'; end if;
  if not public.rate_hit('plan_requests:' || coalesce(nullif(ip, ''), 'unknown'), 5, 3600) then
    raise exception 'Too many requests. Try again later.' using errcode = '54000';
  end if;
  return new;
end $$;
revoke execute on function public.plan_requests_limit() from public, anon, authenticated;
drop trigger if exists plan_requests_limit on public.plan_requests;
create trigger plan_requests_limit before insert on public.plan_requests for each row execute function public.plan_requests_limit();

-- 4. The public official-forms bucket holds blank government forms only, written by the forms function with the
--    monitor key (service role). However a later policy is written, no signed-in or anonymous caller can add, change
--    or remove a file in it, so a customer's document can never land in a public bucket.
do $$
begin
  execute 'drop policy if exists "official-forms is written by the server only" on storage.objects';
  execute $p$create policy "official-forms is written by the server only" on storage.objects as restrictive for insert to anon, authenticated
    with check (bucket_id <> 'official-forms')$p$;
  execute 'drop policy if exists "official-forms is changed by the server only" on storage.objects';
  execute $p$create policy "official-forms is changed by the server only" on storage.objects as restrictive for update to anon, authenticated
    using (bucket_id <> 'official-forms')$p$;
  execute 'drop policy if exists "official-forms is emptied by the server only" on storage.objects';
  execute $p$create policy "official-forms is emptied by the server only" on storage.objects as restrictive for delete to anon, authenticated
    using (bucket_id <> 'official-forms')$p$;
  -- and only PDFs, at most 15 MB (what the forms function keeps)
  begin
    update storage.buckets set allowed_mime_types = array['application/pdf'], file_size_limit = 15728640 where id = 'official-forms';
  exception when undefined_column then
    update storage.buckets set file_size_limit = 15728640 where id = 'official-forms';
  end;
exception when insufficient_privilege then
  raise notice 'storage policies for official-forms were refused (%); set them in the dashboard', sqlerrm;
end $$;

-- 5. Trigger functions are never called by a client.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
