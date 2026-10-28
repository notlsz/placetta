-- Replicate this store (src/replicate.ts): an owner opens new locations like a store that works, on one approval. The
-- new stores and their applications live in the workspace's state like every other store; this table keeps the record
-- of the approval itself: who approved copying which store to which places, and when. Members read their own
-- workspace's records; rows are written only by store_replication_record, and only for an owner. Safe to run twice.

create table if not exists public.store_replications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_store text not null check (length(source_store) between 1 and 120),
  places text[] not null check (cardinality(places) between 1 and 12),
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.store_replications is 'An owner''s approval to open new locations like an existing store (src/replicate.ts). Written only by store_replication_record.';
create index if not exists store_replications_ws on public.store_replications (workspace_id, created_at desc);
alter table public.store_replications enable row level security;
revoke all on public.store_replications from public, anon, authenticated;
grant select on public.store_replications to authenticated;
drop policy if exists "members read store replications" on public.store_replications;
create policy "members read store replications" on public.store_replications for select to authenticated using (public.can_view(workspace_id));

/* The owner's approval, recorded. Places are trimmed, cut to 120 characters and deduplicated; at most 12. */
create or replace function public.store_replication_record(p_ws uuid, p_source text, p_places text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare got uuid; clean text[];
begin
  if not public.is_owner(p_ws) then raise exception 'Only an owner can open new locations.' using errcode = '42501'; end if;
  if coalesce(btrim(p_source), '') = '' then raise exception 'source store required'; end if;
  select coalesce(array_agg(distinct left(btrim(x), 120)), '{}') into clean from unnest(coalesce(p_places, '{}')) x where btrim(x) <> '';
  if cardinality(clean) = 0 or cardinality(clean) > 12 then raise exception 'between 1 and 12 places'; end if;
  insert into public.store_replications (workspace_id, source_store, places, approved_by)
    values (p_ws, left(btrim(p_source), 120), clean, auth.uid()) returning id into got;
  return got;
end $$;
revoke execute on function public.store_replication_record(uuid, text, text[]) from public, anon;
grant execute on function public.store_replication_record(uuid, text, text[]) to authenticated;
