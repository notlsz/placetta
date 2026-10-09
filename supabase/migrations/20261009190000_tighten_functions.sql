-- Security pass 2. Safe to run twice.
-- pin_check is an internal step of pin_unlock/pin_set/pin_clear; pin_refusal only formats a reply. Neither is called by users.
revoke execute on function public.pin_check(text), public.pin_refusal(text) from public, anon, authenticated;
-- The first team queue is replaced by filing_queue_v3 (with v2 as the fallback); nothing calls it any more.
revoke execute on function public.filing_queue() from public, anon, authenticated;
