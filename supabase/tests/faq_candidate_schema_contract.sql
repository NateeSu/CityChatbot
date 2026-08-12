-- P5-FAQ-001 database contract; execute with psql against the target Supabase
-- project after the core, support and knowledge migrations.
\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.faq_candidates') is null then
    raise exception 'faq_candidates table is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.faq_candidates'::regclass
      and conname = 'faq_candidates_source_message_fk'
  ) then
    raise exception 'FAQ source message tenant FK is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'faq_candidates'
      and column_name = 'source_message_id'
  ) then
    raise exception 'FAQ source_message_id lineage column is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'faq_candidates'
      and column_name = 'source_message_id'
  ) then
    raise exception 'FAQ source_message_id lineage column is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'faq_candidates'
      and policyname = 'faq_candidates_read_scoped'
  ) then
    raise exception 'FAQ scoped read policy is missing';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.faq_candidates'::regclass and relforcerowsecurity
  ) then
    raise exception 'FAQ table must have forced RLS';
  end if;
end;
$$;

-- Tenant A must not see tenant B and an unapproved candidate must never be in
-- the active search result; the API/RPC test supplies the authenticated claims.
