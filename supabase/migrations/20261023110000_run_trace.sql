-- A run's trace for the team (src/trace.ts): each model call and tool call with when it started, how long it took, and
-- for model calls the model, tokens, prompt-cache reads and writes and the price. Names and numbers only, no prompt or
-- tool input. agent-run saves it when a run ends; the Replay on Agent health (staff only) shows it.
-- Safe to run twice.

alter table public.agent_runs add column if not exists trace jsonb;
alter table public.agent_runs drop constraint if exists agent_runs_trace_check;
alter table public.agent_runs add constraint agent_runs_trace_check check (trace is null or (jsonb_typeof(trace) = 'array' and jsonb_array_length(trace) <= 150));

create or replace function public.agent_run_trace(p_id uuid, p_trace jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.agent_runs set trace = case when jsonb_typeof(p_trace) = 'array' and jsonb_array_length(p_trace) <= 150 and length(p_trace::text) <= 60000 then p_trace end
   where id = p_id;
$$;
revoke execute on function public.agent_run_trace(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.agent_run_trace(uuid, jsonb) to service_role;

-- The Replay, as before, with the trace and the run's own token, cache and cost totals (20261022211905_agent_memory).
create or replace function public.agent_run_replay(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.agent_runs; done_at timestamptz;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  select * into r from public.agent_runs where id = p_id;
  if r.id is null then raise exception 'No such run.'; end if;
  done_at := public.agent_run_end(r);
  return jsonb_build_object(
    'id', r.id, 'workspace_id', r.workspace_id, 'business', (select name from public.workspaces where id = r.workspace_id),
    'kind', r.kind, 'channel', r.channel, 'status', r.status, 'title', r.title, 'prompt', left(r.prompt, 600), 'error', r.error,
    'created_at', r.created_at, 'first_reply_at', r.first_text_at, 'done_at', done_at,
    'tool_calls', r.tool_calls, 'tool_errors', r.tool_errors, 'steps', r.steps,
    'reply', case when jsonb_typeof(r.reply->'text') = 'array' then r.reply->'text' end,
    'calls', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'role', e.role, 'provider', e.provider, 'model', e.model, 'cost_usd', e.cost_usd, 'saver', e.saver) order by e.at), '[]'::jsonb)
      from public.ai_events e where e.workspace_id = r.workspace_id and e.at >= r.created_at and e.at <= coalesce(done_at, r.created_at + interval '15 minutes') + interval '5 seconds'),
    'cost_usd', public.agent_run_cost(r.workspace_id, r.created_at, done_at),
    'checks', (select coalesce(jsonb_agg(jsonb_build_object('job_id', c.job_id, 'passed', c.passed, 'of', c.of, 'at', c.at) order by c.at), '[]'::jsonb)
      from public.odelia_job_checks c where c.run_id = r.id),
    'trace', coalesce(r.trace, '[]'::jsonb),
    'run_tokens', jsonb_build_object('calls', r.cache_calls, 'input', r.input_tokens, 'output', r.output_tokens, 'cache_read', r.cache_read_tokens, 'cache_write', r.cache_write_tokens, 'cost_usd', r.cost_usd));
end $$;
