-- GraphQL closed (docs/SECURITY-AUDIT.md, Code review, 2026-10-22). Placetta never uses GraphQL: the app and the
-- website talk to PostgREST and the server functions. pg_graphql, which Supabase used to turn on in every project, lets
-- anyone holding the publishable key ask /graphql/v1 to describe every table and column the API roles are granted,
-- and Supabase grants every public table to anon and authenticated by default. Row-level security still hides the
-- rows, but the schema map is free reconnaissance. So the extension goes, and the API roles lose the schemas it
-- serves. Idempotent: safe to run again, and on a project where pg_graphql is already off.
do $$
begin
  begin
    drop extension if exists pg_graphql;
  exception when others then
    -- a project where the migration role may not drop it: the revokes below still close it to the API roles
    raise notice 'pg_graphql not dropped: %', sqlerrm;
  end;
  if exists (select 1 from pg_namespace where nspname = 'graphql_public') then
    revoke execute on all functions in schema graphql_public from public, anon, authenticated;
    revoke usage on schema graphql_public from public, anon, authenticated;
  end if;
  if exists (select 1 from pg_namespace where nspname = 'graphql') then
    revoke execute on all functions in schema graphql from public, anon, authenticated;
    revoke usage on schema graphql from public, anon, authenticated;
  end if;
end $$;
