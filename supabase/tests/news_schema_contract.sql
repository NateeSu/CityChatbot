-- PostgreSQL contract assertions for P6-NEWS-001.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  relation record;
  table_name text;
begin
  foreach table_name in array array['news_categories', 'news_posts', 'news_revisions', 'news_revision_categories', 'news_delivery_runs'] loop
    select c.relrowsecurity, c.relforcerowsecurity into relation
      from pg_class as c join pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = table_name;
    if not found then raise exception 'missing news table: %', table_name; end if;
    if not relation.relrowsecurity or not relation.relforcerowsecurity then raise exception 'news table must use forced RLS: %', table_name; end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'news_revisions_post_fk') then raise exception 'revision composite tenant FK is missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'news_revision_categories_category_fk') then raise exception 'revision category composite tenant FK is missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'news_delivery_runs_revision_fk') then raise exception 'delivery revision composite tenant FK is missing'; end if;
  if not exists (select 1 from pg_indexes where indexname = 'news_posts_published_slug_uq') then raise exception 'published news index is missing'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'news_revisions_guard') then raise exception 'news revision immutability trigger is missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'publish_news_revision') then raise exception 'news publish function is missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'archive_news_post') then raise exception 'news archive function is missing'; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'news_posts' and policyname = 'news_posts_read_current_tenant') then raise exception 'tenant-scoped news read policy is missing'; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'news_delivery_runs' and policyname = 'news_delivery_runs_read_current_tenant') then raise exception 'tenant-scoped delivery read policy is missing'; end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('news_categories', 'news_posts', 'news_revisions', 'news_revision_categories', 'news_delivery_runs')
       and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then raise exception 'authenticated news writes must be denied'; end if;
end;
$$;

select 'NEWS_SCHEMA_SQL_CONTRACT_PASS' as contract;
