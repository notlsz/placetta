-- Connections that read where the stores are and who the company is, and send papers for signature
-- (supabase/functions/integrations/places.ts and esign.ts): Google Business Profile ('gbp'), Clover, Shopify, Xero and
-- Dropbox Sign. Their tokens, or Dropbox Sign's API key, are in the vault like every other connection's. Safe to run
-- twice.
alter table public.integrations drop constraint if exists integrations_kind_check;
alter table public.integrations add constraint integrations_kind_check
  check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams', 'dingtalk',
    'slack_bot', 'lark_bot', 'wechat_bot', 'square', 'toast', 'webhook', 'gbp', 'clover', 'shopify', 'xero', 'dropbox_sign'));
