-- PostgreSQL contract assertions for P6-THEME-001.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  relation record;
begin
  select c.relrowsecurity, c.relforcerowsecurity into relation
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'theme_versions';
  if not found then raise exception 'missing theme_versions table'; end if;
  if not relation.relrowsecurity or not relation.relforcerowsecurity then
    raise exception 'theme_versions must use forced RLS';
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'theme_versions_published_uq') then
    raise exception 'published theme uniqueness invariant is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'theme_versions_guard') then
    raise exception 'theme immutability trigger is missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'publish_theme_version') then
    raise exception 'theme publish function is missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'rollback_theme_version') then
    raise exception 'theme rollback function is missing';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'theme_versions'
       and policyname = 'theme_versions_read_current_tenant'
  ) then
    raise exception 'tenant-scoped theme read policy is missing';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'theme_versions'
       and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'authenticated theme settings writes must be denied';
  end if;
end;
$$;

select 'THEME_VERSIONS_SCHEMA_SQL_CONTRACT_PASS' as contract;
