do $$
declare
  table_name text;
begin
  foreach table_name in array array['tenant_provisioning_runs', 'tenant_provisioning_steps', 'tenant_usage_limit_versions', 'tenant_usage_counters'] loop
    if to_regclass('public.' || table_name) is null then raise exception 'missing tenant provisioning table: %', table_name; end if;
    if not exists (select 1 from pg_class where relname = table_name and relforcerowsecurity) then raise exception 'forced RLS missing: %', table_name; end if;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'tenant_provisioning_steps_run_fk') then raise exception 'provisioning step composite FK missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'tenant_usage_counters_unique_period') then raise exception 'usage counter idempotent period key missing'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'tenant_provisioning_step_guard') then raise exception 'provisioning step guard missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'provision_tenant_step') then raise exception 'provision tenant step function missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'suspend_tenant') then raise exception 'suspend tenant function missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'reactivate_tenant') then raise exception 'reactivate tenant function missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'consume_tenant_usage') then raise exception 'usage enforcement function missing'; end if;
end;
$$;

do $$
declare
  grants text;
begin
  foreach grants in array array['tenant_provisioning_runs', 'tenant_provisioning_steps', 'tenant_usage_limit_versions', 'tenant_usage_counters'] loop
    if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = grants and grantee = 'authenticated') then raise exception 'browser grant must remain denied: %', grants; end if;
  end loop;
end;
$$;

select 'TENANT_PROVISIONING_SCHEMA_SQL_CONTRACT_PASS' as contract;
