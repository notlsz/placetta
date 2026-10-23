-- A generic webhook connection (supabase/functions/_shared/channels.ts, kind 'webhook'): any https address that takes
-- JSON (Zapier's Catch Hook, Make, n8n, the business's own system) gets the same updates the team chats get, as data,
-- signed the Standard Webhooks way when the business gives a secret. The address and the secret are in the vault, like
-- every chat link. Safe to run twice.
alter table public.integrations drop constraint if exists integrations_kind_check;
alter table public.integrations add constraint integrations_kind_check
  check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams', 'dingtalk',
    'slack_bot', 'lark_bot', 'wechat_bot', 'square', 'toast', 'webhook'));
