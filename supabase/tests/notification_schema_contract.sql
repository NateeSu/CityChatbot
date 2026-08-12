-- PostgreSQL integration assertions for P3-NOTIF-001.
-- Run with ON_ERROR_STOP=1 after all migrations and synthetic seed.

set timezone = 'UTC';

do $$
declare
  required_table text;
  required_tables text[] := array[
    'notification_template_versions', 'notification_deliveries', 'staff_notifications'
  ];
  rel record;
begin
  foreach required_table in array required_tables loop
    if to_regclass(format('public.%I', required_table)) is null then
      raise exception 'missing notification table public.%', required_table;
    end if;
    select c.relrowsecurity, c.relforcerowsecurity
      into rel
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = required_table;
    if not rel.relrowsecurity or not rel.relforcerowsecurity then
      raise exception 'notification table RLS must be enabled and forced on public.%', required_table;
    end if;
  end loop;
end;
$$;

do $$
declare
  tenant_a uuid := '00000000-0000-4000-8000-000000000001';
  tenant_b uuid := '00000000-0000-4000-8000-000000000002';
begin
  if (select count(*) from public.notification_template_versions where tenant_id = tenant_a) <> 2
     or (select count(*) from public.notification_template_versions where tenant_id = tenant_b) <> 2 then
    raise exception 'synthetic notification template fixtures are incomplete';
  end if;
  if exists (
    select 1 from public.notification_template_versions
    where jsonb_typeof(variables) <> 'array' or state = 'ACTIVE' and version < 1
  ) then
    raise exception 'notification template invariant failed';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notification_deliveries_outbox_fk') then
    raise exception 'notification delivery must remain attached to domain outbox';
  end if;
end;
$$;

set role authenticated;
select set_config(
  'request.jwt.claims',
  '{"tenant_id":"00000000-0000-4000-8000-000000000001","account_id":"10000000-0000-4000-8000-000000000001"}',
  false
);

do $$
begin
  if (select count(*) from public.notification_template_versions) <> 2 then
    raise exception 'tenant A must see only its two notification templates';
  end if;
  if exists (select 1 from public.notification_template_versions where tenant_id <> private.current_tenant_id()) then
    raise exception 'tenant A must not see tenant B notification templates';
  end if;
  if exists (select 1 from public.notification_deliveries) then
    raise exception 'authenticated notification delivery reads must be empty for the synthetic fixture';
  end if;
end;
$$;

reset role;
