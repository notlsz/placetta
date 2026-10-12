-- Account deletion (team function, action delete_account): deleting an auth user must not be blocked by the rows that
-- name who did something. Those references become "on delete set null"; the rows themselves (filings, invites, logins,
-- documents) stay with the workspace that owns them. Memberships and the settings PIN already cascade.

alter table public.workspaces alter column created_by drop not null;
alter table public.workspaces drop constraint if exists workspaces_created_by_fkey,
  add constraint workspaces_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.workspaces drop constraint if exists workspaces_authorized_by_fkey,
  add constraint workspaces_authorized_by_fkey foreign key (authorized_by) references auth.users(id) on delete set null;

alter table public.filings alter column approved_by drop not null;
alter table public.filings drop constraint if exists filings_approved_by_fkey,
  add constraint filings_approved_by_fkey foreign key (approved_by) references auth.users(id) on delete set null;
alter table public.filings drop constraint if exists filings_assigned_to_fkey,
  add constraint filings_assigned_to_fkey foreign key (assigned_to) references auth.users(id) on delete set null;

alter table public.documents drop constraint if exists documents_uploaded_by_fkey,
  add constraint documents_uploaded_by_fkey foreign key (uploaded_by) references auth.users(id) on delete set null;

alter table public.workspace_invites alter column invited_by drop not null;
alter table public.workspace_invites drop constraint if exists workspace_invites_invited_by_fkey,
  add constraint workspace_invites_invited_by_fkey foreign key (invited_by) references auth.users(id) on delete set null;
alter table public.workspace_invites drop constraint if exists workspace_invites_accepted_by_fkey,
  add constraint workspace_invites_accepted_by_fkey foreign key (accepted_by) references auth.users(id) on delete set null;

alter table public.integrations drop constraint if exists integrations_connected_by_fkey,
  add constraint integrations_connected_by_fkey foreign key (connected_by) references auth.users(id) on delete set null;

alter table public.agency_logins drop constraint if exists agency_logins_created_by_fkey,
  add constraint agency_logins_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.agency_logins drop constraint if exists agency_logins_last_opened_by_fkey,
  add constraint agency_logins_last_opened_by_fkey foreign key (last_opened_by) references auth.users(id) on delete set null;

alter table public.team_tasks drop constraint if exists team_tasks_done_by_fkey,
  add constraint team_tasks_done_by_fkey foreign key (done_by) references auth.users(id) on delete set null;
