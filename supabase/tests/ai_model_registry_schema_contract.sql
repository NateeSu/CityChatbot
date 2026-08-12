-- PostgreSQL contract assertions for P4-AIGW-001 model route registry.
-- tenant A must not see tenant B model routes.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  relation record;
begin
  select c.relrowsecurity, c.relforcerowsecurity into relation
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'ai_model_registry';
  if not found then raise exception 'missing ai model registry table'; end if;
  if not relation.relrowsecurity or not relation.relforcerowsecurity then
    raise exception 'AI model registry must use forced RLS';
  end if;
  if to_regprocedure('private.approve_ai_model_route(uuid,uuid,uuid)') is null then
    raise exception 'AI model approval function is missing';
  end if;
  if to_regprocedure('private.retire_ai_model_route(uuid,uuid,uuid)') is null then
    raise exception 'AI model retirement function is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'ai_model_registry_route_active_uq') then
    raise exception 'one active route per route key invariant is missing';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'ai_model_registry'
       and policyname = 'ai_model_registry_read_approved'
       and qual like '%UNIT_APPROVED%'
       and qual like '%effective_until%'
  ) then
    raise exception 'AI model reads must be approved/effective scoped';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'ai_model_registry'
       and (qual like '%FOR ALL%' or with_check like '%true%')
  ) then
    raise exception 'AI model registry must not expose broad authenticated writes';
  end if;
end;
$$;

select 'AI_MODEL_REGISTRY_SQL_CONTRACT_PASS' as contract;
