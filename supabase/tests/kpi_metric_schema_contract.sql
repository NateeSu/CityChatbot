-- PostgreSQL contract assertions for P7-KPI-001.
-- Run with ON_ERROR_STOP=1 after migrations and the synthetic seed.

set timezone = 'UTC';

do $$
declare
  relation record;
begin
  if to_regclass('public.kpi_metric_definitions') is null then
    raise exception 'missing public.kpi_metric_definitions';
  end if;
  select c.relrowsecurity, c.relforcerowsecurity
    into relation
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'kpi_metric_definitions';
  if not relation.relrowsecurity or not relation.relforcerowsecurity then
    raise exception 'KPI metric definitions must use forced RLS';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'kpi_metric_definitions_tenant_id_uq'
       and conrelid = 'public.kpi_metric_definitions'::regclass
  ) then
    raise exception 'KPI definitions need tenant-scoped identity uniqueness';
  end if;
end;
$$;

do $$
declare
  required_key text;
  required_keys text[] := array[
    'COMPLAINT_RECEIVED_VOLUME', 'COMPLAINT_CLOSED_VOLUME',
    'COMPLAINT_OPEN_BACKLOG', 'COMPLAINT_REOPENED_VOLUME',
    'FIRST_RESPONSE_SLA_RATE', 'RESOLUTION_SLA_RATE',
    'OUT_OF_JURISDICTION_RATE', 'SUPPORT_TICKET_VOLUME',
    'SUPPORT_TICKET_CLOSED_RATE'
  ];
begin
  foreach required_key in array required_keys loop
    if not exists (
      select 1 from public.kpi_metric_definitions
       where tenant_id = '00000000-0000-4000-8000-000000000001'::uuid
         and metric_key = required_key
         and version = 1
         and state = 'APPROVED'
         and approved_by_account_id is not null
         and approved_at is not null
    ) then
      raise exception 'missing approved KPI definition %', required_key;
    end if;
  end loop;
  if not exists (select 1 from pg_proc where pronamespace = 'private'::regnamespace and proname = 'calculate_kpi') then
    raise exception 'private.calculate_kpi is missing';
  end if;
  if not exists (select 1 from pg_proc where pronamespace = 'private'::regnamespace and proname = 'complaint_status_at')
     or not exists (select 1 from pg_proc where pronamespace = 'private'::regnamespace and proname = 'support_ticket_status_at') then
    raise exception 'as-of status reconstruction functions are missing';
  end if;
end;
$$;

do $$
declare
  row record;
  tenant_a uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  tenant_b uuid := '00000000-0000-4000-8000-000000000002'::uuid;
  required_metric text;
  required_metrics text[] := array[
    'COMPLAINT_RECEIVED_VOLUME', 'COMPLAINT_CLOSED_VOLUME',
    'COMPLAINT_OPEN_BACKLOG', 'COMPLAINT_REOPENED_VOLUME',
    'FIRST_RESPONSE_SLA_RATE', 'RESOLUTION_SLA_RATE',
    'OUT_OF_JURISDICTION_RATE', 'SUPPORT_TICKET_VOLUME',
    'SUPPORT_TICKET_CLOSED_RATE'
  ];
begin
  foreach required_metric in array required_metrics loop
    for row in select * from private.calculate_kpi(
      tenant_a,
      required_metric,
      '2026-08-01 00:00:00+00'::timestamptz,
      '2026-08-11 00:00:00+00'::timestamptz
    ) loop
      if row.tenant_id <> tenant_a or row.definition_version <> 1 or row.source <> 'APPROVED_SQL_DEFINITION' then
        raise exception 'KPI result metadata is not tenant/version/source safe';
      end if;
    end loop;
  end loop;

  if (select numerator from private.calculate_kpi(
    tenant_b, 'COMPLAINT_RECEIVED_VOLUME',
    '2026-08-01 00:00:00+00'::timestamptz,
    '2026-08-11 00:00:00+00'::timestamptz
  )) <> 0 then
    raise exception 'empty tenant B fixture must not see tenant A rows';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('authenticated', 'public.kpi_metric_definitions', 'insert')
     or has_table_privilege('authenticated', 'public.kpi_metric_definitions', 'update')
     or has_table_privilege('authenticated', 'public.kpi_metric_definitions', 'delete') then
    raise exception 'authenticated KPI dictionary mutation privilege unexpectedly exists';
  end if;
  if not has_function_privilege(
    'authenticated',
    'private.calculate_kpi(uuid,text,timestamptz,timestamptz,uuid,integer)',
    'execute'
  ) then
    raise exception 'authenticated KPI calculation execute privilege is missing';
  end if;
end;
$$;

-- Exact hand-calculated SQL fixture. Every row is rolled back so this contract
-- cannot alter the synthetic database. Expected values mirror the locked
-- P7-KPI-001 fixtures: received=6, closed=2, backlog=3, reopened=1,
-- first-response SLA=2/3 with one pending, resolution SLA=2/3 with one
-- late case and one pending, and out-of-jurisdiction=1/5.
begin;

do $$
declare
  tenant_a uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  department_a1 uuid := '30000000-0000-4000-8000-000000000001'::uuid;
  department_a2 uuid := '30000000-0000-4000-8000-000000000002'::uuid;
  queue_a1 uuid := '34000000-0000-4000-8000-000000000001'::uuid;
  category_a uuid := '33000000-0000-4000-8000-000000000001'::uuid;
  complaint_id uuid;
  allocation_prefix text;
  allocation_sequence bigint;
begin
  select prefix, sequence_number into allocation_prefix, allocation_sequence from private.reserve_complaint_number(tenant_a, 2026);
  complaint_id := '70000000-0000-4000-8000-000000000001'::uuid;
  insert into public.complaints (
    id, tenant_id, complaint_no, complaint_year, complaint_sequence, line_user_id,
    category_id, category_uncertain, title, description, canonical_status, priority,
    risk_level, intake_queue_id, assigned_department_id, first_response_at,
    resolved_at, closed_at, created_at, updated_at
  ) values (
    complaint_id, tenant_a, allocation_prefix || '-2026-' || lpad(allocation_sequence::text, 6, '0'), 2026, allocation_sequence,
    'kpi-line-c1', category_a, false, 'KPI fixture one', 'KPI fixture complaint one', 'CLOSED', 'NORMAL', 'STANDARD', queue_a1,
    department_a1, '2026-08-01 01:00:00+00', '2026-08-02 00:00:00+00', '2026-08-02 01:00:00+00',
    '2026-08-01 00:00:00+00', '2026-08-02 01:00:00+00'
  );
  insert into public.complaint_sla_snapshots (
    tenant_id, complaint_id, sla_rule_version_id, rule_version, calendar_id, timezone,
    department_id, category_id, priority, started_at, captured_at,
    response_target_seconds, resolution_target_seconds, response_warning_at,
    response_due_at, resolution_warning_at, resolution_due_at, pause_statuses,
    paused_business_seconds, state, completed_at
  ) values (
    tenant_a, complaint_id, '50000000-0000-4000-8000-000000000001'::uuid, 1,
    '52000000-0000-4000-8000-000000000001'::uuid, 'Asia/Bangkok', department_a1, category_a, 'NORMAL',
    '2026-08-01 00:00:00+00', '2026-08-01 00:01:00+00', 3600, 172800,
    '2026-08-01 01:00:00+00', '2026-08-01 02:00:00+00', '2026-08-02 23:00:00+00',
    '2026-08-03 00:00:00+00', '["WAITING_FOR_CITIZEN"]'::jsonb, 0, 'COMPLETED', '2026-08-02 00:00:00+00'
  ) returning id into complaint_id;
  update public.complaints set sla_snapshot_id = complaint_id where id = '70000000-0000-4000-8000-000000000001'::uuid;

  select prefix, sequence_number into allocation_prefix, allocation_sequence from private.reserve_complaint_number(tenant_a, 2026);
  insert into public.complaints (
    id, tenant_id, complaint_no, complaint_year, complaint_sequence, line_user_id,
    category_id, category_uncertain, title, description, canonical_status, priority,
    risk_level, intake_queue_id, assigned_department_id, first_response_at,
    resolved_at, closed_at, created_at, updated_at
  ) values (
    '70000000-0000-4000-8000-000000000002'::uuid, tenant_a, allocation_prefix || '-2026-' || lpad(allocation_sequence::text, 6, '0'), 2026, allocation_sequence,
    'kpi-line-c2', category_a, false, 'KPI fixture two', 'KPI fixture complaint two', 'IN_PROGRESS', 'NORMAL', 'STANDARD', queue_a1,
    department_a1, '2026-08-03 03:00:00+00', '2026-08-04 00:00:00+00', '2026-08-04 01:00:00+00',
    '2026-08-03 00:00:00+00', '2026-08-05 00:00:00+00'
  );
  insert into public.complaint_sla_snapshots (
    tenant_id, complaint_id, sla_rule_version_id, rule_version, calendar_id, timezone,
    department_id, category_id, priority, started_at, captured_at,
    response_target_seconds, resolution_target_seconds, response_warning_at,
    response_due_at, resolution_warning_at, resolution_due_at, pause_statuses,
    paused_business_seconds, state, completed_at
  ) values (
    tenant_a, '70000000-0000-4000-8000-000000000002'::uuid, '50000000-0000-4000-8000-000000000001'::uuid, 1,
    '52000000-0000-4000-8000-000000000001'::uuid, 'Asia/Bangkok', department_a1, category_a, 'NORMAL',
    '2026-08-03 00:00:00+00', '2026-08-03 00:01:00+00', 3600, 172800,
    '2026-08-03 01:00:00+00', '2026-08-03 02:00:00+00', '2026-08-04 01:00:00+00',
    '2026-08-04 02:00:00+00', '["WAITING_FOR_CITIZEN"]'::jsonb, 0, 'COMPLETED', '2026-08-04 00:00:00+00'
  ) returning id into complaint_id;
  update public.complaints set sla_snapshot_id = complaint_id where id = '70000000-0000-4000-8000-000000000002'::uuid;

  select prefix, sequence_number into allocation_prefix, allocation_sequence from private.reserve_complaint_number(tenant_a, 2026);
  insert into public.complaints (
    id, tenant_id, complaint_no, complaint_year, complaint_sequence, line_user_id,
    category_id, category_uncertain, title, description, canonical_status, priority,
    risk_level, intake_queue_id, assigned_department_id, created_at, updated_at
  ) values (
    '70000000-0000-4000-8000-000000000003'::uuid, tenant_a, allocation_prefix || '-2026-' || lpad(allocation_sequence::text, 6, '0'), 2026, allocation_sequence,
    'kpi-line-c3', category_a, false, 'KPI fixture three', 'KPI fixture complaint three', 'CANCELLED', 'NORMAL', 'STANDARD', queue_a1,
    department_a2, '2026-08-05 00:00:00+00', '2026-08-05 00:00:00+00'
  );

  select prefix, sequence_number into allocation_prefix, allocation_sequence from private.reserve_complaint_number(tenant_a, 2026);
  insert into public.complaints (
    id, tenant_id, complaint_no, complaint_year, complaint_sequence, line_user_id,
    category_id, category_uncertain, title, description, canonical_status, priority,
    risk_level, intake_queue_id, assigned_department_id, created_at, updated_at
  ) values (
    '70000000-0000-4000-8000-000000000004'::uuid, tenant_a, allocation_prefix || '-2026-' || lpad(allocation_sequence::text, 6, '0'), 2026, allocation_sequence,
    'kpi-line-c4', category_a, false, 'KPI fixture four', 'KPI fixture complaint four', 'OUT_OF_JURISDICTION', 'NORMAL', 'STANDARD', queue_a1,
    department_a2, '2026-08-06 00:00:00+00', '2026-08-06 00:00:00+00'
  );

  select prefix, sequence_number into allocation_prefix, allocation_sequence from private.reserve_complaint_number(tenant_a, 2026);
  insert into public.complaints (
    id, tenant_id, complaint_no, complaint_year, complaint_sequence, line_user_id,
    category_id, category_uncertain, title, description, canonical_status, priority,
    risk_level, intake_queue_id, assigned_department_id, first_response_at,
    resolved_at, created_at, updated_at
  ) values (
    '70000000-0000-4000-8000-000000000005'::uuid, tenant_a, allocation_prefix || '-2026-' || lpad(allocation_sequence::text, 6, '0'), 2026, allocation_sequence,
    'kpi-line-c5', category_a, false, 'KPI fixture five', 'KPI fixture complaint five', 'RESOLVED', 'NORMAL', 'STANDARD', queue_a1,
    department_a1, '2026-08-07 01:00:00+00', '2026-08-09 00:30:00+00', '2026-08-07 00:00:00+00', '2026-08-09 00:30:00+00'
  );
  insert into public.complaint_sla_snapshots (
    tenant_id, complaint_id, sla_rule_version_id, rule_version, calendar_id, timezone,
    department_id, category_id, priority, started_at, captured_at,
    response_target_seconds, resolution_target_seconds, response_warning_at,
    response_due_at, resolution_warning_at, resolution_due_at, pause_statuses,
    paused_business_seconds, state
  ) values (
    tenant_a, '70000000-0000-4000-8000-000000000005'::uuid, '50000000-0000-4000-8000-000000000001'::uuid, 1,
    '52000000-0000-4000-8000-000000000001'::uuid, 'Asia/Bangkok', department_a1, category_a, 'NORMAL',
    '2026-08-07 00:00:00+00', '2026-08-07 00:01:00+00', 3600, 172800,
    '2026-08-07 01:00:00+00', '2026-08-07 02:00:00+00', '2026-08-07 23:00:00+00',
    '2026-08-08 00:00:00+00', '["WAITING_FOR_CITIZEN"]'::jsonb, 86400, 'COMPLETED'
  ) returning id into complaint_id;
  update public.complaints set sla_snapshot_id = complaint_id where id = '70000000-0000-4000-8000-000000000005'::uuid;

  select prefix, sequence_number into allocation_prefix, allocation_sequence from private.reserve_complaint_number(tenant_a, 2026);
  insert into public.complaints (
    id, tenant_id, complaint_no, complaint_year, complaint_sequence, line_user_id,
    category_id, category_uncertain, title, description, canonical_status, priority,
    risk_level, intake_queue_id, assigned_department_id, created_at, updated_at
  ) values (
    '70000000-0000-4000-8000-000000000006'::uuid, tenant_a, allocation_prefix || '-2026-' || lpad(allocation_sequence::text, 6, '0'), 2026, allocation_sequence,
    'kpi-line-c6', category_a, false, 'KPI fixture six', 'KPI fixture complaint six', 'RECEIVED', 'NORMAL', 'STANDARD', queue_a1,
    department_a1, '2026-08-10 00:00:00+00', '2026-08-10 00:00:00+00'
  );
  insert into public.complaint_sla_snapshots (
    tenant_id, complaint_id, sla_rule_version_id, rule_version, calendar_id, timezone,
    department_id, category_id, priority, started_at, captured_at,
    response_target_seconds, resolution_target_seconds, response_warning_at,
    response_due_at, resolution_warning_at, resolution_due_at, pause_statuses,
    paused_business_seconds, state
  ) values (
    tenant_a, '70000000-0000-4000-8000-000000000006'::uuid, '50000000-0000-4000-8000-000000000001'::uuid, 1,
    '52000000-0000-4000-8000-000000000001'::uuid, 'Asia/Bangkok', department_a1, category_a, 'NORMAL',
    '2026-08-10 00:00:00+00', '2026-08-10 00:01:00+00', 3600, 172800,
    '2026-08-12 02:00:00+00', '2026-08-12 03:00:00+00', '2026-08-12 23:00:00+00',
    '2026-08-13 00:00:00+00', '["WAITING_FOR_CITIZEN"]'::jsonb, 0, 'ACTIVE'
  ) returning id into complaint_id;
  update public.complaints set sla_snapshot_id = complaint_id where id = '70000000-0000-4000-8000-000000000006'::uuid;

  insert into public.complaint_status_logs (id, tenant_id, complaint_id, from_status, to_status, actor_type, reason, created_at) values
    ('71000000-0000-4000-8000-000000000001'::uuid, tenant_a, '70000000-0000-4000-8000-000000000001'::uuid, null, 'RECEIVED', 'SYSTEM', 'KPI fixture', '2026-08-01 00:00:00+00'),
    ('71000000-0000-4000-8000-000000000013'::uuid, tenant_a, '70000000-0000-4000-8000-000000000001'::uuid, 'RECEIVED', 'RESOLVED', 'SYSTEM', 'KPI fixture', '2026-08-02 00:00:00+00'),
    ('71000000-0000-4000-8000-000000000014'::uuid, tenant_a, '70000000-0000-4000-8000-000000000001'::uuid, 'RESOLVED', 'CLOSED', 'SYSTEM', 'KPI fixture', '2026-08-02 01:00:00+00'),
    ('71000000-0000-4000-8000-000000000002'::uuid, tenant_a, '70000000-0000-4000-8000-000000000002'::uuid, null, 'RECEIVED', 'SYSTEM', 'KPI fixture', '2026-08-03 00:00:00+00'),
    ('71000000-0000-4000-8000-000000000003'::uuid, tenant_a, '70000000-0000-4000-8000-000000000002'::uuid, 'RECEIVED', 'RESOLVED', 'SYSTEM', 'KPI fixture', '2026-08-04 00:00:00+00'),
    ('71000000-0000-4000-8000-000000000004'::uuid, tenant_a, '70000000-0000-4000-8000-000000000002'::uuid, 'RESOLVED', 'CLOSED', 'SYSTEM', 'KPI fixture', '2026-08-04 01:00:00+00'),
    ('71000000-0000-4000-8000-000000000005'::uuid, tenant_a, '70000000-0000-4000-8000-000000000002'::uuid, 'CLOSED', 'IN_PROGRESS', 'SYSTEM', 'KPI fixture', '2026-08-05 00:00:00+00'),
    ('71000000-0000-4000-8000-000000000006'::uuid, tenant_a, '70000000-0000-4000-8000-000000000003'::uuid, null, 'CANCELLED', 'SYSTEM', 'KPI fixture', '2026-08-05 00:00:00+00'),
    ('71000000-0000-4000-8000-000000000007'::uuid, tenant_a, '70000000-0000-4000-8000-000000000004'::uuid, null, 'OUT_OF_JURISDICTION', 'SYSTEM', 'KPI fixture', '2026-08-06 00:00:00+00'),
    ('71000000-0000-4000-8000-000000000008'::uuid, tenant_a, '70000000-0000-4000-8000-000000000005'::uuid, null, 'RECEIVED', 'SYSTEM', 'KPI fixture', '2026-08-07 00:00:00+00'),
    ('71000000-0000-4000-8000-000000000009'::uuid, tenant_a, '70000000-0000-4000-8000-000000000005'::uuid, 'RECEIVED', 'WAITING_FOR_CITIZEN', 'SYSTEM', 'KPI fixture', '2026-08-07 03:00:00+00'),
    ('71000000-0000-4000-8000-000000000010'::uuid, tenant_a, '70000000-0000-4000-8000-000000000005'::uuid, 'WAITING_FOR_CITIZEN', 'IN_PROGRESS', 'SYSTEM', 'KPI fixture', '2026-08-08 03:00:00+00'),
    ('71000000-0000-4000-8000-000000000011'::uuid, tenant_a, '70000000-0000-4000-8000-000000000005'::uuid, 'IN_PROGRESS', 'RESOLVED', 'SYSTEM', 'KPI fixture', '2026-08-09 00:30:00+00'),
    ('71000000-0000-4000-8000-000000000012'::uuid, tenant_a, '70000000-0000-4000-8000-000000000006'::uuid, null, 'RECEIVED', 'SYSTEM', 'KPI fixture', '2026-08-10 00:00:00+00');

  insert into public.support_tickets (
    id, tenant_id, public_ticket_id, request_key, request_fingerprint, source_event_id,
    citizen_identity_hash, topic_key, channel, reason_code, reason_detail,
    default_intake_queue_id, assigned_department_id, priority, confirmation_state,
    canonical_status, source_trace, sla_snapshot, created_at, updated_at
  ) values
    ('72000000-0000-4000-8000-000000000001'::uuid, tenant_a, 'KPI-2026-000001', 'kpi-ticket-001', repeat('a', 64), 'kpi-ticket-event-001', repeat('b', 64), repeat('c', 64), 'SYSTEM', 'LOW_EVIDENCE', 'KPI fixture ticket one', queue_a1, department_a1, 'NORMAL', 'CONFIRMED', 'CLOSED', '{}'::jsonb, '{}'::jsonb, '2026-08-02 00:00:00+00', '2026-08-03 00:00:00+00'),
    ('72000000-0000-4000-8000-000000000002'::uuid, tenant_a, 'KPI-2026-000002', 'kpi-ticket-002', repeat('d', 64), 'kpi-ticket-event-002', repeat('e', 64), repeat('f', 64), 'SYSTEM', 'NO_EVIDENCE', 'KPI fixture ticket two', queue_a1, department_a1, 'NORMAL', 'CONFIRMED', 'IN_PROGRESS', '{}'::jsonb, '{}'::jsonb, '2026-08-04 00:00:00+00', '2026-08-04 00:00:00+00');

  insert into public.support_ticket_status_logs (id, tenant_id, ticket_id, from_status, to_status, actor_type, reason, occurred_at) values
    ('73000000-0000-4000-8000-000000000001'::uuid, tenant_a, '72000000-0000-4000-8000-000000000001'::uuid, null, 'NEW', 'SYSTEM', 'KPI fixture', '2026-08-02 00:00:00+00'),
    ('73000000-0000-4000-8000-000000000002'::uuid, tenant_a, '72000000-0000-4000-8000-000000000001'::uuid, 'NEW', 'CLOSED', 'SYSTEM', 'KPI fixture', '2026-08-03 00:00:00+00'),
    ('73000000-0000-4000-8000-000000000003'::uuid, tenant_a, '72000000-0000-4000-8000-000000000002'::uuid, null, 'IN_PROGRESS', 'SYSTEM', 'KPI fixture', '2026-08-04 00:00:00+00');
end;
$$;

do $$
declare
  result record;
  tenant_a uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  department_a1 uuid := '30000000-0000-4000-8000-000000000001'::uuid;
  from_at timestamptz := '2026-08-01 00:00:00+00';
  to_at timestamptz := '2026-08-11 00:00:00+00';
begin
  select * into result from private.calculate_kpi(tenant_a, 'COMPLAINT_RECEIVED_VOLUME', from_at, to_at);
  if result.numerator <> 6 or result.denominator <> 6 or result.value <> 6 then raise exception 'received fixture mismatch: %', result; end if;
  select * into result from private.calculate_kpi(tenant_a, 'COMPLAINT_CLOSED_VOLUME', from_at, to_at);
  if result.numerator <> 2 then raise exception 'closed fixture mismatch: %', result; end if;
  select * into result from private.calculate_kpi(tenant_a, 'COMPLAINT_OPEN_BACKLOG', from_at, to_at);
  if result.numerator <> 3 then raise exception 'backlog fixture mismatch: %', result; end if;
  select * into result from private.calculate_kpi(tenant_a, 'COMPLAINT_REOPENED_VOLUME', from_at, to_at);
  if result.numerator <> 1 then raise exception 'reopened fixture mismatch: %', result; end if;
  select * into result from private.calculate_kpi(tenant_a, 'FIRST_RESPONSE_SLA_RATE', from_at, to_at);
  if result.numerator <> 2 or result.denominator <> 3 or result.pending <> 1 or result.excluded <> 2 then raise exception 'first response fixture mismatch: %', result; end if;
  select * into result from private.calculate_kpi(tenant_a, 'RESOLUTION_SLA_RATE', from_at, to_at);
  if result.numerator <> 2 or result.denominator <> 3 or result.pending <> 1 or result.excluded <> 2 then raise exception 'resolution fixture mismatch: %', result; end if;
  select * into result from private.calculate_kpi(tenant_a, 'OUT_OF_JURISDICTION_RATE', from_at, to_at);
  if result.numerator <> 1 or result.denominator <> 5 or result.excluded <> 1 then raise exception 'out-of-jurisdiction fixture mismatch: %', result; end if;
  select * into result from private.calculate_kpi(tenant_a, 'SUPPORT_TICKET_VOLUME', from_at, to_at);
  if result.numerator <> 2 then raise exception 'support volume fixture mismatch: %', result; end if;
  select * into result from private.calculate_kpi(tenant_a, 'SUPPORT_TICKET_CLOSED_RATE', from_at, to_at);
  if result.numerator <> 1 or result.denominator <> 2 then raise exception 'support closure fixture mismatch: %', result; end if;
  select * into result from private.calculate_kpi(tenant_a, 'COMPLAINT_RECEIVED_VOLUME', from_at, to_at, department_a1);
  if result.numerator <> 4 then raise exception 'department fixture mismatch: %', result; end if;
end;
$$;

rollback;

-- Version pin/rollback contract: a retired definition remains readable for a
-- historical snapshot or rollback, while the default selection still picks
-- only the current APPROVED version.
begin;
do $$
declare
  tenant_a uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  admin_account uuid := '10000000-0000-4000-8000-000000000004'::uuid;
  result record;
begin
  insert into public.kpi_metric_definitions (
    tenant_id, metric_key, version, state, display_name, metric_kind, unit,
    formula_sql, cohort_rule, timezone, null_rule, tooltip_text, source_tables,
    drilldown_query, definition_json, effective_from, created_by_account_id
  )
  select tenant_id, metric_key, 2, 'DRAFT', display_name, metric_kind, unit,
         formula_sql, cohort_rule, timezone, null_rule, tooltip_text, source_tables,
         drilldown_query, definition_json, effective_from, created_by_account_id
    from public.kpi_metric_definitions
   where tenant_id = tenant_a and metric_key = 'COMPLAINT_RECEIVED_VOLUME' and version = 1;

  update public.kpi_metric_definitions
     set state = 'RETIRED', retired_at = statement_timestamp()
   where tenant_id = tenant_a and metric_key = 'COMPLAINT_RECEIVED_VOLUME' and version = 1;
  update public.kpi_metric_definitions
     set state = 'APPROVED', approved_by_account_id = admin_account, approved_at = statement_timestamp()
   where tenant_id = tenant_a and metric_key = 'COMPLAINT_RECEIVED_VOLUME' and version = 2;

  select * into result from private.calculate_kpi(
    tenant_a,
    'COMPLAINT_RECEIVED_VOLUME',
    '2026-08-01 00:00:00+00'::timestamptz,
    '2026-08-11 00:00:00+00'::timestamptz,
    null,
    1
  );
  if result.definition_version <> 1 then
    raise exception 'pinned KPI rollback version was not preserved: %', result;
  end if;
end;
$$;
rollback;
