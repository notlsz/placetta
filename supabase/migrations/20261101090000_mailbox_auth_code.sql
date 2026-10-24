-- A mailbox connected with its authorization code (授权码) or app password: QQ, NetEase 163 and 126, Sina, Aliyun, Yahoo
-- and company mail (Tencent Exmail, NetEase Qiye, Aliyun Qiye, or any SMTP/IMAP host on SSL). The integrations function
-- signs in to SMTP and IMAP before it keeps the code; the code lives in the vault like every other credential, and the
-- row's meta keeps only the provider, the address and the two hosts. Mail sent from it is watched for replies like Gmail
-- and Outlook (mail_threads, kind 'mailbox', thread_id = the Message-ID Placetta set).
-- Safe to run twice.

alter table public.integrations drop constraint if exists integrations_kind_check;
alter table public.integrations add constraint integrations_kind_check
  check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack', 'lark', 'wecom', 'teams', 'dingtalk',
    'slack_bot', 'lark_bot', 'wechat_bot', 'square', 'toast', 'webhook', 'gbp', 'clover', 'shopify', 'xero', 'dropbox_sign',
    'teams_bot', 'telegram_bot', 'mailbox'));

alter table public.mail_threads drop constraint if exists mail_threads_kind_check;
alter table public.mail_threads add constraint mail_threads_kind_check
  check (kind in ('gmail', 'outlook_mail', 'mailbox'));
