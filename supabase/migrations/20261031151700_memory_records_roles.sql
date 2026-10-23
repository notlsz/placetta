-- Agent memory tied to the records, checked again when a rule changes, and shared across the team by role. Safe to run
-- twice. Tests: supabase/tests/memory_records.sql.
--   1. Record links. A memory about a filing, an application, a deadline, a legal entity, a store or an official form
--      carries the record it is about (record_kind, record_id), set from its entity key ("app:sign", "form:ca-seller")
--      by a trigger, so every writer gets it: agent-run, the app, an import.
--   2. Re-verification. When the sweeper finds that an agency page Placetta quotes changed (a qa_findings 'drift' or
--      'fee' finding, new or reopened), every memory tied to that form, to an application filed on it, or read from that
--      page is marked 'recheck' with the reason, and the owners hear about it once a day in Updates. A filing that
--      reaches a decision (needs info, accepted, rejected) or gets a new confirmation number does the same for the
--      memories tied to it. A person settles each one: still true (confirmed) or retire it (expired, kept in history).
--      Claude and ChatGPT keep a memory until someone deletes it; here a changed rule says so.
--   3. Roles. A team memory is for the whole team (visibility 'team') or for owners and admins only ('admins': the
--      landlord's rent terms, a dispute with an agency). Members and viewers never read, edit or delete an admins-only
--      memory; an owner or admin sets it. A person's own memory (scope person) stays theirs alone, and now so do the
--      conflicts and re-checks raised about it (the conflicts policy let any teammate read its value).
--   4. Each person's own switches, copied from ChatGPT's Personalization settings ("Reference saved memories",
--      "Reference chat history"): whether their runs read the saved memories and search their own past chats.
-- Nothing here holds a secret; every text column stays under memory_text_ok through agent_memories' own check.

/* ================================ 1. record links ================================ */

alter table public.agent_memories add column if not exists record_kind text
  check (record_kind is null or record_kind in ('filing', 'application', 'deadline', 'entity', 'store', 'form'));
alter table public.agent_memories add column if not exists record_id text check (record_id is null or length(record_id) between 1 and 120);
comment on column public.agent_memories.record_kind is 'The record this memory is about, from its entity key (app:, filing:, deadline:, entity:, store:, form:). Set by agent_memories_link.';

/* ================================ 2. re-verification ================================ */

alter table public.agent_memories add column if not exists verify text not null default 'current' check (verify in ('current', 'recheck', 'confirmed'));
alter table public.agent_memories add column if not exists verify_reason jsonb check (verify_reason is null or (jsonb_typeof(verify_reason) = 'object' and verify_reason ? 'en'));
alter table public.agent_memories add column if not exists verify_at timestamptz;
alter table public.agent_memories add column if not exists verified_by uuid references auth.users(id) on delete set null;
comment on column public.agent_memories.verify is 'current: nothing has changed since it was kept. recheck: the rule or record behind it changed (verify_reason says what). confirmed: a person checked it after a change.';

/* ================================ 3. roles ================================ */

alter table public.agent_memories add column if not exists visibility text not null default 'team' check (visibility in ('team', 'admins'));
comment on column public.agent_memories.visibility is 'team: everyone on the workspace reads it. admins: only owners and admins read, edit, delete or are answered with it.';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agent_memories_person_team') then
    alter table public.agent_memories add constraint agent_memories_person_team check (scope_kind <> 'person' or visibility = 'team');
  end if;
end $$;
create index if not exists agent_memories_record on public.agent_memories (workspace_id, record_kind, record_id) where record_kind is not null;
create index if not exists agent_memories_recheck on public.agent_memories (workspace_id) where verify = 'recheck';

-- The entity key names the record. A plain name ("Bayou Realty") links nothing.
create or replace function public.agent_memories_link() returns trigger
language plpgsql set search_path = '' as $$
declare k text := split_part(coalesce(new.entity, ''), ':', 1); v text := substr(coalesce(new.entity, ''), length(split_part(coalesce(new.entity, ''), ':', 1)) + 2);
begin
  if new.record_kind is null and position(':' in coalesce(new.entity, '')) > 1 and length(v) between 1 and 120 then
    new.record_kind := case k when 'app' then 'application' when 'filing' then 'filing' when 'deadline' then 'deadline' when 'entity' then 'entity' when 'store' then 'store' when 'form' then 'form' else null end;
    if new.record_kind is not null then new.record_id := v; end if;
  end if;
  return new;
end $$;
drop trigger if exists agent_memories_link on public.agent_memories;
create trigger agent_memories_link before insert or update of entity on public.agent_memories for each row execute function public.agent_memories_link();
-- memories kept before this migration
update public.agent_memories set entity = entity where record_kind is null and position(':' in entity) > 1;

-- Who may read a memory: the workspace, a person's own, and admins-only for owners and admins.
create or replace function public.memory_visible(ws uuid, p_scope text, p_scope_id text, p_vis text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_view(ws) and (p_scope <> 'person' or p_scope_id = auth.uid()::text) and (coalesce(p_vis, 'team') = 'team' or public.is_admin(ws));
$$;
revoke execute on function public.memory_visible(uuid, text, text, text) from public, anon;
grant execute on function public.memory_visible(uuid, text, text, text) to authenticated;

drop policy if exists "Anyone on the workspace reads its memories" on public.agent_memories;
drop policy if exists "Memories by scope and role" on public.agent_memories;
create policy "Memories by scope and role" on public.agent_memories for select to authenticated
  using (public.memory_visible(workspace_id, scope_kind, scope_id, visibility));

-- A conflict shows the memory's value: it is read only by whoever may read the memory.
drop policy if exists "Anyone on the workspace reads its memory conflicts" on public.agent_memory_conflicts;
drop policy if exists "Memory conflicts follow their memory" on public.agent_memory_conflicts;
create policy "Memory conflicts follow their memory" on public.agent_memory_conflicts for select to authenticated
  using (exists (select 1 from public.agent_memories m where m.id = memory_id and public.memory_visible(m.workspace_id, m.scope_kind, m.scope_id, m.visibility)));

-- The functions that change a memory, again, with the person and role checks: a person's memory is theirs; an
-- admins-only memory is owners' and admins'.
create or replace function public.memory_may_change(m public.agent_memories) returns boolean
language sql stable security definer set search_path = '' as $$
  select m.id is not null and public.is_member(m.workspace_id) and (m.scope_kind <> 'person' or m.scope_id = auth.uid()::text)
     and (m.visibility = 'team' or public.is_admin(m.workspace_id));
$$;
revoke execute on function public.memory_may_change(public.agent_memories) from public, anon, authenticated;

create or replace function public.agent_memory_edit(p_id text, p_en text, p_zh text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.agent_memories;
begin
  select * into m from public.agent_memories where id = p_id;
  if not public.memory_may_change(m) then raise exception 'You can''t edit memories in this workspace.'; end if;
  if not public.memory_text_ok(p_en) or not public.memory_text_ok(p_zh) then raise exception 'Memory never keeps ID numbers, card or bank numbers or passwords.'; end if;
  update public.agent_memories set text_en = left(btrim(p_en), 300), text_zh = left(coalesce(nullif(btrim(p_zh), ''), btrim(p_en)), 300), updated_by = auth.uid(), updated_at = now()
   where id = p_id returning * into m;
  return to_jsonb(m);
end $$;

create or replace function public.agent_memory_delete(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.agent_memories;
begin
  select * into m from public.agent_memories where id = p_id;
  if not public.memory_may_change(m) then raise exception 'You can''t delete memories in this workspace.'; end if;
  delete from public.agent_memories where id = p_id;
  perform public.memory_audit(m.workspace_id, 'Deleted a memory', '删除了一条记忆', m.topic, m.topic);
end $$;

create or replace function public.agent_memory_pin(p_id text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.agent_memories;
begin
  select * into m from public.agent_memories where id = p_id;
  if not public.memory_may_change(m) then raise exception 'You can''t change memories in this workspace.'; end if;
  update public.agent_memories set pinned = coalesce(p_on, false), updated_by = auth.uid(), updated_at = now() where id = p_id;
end $$;

-- Approving stays with owners and admins; a person's own suggestion (an import) only by that person.
create or replace function public.agent_memory_review(p_id text, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.agent_memories; cap int; n int;
begin
  select * into m from public.agent_memories where id = p_id;
  if m.id is null or not public.is_admin(m.workspace_id) or (m.scope_kind = 'person' and m.scope_id <> auth.uid()::text) then raise exception 'Only an owner or admin of this workspace can approve memories.'; end if;
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

-- Who reads a team memory: the whole team, or owners and admins only. Owners and admins set it; never on a person's own.
create or replace function public.agent_memory_visibility_set(p_id text, p_visibility text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.agent_memories;
begin
  select * into m from public.agent_memories where id = p_id;
  if m.id is null or not public.is_admin(m.workspace_id) or not public.mfa_ok() then raise exception 'Only an owner or admin can choose who sees a memory.'; end if;
  if p_visibility not in ('team', 'admins') then raise exception 'Choose team or admins.'; end if;
  if m.scope_kind = 'person' then raise exception 'A personal memory is already yours alone.'; end if;
  update public.agent_memories set visibility = p_visibility, updated_by = auth.uid(), updated_at = now() where id = p_id returning * into m;
  perform public.memory_audit(m.workspace_id, case when p_visibility = 'admins' then 'Made a memory owners and admins only' else 'Shared a memory with the team' end,
    case when p_visibility = 'admins' then '将一条记忆设为仅所有者和管理员可见' else '将一条记忆共享给团队' end, m.topic, m.topic);
  return to_jsonb(m);
end $$;

-- A memory marked for re-checking, settled: still true (confirmed, with who and when) or retired (expired, kept in the
-- history). Anyone who may change the memory.
create or replace function public.agent_memory_reverify(p_id text, p_still_true boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.agent_memories;
begin
  select * into m from public.agent_memories where id = p_id;
  if not public.memory_may_change(m) then raise exception 'You can''t change memories in this workspace.'; end if;
  if coalesce(p_still_true, false) then
    update public.agent_memories set verify = 'confirmed', verify_at = now(), verified_by = auth.uid(), updated_at = now() where id = p_id returning * into m;
    perform public.memory_audit(m.workspace_id, 'Confirmed a memory after a rule changed', '规则变化后确认了一条记忆', m.topic, m.topic);
  else
    update public.agent_memories set status = 'expired', valid_to = current_date, verify = 'confirmed', verify_at = now(), verified_by = auth.uid(), updated_at = now() where id = p_id returning * into m;
    perform public.memory_audit(m.workspace_id, 'Retired a memory after a rule changed', '规则变化后停用了一条记忆', m.topic, m.topic);
  end if;
  return to_jsonb(m);
end $$;

revoke execute on function public.agent_memory_edit(text, text, text), public.agent_memory_delete(text), public.agent_memory_pin(text, boolean), public.agent_memory_review(text, boolean),
  public.agent_memory_visibility_set(text, text), public.agent_memory_reverify(text, boolean) from public, anon;
grant execute on function public.agent_memory_edit(text, text, text), public.agent_memory_delete(text), public.agent_memory_pin(text, boolean), public.agent_memory_review(text, boolean),
  public.agent_memory_visibility_set(text, text), public.agent_memory_reverify(text, boolean) to authenticated;

/* ================================ 2. what marks a memory for re-checking ================================ */

-- Mark the current memories tied to these records (or read from this page) for re-checking, with the reason, and tell
-- the owners once a day per workspace. p_ws null: every workspace (the sweeper's findings are about a form, anywhere).
-- Returns how many were marked. Server only.
create or replace function public.agent_memory_flag(p_ws uuid, p_kind text, p_ids text[], p_url text, p_en text, p_zh text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  if p_kind is not null and p_kind not in ('filing', 'application', 'deadline', 'entity', 'store', 'form') then raise exception 'Unknown record kind.'; end if;
  for r in
    with hit as (
      update public.agent_memories m
         set verify = 'recheck', verify_at = now(), verified_by = null, updated_at = now(),
             verify_reason = jsonb_build_object('en', left(coalesce(p_en, 'The rule behind it changed.'), 200), 'zh', left(coalesce(p_zh, p_en, '其依据的规定发生了变化。'), 200))
       where m.status = 'approved' and m.valid_to is null and m.verify <> 'recheck'
         and (p_ws is null or m.workspace_id = p_ws)
         and ((p_kind is not null and m.record_kind = p_kind and m.record_id = any(coalesce(p_ids, '{}')))
           or (p_url is not null and length(p_url) > 8 and m.source_url = p_url))
      returning m.workspace_id
    )
    select workspace_id, count(*) c from hit group by workspace_id
  loop
    n := n + r.c;
    insert into public.updates (workspace_id, kind, title, body, dedupe)
    values (r.workspace_id, 'agent', jsonb_build_object('en', 'A rule changed: check what Odelia remembers', 'zh', '规定有变化：请核对 Odelia 的记忆'),
      jsonb_build_object('en', r.c || ' memor' || case when r.c = 1 then 'y is' else 'ies are' end || ' marked to check again. ' || left(coalesce(p_en, ''), 160) || ' Settle them in Settings, Agent memory.',
                         'zh', r.c || ' 条记忆需要重新核对。' || left(coalesce(p_zh, p_en, ''), 160) || '请在设置的助理记忆中处理。'),
      'memory-recheck:' || to_char(now(), 'YYYY-MM-DD'))
    on conflict (workspace_id, dedupe) do nothing;
  end loop;
  return n;
end $$;
revoke execute on function public.agent_memory_flag(uuid, text, text[], text, text, text) from public, anon, authenticated;
grant execute on function public.agent_memory_flag(uuid, text, text[], text, text, text) to service_role;

-- The sweeper found the words Placetta quotes for a form gone from the agency's page, or a new fee there: the memories
-- tied to that form, to an application filed on it (its official form), or read from that page are checked again.
create or replace function public.qa_findings_memory() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w record; apps text[];
begin
  if new.kind not in ('drift', 'fee') then return new; end if;
  if tg_op = 'UPDATE' and not (old.status = 'fixed' and new.status = 'open') then return new; end if;
  perform public.agent_memory_flag(null, 'form', array[new.subject], new.source,
    case new.kind when 'fee' then 'The agency''s page shows a new fee for ' || left(new.subject, 60) || '.' else 'The agency changed its page for ' || left(new.subject, 60) || '.' end,
    case new.kind when 'fee' then '机构网页上 ' || left(new.subject, 60) || ' 的费用有变化。' else '机构更新了 ' || left(new.subject, 60) || ' 的网页。' end);
  for w in select ws.id, ws.state from public.workspaces ws
            where jsonb_typeof(ws.state->'apps') = 'array'
              and exists (select 1 from jsonb_array_elements(ws.state->'apps') a where a->>'official' = new.subject) loop
    select array_agg(a->>'id') into apps from jsonb_array_elements(w.state->'apps') a where a->>'official' = new.subject and a ? 'id';
    perform public.agent_memory_flag(w.id, 'application', apps, null,
      case new.kind when 'fee' then 'The agency''s page shows a new fee for this application''s form.' else 'The agency changed the page for this application''s form.' end,
      case new.kind when 'fee' then '机构网页上该申请表格的费用有变化。' else '机构更新了该申请表格的网页。' end);
  end loop;
  return new;
end $$;
revoke execute on function public.qa_findings_memory() from public, anon, authenticated;
drop trigger if exists qa_findings_memory on public.qa_findings;
create trigger qa_findings_memory after insert or update of status on public.qa_findings for each row execute function public.qa_findings_memory();

-- A filing reached a decision or got a new confirmation number: what memory says about it is checked again.
create or replace function public.filings_memory() returns trigger
language plpgsql security definer set search_path = '' as $$
declare st text := new.status;
begin
  if (new.status is distinct from old.status and new.status in ('needs_info', 'accepted', 'rejected'))
     or (new.confirmation_number is distinct from old.confirmation_number and old.confirmation_number is not null) then
    perform public.agent_memory_flag(new.workspace_id, 'application', array[new.app_id], null,
      case when new.status is distinct from old.status then 'The filing is now ' || replace(st, '_', ' ') || '.' else 'The filing''s confirmation number changed.' end,
      case when new.status is distinct from old.status then '申请状态已变为' || case st when 'needs_info' then '需补充材料' when 'accepted' then '已受理' else '被拒绝' end || '。' else '申请的确认号已变更。' end);
    perform public.agent_memory_flag(new.workspace_id, 'filing', array[new.id::text], null,
      case when new.status is distinct from old.status then 'The filing is now ' || replace(st, '_', ' ') || '.' else 'The filing''s confirmation number changed.' end,
      case when new.status is distinct from old.status then '申请状态已变化。' else '申请的确认号已变更。' end);
  end if;
  return new;
end $$;
revoke execute on function public.filings_memory() from public, anon, authenticated;
drop trigger if exists filings_memory on public.filings;
create trigger filings_memory after update of status, confirmation_number on public.filings for each row execute function public.filings_memory();

/* ================================ 4. each person's switches ================================ */

create table if not exists public.agent_memory_person (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reference_memories boolean not null default true,
  reference_chats boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
comment on table public.agent_memory_person is 'Each person''s own memory switches (ChatGPT''s Reference saved memories and Reference chat history). Read by agent-run for that person''s runs.';
alter table public.agent_memory_person enable row level security;
revoke all on public.agent_memory_person from public, anon, authenticated;
grant select on public.agent_memory_person to authenticated;
drop policy if exists "Each person reads their own memory switches" on public.agent_memory_person;
create policy "Each person reads their own memory switches" on public.agent_memory_person for select to authenticated
  using (user_id = auth.uid() and public.can_view(workspace_id));

-- Anyone on the workspace, for themselves only.
create or replace function public.agent_memory_person_set(ws uuid, p_memories boolean default null, p_chats boolean default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.agent_memory_person;
begin
  if auth.uid() is null or not public.can_view(ws) then raise exception 'Not your workspace.'; end if;
  insert into public.agent_memory_person (workspace_id, user_id, reference_memories, reference_chats, updated_at)
  values (ws, auth.uid(), coalesce(p_memories, true), coalesce(p_chats, true), now())
  on conflict (workspace_id, user_id) do update set reference_memories = coalesce(p_memories, agent_memory_person.reference_memories),
    reference_chats = coalesce(p_chats, agent_memory_person.reference_chats), updated_at = now()
  returning * into r;
  return to_jsonb(r);
end $$;
revoke execute on function public.agent_memory_person_set(uuid, boolean, boolean) from public, anon;
grant execute on function public.agent_memory_person_set(uuid, boolean, boolean) to authenticated;
