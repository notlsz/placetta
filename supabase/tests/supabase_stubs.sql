-- Just enough of Supabase to run Placetta's migrations locally.
do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end $$;
grant usage on schema public to anon, authenticated, service_role;
create schema auth; create schema storage; create schema vault; create schema extensions;
grant usage on schema auth, storage, extensions to anon, authenticated, service_role;
create extension pgcrypto with schema extensions;
create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text, email_confirmed_at timestamptz,
  created_at timestamptz, updated_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb);
create type auth.factor_type as enum ('totp', 'webauthn', 'phone');
create type auth.factor_status as enum ('unverified', 'verified');
create table auth.mfa_factors (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, friendly_name text,
  factor_type auth.factor_type not null, status auth.factor_status not null, created_at timestamptz not null, updated_at timestamptz not null);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text, secret text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language sql as $$ insert into vault.secrets(name, secret) values (new_name, new_secret) returning id $$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null) returns void language sql as $$ update vault.secrets set secret = coalesce(new_secret, secret) where id = secret_id $$;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
-- Supabase grants new public tables and functions to its API roles by default.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, provider text not null);
-- pg_net: requests are queued (net.http_request_queue) instead of sent; the e2e harness (scripts/e2e) delivers them.
create schema if not exists net;
create table net.http_request_queue (id bigserial primary key, method text not null default 'POST', url text not null, headers jsonb,
  body jsonb, timeout_milliseconds int, created_at timestamptz not null default now(), delivered_at timestamptz);
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds int default 5000) returns bigint
language sql as $$ insert into net.http_request_queue (url, headers, body, timeout_milliseconds) values (url, headers, body, timeout_milliseconds) returning id $$;
-- More of GoTrue's auth.users, for the functions that read or delete accounts.
alter table auth.users add column if not exists phone text, add column if not exists deleted_at timestamptz,
  add column if not exists last_sign_in_at timestamptz, add column if not exists is_anonymous boolean not null default false;
-- GoTrue's sessions and refresh tokens (revoke_sessions), and the SAML providers registered with `supabase sso add`.
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz default now());
create table auth.refresh_tokens (id bigserial primary key, token text, user_id varchar(255), session_id uuid references auth.sessions(id) on delete cascade, revoked boolean default false);
create table auth.sso_providers (id uuid primary key, resource_id text, created_at timestamptz default now());
create table auth.sso_domains (id uuid primary key default gen_random_uuid(), sso_provider_id uuid not null references auth.sso_providers(id) on delete cascade, domain text not null);
-- Supabase's GraphQL endpoint: the graphql_public schema the API serves, open to the API roles (pg_graphql itself isn't
-- installed here; 20261026100000_graphql_closed.sql drops it on the live project).
create schema if not exists graphql_public;
create function graphql_public.graphql("operationName" text default null, query text default null, variables jsonb default null, extensions jsonb default null)
  returns jsonb language sql as $$ select '{}'::jsonb $$;
grant usage on schema graphql_public to anon, authenticated, service_role;
grant execute on function graphql_public.graphql(text, text, jsonb, jsonb) to anon, authenticated, service_role;
