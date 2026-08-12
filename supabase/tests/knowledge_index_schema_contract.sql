-- PostgreSQL integration assertions for P4-INDEX-001.
-- Run with ON_ERROR_STOP=1 after all migrations and synthetic seed.
-- tenant A must not see tenant B index rows through the scoped policies.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  table_name text;
  relation record;
begin
  foreach table_name in array array['knowledge_index_generations', 'knowledge_facts'] loop
    select c.relrowsecurity, c.relforcerowsecurity into relation
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = table_name;
    if not found then raise exception 'missing index table %', table_name; end if;
    if not relation.relrowsecurity or not relation.relforcerowsecurity then
      raise exception 'index table % must use forced RLS', table_name;
    end if;
  end loop;
  if to_regprocedure('private.activate_knowledge_index_generation(uuid,uuid,uuid)') is null then
    raise exception 'index activation function is missing';
  end if;
  if to_regprocedure('private.rollback_knowledge_index_generation(uuid,uuid,uuid)') is null then
    raise exception 'index rollback function is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'knowledge_index_generations_active_uq') then
    raise exception 'one-active-index invariant is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'knowledge_chunks_generation_index_uq') then
    raise exception 'generation chunk ordering index is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'knowledge_chunks_search_trgm_idx') then
    raise exception 'lexical search index is missing';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'knowledge_chunks'
       and policyname = 'knowledge_chunks_read_scoped'
       and qual like '%state = ''ACTIVE''%'
       and qual like '%effective_from%'
       and qual like '%effective_until%'
  ) then
    raise exception 'chunk retrieval policy must enforce active/effective versions';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'knowledge_facts'
       and policyname = 'knowledge_facts_read_scoped'
       and qual like '%review_status = ''APPROVED''%'
       and qual like '%state = ''ACTIVE''%'
  ) then
    raise exception 'fact retrieval policy must enforce approved active versions';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('knowledge_index_generations', 'knowledge_facts')
       and policyname like '%_write%'
  ) then
    raise exception 'index tables must not expose broad write policies';
  end if;
end;
$$;

do $$
declare
  invalid_generation boolean := false;
begin
  begin
    insert into public.knowledge_index_generations (
      tenant_id, document_version_id, generation, namespace, config_hash, state
    ) values (
      '00000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000002',
      1,
      'invalid-namespace',
      repeat('a', 64),
      'BUILDING'
    );
  exception when others then
    invalid_generation := true;
  end;
  if not invalid_generation then raise exception 'invalid index namespace unexpectedly succeeded'; end if;
end;
$$;

select 'KNOWLEDGE_INDEX_SQL_CONTRACT_PASS' as contract;
