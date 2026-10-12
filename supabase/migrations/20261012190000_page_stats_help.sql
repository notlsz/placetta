-- Count Help Center articles too (/help/<section>/<article>), not only /guides/ pages.
alter table public.page_stats drop constraint if exists page_stats_path_check;
alter table public.page_stats add constraint page_stats_path_check check (path ~ '^/(guides|help)/[a-z0-9/._-]{0,200}$');

create or replace function public.page_hit(p_path text, p_view boolean default true, p_helpful boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r public.page_stats;
begin
  if p_path is null or p_path !~ '^/(guides|help)/[a-z0-9/._-]{0,200}$' then return null; end if;
  insert into public.page_stats as s (path, views, helpful)
    values (p_path, case when p_view then 1 else 0 end, case when p_helpful then 1 else 0 end)
  on conflict (path) do update
    set views = s.views + case when p_view then 1 else 0 end,
        helpful = s.helpful + case when p_helpful then 1 else 0 end,
        updated_at = now()
  returning * into r;
  return jsonb_build_object('views', r.views, 'helpful', r.helpful);
end $$;

revoke all on function public.page_hit(text, boolean, boolean) from public;
grant execute on function public.page_hit(text, boolean, boolean) to anon, authenticated;
