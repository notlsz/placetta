-- document_in_use answered for any workspace: a signed-in user could ask, of another company's workspace id and a file
-- path, whether that document is attached to an open filing (yes or no). It's only ever used to stop a member deleting a
-- file a filing still needs (can_delete_file, the documents delete policy), and both check membership first. Now it
-- answers only for a member of that workspace or the Placetta team; anyone else always gets false, which reveals nothing.
-- Safe to run twice.
create or replace function public.document_in_use(ws uuid, p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.is_member(ws) or public.is_staff()) and exists (
    select 1 from public.filings f
     where f.workspace_id = ws and f.status in ('requested', 'in_progress', 'needs_info')
       and (f.receipt_path = p_path or strpos(f.payload::text, p_path) > 0)
  );
$$;
revoke execute on function public.document_in_use(uuid, text) from public, anon;
grant execute on function public.document_in_use(uuid, text) to authenticated;
