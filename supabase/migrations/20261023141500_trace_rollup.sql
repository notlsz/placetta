-- The team's cross-run views of Odelia's traces (src/cloud/OpsMore.tsx, Agent health), staff only:
--   agent_usage_by_workspace: cost, tokens, cache reads and tool errors per workspace and day, from each run's own
--     totals (agent_runs.input_tokens ... cost_usd, 20261022211905_agent_memory), as Langfuse's and LangSmith's
--     cost dashboards group by project and day.
--   agent_trace_find: runs whose trace (agent_runs.trace, 20261023110000_run_trace) has a call to a given tool, a
--     failed call or a slow one ("every run where fill_fields failed this week").
-- Names and numbers only, as the trace itself. Safe to run twice.

create or replace function public.agent_usage_by_workspace(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d int := greatest(1, least(coalesce(p_days, 14), 90));
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.day desc, x.cost_usd desc)
      from (
        select r.workspace_id, w.name as business, (r.created_at at time zone 'UTC')::date as day, count(*)::int as runs,
               coalesce(sum(r.input_tokens), 0)::bigint as input, coalesce(sum(r.output_tokens), 0)::bigint as output,
               coalesce(sum(r.cache_read_tokens), 0)::bigint as cache_read, coalesce(sum(r.cache_write_tokens), 0)::bigint as cache_write,
               round(coalesce(sum(r.cost_usd), 0)::numeric, 6) as cost_usd,
               coalesce(sum(r.tool_calls), 0)::int as tool_calls, coalesce(sum(r.tool_errors), 0)::int as tool_errors
          from public.agent_runs r
          left join public.workspaces w on w.id = r.workspace_id
         where r.created_at >= now() - make_interval(days => d)
         group by r.workspace_id, w.name, (r.created_at at time zone 'UTC')::date
         order by day desc, cost_usd desc
         limit 500
      ) x), '[]'::jsonb);
end $$;
revoke execute on function public.agent_usage_by_workspace(int) from public, anon;
grant execute on function public.agent_usage_by_workspace(int) to authenticated;

create or replace function public.agent_trace_find(p_tool text default null, p_failed boolean default false, p_slow_ms int default null, p_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d int := greatest(1, least(coalesce(p_days, 7), 90));
        t text := nullif(left(trim(coalesce(p_tool, '')), 80), '');
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select r.id, w.name as business, r.kind, r.channel, r.status, r.title, left(r.prompt, 160) as prompt, r.created_at,
               extract(epoch from (r.first_text_at - r.created_at))::int as reply_s,
               extract(epoch from (public.agent_run_end(r) - r.created_at))::int as done_s,
               coalesce(r.cost_usd, 0) as cost_usd, r.tool_calls, r.tool_errors, m.hits
          from public.agent_runs r
          left join public.workspaces w on w.id = r.workspace_id
          cross join lateral (
            select count(*)::int as hits from jsonb_array_elements(r.trace) s
             where (t is null or s->>'n' = t)
               and (not coalesce(p_failed, false) or s->>'ok' = 'false')
               and (p_slow_ms is null or coalesce((s->>'ms')::numeric, 0) >= p_slow_ms)
          ) m
         where r.created_at >= now() - make_interval(days => d)
           and r.trace is not null and jsonb_typeof(r.trace) = 'array'
           and m.hits > 0
         order by r.created_at desc
         limit 50
      ) x), '[]'::jsonb);
end $$;
revoke execute on function public.agent_trace_find(text, boolean, int, int) from public, anon;
grant execute on function public.agent_trace_find(text, boolean, int, int) to authenticated;
