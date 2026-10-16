-- Odelia on WhatsApp (Meta's Cloud API, direct). Same people, same verified numbers: a WhatsApp number is a phone
-- number, so a linked phone that writes on WhatsApp is answered there.
--   phone_links.via         the app they last texted Odelia on ('whatsapp', or null for iMessage and SMS); answers and
--                           updates go back there
--   phone_links.wa_last_in  their last WhatsApp message: free-form replies only within 24 hours of it, then the
--                           update template
--   odelia_messages.service also 'WhatsApp'
alter table public.phone_links add column if not exists via text check (via is null or via in ('whatsapp'));
alter table public.phone_links add column if not exists wa_last_in timestamptz;
alter table public.odelia_messages drop constraint if exists odelia_messages_service_check;
alter table public.odelia_messages add constraint odelia_messages_service_check check (service is null or service in ('iMessage', 'RCS', 'SMS', 'WhatsApp'));
