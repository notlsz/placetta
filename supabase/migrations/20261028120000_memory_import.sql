-- Memory brought over from another assistant (src/odeliaMemory/import.ts), copied from Claude's memory import: an owner
-- or admin pastes what ChatGPT or Claude remembers about them, and each kept line becomes a suggestion scoped to them
-- alone (scope person, so nobody else on the workspace reads it), untrusted, waiting for their approval like anything
-- else from outside the app. The table's own checks (memory_text_ok) run on every line again; a line they refuse is
-- skipped, not saved. At most 50 a time. Memory has to be on. Audited. Safe to run twice.
create or replace function public.agent_memory_import(ws uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare it jsonb; n int := 0; on_ boolean; t text; tp text;
begin
  if not public.is_admin(ws) or not public.mfa_ok() then raise exception 'Only an owner or admin can bring memories over.'; end if;
  select s.enabled into on_ from public.agent_memory_settings s where s.workspace_id = ws;
  if not coalesce(on_, false) then raise exception 'Turn agent memory on first.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then raise exception 'At most 50 memories at a time.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    t := left(trim(coalesce(it->>'text', '')), 300);
    tp := coalesce(it->>'topic', 'company');
    if length(t) < 8 or tp not in ('company', 'stores', 'markets', 'people', 'preferences', 'rules', 'decisions') then continue; end if;
    begin
      insert into public.agent_memories (workspace_id, scope_kind, scope_id, topic, entity, attr, value, text_en, text_zh, source_kind, source_ref, source_title, source_quote,
        status, trust, created_by)
      values (ws, 'person', auth.uid()::text, tp, left(coalesce(nullif(it->>'entity', ''), split_part(t, ' ', 1)), 120), 'imported', t, t, t, 'upload',
        'import:' || to_char(now(), 'YYYY-MM-DD'), 'Imported from another assistant', t, 'suggested', 'untrusted', auth.uid());
      n := n + 1;
    exception when check_violation then
      null;   -- a line the table refuses (a secret, an ID number) is left out
    end;
  end loop;
  if n > 0 then perform public.memory_audit(ws, 'Brought memories over from another assistant', '从其他助手导入了记忆', n::text || ' suggestions', n::text || ' 条建议'); end if;
  return n;
end $$;
revoke execute on function public.agent_memory_import(uuid, jsonb) from public, anon;
grant execute on function public.agent_memory_import(uuid, jsonb) to authenticated;
