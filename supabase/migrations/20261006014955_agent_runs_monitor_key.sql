create or replace function public.monitor_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1;
$$;
revoke execute on function public.monitor_key() from public, anon, authenticated;
grant execute on function public.monitor_key() to service_role;
