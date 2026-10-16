-- Team chats: a business can link a Slack, Lark (Feishu), WeCom or Microsoft Teams group by pasting its incoming-webhook
-- link. The link lives in the vault like any sign-in; the row only says it's there (meta.via = 'link').
alter table public.integrations drop constraint if exists integrations_kind_check;
alter table public.integrations add constraint integrations_kind_check
  check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams'));
