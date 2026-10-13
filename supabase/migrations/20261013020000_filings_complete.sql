-- Nothing is filed with a blank line or a missing document, whatever sends it: the app, an old app still open in a
-- browser, or a direct API call. Same rule as the app's isBlank (src/core.ts): empty, whitespace, or a stand-in such
-- as "TBD", "unknown", "?", "[owner name]". "N/A" and "None" are real answers. Customers only: the team and the
-- service role can still record what an agency sent back. Safe to run twice.
create or replace function public.is_blank_value(v text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(btrim(v), '') ~* '^(|tbd|tbc|to be (confirmed|determined|added)|unknown|pending|placeholder|xxx+|\?+|-+|_+|\.{3}|…|\[[^]]*\]|<[^>]*>|\{[^}]*\}|待定|未知|待确认|待补充)$'
$$;

create or replace function public.filings_complete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  blank text;
  missing text;
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  select string_agg(coalesce(f->'label'->>'en', f->>'label', f->>'id', 'a field'), ', ') into blank
    from jsonb_array_elements(case when jsonb_typeof(new.payload->'fields') = 'array' then new.payload->'fields' else '[]'::jsonb end) f
    where public.is_blank_value(f->>'value');
  select string_agg(coalesce(c->'label'->>'en', c->>'label', 'a document'), ', ') into missing
    from jsonb_array_elements(case when jsonb_typeof(new.payload->'checklist') = 'array' then new.payload->'checklist' else '[]'::jsonb end) c
    where c->>'state' = 'missing';
  if blank is not null or missing is not null then
    raise exception using errcode = '23514',
      message = 'Not ready to file yet.' || coalesce(' Still empty: ' || blank || '.', '') || coalesce(' Documents still missing: ' || missing || '.', '');
  end if;
  return new;
end $$;

drop trigger if exists filings_complete on public.filings;
create trigger filings_complete before insert on public.filings for each row execute function public.filings_complete();
revoke execute on function public.filings_complete() from public, anon, authenticated;
