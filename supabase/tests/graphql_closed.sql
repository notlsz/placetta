-- GraphQL closed (20261026100000_graphql_closed.sql): neither anon nor a signed-in user can reach the GraphQL endpoint
-- or the pg_graphql extension behind it. Run with scripts/test-db.sh (ends by raising TEST_RESULTS).
do $test$
declare
  res jsonb := '{}'::jsonb; r text; ok boolean;
begin
  res := res || jsonb_build_object('pg_graphql is not installed', not exists (select 1 from pg_extension where extname = 'pg_graphql'));
  foreach r in array array['anon', 'authenticated'] loop
    ok := true;
    if exists (select 1 from pg_namespace where nspname = 'graphql_public') then
      ok := ok and not has_schema_privilege(r, 'graphql_public', 'usage')
        and not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'graphql_public' and has_function_privilege(r, p.oid, 'execute'));
    end if;
    if exists (select 1 from pg_namespace where nspname = 'graphql') then
      ok := ok and not has_schema_privilege(r, 'graphql', 'usage');
    end if;
    res := res || jsonb_build_object(r || ' cannot reach GraphQL', ok);
  end loop;
  -- the server keeps what it had
  res := res || jsonb_build_object('service_role keeps graphql_public', not exists (select 1 from pg_namespace where nspname = 'graphql_public') or has_schema_privilege('service_role', 'graphql_public', 'usage'));
  raise exception 'TEST_RESULTS %', res;
end
$test$;
