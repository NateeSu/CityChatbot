-- Requirements: RF-12, RF-15, RF-17
-- P7-KPI-002: idempotent daily/monthly snapshots, watermark, late-data
-- correction and raw-vs-snapshot reconciliation. Snapshot facts are append-only
-- revisions; browser clients cannot create, update or delete them.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.kpi_snapshot_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  job_key text not null,
  idempotency_key text not null,
  granularity text not null,
  source_watermark timestamptz not null,
  definition_version integer,
  status text not null default 'RUNNING',
  cursor_position integer not null default 0,
  total_work integer not null default 0,
  processed_work integer not null default 0,
  error_detail_redacted text,
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint kpi_snapshot_runs_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint kpi_snapshot_runs_tenant_id_uq unique (tenant_id, id),
  constraint kpi_snapshot_runs_idempotency_uq unique (tenant_id, job_key, idempotency_key),
  constraint kpi_snapshot_runs_job_key_ck check (job_key ~ '^[a-z][a-z0-9_.:-]{2,127}$'),
  constraint kpi_snapshot_runs_idempotency_ck check (idempotency_key ~ '^[A-Za-z0-9._:-]{8,255}$'),
  constraint kpi_snapshot_runs_granularity_ck check (granularity in ('DAILY', 'MONTHLY')),
  constraint kpi_snapshot_runs_definition_ck check (definition_version is null or definition_version > 0),
  constraint kpi_snapshot_runs_status_ck check (status in ('RUNNING', 'PARTIAL', 'SUCCEEDED', 'FAILED')),
  constraint kpi_snapshot_runs_cursor_ck check (cursor_position >= 0 and processed_work >= cursor_position and cursor_position <= total_work and processed_work <= total_work),
  constraint kpi_snapshot_runs_total_ck check (total_work >= 0),
  constraint kpi_snapshot_runs_completion_ck check (completed_at is null or status in ('SUCCEEDED', 'FAILED')),
  constraint kpi_snapshot_runs_error_ck check (error_detail_redacted is null or length(btrim(error_detail_redacted)) between 3 and 2000),
  constraint kpi_snapshot_runs_row_version_ck check (row_version > 0)
);
create index if not exists kpi_snapshot_runs_status_idx
  on public.kpi_snapshot_runs (tenant_id, status, updated_at desc, id);

create table if not exists public.kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  snapshot_key text not null,
  metric_key text not null,
  definition_version integer not null,
  granularity text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  department_id uuid,
  numerator bigint not null,
  denominator bigint not null,
  pending bigint not null default 0,
  excluded bigint not null default 0,
  value numeric,
  unit text not null,
  source_watermark timestamptz not null,
  source_digest text not null,
  source_run_id uuid,
  state text not null default 'CURRENT',
  revision integer not null default 1,
  correction_reason text,
  retention_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint kpi_snapshots_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint kpi_snapshots_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint kpi_snapshots_run_fk foreign key (tenant_id, source_run_id)
    references public.kpi_snapshot_runs (tenant_id, id) on delete restrict,
  constraint kpi_snapshots_tenant_id_uq unique (tenant_id, id),
  constraint kpi_snapshots_identity_uq unique (tenant_id, snapshot_key, revision),
  constraint kpi_snapshots_key_ck check (length(btrim(snapshot_key)) between 8 and 512),
  constraint kpi_snapshots_metric_ck check (metric_key ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  constraint kpi_snapshots_definition_ck check (definition_version > 0),
  constraint kpi_snapshots_granularity_ck check (granularity in ('DAILY', 'MONTHLY')),
  constraint kpi_snapshots_period_ck check (period_start < period_end),
  constraint kpi_snapshots_counts_ck check (numerator >= 0 and denominator >= 0 and pending >= 0 and excluded >= 0),
  constraint kpi_snapshots_value_ck check (value is null or value >= 0),
  constraint kpi_snapshots_unit_ck check (unit in ('CASES', 'PERCENT')),
  constraint kpi_snapshots_digest_ck check (source_digest ~ '^[a-f0-9]{64}$'),
  constraint kpi_snapshots_state_ck check (state in ('CURRENT', 'SUPERSEDED', 'ARCHIVED')),
  constraint kpi_snapshots_revision_ck check (revision > 0),
  constraint kpi_snapshots_reason_ck check (correction_reason is null or length(btrim(correction_reason)) between 3 and 2000),
  constraint kpi_snapshots_row_version_ck check (row_version > 0)
);
create unique index if not exists kpi_snapshots_current_uq
  on public.kpi_snapshots (tenant_id, snapshot_key)
  where state = 'CURRENT';
create index if not exists kpi_snapshots_lookup_idx
  on public.kpi_snapshots (tenant_id, metric_key, granularity, period_start, period_end, state, revision desc);
create index if not exists kpi_snapshots_department_idx
  on public.kpi_snapshots (tenant_id, department_id, metric_key, period_start, period_end, state);

create table if not exists public.kpi_snapshot_watermarks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  job_key text not null,
  granularity text not null,
  watermark_at timestamptz not null,
  last_period_end timestamptz,
  last_run_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint kpi_snapshot_watermarks_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint kpi_snapshot_watermarks_run_fk foreign key (tenant_id, last_run_id)
    references public.kpi_snapshot_runs (tenant_id, id) on delete restrict,
  constraint kpi_snapshot_watermarks_tenant_id_uq unique (tenant_id, id),
  constraint kpi_snapshot_watermarks_job_uq unique (tenant_id, job_key),
  constraint kpi_snapshot_watermarks_job_key_ck check (job_key ~ '^[a-z][a-z0-9_.:-]{2,127}$'),
  constraint kpi_snapshot_watermarks_granularity_ck check (granularity in ('DAILY', 'MONTHLY')),
  constraint kpi_snapshot_watermarks_row_version_ck check (row_version > 0)
);

create table if not exists public.kpi_snapshot_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  snapshot_id uuid not null,
  expected_numerator bigint not null,
  expected_denominator bigint not null,
  expected_pending bigint not null,
  expected_excluded bigint not null,
  expected_value numeric,
  actual_numerator bigint not null,
  actual_denominator bigint not null,
  actual_pending bigint not null,
  actual_excluded bigint not null,
  actual_value numeric,
  definition_version integer not null,
  status text not null,
  checked_at timestamptz not null default statement_timestamp(),
  constraint kpi_snapshot_reconciliations_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint kpi_snapshot_reconciliations_snapshot_fk foreign key (tenant_id, snapshot_id)
    references public.kpi_snapshots (tenant_id, id) on delete restrict,
  constraint kpi_snapshot_reconciliations_tenant_id_uq unique (tenant_id, id),
  constraint kpi_snapshot_reconciliations_counts_ck check (
    expected_numerator >= 0 and expected_denominator >= 0 and expected_pending >= 0 and expected_excluded >= 0
    and actual_numerator >= 0 and actual_denominator >= 0 and actual_pending >= 0 and actual_excluded >= 0
  ),
  constraint kpi_snapshot_reconciliations_definition_ck check (definition_version > 0),
  constraint kpi_snapshot_reconciliations_status_ck check (status in ('MATCH', 'MISMATCH'))
);
create index if not exists kpi_snapshot_reconciliations_lookup_idx
  on public.kpi_snapshot_reconciliations (tenant_id, snapshot_id, checked_at desc, id);

create or replace function private.reject_kpi_snapshot_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'KPI snapshots are append-only revisions';
  end if;
  if new.tenant_id <> old.tenant_id
     or new.snapshot_key <> old.snapshot_key
     or new.metric_key <> old.metric_key
     or new.definition_version <> old.definition_version
     or new.granularity <> old.granularity
     or new.period_start <> old.period_start
     or new.period_end <> old.period_end
     or new.department_id is distinct from old.department_id
     or new.numerator <> old.numerator
     or new.denominator <> old.denominator
     or new.pending <> old.pending
     or new.excluded <> old.excluded
     or new.value is distinct from old.value
     or new.unit <> old.unit
     or new.source_watermark <> old.source_watermark
     or new.source_digest <> old.source_digest
     or new.source_run_id is distinct from old.source_run_id
     or new.revision <> old.revision
     or new.correction_reason is distinct from old.correction_reason
     or new.retention_until is distinct from old.retention_until then
    raise exception using errcode = '55000', message = 'KPI snapshot facts are immutable; append a corrected revision';
  end if;
  if not ((old.state = 'CURRENT' and new.state = 'SUPERSEDED') or (old.state = 'SUPERSEDED' and new.state = 'ARCHIVED')) then
    raise exception using errcode = '55000', message = 'KPI snapshot state transition is invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists kpi_snapshots_mutation_guard on public.kpi_snapshots;
create trigger kpi_snapshots_mutation_guard
  before update or delete on public.kpi_snapshots
  for each row execute function private.reject_kpi_snapshot_mutation();

create or replace function private.reject_kpi_snapshot_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000', message = 'KPI reconciliation history is append-only';
end;
$$;

drop trigger if exists kpi_snapshot_reconciliations_append_only on public.kpi_snapshot_reconciliations;
create trigger kpi_snapshot_reconciliations_append_only
  before update or delete on public.kpi_snapshot_reconciliations
  for each row execute function private.reject_kpi_snapshot_append_only();

drop trigger if exists kpi_snapshot_runs_touch_updated_at on public.kpi_snapshot_runs;
create trigger kpi_snapshot_runs_touch_updated_at
  before update on public.kpi_snapshot_runs
  for each row execute function private.touch_mutable_row();
drop trigger if exists kpi_snapshot_watermarks_touch_updated_at on public.kpi_snapshot_watermarks;
create trigger kpi_snapshot_watermarks_touch_updated_at
  before update on public.kpi_snapshot_watermarks
  for each row execute function private.touch_mutable_row();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'kpi_snapshot_runs', 'kpi_snapshots', 'kpi_snapshot_watermarks', 'kpi_snapshot_reconciliations'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

drop policy if exists kpi_snapshots_read_current on public.kpi_snapshots;
create policy kpi_snapshots_read_current on public.kpi_snapshots
  for select to authenticated
  using (state = 'CURRENT' and (select private.can_read_tenant(tenant_id)));

revoke all on table public.kpi_snapshot_runs, public.kpi_snapshot_watermarks, public.kpi_snapshot_reconciliations from anon, authenticated;
revoke insert, update, delete, truncate on table public.kpi_snapshots from anon, authenticated;
grant select on table public.kpi_snapshots to authenticated;

create or replace function private.kpi_snapshot_key(
  p_metric_key text,
  p_granularity text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_department_id uuid
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select p_metric_key || '|' || p_granularity || '|'
    || (p_period_start at time zone 'UTC')::text || '|'
    || (p_period_end at time zone 'UTC')::text || '|'
    || coalesce(p_department_id::text, 'TENANT');
$$;

create or replace function private.record_kpi_snapshot_run(
  p_tenant_id uuid,
  p_job_key text,
  p_idempotency_key text,
  p_granularity text,
  p_source_watermark timestamptz,
  p_total_work integer,
  p_definition_version integer default null
)
returns table (run_id uuid, idempotent_replay boolean, status text, cursor_position integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing public.kpi_snapshot_runs%rowtype;
begin
  if p_tenant_id is null or p_job_key is null or p_idempotency_key is null or p_source_watermark is null or p_total_work < 0 then
    raise exception using errcode = '22023', message = 'KPI snapshot run input is invalid';
  end if;
  insert into public.kpi_snapshot_runs (
    tenant_id, job_key, idempotency_key, granularity, source_watermark,
    total_work, definition_version
  ) values (
    p_tenant_id, p_job_key, p_idempotency_key, p_granularity, p_source_watermark,
    p_total_work, p_definition_version
  ) on conflict (tenant_id, job_key, idempotency_key) do nothing;
  select * into existing
    from public.kpi_snapshot_runs as run
   where run.tenant_id = p_tenant_id
     and run.job_key = p_job_key
     and run.idempotency_key = p_idempotency_key;
  if existing.total_work <> p_total_work
     or existing.granularity <> p_granularity
     or existing.source_watermark <> p_source_watermark
     or existing.definition_version is distinct from p_definition_version then
    raise exception using errcode = '23505', message = 'KPI snapshot idempotency payload differs';
  end if;
  return query select existing.id, existing.status <> 'RUNNING', existing.status, existing.cursor_position;
end;
$$;

create or replace function private.complete_kpi_snapshot_run(
  p_tenant_id uuid,
  p_run_id uuid,
  p_status text,
  p_cursor_position integer,
  p_processed_work integer,
  p_error_detail_redacted text default null
)
returns public.kpi_snapshot_runs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result public.kpi_snapshot_runs%rowtype;
begin
  if p_status not in ('PARTIAL', 'SUCCEEDED', 'FAILED') or p_cursor_position < 0 or p_processed_work < p_cursor_position then
    raise exception using errcode = '22023', message = 'KPI snapshot run completion is invalid';
  end if;
  update public.kpi_snapshot_runs
     set status = p_status,
         cursor_position = p_cursor_position,
         processed_work = p_processed_work,
         error_detail_redacted = p_error_detail_redacted,
         completed_at = case when p_status in ('SUCCEEDED', 'FAILED') then statement_timestamp() else null end
   where tenant_id = p_tenant_id and id = p_run_id;
  if not found then raise exception using errcode = 'P0002', message = 'KPI snapshot run not found'; end if;
  select * into result from public.kpi_snapshot_runs where tenant_id = p_tenant_id and id = p_run_id;
  return result;
end;
$$;

create or replace function private.advance_kpi_snapshot_watermark(
  p_tenant_id uuid,
  p_job_key text,
  p_granularity text,
  p_watermark_at timestamptz,
  p_period_end timestamptz default null,
  p_run_id uuid default null
)
returns public.kpi_snapshot_watermarks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result public.kpi_snapshot_watermarks%rowtype;
begin
  insert into public.kpi_snapshot_watermarks (
    tenant_id, job_key, granularity, watermark_at, last_period_end, last_run_id
  ) values (
    p_tenant_id, p_job_key, p_granularity, p_watermark_at, p_period_end, p_run_id
  ) on conflict (tenant_id, job_key) do update set
    granularity = excluded.granularity,
    watermark_at = excluded.watermark_at,
    last_period_end = excluded.last_period_end,
    last_run_id = excluded.last_run_id
  where excluded.watermark_at > public.kpi_snapshot_watermarks.watermark_at;
  select * into result from public.kpi_snapshot_watermarks
   where tenant_id = p_tenant_id and job_key = p_job_key;
  return result;
end;
$$;

create or replace function private.materialize_kpi_snapshot(
  p_tenant_id uuid,
  p_metric_key text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_department_id uuid,
  p_granularity text,
  p_source_watermark timestamptz,
  p_source_run_id uuid default null,
  p_definition_version integer default null,
  p_correction_reason text default null,
  p_retention_until timestamptz default null
)
returns table (snapshot_id uuid, revision integer, idempotent_replay boolean, source_digest text, numerator bigint, denominator bigint, pending bigint, excluded bigint, value numeric)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  raw record;
  current_snapshot public.kpi_snapshots%rowtype;
  next_revision integer;
  key text;
  digest text;
  inserted_snapshot public.kpi_snapshots%rowtype;
begin
  if p_period_start is null or p_period_end is null or p_period_start >= p_period_end or p_source_watermark is null then
    raise exception using errcode = '22023', message = 'KPI snapshot period/watermark is invalid';
  end if;
  if p_source_run_id is not null and not exists (select 1 from public.kpi_snapshot_runs where tenant_id = p_tenant_id and id = p_source_run_id) then
    raise exception using errcode = '23503', message = 'KPI snapshot source run is not in the same tenant';
  end if;
  select * into raw from private.calculate_kpi(
    p_tenant_id, p_metric_key, p_period_start, p_period_end, p_department_id, p_definition_version
  );
  key := private.kpi_snapshot_key(raw.metric_key, p_granularity, p_period_start, p_period_end, p_department_id);
  digest := encode(digest(
    raw.metric_key || '|' || raw.definition_version::text || '|' || p_period_start::text || '|'
    || p_period_end::text || '|' || coalesce(p_department_id::text, 'TENANT') || '|'
    || raw.numerator::text || '|' || raw.denominator::text || '|' || raw.pending::text || '|'
    || raw.excluded::text || '|' || coalesce(raw.value::text, 'NULL') || '|' || p_source_watermark::text,
    'sha256'
  ), 'hex');
  select * into current_snapshot
    from public.kpi_snapshots as snapshot
   where snapshot.tenant_id = p_tenant_id and snapshot.snapshot_key = key and snapshot.state = 'CURRENT'
   for update;
  if found
     and current_snapshot.definition_version = raw.definition_version
     and current_snapshot.numerator = raw.numerator
     and current_snapshot.denominator = raw.denominator
     and current_snapshot.pending = raw.pending
     and current_snapshot.excluded = raw.excluded
     and current_snapshot.value is not distinct from raw.value
     and current_snapshot.unit = raw.unit then
    return query select current_snapshot.id, current_snapshot.revision, true, current_snapshot.source_digest,
      current_snapshot.numerator, current_snapshot.denominator, current_snapshot.pending, current_snapshot.excluded, current_snapshot.value;
    return;
  end if;
  if found then
    update public.kpi_snapshots set state = 'SUPERSEDED' where tenant_id = p_tenant_id and id = current_snapshot.id;
  end if;
  select coalesce(max(snapshot.revision), 0) + 1 into next_revision
    from public.kpi_snapshots as snapshot
   where snapshot.tenant_id = p_tenant_id and snapshot.snapshot_key = key;
  insert into public.kpi_snapshots (
    tenant_id, snapshot_key, metric_key, definition_version, granularity,
    period_start, period_end, department_id, numerator, denominator, pending,
    excluded, value, unit, source_watermark, source_digest, source_run_id,
    state, revision, correction_reason, retention_until
  ) values (
    p_tenant_id, key, raw.metric_key, raw.definition_version, p_granularity,
    p_period_start, p_period_end, p_department_id, raw.numerator, raw.denominator,
    raw.pending, raw.excluded, raw.value, raw.unit, p_source_watermark, digest,
    p_source_run_id, 'CURRENT', next_revision, p_correction_reason, p_retention_until
  ) returning * into inserted_snapshot;
  return query select inserted_snapshot.id, inserted_snapshot.revision, false, inserted_snapshot.source_digest,
    inserted_snapshot.numerator, inserted_snapshot.denominator, inserted_snapshot.pending, inserted_snapshot.excluded, inserted_snapshot.value;
end;
$$;

create or replace function private.reconcile_kpi_snapshot(
  p_tenant_id uuid,
  p_snapshot_id uuid
)
returns table (reconciliation_id uuid, status text, expected_numerator bigint, actual_numerator bigint, expected_denominator bigint, actual_denominator bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  snapshot public.kpi_snapshots%rowtype;
  raw record;
  match_status text;
  inserted_reconciliation public.kpi_snapshot_reconciliations%rowtype;
begin
  select * into snapshot from public.kpi_snapshots where tenant_id = p_tenant_id and id = p_snapshot_id;
  if not found then raise exception using errcode = 'P0002', message = 'KPI snapshot not found'; end if;
  select * into raw from private.calculate_kpi(
    snapshot.tenant_id, snapshot.metric_key, snapshot.period_start, snapshot.period_end,
    snapshot.department_id, snapshot.definition_version
  );
  match_status := case when raw.numerator = snapshot.numerator
    and raw.denominator = snapshot.denominator
    and raw.pending = snapshot.pending
    and raw.excluded = snapshot.excluded
    and raw.value is not distinct from snapshot.value
    and raw.definition_version = snapshot.definition_version then 'MATCH' else 'MISMATCH' end;
  insert into public.kpi_snapshot_reconciliations (
    tenant_id, snapshot_id, expected_numerator, expected_denominator, expected_pending,
    expected_excluded, expected_value, actual_numerator, actual_denominator,
    actual_pending, actual_excluded, actual_value, definition_version, status
  ) values (
    p_tenant_id, p_snapshot_id, raw.numerator, raw.denominator, raw.pending,
    raw.excluded, raw.value, snapshot.numerator, snapshot.denominator,
    snapshot.pending, snapshot.excluded, snapshot.value, snapshot.definition_version, match_status
  ) returning * into inserted_reconciliation;
  return query select inserted_reconciliation.id, inserted_reconciliation.status,
    inserted_reconciliation.expected_numerator, inserted_reconciliation.actual_numerator,
    inserted_reconciliation.expected_denominator, inserted_reconciliation.actual_denominator;
end;
$$;

revoke all on function private.record_kpi_snapshot_run(uuid, text, text, text, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function private.complete_kpi_snapshot_run(uuid, uuid, text, integer, integer, text) from public, anon, authenticated;
revoke all on function private.advance_kpi_snapshot_watermark(uuid, text, text, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.materialize_kpi_snapshot(uuid, text, timestamptz, timestamptz, uuid, text, timestamptz, uuid, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function private.reconcile_kpi_snapshot(uuid, uuid) from public, anon, authenticated;

comment on table public.kpi_snapshots is 'Append-only KPI revisions; one CURRENT row per tenant snapshot key, late data creates a new revision.';
comment on table public.kpi_snapshot_watermarks is 'Monotonic per-tenant job watermark; older/out-of-order runs cannot rewind it.';
comment on table public.kpi_snapshot_reconciliations is 'Immutable raw SQL versus snapshot comparison history; mismatch blocks publication.';
comment on function private.materialize_kpi_snapshot(uuid, text, timestamptz, timestamptz, uuid, text, timestamptz, uuid, integer, text, timestamptz) is 'Trusted idempotent snapshot materialization; raw values always come from private.calculate_kpi.';
