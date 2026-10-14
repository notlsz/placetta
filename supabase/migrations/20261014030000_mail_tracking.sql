-- Email that Placetta sends from a customer's own Gmail or Outlook (an approved message, or a filing sent by email) is
-- tracked until someone answers: the integrations function records the thread when it sends, and every 10 minutes
-- (mail_watch) looks for new replies in that thread. A reply becomes an Update in the app and, for owners who linked a
-- phone, a text. Only the thread's own messages are read, and only their sender, time and first lines are kept.
-- Safe to run twice.

create table if not exists public.mail_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('gmail', 'outlook_mail')),
  account text,                         -- the mailbox it went from
  message_id text not null,             -- Gmail message id or Outlook message id
  thread_id text not null,              -- Gmail threadId or Outlook conversationId
  to_addrs text not null,
  subject text not null,
  filing_id uuid,                       -- set when it was a filing sent by email
  app_id text,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  checked_at timestamptz,
  replies integer not null default 0,
  last_reply_at timestamptz,
  last_reply_from text,
  last_reply_snippet text,
  closed_at timestamptz                 -- stops watching (30 days without a reply, or the workspace disconnected the mailbox)
);
comment on table public.mail_threads is 'Emails sent from a customer mailbox, watched for replies by integrations mail_watch. Service role writes; members read their own.';
create index if not exists mail_threads_open on public.mail_threads(checked_at nulls first) where closed_at is null;
create index if not exists mail_threads_workspace on public.mail_threads(workspace_id, sent_at desc);
alter table public.mail_threads enable row level security;
revoke all on public.mail_threads from public, anon, authenticated;
grant select on public.mail_threads to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'mail_threads' and policyname = 'Members read their workspace''s sent mail') then
    create policy "Members read their workspace's sent mail" on public.mail_threads for select to authenticated using (public.is_member(workspace_id));
  end if;
end $$;

-- A reply is its own kind of update (every earlier kind kept, including agent runs).
alter table public.updates drop constraint if exists updates_kind_check;
alter table public.updates add constraint updates_kind_check check (kind in ('deadline', 'renewal', 'filing', 'payment', 'team', 'agent', 'mail'));

-- Every 10 minutes, only while some thread is still open.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; mail replies are not watched.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-mail-watch';
  perform cron.schedule('placetta-mail-watch', '*/10 * * * *', $job$
    select net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/integrations',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)),
      body := '{"action":"mail_watch"}'::jsonb,
      timeout_milliseconds := 60000
    )
    where exists (select 1 from public.mail_threads where closed_at is null);
  $job$);
end $$;
