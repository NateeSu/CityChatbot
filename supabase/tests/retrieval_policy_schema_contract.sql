-- PostgreSQL contract assertions for P4-RET-001.
-- tenant A must not see tenant B policy rows through the active/effective policy.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  relation record;
begin
  select c.relrowsecurity, c.relforcerowsecurity into relation
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'retrieval_policy_versions';
  if not found then raise exception 'missing retrieval policy table'; end if;
  if not relation.relrowsecurity or not relation.relforcerowsecurity then
    raise exception 'retrieval policy table must use forced RLS';
  end if;
  if to_regprocedure('private.approve_retrieval_policy_version(uuid,uuid,uuid)') is null then
    raise exception 'retrieval policy approval function is missing';
  end if;
  if to_regprocedure('private.activate_retrieval_policy_version(uuid,uuid,uuid)') is null then
    raise exception 'retrieval policy activation function is missing';
  end if;
  if to_regprocedure('private.rollback_retrieval_policy_version(uuid,uuid,uuid)') is null then
    raise exception 'retrieval policy rollback function is missing';
  end if;
  if to_regprocedure('private.get_active_retrieval_policy(uuid,text)') is null then
    raise exception 'active retrieval policy reader is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'retrieval_policy_versions_active_uq') then
    raise exception 'one-active-policy invariant is missing';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'retrieval_policy_versions'
       and policyname = 'retrieval_policy_versions_read_active'
       and qual like '%state = ''ACTIVE''%'
       and qual like '%effective_until%'
  ) then
    raise exception 'policy read must be active/effective scoped';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'retrieval_policy_versions'
       and (qual like '%FOR ALL%' or with_check like '%true%')
  ) then
    raise exception 'retrieval policy must not expose broad authenticated writes';
  end if;
end;
$$;

select 'RETRIEVAL_POLICY_SQL_CONTRACT_PASS' as contract;
