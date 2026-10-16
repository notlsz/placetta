-- Email Odelia (odelia-mail): owners write or forward to Odelia's address from the address they sign in with.
--   odelia_messages: channel 'email', and the subject (the reply goes in the same thread)
--   agent_runs: channel 'email' (reply_to is their sign-in address)
--   user_by_email(email): the account an address signs in with (confirmed addresses only), for odelia-mail
alter table public.odelia_messages drop constraint if exists odelia_messages_channel_check;
alter table public.odelia_messages add constraint odelia_messages_channel_check check (channel in ('sms', 'voice', 'email'));
alter table public.odelia_messages add column if not exists subject text check (subject is null or length(subject) <= 300);

alter table public.agent_runs drop constraint if exists agent_runs_channel_check;
alter table public.agent_runs add constraint agent_runs_channel_check check (channel in ('app', 'sms', 'voice', 'slack', 'lark', 'email'));
alter table public.agent_runs drop constraint if exists agent_runs_reply_to_check;
alter table public.agent_runs add constraint agent_runs_reply_to_check check (reply_to is null or reply_to ~ '^\+[1-9][0-9]{7,14}$' or (channel = 'email' and reply_to ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

create or replace function public.user_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
   where lower(u.email) = lower(btrim(coalesce(p_email, ''))) and u.email_confirmed_at is not null and u.deleted_at is null
   limit 1;
$$;
revoke execute on function public.user_by_email(text) from public, anon, authenticated;
grant execute on function public.user_by_email(text) to service_role;
