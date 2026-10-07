-- Security pass: grants match the RLS policies. Safe to run twice.
-- plan_requests: the website may only add a row. TRUNCATE ignores RLS, so it and every other privilege go.
revoke all on public.plan_requests from anon, authenticated;
grant insert on public.plan_requests to anon, authenticated;
-- No policy allows these writes, so the grants only invite mistakes: documents are added, never edited by users;
-- invites are removed through revoke_invite().
revoke update, delete on public.documents from authenticated;
revoke delete on public.workspace_invites from authenticated;
-- Service-only tables, stated outright (RLS with no policy already denies; this keeps it that way if a policy is added).
revoke all on public.stripe_events, public.oauth_pending, public.calendar_feeds from anon, authenticated;
revoke insert, update, delete on public.staff_emails from anon, authenticated;
-- No user role ever needs TRUNCATE (it ignores RLS), TRIGGER or REFERENCES on any table.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
-- Indexes for the self-filing tables' foreign keys.
create index if not exists agent_skills_workspace on public.agent_skills(workspace_id);
create index if not exists team_tasks_filing on public.team_tasks(filing_id);
create index if not exists team_tasks_workspace on public.team_tasks(workspace_id);
create index if not exists team_tasks_done_by on public.team_tasks(done_by);
