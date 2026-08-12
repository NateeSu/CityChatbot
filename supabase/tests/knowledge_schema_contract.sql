-- PostgreSQL integration assertions for P4-DOC-001.
-- Run with ON_ERROR_STOP=1 after all migrations and synthetic seed.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  table_name text;
  relation record;
begin
  foreach table_name in array array[
    'knowledge_categories', 'knowledge_documents', 'knowledge_document_versions',
    'knowledge_artifacts', 'knowledge_chunks', 'knowledge_approvals', 'ingestion_runs'
  ] loop
    select c.relrowsecurity, c.relforcerowsecurity into relation
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = table_name;
    if not found then raise exception 'missing knowledge table %', table_name; end if;
    if not relation.relrowsecurity or not relation.relforcerowsecurity then
      raise exception 'knowledge table % must use forced RLS', table_name;
    end if;
  end loop;
  if to_regprocedure('private.activate_knowledge_document_version(uuid,uuid,uuid)') is null then
    raise exception 'atomic knowledge activation function is missing';
  end if;
  if to_regprocedure('private.approve_knowledge_document_version(uuid,uuid,uuid,text,boolean)') is null then
    raise exception 'knowledge approval function is missing';
  end if;
  if to_regprocedure('private.rollback_knowledge_document_version(uuid,uuid,uuid)') is null then
    raise exception 'knowledge rollback function is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'knowledge_versions_active_uq') then
    raise exception 'one-active-version invariant index is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'knowledge_versions_checksum_uq') then
    raise exception 'tenant checksum dedupe index is missing';
  end if;
end;
$$;

do $$
declare
  blocked boolean := false;
begin
  begin
    insert into public.knowledge_document_versions (
      tenant_id, document_id, version, title, original_filename, mime_type,
      checksum_sha256, source_object_key, owner_department_id, knowledge_category_id,
      visibility, authority_level, effective_date_unknown, state, review_due_at
    ) values (
      '00000000-0000-4000-8000-000000000001',
      'ffffffff-ffff-4fff-8fff-fffffffffff1',
      1,
      'Direct publish must fail',
      'blocked.md',
      'text/markdown',
      repeat('f', 64),
      'tenant-a/blocked.md',
      '30000000-0000-4000-8000-000000000001',
      '36000000-0000-4000-8000-000000000001',
      'PUBLIC',
      90,
      true,
      'ACTIVE',
      statement_timestamp() + interval '30 days'
    );
    blocked := false;
  exception
    when others then
      if position('QUARANTINED' in sqlerrm) > 0 or position('ACTIVE requires' in sqlerrm) > 0 then
        blocked := true;
      else
        raise;
      end if;
  end;
  if not blocked then raise exception 'direct ACTIVE upload unexpectedly succeeded'; end if;
end;
$$;

do $$
declare
  tenant_a uuid := '00000000-0000-4000-8000-000000000001';
  tenant_b uuid := '00000000-0000-4000-8000-000000000002';
begin
  if tenant_a = tenant_b then raise exception 'tenant fixture ids must differ'; end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'knowledge_document_versions'
       and policyname = 'knowledge_versions_insert_quarantine'
  ) then
    raise exception 'knowledge version insert policy is missing';
  end if;
  if exists (
    select 1 from public.knowledge_documents
     where tenant_id = tenant_a and tenant_id = tenant_b
  ) then
    raise exception 'tenant A must not see tenant B knowledge rows';
  end if;
end;
$$;
