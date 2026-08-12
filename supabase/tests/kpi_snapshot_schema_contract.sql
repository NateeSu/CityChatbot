-- PostgreSQL contract assertions for P7-KPI-002.
-- Run with ON_ERROR_STOP=1 after the KPI dictionary migration and synthetic seed.

set timezone = 'UTC';

do $$
declare
  table_name text;
  relation record;
begin
  foreach table_name in array array[
    'kpi_snapshot_runs', 'kpi_snapshots', 'kpi_snapshot_watermarks', 'kpi_snapshot_reconciliations'
  ] loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'missing KPI snapshot table public.%', table_name;
    end if;
    select c.relrowsecurity, c.relforcerowsecurity
      into relation
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = table_name;
    if not relation.relrowsecurity or not relation.relforcerowsecurity then
      raise exception 'KPI snapshot table must use forced RLS: %', table_name;
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'kpi_snapshots_department_fk')
     or not exists (select 1 from pg_constraint where conname = 'kpi_snapshots_run_fk')
     or not exists (select 1 from pg_constraint where conname = 'kpi_snapshot_reconciliations_snapshot_fk') then
    raise exception 'KPI snapshot tenant-composite relationships are missing';
  end if;
end;
$$;

do $$
declare
  function_name text;
  required_functions text[] := array[
    'record_kpi_snapshot_run', 'complete_kpi_snapshot_run',
    'advance_kpi_snapshot_watermark', 'materialize_kpi_snapshot',
    'reconcile_kpi_snapshot'
  ];
begin
  foreach function_name in array required_functions loop
    if not exists (select 1 from pg_proc where pronamespace = 'private'::regnamespace and proname = function_name) then
      raise exception 'missing private KPI snapshot function %', function_name;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.kpi_snapshot_runs', 'insert')
     and not has_table_privilege('authenticated', 'public.kpi_snapshot_runs', 'update')
     and not has_table_privilege('authenticated', 'public.kpi_snapshot_runs', 'delete')
     and not has_table_privilege('authenticated', 'public.kpi_snapshot_watermarks', 'insert')
     and not has_table_privilege('authenticated', 'public.kpi_snapshot_reconciliations', 'insert') then
    null;
  else
    raise exception 'authenticated KPI snapshot mutation privilege unexpectedly exists';
  end if;
end;
$$;

begin;

do $$
declare
  tenant_a uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  category_a uuid := '33000000-0000-4000-8000-000000000001'::uuid;
  queue_a uuid := '34000000-0000-4000-8000-000000000001'::uuid;
  prefix text;
  sequence_number bigint;
  snapshot_result record;
  snapshot_id uuid;
  run_result record;
  watermark_result record;
begin
  select reserved.prefix, reserved.sequence_number
    into prefix, sequence_number
    from private.reserve_complaint_number(tenant_a, 2026) as reserved;

  select * into snapshot_result from private.materialize_kpi_snapshot(
    tenant_a,
    'COMPLAINT_RECEIVED_VOLUME',
    '2026-09-01 00:00:00+00'::timestamptz,
    '2026-09-02 00:00:00+00'::timestamptz,
    null,
    'DAILY',
    '2026-09-02 00:00:00+00'::timestamptz
  );
  if snapshot_result.revision <> 1 or snapshot_result.idempotent_replay or snapshot_result.numerator <> 0 then
    raise exception 'initial KPI snapshot materialization mismatch: %', snapshot_result;
  end if;
  snapshot_id := snapshot_result.snapshot_id;

  select * into snapshot_result from private.materialize_kpi_snapshot(
    tenant_a,
    'COMPLAINT_RECEIVED_VOLUME',
    '2026-09-01 00:00:00+00'::timestamptz,
    '2026-09-02 00:00:00+00'::timestamptz,
    null,
    'DAILY',
    '2026-09-02 00:00:00+00'::timestamptz
  );
  if not snapshot_result.idempotent_replay or snapshot_result.revision <> 1 then
    raise exception 'KPI snapshot replay is not idempotent: %', snapshot_result;
  end if;

  insert into public.complaints (
    id, tenant_id, complaint_no, complaint_year, complaint_sequence, line_user_id,
    category_id, category_uncertain, title, description, canonical_status,
    priority, risk_level, intake_queue_id, created_at, updated_at
  ) values (
    '74000000-0000-4000-8000-000000000001'::uuid,
    tenant_a,
    prefix || '-2026-' || lpad(sequence_number::text, 6, '0'),
    2026,
    sequence_number,
    'kpi-snapshot-late-event',
    category_a,
    false,
    'KPI snapshot late event',
    'Synthetic late event for rollback-safe snapshot contract',
    'RECEIVED',
    'NORMAL',
    'STANDARD',
    queue_a,
    '2026-09-01 12:00:00+00',
    '2026-09-01 12:00:00+00'
  );

  select * into snapshot_result from private.materialize_kpi_snapshot(
    tenant_a,
    'COMPLAINT_RECEIVED_VOLUME',
    '2026-09-01 00:00:00+00'::timestamptz,
    '2026-09-02 00:00:00+00'::timestamptz,
    null,
    'DAILY',
    '2026-09-03 00:00:00+00'::timestamptz,
    null,
    null,
    'late source event'
  );
  if snapshot_result.revision <> 2 or snapshot_result.idempotent_replay or snapshot_result.numerator <> 1 then
    raise exception 'late-data correction did not create exact revision: %', snapshot_result;
  end if;
  snapshot_id := snapshot_result.snapshot_id;

  select * into run_result from private.reconcile_kpi_snapshot(tenant_a, snapshot_id);
  if run_result.status <> 'MATCH' or run_result.expected_numerator <> run_result.actual_numerator then
    raise exception 'raw-vs-snapshot reconciliation mismatch: %', run_result;
  end if;

  select * into run_result from private.record_kpi_snapshot_run(
    tenant_a, 'kpi.daily', 'sql-contract-run-001', 'DAILY',
    '2026-09-03 00:00:00+00'::timestamptz, 2, 1
  );
  if run_result.status <> 'RUNNING' or run_result.idempotent_replay then
    raise exception 'snapshot run start mismatch: %', run_result;
  end if;
  select * into run_result from private.complete_kpi_snapshot_run(tenant_a, run_result.run_id, 'PARTIAL', 1, 1, 'synthetic interruption');
  if run_result.status <> 'PARTIAL' or run_result.cursor_position <> 1 then
    raise exception 'partial snapshot run resume cursor mismatch: %', run_result;
  end if;
  select * into watermark_result from private.advance_kpi_snapshot_watermark(
    tenant_a, 'kpi.daily', 'DAILY', '2026-09-03 00:00:00+00'::timestamptz,
    '2026-09-02 00:00:00+00'::timestamptz, run_result.id
  );
  if watermark_result.watermark_at <> '2026-09-03 00:00:00+00'::timestamptz then
    raise exception 'KPI watermark was not advanced: %', watermark_result;
  end if;
  select * into watermark_result from private.advance_kpi_snapshot_watermark(
    tenant_a, 'kpi.daily', 'DAILY', '2026-09-01 00:00:00+00'::timestamptz
  );
  if watermark_result.watermark_at <> '2026-09-03 00:00:00+00'::timestamptz then
    raise exception 'out-of-order watermark rewound the checkpoint: %', watermark_result;
  end if;
end;
$$;

rollback;
