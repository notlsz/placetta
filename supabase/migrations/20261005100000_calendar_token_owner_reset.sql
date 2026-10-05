-- The calendar link: any member can read it, only an owner can reset it. Resetting swaps the token in place.
create or replace function public.calendar_token(ws uuid, p_rotate boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if not public.is_member(ws) then raise exception 'Not your workspace.'; end if;
  if p_rotate then
    if not public.is_owner(ws) then raise exception 'Only an owner can reset the calendar link.'; end if;
    t := encode(extensions.gen_random_bytes(24), 'hex');
    update public.calendar_feeds set token = t, created_at = now() where workspace_id = ws;
    if found then return t; end if;
  end if;
  select token into t from public.calendar_feeds where workspace_id = ws;
  if t is null then
    t := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.calendar_feeds(workspace_id, token) values (ws, t);
  end if;
  return t;
end $$;
revoke execute on function public.calendar_token(uuid, boolean) from public, anon;
grant execute on function public.calendar_token(uuid, boolean) to authenticated;
