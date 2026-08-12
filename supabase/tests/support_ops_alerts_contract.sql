-- PostgreSQL contract assertions for P5-OPS-001.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  relation record;
begin
  select c.relrowsecurity, c.relforcerowsecurity into relation
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'support_ops_alerts';
  if not found then raise exception 'support_ops_alerts table is missing'; end if;
  if not relation.relrowsecurity or not relation.relforcerowsecurity then
    raise exception 'support_ops_alerts must use forced RLS';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'support_ops_alerts'
       and policyname = 'support_ops_alerts_read_scoped'
       and cmd = 'SELECT'
  ) then
    raise exception 'support ops scoped read policy is missing';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'support_ops_alerts'
       and cmd = 'ALL'
  ) then
    raise exception 'broad support ops policy is forbidden';
  end if;
end;
$$;

do $$
declare
  index_name text;
begin
  foreach index_name in array array[
    'support_ops_alerts_key_uq', 'support_ops_alerts_queue_idx',
    'support_ops_alerts_ticket_idx', 'support_ops_alerts_department_idx'
  ] loop
    if not exists (select 1 from pg_indexes where indexname = index_name) then
      raise exception 'support ops index is missing: %', index_name;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'support_ops_alerts_touch_updated_at') then
    raise exception 'support ops update/version trigger is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_ops_alerts_ticket_fk') then
    raise exception 'support ops ticket tenant composite FK is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_ops_alerts_department_fk') then
    raise exception 'support ops department tenant composite FK is missing';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name = 'support_ops_alerts'
       and grantee = 'authenticated'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ) then
    raise exception 'authenticated support ops writes must be denied';
  end if;
end;
$$;

select 'SUPPORT_OPS_ALERTS_SQL_CONTRACT_PASS' as contract;
