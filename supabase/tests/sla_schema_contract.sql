-- PostgreSQL integration assertions for P3-SLA-001.
-- Run with ON_ERROR_STOP=1 after all migrations and synthetic seed.

set timezone = 'UTC';

do $$
declare
  required_table text;
  required_tables text[] := array[
    'business_calendars', 'business_calendar_days',
    'sla_rule_versions', 'complaint_sla_snapshots'
  ];
  rel record;
begin
  foreach required_table in array required_tables loop
    if to_regclass(format('public.%I', required_table)) is null then
      raise exception 'missing required SLA table public.%', required_table;
    end if;
    select c.relrowsecurity, c.relforcerowsecurity
      into rel
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = required_table;
    if not rel.relrowsecurity or not rel.relforcerowsecurity then
      raise exception 'SLA table RLS must be enabled and forced on public.%', required_table;
    end if;
  end loop;
end;
$$;

do $$
declare
  tenant_a uuid := '00000000-0000-4000-8000-000000000001';
  tenant_b uuid := '00000000-0000-4000-8000-000000000002';
begin
  if (select count(*) from public.business_calendars where tenant_id = tenant_a) <> 1
     or (select count(*) from public.business_calendars where tenant_id = tenant_b) <> 1 then
    raise exception 'synthetic calendars must be present for both tenants';
  end if;
  if exists (
    select 1 from public.sla_rule_versions
    where state = 'ACTIVE' and calendar_id is null
  ) then
    raise exception 'active SLA rule is missing a calendar snapshot source';
  end if;
  if exists (
    select 1 from public.business_calendars
    where jsonb_typeof(windows) <> 'array' or jsonb_typeof(holiday_dates) <> 'array'
  ) then
    raise exception 'calendar JSON shape is invalid';
  end if;
end;
$$;

-- A trusted tenant claim must not expose the other tenant's calendar/rules.
set role authenticated;
select set_config(
  'request.jwt.claims',
  '{"tenant_id":"00000000-0000-4000-8000-000000000001","account_id":"10000000-0000-4000-8000-000000000001"}',
  false
);

do $$
begin
  if (select count(*) from public.business_calendars) <> 1 then
    raise exception 'tenant A calendar isolation failed';
  end if;
  if exists (select 1 from public.business_calendars where tenant_id <> private.current_tenant_id()) then
    raise exception 'tenant A must not see tenant B calendars';
  end if;
  if exists (select 1 from public.sla_rule_versions where tenant_id <> private.current_tenant_id()) then
    raise exception 'tenant A must not see tenant B SLA rules';
  end if;
end;
$$;

reset role;
