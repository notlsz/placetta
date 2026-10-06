create table if not exists public.plan_requests (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  client_id          uuid not null unique,
  source             text,
  page_lang          text,
  preferred_language text,
  market             text,
  industry           text,
  hq                 text,
  opening            text,
  locations          text,
  contact_method     text,
  email              text,
  wechat             text,
  company            text,
  website            text,
  answers            jsonb not null default '{}'::jsonb,
  utm                jsonb not null default '{}'::jsonb,
  page_url           text,
  referrer           text,
  user_agent         text,
  constraint plan_requests_contact check (email is not null or wechat is not null),
  constraint plan_requests_sizes check (
    pg_column_size(answers) < 8000 and pg_column_size(utm) < 4000
    and coalesce(length(email), 0) <= 320 and coalesce(length(wechat), 0) <= 100
    and coalesce(length(company), 0) <= 300 and coalesce(length(website), 0) <= 500
    and coalesce(length(market), 0) <= 300 and coalesce(length(source), 0) <= 100
    and coalesce(length(page_url), 0) <= 500 and coalesce(length(referrer), 0) <= 500
    and coalesce(length(user_agent), 0) <= 300
  )
);
comment on table public.plan_requests is 'Plan requests from the Placetta website form. The website can only add rows; view them in the Table Editor.';
create index if not exists plan_requests_created_at_idx on public.plan_requests (created_at desc);
alter table public.plan_requests enable row level security;
create policy "website can submit plan requests" on public.plan_requests
  for insert to anon, authenticated with check (true);
