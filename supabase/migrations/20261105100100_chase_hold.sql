-- The undo window for Hands-off asks (supabase/functions/monitor/initiative.ts). Every outbound send keeps the undo
-- window; the morning's asks to the landlord, contractor or insurer from Odelia's own address went out at once. Now an
-- ask is written into its odelia_chases row and held (send_after, SEND_HOLD_MINUTES, 10 by default), the owner's Update
-- offers Undo, and the per-minute outbox sweep (the monitor's "outbox" action, pg_cron below) sends what is due. The same
-- three steps as the agency outbox (20261105090300_carry_to_approval), each under the row lock, so an Undo and the send
-- can never both win:
--   chase_claim_due(limit)          the sweep takes held asks past their window: held -> sending
--   chase_send_done(id, ok, id)     sent (with the provider's id), or given back (the row is deleted, as a failed send
--                                   always was, so the next morning may ask again)
--   chase_undo(id)                  an owner or admin, only while it is held: held -> undone, in the audit trail
-- No new table; odelia_chases keeps its row-level security (members read their own). Safe to run twice.

alter table public.odelia_chases add column if not exists send_after timestamptz;
alter table public.odelia_chases add column if not exists hold_state text;
alter table public.odelia_chases add column if not exists mail_subject text;
alter table public.odelia_chases add column if not exists mail_body text;
alter table public.odelia_chases add column if not exists undone_at timestamptz;
alter table public.odelia_chases add column if not exists undone_by uuid references auth.users(id) on delete set null;
alter table public.odelia_chases drop constraint if exists odelia_chases_hold_state_check;
alter table public.odelia_chases add constraint odelia_chases_hold_state_check check (hold_state is null or hold_state in ('held', 'sending', 'sent', 'undone'));
alter table public.odelia_chases drop constraint if exists odelia_chases_mail_check;
alter table public.odelia_chases add constraint odelia_chases_mail_check check ((mail_subject is null or length(mail_subject) <= 300) and (mail_body is null or length(mail_body) <= 4000));
comment on column public.odelia_chases.hold_state is 'A Hands-off ask: held during its undo window (until send_after), sending, sent, or undone by an owner. Null: an ask drafted for approval, or one sent before the window existed.';
create index if not exists odelia_chases_held on public.odelia_chases(send_after) where hold_state = 'held';

create or replace function public.chase_claim_due(p_limit int default 20) returns setof public.odelia_chases
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.odelia_chases c set hold_state = 'sending'
   where c.id in (select x.id from public.odelia_chases x where x.hold_state = 'held' and x.send_after <= now()
                   order by x.send_after for update skip locked limit least(greatest(coalesce(p_limit, 20), 1), 100))
  returning c.*;
end $$;

create or replace function public.chase_send_done(p_id uuid, p_ok boolean, p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_ok then
    update public.odelia_chases set hold_state = 'sent', sent_at = now(), provider_id = left(p_provider, 200) where id = p_id and hold_state = 'sending';
  else
    delete from public.odelia_chases where id = p_id and hold_state = 'sending';
  end if;
end $$;

create or replace function public.chase_undo(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare c public.odelia_chases;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into c from public.odelia_chases where id = p_id for update;
  if c.id is null or not (public.is_owner(c.workspace_id) or public.is_admin(c.workspace_id)) then raise exception 'No such message.'; end if;
  if c.hold_state is distinct from 'held' then return false; end if;
  update public.odelia_chases set hold_state = 'undone', undone_at = now(), undone_by = auth.uid() where id = p_id;
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (c.workspace_id, 'you', auth.uid(), '{"en": "Undid Odelia''s email before it went", "zh": "在发出前撤销了 Odelia 的邮件"}'::jsonb,
          jsonb_build_object('en', coalesce(c.to_name, 'a contact'), 'zh', coalesce(c.to_name, '联系人')), null);
  return true;
end $$;

revoke execute on function public.chase_claim_due(int), public.chase_send_done(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.chase_claim_due(int), public.chase_send_done(uuid, boolean, text) to service_role;
revoke execute on function public.chase_undo(uuid) from public, anon;
grant execute on function public.chase_undo(uuid) to authenticated;

-- The per-minute sweep runs while an agency send or a held ask is due.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; held asks go out at the monitor''s next outbox call.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-agency-outbox';
  perform cron.schedule('placetta-agency-outbox', '* * * * *', $job$
    select net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/monitor',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)),
      body := '{"action": "outbox"}'::jsonb,
      timeout_milliseconds := 60000
    )
    where exists (select 1 from public.agency_outbox where status = 'held' and send_after <= now())
       or exists (select 1 from public.odelia_chases where hold_state = 'held' and send_after <= now());
  $job$);
end $$;
