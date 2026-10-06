-- Trigger functions are never called directly; plan_of is read through billing instead.
revoke execute on function public.filings_guard(), public.filings_audit(), public.touch() from public, anon, authenticated;
revoke execute on function public.plan_of(uuid) from public, anon, authenticated;
grant execute on function public.plan_of(uuid) to service_role;
