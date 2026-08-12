-- PostgreSQL contract assertions for P6-BOT-001 prompt settings.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  relation record;
begin
  select c.relrowsecurity, c.relforcerowsecurity into relation
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'prompt_versions';
  if not found then raise exception 'missing prompt_versions table'; end if;
  if not relation.relrowsecurity or not relation.relforcerowsecurity then
    raise exception 'prompt_versions must use forced RLS';
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'prompt_versions_published_uq') then
    raise exception 'published prompt uniqueness invariant is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'prompt_versions_policy_guard') then
    raise exception 'prompt policy lock trigger is missing';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'prompt_versions'
       and policyname = 'prompt_versions_read_current_tenant'
  ) then
    raise exception 'tenant-scoped prompt read policy is missing';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'prompt_versions'
       and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'authenticated prompt settings writes must be denied';
  end if;
end;
$$;

select 'PROMPT_VERSIONS_SCHEMA_SQL_CONTRACT_PASS' as contract;
