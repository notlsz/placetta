-- Agent memory. Safe to run twice.
--   1. Observational memory (src/odeliaMemory/): short, durable facts Odelia keeps per workspace, scoped to the
--      workspace, a brand, a store, a market or a person, each with its source and dates (valid from, valid to: a
--      changed fact is superseded, not lost). Odelia only suggests; an owner or admin approves. Members edit, delete and
--      pin; viewers read. Memory is off until an owner or admin turns it on (agent_memory_settings).
--   2. Briefs: a plain note per workspace, brand, market and store that every run loads first. Members edit them;
--      Odelia's proposed lines wait in agent_memory_proposals until a member approves.
--   3. Conflicts: a nightly check (agent_memory_check) compares memory with the records (filings' confirmation
--      numbers, deadlines' dates, legal entities' names). The record wins; the conflict goes to the owners in Updates.
--   4. Each run's prompt cache use and cost (agent_runs.cache_*), and whether it was a "don't remember this chat" run.
-- Row-level security: rows are read by anyone on the workspace (can_view) and never written from the browser except
-- through the functions below, which check the role. Nothing here holds a secret: a check refuses SSN, card and bank
-- numbers and passwords in every text column, whatever wrote it.

/* ================================ text that may be kept ================================ */

create or replace function public.memory_text_ok(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t is null or (
        t !~ '(^|[^0-9-])[0-9]{3}[- ][0-9]{2}[- ][0-9]{4}([^0-9-]|$)'                       -- SSN or ITIN
    and t !~ '(^|[^0-9])([0-9]{13,19}|[0-9]{4}([ -])[0-9]{4}\3[0-9]{4}\3[0-9]{1,7})([^0-9]|$)'  -- card or account number
    and t !~* '(password|passcode|passwd|api[ _-]?key|secret|token)\s*[:=]\s*\S'             -- a credential
    and t !~* '(routing|account|acct)( number| no\.?| #)?\s*[:#]?\s*[0-9][0-9 -]{4,}');       -- a bank number
$$;

/* ================================ settings ================================ */

create table if not exists public.agent_memory_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  suggest boolean not null default true,
  allow_last4 boolean not null default false,
  cap int not null default 300 check (cap between 10 and 2000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.agent_memory_settings is 'Agent memory per workspace. enabled is off until an owner or admin turns it on (opt-in, disclosed in the privacy policy).';
alter table public.agent_memory_settings enable row level security;
revoke all on public.agent_memory_settings from public, anon, authenticated;
grant select on public.agent_memory_settings to authenticated;
drop policy if exists "Anyone on the workspace reads its memory settings" on public.agent_memory_settings;
create policy "Anyone on the workspace reads its memory settings" on public.agent_memory_settings for select to authenticated using (public.can_view(workspace_id));

/* ================================ memories ================================ */

create table if not exists public.agent_memories (
  id text primary key default gen_random_uuid()::text check (length(id) between 1 and 64),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope_kind text not null default 'workspace' check (scope_kind in ('workspace', 'brand', 'store', 'market', 'person')),
  scope_id text not null default '' check (length(scope_id) <= 80),
  topic text not null default 'company' check (topic in ('company', 'stores', 'markets', 'people', 'preferences', 'rules', 'decisions')),
  entity text not null check (length(entity) between 1 and 120),
  attr text not null check (length(attr) between 1 and 60),
  value text not null default '' check (length(value) <= 300),
  text_en text not null check (length(text_en) between 1 and 300),
  text_zh text not null check (length(text_zh) between 1 and 300),
  source_kind text not null check (source_kind in ('chat', 'remote', 'filing', 'document', 'email', 'portal', 'upload', 'owner', 'record')),
  source_ref text not null default '' check (length(source_ref) <= 200),
  source_title text check (length(source_title) <= 200),
  source_url text check (length(source_url) <= 500),
  source_quote text check (length(source_quote) <= 600),
  observed_at timestamptz not null default now(),
  valid_from date not null default current_date,
  valid_to date,
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'rejected', 'superseded', 'expired')),
  trust text not null default 'agent' check (trust in ('owner', 'agent', 'untrusted', 'record')),
  pinned boolean not null default false,
  critical text check (critical in ('entity', 'license', 'expiry', 'renewal', 'approval', 'case', 'deadline')),
  supersedes text,
  superseded_by text,
  seen int not null default 1 check (seen >= 1),
  last_seen timestamptz,
  ttl_days int check (ttl_days between 1 and 3650),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- nothing from outside is ever approved without a person: an untrusted suggestion becomes approved only through
  -- agent_memory_review, which records who approved it
  constraint agent_memories_untrusted_reviewed check (trust <> 'untrusted' or status <> 'approved' or updated_by is not null),
  constraint agent_memories_no_secrets check (public.memory_text_ok(text_en) and public.memory_text_ok(text_zh) and public.memory_text_ok(value) and public.memory_text_ok(source_quote) and public.memory_text_ok(entity))
);
comment on table public.agent_memories is 'Odelia''s observations about a workspace, each with its source, dates and status. Written by agent-run (suggestions) and the agent_memory_* functions; read by anyone on the workspace.';
create index if not exists agent_memories_ws on public.agent_memories (workspace_id, status, updated_at desc);
create index if not exists agent_memories_slot on public.agent_memories (workspace_id, scope_kind, scope_id, lower(entity), lower(attr)) where valid_to is null;
alter table public.agent_memories enable row level security;
revoke all on public.agent_memories from public, anon, authenticated;
grant select on public.agent_memories to authenticated;
drop policy if exists "Anyone on the workspace reads its memories" on public.agent_memories;
-- a person-scoped memory is that person's alone
create policy "Anyone on the workspace reads its memories" on public.agent_memories for select to authenticated
  using (public.can_view(workspace_id) and (scope_kind <> 'person' or scope_id = auth.uid()::text));

/* ================================ briefs ================================ */

create table if not exists public.agent_memory_briefs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope_kind text not null check (scope_kind in ('workspace', 'brand', 'store', 'market')),
  scope_id text not null default '' check (length(scope_id) <= 80),
  body text not null default '' check (length(body) <= 4000 and public.memory_text_ok(body)),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, scope_kind, scope_id)
);
alter table public.agent_memory_briefs enable row level security;
revoke all on public.agent_memory_briefs from public, anon, authenticated;
grant select on public.agent_memory_briefs to authenticated;
drop policy if exists "Anyone on the workspace reads its briefs" on public.agent_memory_briefs;
create policy "Anyone on the workspace reads its briefs" on public.agent_memory_briefs for select to authenticated using (public.can_view(workspace_id));

create table if not exists public.agent_memory_proposals (
  id text primary key default gen_random_uuid()::text check (length(id) between 1 and 64),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope_kind text not null default 'workspace' check (scope_kind in ('workspace', 'brand', 'store', 'market')),
  scope_id text not null default '' check (length(scope_id) <= 80),
  line text not null check (length(line) between 1 and 300 and public.memory_text_ok(line)),
  why text not null default '' check (length(why) <= 200),
  source_kind text not null default 'chat' check (source_kind in ('chat', 'remote', 'filing', 'document', 'email', 'portal', 'upload', 'owner', 'record')),
  source_ref text not null default '' check (length(source_ref) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists agent_memory_proposals_ws on public.agent_memory_proposals (workspace_id, created_at);
alter table public.agent_memory_proposals enable row level security;
revoke all on public.agent_memory_proposals from public, anon, authenticated;
grant select on public.agent_memory_proposals to authenticated;
drop policy if exists "Anyone on the workspace reads its brief proposals" on public.agent_memory_proposals;
create policy "Anyone on the workspace reads its brief proposals" on public.agent_memory_proposals for select to authenticated using (public.can_view(workspace_id));

/* ================================ conflicts ================================ */

create table if not exists public.agent_memory_conflicts (
  id text primary key default gen_random_uuid()::text,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  memory_id text not null references public.agent_memories(id) on delete cascade,
  record text not null check (length(record) <= 200),
  memory_value text not null default '',
  record_value text not null default '',
  found_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (memory_id, record_value)
);
alter table public.agent_memory_conflicts enable row level security;
revoke all on public.agent_memory_conflicts from public, anon, authenticated;
grant select on public.agent_memory_conflicts to authenticated;
drop policy if exists "Anyone on the workspace reads its memory conflicts" on public.agent_memory_conflicts;
create policy "Anyone on the workspace reads its memory conflicts" on public.agent_memory_conflicts for select to authenticated using (public.can_view(workspace_id));

/* ================================ runs: cache and temporary chats ================================ */

alter table public.agent_runs add column if not exists no_memory boolean not null default false;
alter table public.agent_runs add column if not exists cache_calls int;
alter table public.agent_runs add column if not exists input_tokens int;
alter table public.agent_runs add column if not exists cache_read_tokens int;
alter table public.agent_runs add column if not exists cache_write_tokens int;
alter table public.agent_runs add column if not exists output_tokens int;
alter table public.agent_runs add column if not exists cost_usd numeric(12, 6);
alter table public.agent_runs add column if not exists prefix_hash text;
comment on column public.agent_runs.no_memory is '"Don''t remember this chat": the run reads no memory beyond the records and briefs, and saves none.';
comment on column public.agent_runs.cache_read_tokens is 'Input tokens the providers served from their prompt cache over the whole run. Hit rate = read / (input + read + write).';
grant select (no_memory, cache_calls, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, cost_usd) on public.agent_runs to authenticated;

create or replace function public.agent_run_cache(p_id uuid, p_calls int, p_in int, p_read int, p_write int, p_out int, p_cost numeric, p_prefix text) returns void
language sql security definer set search_path = '' as $$
  update public.agent_runs set cache_calls = greatest(coalesce(p_calls, 0), 0), input_tokens = greatest(coalesce(p_in, 0), 0),
    cache_read_tokens = greatest(coalesce(p_read, 0), 0), cache_write_tokens = greatest(coalesce(p_write, 0), 0),
    output_tokens = greatest(coalesce(p_out, 0), 0), cost_usd = greatest(coalesce(p_cost, 0), 0), prefix_hash = left(p_prefix, 32)
   where id = p_id;
$$;
revoke execute on function public.agent_run_cache(uuid, int, int, int, int, int, numeric, text) from public, anon, authenticated;
grant execute on function public.agent_run_cache(uuid, int, int, int, int, int, numeric, text) to service_role;

-- The workspace's cache hit rate and cost per run over the last 30 days, for the team's Agent health page.
create or replace function public.agent_cache_stats(ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare j jsonb;
begin
  if not (public.can_view(ws) or public.is_staff()) then raise exception 'Not your workspace.'; end if;
  select jsonb_build_object('runs', count(*), 'hit_rate', round(coalesce(sum(cache_read_tokens)::numeric / nullif(sum(coalesce(input_tokens, 0) + coalesce(cache_read_tokens, 0) + coalesce(cache_write_tokens, 0)), 0), 0), 4),
    'cost_per_run', round(coalesce(avg(cost_usd), 0), 6), 'read_tokens', coalesce(sum(cache_read_tokens), 0), 'input_tokens', coalesce(sum(input_tokens), 0))
    into j from public.agent_runs where workspace_id = ws and created_at > now() - interval '30 days' and cache_calls is not null;
  return j;
end $$;
revoke execute on function public.agent_cache_stats(uuid) from public, anon;
grant execute on function public.agent_cache_stats(uuid) to authenticated;

/* ================================ what people do ================================ */

-- An audit entry for memory changes (who did what, never the memory's words beyond a short label).
create or replace function public.memory_audit(ws uuid, en text, zh text, d_en text default null, d_zh text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (workspace_id, actor, actor_id, action, object, detail)
  values (ws, 'you', auth.uid(), jsonb_build_object('en', en, 'zh', zh), jsonb_build_object('en', 'Agent memory', 'zh', '助理记忆'),
    case when d_en is null then null else jsonb_build_object('en', left(d_en, 160), 'zh', left(coalesce(d_zh, d_en), 160)) end);
$$;
revoke execute on function public.memory_audit(uuid, text, text, text, text) from public, anon, authenticated;

-- Turn memory on or off, and its options. Owners and admins.
create or replace function public.agent_memory_settings_set(ws uuid, p_enabled boolean, p_suggest boolean default null, p_allow_last4 boolean default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.agent_memory_settings;
begin
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can change agent memory settings.'; end if;
  insert into public.agent_memory_settings (workspace_id, enabled, suggest, allow_last4, updated_by, updated_at)
  values (ws, coalesce(p_enabled, false), coalesce(p_suggest, true), coalesce(p_allow_last4, false), auth.uid(), now())
  on conflict (workspace_id) do update set enabled = coalesce(p_enabled, agent_memory_settings.enabled), suggest = coalesce(p_suggest, agent_memory_settings.suggest),
    allow_last4 = coalesce(p_allow_last4, agent_memory_settings.allow_last4), updated_by = auth.uid(), updated_at = now()
  returning * into s;
  perform public.memory_audit(ws, case when s.enabled then 'Turned agent memory on' else 'Turned agent memory off' end, case when s.enabled then '开启了助理记忆' else '关闭了助理记忆' end);
  return to_jsonb(s);
end $$;

-- Approve or reject a suggestion. Owners and admins (Odelia suggests, an owner decides). Approving replaces the fact it
-- was marked to replace, or the current fact in the same slot; refused when memory is full.
create or replace function public.agent_memory_review(p_id text, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.agent_memories; cap int; n int;
begin
  select * into m from public.agent_memories where id = p_id;
  if m.id is null or not public.is_admin(m.workspace_id) then raise exception 'Only an owner or admin of this workspace can approve memories.'; end if;
  if m.status <> 'suggested' then raise exception 'That memory isn''t waiting for review.'; end if;
  if not p_approve then
    update public.agent_memories set status = 'rejected', updated_by = auth.uid(), updated_at = now() where id = p_id returning * into m;
    return to_jsonb(m);
  end if;
  select coalesce((select s.cap from public.agent_memory_settings s where s.workspace_id = m.workspace_id), 300) into cap;
  select count(*) into n from public.agent_memories where workspace_id = m.workspace_id and status = 'approved' and valid_to is null;
  if n >= cap then raise exception 'Memory is full. Remove some memories first.'; end if;
  update public.agent_memories o set status = 'superseded', valid_to = current_date, superseded_by = m.id, updated_by = auth.uid(), updated_at = now()
   where o.workspace_id = m.workspace_id and o.id <> m.id and o.status = 'approved' and o.valid_to is null
     and (o.id = m.supersedes or (o.scope_kind = m.scope_kind and o.scope_id = m.scope_id and lower(o.entity) = lower(m.entity) and lower(o.attr) = lower(m.attr)));
  update public.agent_memories set status = 'approved', supersedes = null, updated_by = auth.uid(), updated_at = now() where id = p_id returning * into m;
  perform public.memory_audit(m.workspace_id, 'Approved a memory', '批准了一条记忆', m.topic, m.topic);
  return to_jsonb(m);
end $$;

-- Edit a memory's words. Members and up (viewers read only).
create or replace function public.agent_memory_edit(p_id text, p_en text, p_zh text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.agent_memories;
begin
  select * into m from public.agent_memories where id = p_id;
  if m.id is null or not public.is_member(m.workspace_id) or (m.scope_kind = 'person' and m.scope_id <> auth.uid()::text) then raise exception 'You can''t edit memories in this workspace.'; end if;
  if not public.memory_text_ok(p_en) or not public.memory_text_ok(p_zh) then raise exception 'Memory never keeps ID numbers, card or bank numbers or passwords.'; end if;
  update public.agent_memories set text_en = left(btrim(p_en), 300), text_zh = left(coalesce(nullif(btrim(p_zh), ''), btrim(p_en)), 300), updated_by = auth.uid(), updated_at = now()
   where id = p_id returning * into m;
  return to_jsonb(m);
end $$;

-- Delete one memory, or pin it so it is always in context. Members and up.
create or replace function public.agent_memory_delete(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.agent_memories;
begin
  select * into m from public.agent_memories where id = p_id;
  if m.id is null or not public.is_member(m.workspace_id) or (m.scope_kind = 'person' and m.scope_id <> auth.uid()::text) then raise exception 'You can''t delete memories in this workspace.'; end if;
  delete from public.agent_memories where id = p_id;
  perform public.memory_audit(m.workspace_id, 'Deleted a memory', '删除了一条记忆', m.topic, m.topic);
end $$;
create or replace function public.agent_memory_pin(p_id text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  select workspace_id into ws from public.agent_memories where id = p_id;
  if ws is null or not public.is_member(ws) then raise exception 'You can''t change memories in this workspace.'; end if;
  update public.agent_memories set pinned = coalesce(p_on, false), updated_by = auth.uid(), updated_at = now() where id = p_id;
end $$;

-- Forget everything Odelia remembers about this workspace: memories, suggestions, proposals and conflicts. The briefs
-- (the owners' own notes) stay unless p_briefs. Owners and admins.
create or replace function public.agent_memory_forget_all(ws uuid, p_briefs boolean default false) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_admin(ws) then raise exception 'Only an owner or admin can clear agent memory.'; end if;
  delete from public.agent_memories where workspace_id = ws;
  get diagnostics n = row_count;
  delete from public.agent_memory_proposals where workspace_id = ws;
  if coalesce(p_briefs, false) then delete from public.agent_memory_briefs where workspace_id = ws; end if;
  perform public.memory_audit(ws, 'Cleared agent memory', '清空了助理记忆', n || ' memories', n || ' 条记忆');
  return n;
end $$;

-- A brief's text. Members and up.
create or replace function public.agent_memory_brief_set(ws uuid, p_kind text, p_scope text, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.agent_memory_briefs;
begin
  if not public.is_member(ws) then raise exception 'You can''t edit briefs in this workspace.'; end if;
  if not public.memory_text_ok(p_body) then raise exception 'A brief never keeps ID numbers, card or bank numbers or passwords.'; end if;
  insert into public.agent_memory_briefs (workspace_id, scope_kind, scope_id, body, updated_by, updated_at) values (ws, p_kind, coalesce(p_scope, ''), left(coalesce(p_body, ''), 4000), auth.uid(), now())
  on conflict (workspace_id, scope_kind, scope_id) do update set body = excluded.body, updated_by = auth.uid(), updated_at = now()
  returning * into b;
  return to_jsonb(b);
end $$;

-- Approve (the line joins its brief) or reject one of Odelia's proposed lines. Members and up.
create or replace function public.agent_memory_proposal_review(p_id text, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.agent_memory_proposals;
begin
  select * into p from public.agent_memory_proposals where id = p_id;
  if p.id is null or not public.is_member(p.workspace_id) then raise exception 'You can''t review briefs in this workspace.'; end if;
  if p_approve then
    insert into public.agent_memory_briefs (workspace_id, scope_kind, scope_id, body, updated_by, updated_at) values (p.workspace_id, p.scope_kind, p.scope_id, '- ' || p.line, auth.uid(), now())
    on conflict (workspace_id, scope_kind, scope_id) do update set body = left(case when agent_memory_briefs.body = '' then '' else agent_memory_briefs.body || E'\n' end || '- ' || p.line, 4000), updated_by = auth.uid(), updated_at = now();
  end if;
  delete from public.agent_memory_proposals where id = p_id;
end $$;

-- Settle a conflict between memory and the records: 'record' updates the memory to the record (the old value stays in
-- its history), 'delete' removes the memory, 'dismiss' closes the conflict. Members and up.
create or replace function public.agent_memory_conflict_settle(p_id text, p_how text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.agent_memory_conflicts; m public.agent_memories; nid text := gen_random_uuid()::text;
begin
  select * into c from public.agent_memory_conflicts where id = p_id;
  if c.id is null or not public.is_member(c.workspace_id) then raise exception 'You can''t settle conflicts in this workspace.'; end if;
  select * into m from public.agent_memories where id = c.memory_id;
  if p_how = 'record' and m.id is not null then
    insert into public.agent_memories (id, workspace_id, scope_kind, scope_id, topic, entity, attr, value, text_en, text_zh, source_kind, source_ref, status, trust, pinned, critical, created_by, updated_by)
    values (nid, m.workspace_id, m.scope_kind, m.scope_id, m.topic, m.entity, m.attr, c.record_value, replace(m.text_en, m.value, c.record_value), replace(m.text_zh, m.value, c.record_value),
      'record', c.record, 'approved', 'record', m.pinned, m.critical, auth.uid(), auth.uid());
    update public.agent_memories set status = 'superseded', valid_to = current_date, superseded_by = nid, updated_at = now() where id = m.id;
  elsif p_how = 'delete' and m.id is not null then
    delete from public.agent_memories where id = m.id;
    return;
  elsif p_how not in ('record', 'delete', 'dismiss') then raise exception 'Unknown choice.';
  end if;
  update public.agent_memory_conflicts set resolved_at = now(), resolved_by = auth.uid() where id = p_id;
end $$;

revoke execute on function public.agent_memory_settings_set(uuid, boolean, boolean, boolean), public.agent_memory_review(text, boolean), public.agent_memory_edit(text, text, text),
  public.agent_memory_delete(text), public.agent_memory_pin(text, boolean), public.agent_memory_forget_all(uuid, boolean), public.agent_memory_brief_set(uuid, text, text, text),
  public.agent_memory_proposal_review(text, boolean), public.agent_memory_conflict_settle(text, text) from public, anon;
grant execute on function public.agent_memory_settings_set(uuid, boolean, boolean, boolean), public.agent_memory_review(text, boolean), public.agent_memory_edit(text, text, text),
  public.agent_memory_delete(text), public.agent_memory_pin(text, boolean), public.agent_memory_forget_all(uuid, boolean), public.agent_memory_brief_set(uuid, text, text, text),
  public.agent_memory_proposal_review(text, boolean), public.agent_memory_conflict_settle(text, text) to authenticated;

/* ================================ the nightly check ================================ */

-- Memory against the records, every night: a current memory about a filing, a deadline or a legal entity that says
-- something else than the record becomes a conflict, and the owners hear about it in Updates. It also ages memory out:
-- suggestions nobody answered in 30 days, and approved memories past their time to live (never pinned or critical ones).
create or replace function public.agent_memory_check() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record; cid text;
begin
  for r in
    select m.id, m.workspace_id, m.value, rec.ref, rec.val
      from public.agent_memories m
      join lateral (
        (select 'filing:' || f.id::text as ref, f.confirmation_number as val
          from public.filings f
         where m.entity like 'app:%' and lower(m.attr) in ('confirmation', 'confirmation number', 'case', 'case number')
           and f.workspace_id = m.workspace_id and f.app_id = substr(m.entity, 5) and f.confirmation_number is not null
         order by f.approved_at desc limit 1)
        union all
        select 'deadline:' || (d->>'id'), d->>'date'
          from public.workspaces w, jsonb_array_elements(coalesce(w.state->'deadlines', '[]'::jsonb)) d
         where m.entity like 'deadline:%' and lower(m.attr) in ('date', 'due', 'due on', 'renews', 'renews on')
           and w.id = m.workspace_id and d->>'id' = substr(m.entity, 10)
        union all
        select 'entity:' || (e->>'id'), e->>'name'
          from public.workspaces w, jsonb_array_elements(coalesce(w.state->'entities', '[]'::jsonb)) e
         where m.entity like 'entity:%' and lower(m.attr) in ('name', 'legal name', 'files under')
           and w.id = m.workspace_id and e->>'id' = substr(m.entity, 8)
      ) rec on true
     where m.status = 'approved' and m.valid_to is null and rec.val is not null
       and lower(btrim(m.value)) <> lower(btrim(rec.val))
  loop
    insert into public.agent_memory_conflicts (workspace_id, memory_id, record, memory_value, record_value)
    values (r.workspace_id, r.id, r.ref, r.value, r.val) on conflict (memory_id, record_value) do nothing returning id into cid;
    if cid is not null then
      n := n + 1;
      insert into public.updates (workspace_id, kind, title, body, dedupe)
      values (r.workspace_id, 'agent', jsonb_build_object('en', 'Odelia''s memory disagrees with your records', 'zh', 'Odelia 的记忆与您的记录不一致'),
        jsonb_build_object('en', 'Memory says "' || left(r.value, 80) || '", the record says "' || left(r.val, 80) || '". The record is used. Settle it in Settings, Agent memory.',
                           'zh', '记忆为“' || left(r.value, 80) || '”，记录为“' || left(r.val, 80) || '”。以记录为准。请在设置的助理记忆中处理。'),
        'memory-conflict:' || cid)
      on conflict (workspace_id, dedupe) do nothing;
    end if;
    cid := null;
  end loop;
  update public.agent_memories set status = 'expired', updated_at = now()
   where status = 'suggested' and observed_at < now() - interval '30 days';
  update public.agent_memories set status = 'expired', updated_at = now()
   where status = 'approved' and valid_to is null and not pinned and critical is null and ttl_days is not null
     and coalesce(last_seen, observed_at) < now() - make_interval(days => ttl_days);
  return n;
end $$;
revoke execute on function public.agent_memory_check() from public, anon, authenticated;
grant execute on function public.agent_memory_check() to service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; agent memory is not checked against the records on a schedule.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-memory-check';
  perform cron.schedule('placetta-memory-check', '47 8 * * *', 'select public.agent_memory_check()');
end $$;
