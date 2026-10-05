-- OAuth connections finish in the app, not in the callback.
-- oauth-callback exchanges the code, puts the tokens in the vault and records a pending row here.
-- The app then calls integrations {action: "finish", id} with the signed-in user's JWT; only the user who
-- started the flow, in the same workspace, can turn the pending row into an integration.
-- That binds a connection to the account that started it, so a connect link sent to someone else is useless.

create table public.oauth_pending (
  id text primary key check (id ~ '^[0-9a-f]{64}$'),   -- 32 random bytes, hex
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,                                -- who started the flow (from the signed state)
  kind text not null check (kind in ('gmail', 'gcal', 'gdrive', 'outlook_mail', 'outlook_cal', 'dropbox', 'quickbooks', 'slack')),
  secret_id uuid not null,                              -- vault secret with the token bundle
  account text,
  scopes text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
comment on table public.oauth_pending is 'OAuth connections waiting for the app to finish them. Service role only.';

alter table public.oauth_pending enable row level security;  -- no policies: service role only
revoke all on public.oauth_pending from anon, authenticated;
