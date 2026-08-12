-- PostgreSQL contract assertions for P4-ROUTE-001.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  rel record;
  request_index_exists boolean;
  source_fk_exists boolean;
  recommended_fk_exists boolean;
begin
  select c.relrowsecurity, c.relforcerowsecurity
    into rel
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'complaint_routing_runs';
  if not rel.relrowsecurity or not rel.relforcerowsecurity then
    raise exception 'routing run RLS must be enabled and forced';
  end if;

  select exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'complaint_routing_runs_request_uq'
  ) into request_index_exists;
  if not request_index_exists then
    raise exception 'routing request idempotency index is missing';
  end if;

  select exists (
    select 1
      from pg_constraint
     where conrelid = 'public.complaint_routing_runs'::regclass
       and conname = 'complaint_routing_runs_source_fk'
  ) into source_fk_exists;
  select exists (
    select 1
      from pg_constraint
     where conrelid = 'public.complaint_routing_runs'::regclass
       and conname = 'complaint_routing_runs_recommended_department_fk'
  ) into recommended_fk_exists;
  if not source_fk_exists or not recommended_fk_exists then
    raise exception 'routing tenant composite foreign keys are missing';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.complaint_routing_runs'::regclass
       and tgname = 'complaint_routing_runs_append_only'
       and not tgenabled = 'D'
  ) then
    raise exception 'routing run append-only trigger is missing';
  end if;
end;
$$;

select 'COMPLAINT_ROUTING_SQL_CONTRACT_PASS' as contract;
