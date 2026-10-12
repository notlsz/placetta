-- Real view and "helpful" counts for the public guide pages. The website never touches the table directly: it calls
-- page_hit(), which only accepts /guides/ paths and only ever adds one to a count.
create table if not exists public.page_stats (
  path       text primary key check (path ~ '^/guides/[a-z0-9/._-]{0,200}$'),
  views      bigint not null default 0,
  helpful    bigint not null default 0,
  updated_at timestamptz not null default now()
);
comment on table public.page_stats is 'Real page views and helpful votes on /guides/ pages, counted by page_hit() from the website.';
alter table public.page_stats enable row level security;

create or replace function public.page_hit(p_path text, p_view boolean default true, p_helpful boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r public.page_stats;
begin
  if p_path is null or p_path !~ '^/guides/[a-z0-9/._-]{0,200}$' then return null; end if;
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
