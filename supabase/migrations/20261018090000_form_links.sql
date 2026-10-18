-- The filled form, handed back by text or chat. When Odelia fills an agency's form again during a run that came by
-- SMS, iMessage, WhatsApp, WeChat, Slack or Lark, her reply ends with a short link to view it (src/forms/versions.ts,
-- supabase/functions/agent-run). The link carries a random token kept here, so it can't be guessed or made up; it
-- opens the filled PDF in the app only for a member of the workspace it belongs to, and only until it expires (seven
-- days). Nobody reads this table directly: the server writes it, and the app opens a link through open_form_link.

create table if not exists public.form_links (
  token text primary key check (token ~ '^[A-Za-z0-9]{12,40}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_id text not null check (length(app_id) between 1 and 200),
  version int not null check (version > 0),
  path text not null check (length(path) > 37),
  name text not null default '' check (length(name) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  -- the file is the workspace's own: its storage path starts with the workspace id
  constraint form_links_own_file check (left(path, 37) = workspace_id::text || '/')
);
create index if not exists form_links_workspace on public.form_links(workspace_id);
create index if not exists form_links_expires on public.form_links(expires_at);
alter table public.form_links enable row level security;
revoke all on public.form_links from anon, authenticated;

-- Opening a link: for a member of its workspace, the form it shows (the file's path only while the link is fresh);
-- for anyone else, nothing at all, the same as a token that doesn't exist.
create or replace function public.open_form_link(p_token text)
returns table (workspace_id uuid, app_id text, version int, path text, name text, expired boolean)
language plpgsql security definer set search_path = public
as $$
declare l public.form_links;
begin
  select * into l from public.form_links f where f.token = p_token;
  if l.token is null or not public.is_member(l.workspace_id) then
    raise exception 'That link is gone, or it isn''t for your workspace.' using errcode = 'P0002';
  end if;
  return query select l.workspace_id, l.app_id, l.version, case when l.expires_at > now() then l.path end, l.name, l.expires_at <= now();
end $$;
revoke all on function public.open_form_link(text) from public, anon;
grant execute on function public.open_form_link(text) to authenticated;

-- Links that expired more than a month ago go.
create or replace function public.form_links_sweep() returns int
language sql security definer set search_path = public
as $$ with gone as (delete from public.form_links where expires_at < now() - interval '30 days' returning 1) select count(*)::int from gone $$;
revoke all on function public.form_links_sweep() from public, anon, authenticated;
