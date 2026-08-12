-- Requirements: RF-06, RF-12, RF-17, RF-18
-- P7-KPI-001: versioned metric dictionary and deterministic SQL truth.
-- Numeric values are computed from the tenant-scoped read model only. AI is
-- intentionally absent from this migration and cannot author KPI numbers.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.kpi_metric_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  metric_key text not null,
  version integer not null,
  state text not null default 'DRAFT',
  display_name text not null,
  metric_kind text not null,
  unit text not null,
  formula_sql text not null,
  cohort_rule text not null,
  timezone text not null,
  null_rule text not null,
  tooltip_text text not null,
  source_tables text[] not null,
  drilldown_query text not null,
  definition_json jsonb not null default '{}'::jsonb,
  effective_from timestamptz,
  effective_until timestamptz,
  created_by_account_id uuid not null,
  approved_by_account_id uuid,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint kpi_metric_definitions_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint kpi_metric_definitions_creator_fk foreign key (created_by_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint kpi_metric_definitions_approver_fk foreign key (approved_by_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint kpi_metric_definitions_tenant_id_uq unique (tenant_id, id),
  constraint kpi_metric_definitions_key_version_uq unique (tenant_id, metric_key, version),
  constraint kpi_metric_definitions_key_ck check (metric_key ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  constraint kpi_metric_definitions_version_ck check (version > 0),
  constraint kpi_metric_definitions_state_ck check (state in ('DRAFT', 'APPROVED', 'RETIRED')),
  constraint kpi_metric_definitions_kind_ck check (metric_kind in ('COUNT', 'RATE')),
  constraint kpi_metric_definitions_unit_ck check (unit in ('CASES', 'PERCENT')),
  constraint kpi_metric_definitions_timezone_ck check (length(btrim(timezone)) between 1 and 128),
  constraint kpi_metric_definitions_array_ck check (cardinality(source_tables) > 0),
  constraint kpi_metric_definitions_json_ck check (jsonb_typeof(definition_json) = 'object'),
  constraint kpi_metric_definitions_window_ck check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint kpi_metric_definitions_approval_ck check (
    state = 'DRAFT'
    or (approved_by_account_id is not null and approved_at is not null)
  ),
  constraint kpi_metric_definitions_retired_ck check (state <> 'RETIRED' or retired_at is not null),
  constraint kpi_metric_definitions_row_version_ck check (row_version > 0),
  constraint kpi_metric_definitions_text_ck check (
    length(btrim(display_name)) between 1 and 200
    and length(btrim(formula_sql)) between 1 and 4000
    and length(btrim(cohort_rule)) between 1 and 2000
    and length(btrim(null_rule)) between 1 and 2000
    and length(btrim(tooltip_text)) between 1 and 2000
    and length(btrim(drilldown_query)) between 1 and 4000
  )
);

create unique index if not exists kpi_metric_definitions_approved_uq
  on public.kpi_metric_definitions (tenant_id, metric_key)
  where state = 'APPROVED';
create index if not exists kpi_metric_definitions_lookup_idx
  on public.kpi_metric_definitions (tenant_id, state, metric_key, effective_from, version desc);

create or replace function private.guard_kpi_metric_definition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and old.state in ('APPROVED', 'RETIRED') then
    if new.metric_key <> old.metric_key
       or new.version <> old.version
       or new.formula_sql <> old.formula_sql
       or new.cohort_rule <> old.cohort_rule
       or new.timezone <> old.timezone
       or new.null_rule <> old.null_rule
       or new.tooltip_text <> old.tooltip_text
       or new.source_tables <> old.source_tables
       or new.drilldown_query <> old.drilldown_query
       or new.definition_json <> old.definition_json then
      raise exception using errcode = '55000', message = 'approved KPI definition is immutable; create a new version';
    end if;
  end if;
  if new.state in ('APPROVED', 'RETIRED')
     and (new.approved_by_account_id is null or new.approved_at is null) then
    raise exception using errcode = '23514', message = 'approved KPI definition requires approval metadata';
  end if;
  return new;
end;
$$;

drop trigger if exists kpi_metric_definitions_state_guard on public.kpi_metric_definitions;
create trigger kpi_metric_definitions_state_guard
  before insert or update on public.kpi_metric_definitions
  for each row execute function private.guard_kpi_metric_definition();

drop trigger if exists kpi_metric_definitions_touch_updated_at on public.kpi_metric_definitions;
create trigger kpi_metric_definitions_touch_updated_at
  before update on public.kpi_metric_definitions
  for each row execute function private.touch_mutable_row();

alter table public.kpi_metric_definitions enable row level security;
alter table public.kpi_metric_definitions force row level security;

drop policy if exists kpi_metric_definitions_read_approved on public.kpi_metric_definitions;
create policy kpi_metric_definitions_read_approved on public.kpi_metric_definitions
  for select to authenticated
  using (
    state = 'APPROVED'
    and (effective_from is null or effective_from <= statement_timestamp())
    and (effective_until is null or effective_until > statement_timestamp())
    and (select private.can_read_tenant(tenant_id))
  );

revoke all on table public.kpi_metric_definitions from anon, authenticated;
grant select on table public.kpi_metric_definitions to authenticated;

create or replace view public.kpi_metric_catalog
with (security_invoker = true)
as
select
  tenant_id,
  metric_key,
  version,
  display_name,
  metric_kind,
  unit,
  formula_sql,
  cohort_rule,
  timezone,
  null_rule,
  tooltip_text,
  source_tables,
  drilldown_query,
  definition_json,
  effective_from,
  effective_until
from public.kpi_metric_definitions
where state = 'APPROVED';

grant select on public.kpi_metric_catalog to authenticated;

create or replace function private.complaint_status_at(
  p_tenant_id uuid,
  p_complaint_id uuid,
  p_as_of timestamptz,
  p_fallback_status text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select log.to_status
      from public.complaint_status_logs as log
      where log.tenant_id = p_tenant_id
        and log.complaint_id = p_complaint_id
        and log.created_at <= p_as_of
      order by log.created_at desc, log.id desc
      limit 1
    ),
    p_fallback_status
  );
$$;

create or replace function private.support_ticket_status_at(
  p_tenant_id uuid,
  p_ticket_id uuid,
  p_as_of timestamptz,
  p_fallback_status text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select log.to_status
      from public.support_ticket_status_logs as log
      where log.tenant_id = p_tenant_id
        and log.ticket_id = p_ticket_id
        and log.occurred_at <= p_as_of
      order by log.occurred_at desc, log.id desc
      limit 1
    ),
    p_fallback_status
  );
$$;

create or replace function private.calculate_kpi(
  p_tenant_id uuid,
  p_metric_key text,
  p_from timestamptz,
  p_to timestamptz,
  p_department_id uuid default null,
  p_definition_version integer default null
)
returns table (
  metric_key text,
  definition_version integer,
  tenant_id uuid,
  department_id uuid,
  period_from timestamptz,
  period_to timestamptz,
  timezone text,
  numerator bigint,
  denominator bigint,
  pending bigint,
  excluded bigint,
  value numeric,
  unit text,
  source text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_definition public.kpi_metric_definitions%rowtype;
  v_numerator bigint := 0;
  v_denominator bigint := 0;
  v_pending bigint := 0;
  v_excluded bigint := 0;
  v_value numeric;
  v_status text;
  v_due_at timestamptz;
  v_first_response_at timestamptz;
  v_resolved_at timestamptz;
begin
  if p_tenant_id is null or p_metric_key is null or p_from is null or p_to is null or p_from >= p_to then
    raise exception using errcode = '22023', message = 'KPI tenant, metric and half-open period are invalid';
  end if;

  if current_user = 'authenticated' and not private.can_read_tenant(p_tenant_id) then
    raise exception using errcode = '42501', message = 'KPI tenant scope is forbidden';
  end if;

  if p_definition_version is null then
    select definition.*
      into v_definition
      from public.kpi_metric_definitions as definition
     where definition.tenant_id = p_tenant_id
       and definition.metric_key = p_metric_key
       and definition.state = 'APPROVED'
       and (definition.effective_from is null or definition.effective_from <= p_from)
       and (definition.effective_until is null or definition.effective_until > p_from)
     order by definition.version desc
     limit 1;
  else
    select definition.*
      into v_definition
      from public.kpi_metric_definitions as definition
     where definition.tenant_id = p_tenant_id
       and definition.metric_key = p_metric_key
       and definition.version = p_definition_version
       and definition.state in ('APPROVED', 'RETIRED');
  end if;
  if not found then
    raise exception using errcode = '22023', message = 'approved KPI definition is unavailable';
  end if;

  if p_metric_key = 'COMPLAINT_RECEIVED_VOLUME' then
    select count(*) into v_numerator
      from public.complaints as complaint
     where complaint.tenant_id = p_tenant_id
       and complaint.created_at >= p_from and complaint.created_at < p_to
       and (p_department_id is null or complaint.assigned_department_id = p_department_id);
  elsif p_metric_key = 'COMPLAINT_CLOSED_VOLUME' then
    select count(*) into v_numerator
      from public.complaints as complaint
     where complaint.tenant_id = p_tenant_id
       and complaint.closed_at >= p_from and complaint.closed_at < p_to
       and (p_department_id is null or complaint.assigned_department_id = p_department_id);
  elsif p_metric_key = 'COMPLAINT_OPEN_BACKLOG' then
    select count(*) into v_numerator
      from public.complaints as complaint
     where complaint.tenant_id = p_tenant_id
       and complaint.created_at < p_to
       and (p_department_id is null or complaint.assigned_department_id = p_department_id)
       and private.complaint_status_at(p_tenant_id, complaint.id, p_to, complaint.canonical_status)
         not in ('CLOSED', 'CANCELLED', 'OUT_OF_JURISDICTION');
  elsif p_metric_key = 'COMPLAINT_REOPENED_VOLUME' then
    select count(*) into v_numerator
      from public.complaint_status_logs as log
      join public.complaints as complaint
        on complaint.tenant_id = log.tenant_id and complaint.id = log.complaint_id
     where log.tenant_id = p_tenant_id
       and log.from_status in ('RESOLVED', 'CLOSED')
       and log.to_status = 'IN_PROGRESS'
       and log.created_at >= p_from and log.created_at < p_to
       and (p_department_id is null or complaint.assigned_department_id = p_department_id);
  elsif p_metric_key = 'FIRST_RESPONSE_SLA_RATE' then
    for v_first_response_at, v_due_at, v_status in
      select complaint.first_response_at,
             snapshot.response_due_at + snapshot.paused_business_seconds * interval '1 second',
             private.complaint_status_at(p_tenant_id, complaint.id, p_to, complaint.canonical_status)
        from public.complaints as complaint
        left join public.complaint_sla_snapshots as snapshot
          on snapshot.tenant_id = complaint.tenant_id and snapshot.id = complaint.sla_snapshot_id
       where complaint.tenant_id = p_tenant_id
         and complaint.created_at >= p_from and complaint.created_at < p_to
         and (p_department_id is null or complaint.assigned_department_id = p_department_id)
    loop
      if v_status in ('CANCELLED', 'OUT_OF_JURISDICTION') or v_due_at is null then
        v_excluded := v_excluded + 1;
      elsif v_first_response_at is not null and v_first_response_at < p_to then
        v_denominator := v_denominator + 1;
        if v_first_response_at <= v_due_at then
          v_numerator := v_numerator + 1;
        end if;
      elsif v_due_at <= p_to then
        v_denominator := v_denominator + 1;
      else
        v_pending := v_pending + 1;
      end if;
    end loop;
  elsif p_metric_key = 'RESOLUTION_SLA_RATE' then
    for v_resolved_at, v_due_at, v_status in
      select complaint.resolved_at,
             snapshot.resolution_due_at + snapshot.paused_business_seconds * interval '1 second',
             private.complaint_status_at(p_tenant_id, complaint.id, p_to, complaint.canonical_status)
        from public.complaints as complaint
        left join public.complaint_sla_snapshots as snapshot
          on snapshot.tenant_id = complaint.tenant_id and snapshot.id = complaint.sla_snapshot_id
       where complaint.tenant_id = p_tenant_id
         and complaint.created_at >= p_from and complaint.created_at < p_to
         and (p_department_id is null or complaint.assigned_department_id = p_department_id)
    loop
      if v_status in ('CANCELLED', 'OUT_OF_JURISDICTION') or v_due_at is null then
        v_excluded := v_excluded + 1;
      elsif v_resolved_at is not null and v_resolved_at < p_to then
        v_denominator := v_denominator + 1;
        if v_resolved_at <= v_due_at then
          v_numerator := v_numerator + 1;
        end if;
      elsif v_due_at <= p_to then
        v_denominator := v_denominator + 1;
      else
        v_pending := v_pending + 1;
      end if;
    end loop;
  elsif p_metric_key = 'OUT_OF_JURISDICTION_RATE' then
    select count(*) filter (where status_at = 'OUT_OF_JURISDICTION'),
           count(*) filter (where status_at <> 'CANCELLED'),
           count(*) filter (where status_at = 'CANCELLED')
      into v_numerator, v_denominator, v_excluded
      from (
        select private.complaint_status_at(p_tenant_id, complaint.id, p_to, complaint.canonical_status) as status_at
          from public.complaints as complaint
         where complaint.tenant_id = p_tenant_id
           and complaint.created_at >= p_from and complaint.created_at < p_to
           and (p_department_id is null or complaint.assigned_department_id = p_department_id)
      ) as scoped;
  elsif p_metric_key = 'SUPPORT_TICKET_VOLUME' then
    select count(*) into v_numerator
      from public.support_tickets as ticket
     where ticket.tenant_id = p_tenant_id
       and ticket.created_at >= p_from and ticket.created_at < p_to
       and (p_department_id is null or ticket.assigned_department_id = p_department_id);
  elsif p_metric_key = 'SUPPORT_TICKET_CLOSED_RATE' then
    select count(*) filter (where status_at = 'CLOSED'), count(*)
      into v_numerator, v_denominator
      from (
        select private.support_ticket_status_at(p_tenant_id, ticket.id, p_to, ticket.canonical_status) as status_at
          from public.support_tickets as ticket
         where ticket.tenant_id = p_tenant_id
           and ticket.created_at >= p_from and ticket.created_at < p_to
           and (p_department_id is null or ticket.assigned_department_id = p_department_id)
      ) as scoped;
  else
    raise exception using errcode = '22023', message = 'unsupported KPI metric key';
  end if;

  if v_definition.metric_kind = 'COUNT' then
    v_denominator := v_numerator;
    v_value := v_numerator::numeric;
  elsif v_denominator = 0 then
    v_value := null;
  else
    v_value := round(v_numerator::numeric / v_denominator::numeric, 10);
  end if;

  return query
  select
    v_definition.metric_key,
    v_definition.version,
    p_tenant_id,
    p_department_id,
    p_from,
    p_to,
    v_definition.timezone,
    v_numerator,
    v_denominator,
    v_pending,
    v_excluded,
    v_value,
    v_definition.unit,
    'APPROVED_SQL_DEFINITION'::text;
end;
$$;

revoke all on function private.calculate_kpi(uuid, text, timestamptz, timestamptz, uuid, integer) from public, anon;
grant execute on function private.calculate_kpi(uuid, text, timestamptz, timestamptz, uuid, integer) to authenticated;

revoke all on function private.complaint_status_at(uuid, uuid, timestamptz, text) from public, anon;
revoke all on function private.support_ticket_status_at(uuid, uuid, timestamptz, text) from public, anon;

comment on table public.kpi_metric_definitions is 'Tenant-scoped approved KPI dictionary; create a new version instead of mutating an approved formula.';
comment on view public.kpi_metric_catalog is 'Read-only approved KPI metadata for definitions and tooltips; numeric truth is private.calculate_kpi.';
comment on function private.calculate_kpi(uuid, text, timestamptz, timestamptz, uuid, integer) is 'Deterministic tenant-scoped KPI SQL truth. Rates return null for zero denominator and retain definition version.';
