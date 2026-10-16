-- Talk to Odelia from Slack and Lark: a run can come from a chat and answers in the same thread (chat_to), the team
-- chats include DingTalk, and the bots' own credentials are kept like any sign-in (slack_bot, lark_bot). chat_events
-- holds the ids of events already taken, since Slack and Lark both retry.
alter table public.agent_runs drop constraint if exists agent_runs_channel_check;
alter table public.agent_runs add constraint agent_runs_channel_check check (channel in ('app', 'sms', 'voice', 'slack', 'lark'));
alter table public.agent_runs add column if not exists chat_to jsonb;
alter table public.integrations drop constraint if exists integrations_kind_check;
alter table public.integrations add constraint integrations_kind_check
  check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams', 'dingtalk', 'slack_bot', 'lark_bot'));
create table if not exists public.chat_events (id text primary key, at timestamptz not null default now());
alter table public.chat_events enable row level security;
