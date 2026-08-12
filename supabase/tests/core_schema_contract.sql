-- PostgreSQL/Supabase integration assertions for P1-DB-001.
-- Run with ON_ERROR_STOP=1 after the migration and synthetic seed.

set timezone = 'UTC';

do $$
declare
  required_table text;
  required_tables text[] := array[
    'tenants', 'tenant_settings', 'feature_flag_versions', 'user_accounts',
    'tenant_memberships', 'departments', 'department_memberships',
    'department_work_scope_versions', 'roles', 'permissions', 'role_permissions',
    'membership_roles', 'support_access_grants', 'sla_rule_versions',
    'department_contacts', 'idempotency_records', 'domain_outbox', 'jobs', 'audit_logs'
  ];
  rel record;
begin
  foreach required_table in array required_tables loop
    if to_regclass(format('public.%I', required_table)) is null then
      raise exception 'missing required table public.%', required_table;
    end if;

    select c.relrowsecurity, c.relforcerowsecurity
      into rel
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = required_table;

    if not rel.relrowsecurity or not rel.relforcerowsecurity then
      raise exception 'RLS must be enabled and forced on public.%', required_table;
    end if;
  end loop;
end;
$$;

do $$
declare
  tenant_a uuid := '00000000-0000-4000-8000-000000000001';
  tenant_b uuid := '00000000-0000-4000-8000-000000000002';
  count_a integer;
  count_b integer;
begin
  select count(*) into count_a from public.departments where tenant_id = tenant_a;
  select count(*) into count_b from public.departments where tenant_id = tenant_b;
  if count_a <> 2 or count_b <> 1 then
    raise exception 'synthetic tenant/department fixtures are incomplete: A=%, B=%', count_a, count_b;
  end if;

  if exists (select 1 from public.tenant_settings where ai_chat_enabled or complaint_ai_routing_enabled) then
    raise exception 'synthetic seed must keep AI flags fail-closed';
  end if;
end;
$$;

do $$
begin
  if extract(epoch from ('2026-08-11 00:00:00+07'::timestamptz - '2026-08-10 17:00:00+00'::timestamptz)) <> 0 then
    raise exception 'Asia/Bangkok/UTC boundary conversion is not stable';
  end if;
end;
$$;

-- A trusted tenant claim plus an active membership can read only its own rows.
-- This block is intended for a session that can SET ROLE authenticated.
do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"tenant_id":"00000000-0000-4000-8000-000000000001","account_id":"10000000-0000-4000-8000-000000000001"}',
    false
  );
end;
$$;

select count(*) as tenant_a_visible_departments
from public.departments
where tenant_id = '00000000-0000-4000-8000-000000000001';

select count(*) as tenant_b_visible_departments
from public.departments
where tenant_id = '00000000-0000-4000-8000-000000000002';
