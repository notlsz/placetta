-- Production tuning from the Supabase advisors: an index behind every foreign key, and auth.uid() evaluated once per
-- query (not once per row) in the two policies that called it directly. Safe to run twice.

create index if not exists agency_logins_created_by on public.agency_logins(created_by);
create index if not exists agency_logins_last_opened_by on public.agency_logins(last_opened_by);
create index if not exists documents_filing on public.documents(filing_id);
create index if not exists documents_uploaded_by on public.documents(uploaded_by);
create index if not exists filings_approved_by on public.filings(approved_by);
create index if not exists filings_assigned_to on public.filings(assigned_to);
create index if not exists integrations_connected_by on public.integrations(connected_by);
create index if not exists oauth_pending_workspace on public.oauth_pending(workspace_id);
create index if not exists workspaces_authorized_by on public.workspaces(authorized_by);
create index if not exists workspaces_created_by on public.workspaces(created_by);

alter policy "see your memberships" on public.workspace_members
  using (user_id = (select auth.uid()) or public.is_member(workspace_id) or public.is_staff());

alter policy "members log their own actions, team logs theirs" on public.audit_log
  with check (
    (public.is_member(workspace_id) and actor in ('you', 'agent') and actor_id = (select auth.uid()))
    or (public.is_staff() and actor in ('team', 'agency') and actor_id = (select auth.uid()))
  );
