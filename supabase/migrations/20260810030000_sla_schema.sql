-- CityChatbot SLA rules, business calendars and immutable complaint snapshots
-- Requirements: RF-03, RF-04, RF-06, RF-12, RF-15, RF-16
-- Depends on 20260810010000_rls_policy_hardening.sql and
-- 20260810020000_complaint_schema.sql.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.business_calendars (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  display_name text not null,
  timezone text not null,
  state text not null default 'DRAFT',
  working_weekdays smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],
  windows jsonb not null default '[{"start":"09:00","end":"17:00"}]'::jsonb,
  holiday_dates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint business_calendars_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint business_calendars_tenant_id_uq unique (tenant_id, id),
  constraint business_calendars_code_uq unique (tenant_id, code),
  constraint business_calendars_code_ck check (code ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  constraint business_calendars_name_ck check (length(btrim(display_name)) between 1 and 200),
  constraint business_calendars_timezone_ck check (length(btrim(timezone)) between 1 and 128),
  constraint business_calendars_state_ck check (state in ('DRAFT', 'ACTIVE', 'RETIRED')),
  constraint business_calendars_weekdays_ck check (
    cardinality(working_weekdays) between 1 and 7
    and working_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  constraint business_calendars_windows_ck check (jsonb_typeof(windows) = 'array'),
  constraint business_calendars_holidays_ck check (jsonb_typeof(holiday_dates) = 'array'),
  constraint business_calendars_row_version_ck check (row_version > 0)
);

create table if not exists public.business_calendar_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  calendar_id uuid not null,
  calendar_date date not null,
  is_working_day boolean not null,
  windows jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint business_calendar_days_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint business_calendar_days_calendar_fk foreign key (tenant_id, calendar_id)
    references public.business_calendars (tenant_id, id) on delete cascade,
  constraint business_calendar_days_tenant_id_uq unique (tenant_id, id),
  constraint business_calendar_days_date_uq unique (tenant_id, calendar_id, calendar_date),
  constraint business_calendar_days_windows_ck check (jsonb_typeof(windows) = 'array'),
  constraint business_calendar_days_note_ck check (note is null or length(btrim(note)) between 1 and 500),
  constraint business_calendar_days_row_version_ck check (row_version > 0)
);

-- The original bootstrap schema required a department.  A tenant default rule
-- is part of the canonical precedence chain, so the column becomes nullable.
alter table public.sla_rule_versions
  alter column department_id drop not null;

alter table public.sla_rule_versions
  add column if not exists category_id uuid,
  add column if not exists priority text,
  add column if not exists calendar_id uuid,
  add column if not exists pause_statuses jsonb not null default '["WAITING_FOR_CITIZEN"]'::jsonb,
  add column if not exists warning_ratio numeric(4, 3) not null default 0.800;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sla_rules_category_fk'
      and conrelid = 'public.sla_rule_versions'::regclass
  ) then
    alter table public.sla_rule_versions
      add constraint sla_rules_category_fk foreign key (tenant_id, category_id)
      references public.complaint_categories (tenant_id, id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sla_rules_calendar_fk'
      and conrelid = 'public.sla_rule_versions'::regclass
  ) then
    alter table public.sla_rule_versions
      add constraint sla_rules_calendar_fk foreign key (tenant_id, calendar_id)
      references public.business_calendars (tenant_id, id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sla_rules_priority_ck'
      and conrelid = 'public.sla_rule_versions'::regclass
  ) then
    alter table public.sla_rule_versions
      add constraint sla_rules_priority_ck check (priority is null or priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sla_rules_pause_statuses_ck'
      and conrelid = 'public.sla_rule_versions'::regclass
  ) then
    alter table public.sla_rule_versions
      add constraint sla_rules_pause_statuses_ck check (jsonb_typeof(pause_statuses) = 'array');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sla_rules_warning_ratio_ck'
      and conrelid = 'public.sla_rule_versions'::regclass
  ) then
    alter table public.sla_rule_versions
      add constraint sla_rules_warning_ratio_ck check (warning_ratio > 0 and warning_ratio < 1);
  end if;
end;
$$;

create unique index if not exists sla_rules_scope_version_uq
  on public.sla_rule_versions (
    tenant_id,
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(priority, ''),
    version
  );
create index if not exists sla_rules_lookup_idx
  on public.sla_rule_versions (tenant_id, state, priority, department_id, category_id, effective_from, version desc);

create table if not exists public.complaint_sla_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  complaint_id uuid not null,
  sla_rule_version_id uuid not null,
  rule_version integer not null,
  calendar_id uuid not null,
  timezone text not null,
  department_id uuid,
  category_id uuid,
  priority text not null,
  started_at timestamptz not null,
  captured_at timestamptz not null default statement_timestamp(),
  response_target_seconds bigint not null,
  resolution_target_seconds bigint not null,
  warning_ratio numeric(4, 3) not null default 0.800,
  response_warning_at timestamptz not null,
  response_due_at timestamptz not null,
  resolution_warning_at timestamptz not null,
  resolution_due_at timestamptz not null,
  pause_statuses jsonb not null default '["WAITING_FOR_CITIZEN"]'::jsonb,
  paused_at timestamptz,
  paused_business_seconds bigint not null default 0,
  state text not null default 'ACTIVE',
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version bigint not null default 1,
  constraint complaint_sla_snapshots_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint complaint_sla_snapshots_complaint_fk foreign key (tenant_id, complaint_id)
    references public.complaints (tenant_id, id) on delete restrict,
  constraint complaint_sla_snapshots_rule_fk foreign key (tenant_id, sla_rule_version_id)
    references public.sla_rule_versions (tenant_id, id) on delete restrict,
  constraint complaint_sla_snapshots_calendar_fk foreign key (tenant_id, calendar_id)
    references public.business_calendars (tenant_id, id) on delete restrict,
  constraint complaint_sla_snapshots_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint complaint_sla_snapshots_category_fk foreign key (tenant_id, category_id)
    references public.complaint_categories (tenant_id, id) on delete restrict,
  constraint complaint_sla_snapshots_tenant_id_uq unique (tenant_id, id),
  constraint complaint_sla_snapshots_rule_version_ck check (rule_version > 0),
  constraint complaint_sla_snapshots_timezone_ck check (length(btrim(timezone)) between 1 and 128),
  constraint complaint_sla_snapshots_priority_ck check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  constraint complaint_sla_snapshots_targets_ck check (
    response_target_seconds > 0 and resolution_target_seconds >= response_target_seconds
  ),
  constraint complaint_sla_snapshots_warning_ratio_ck check (warning_ratio > 0 and warning_ratio < 1),
  constraint complaint_sla_snapshots_dates_ck check (
    captured_at >= started_at
    and response_warning_at <= response_due_at
    and resolution_warning_at <= resolution_due_at
    and response_due_at <= resolution_due_at
  ),
  constraint complaint_sla_snapshots_pause_statuses_ck check (jsonb_typeof(pause_statuses) = 'array'),
  constraint complaint_sla_snapshots_paused_seconds_ck check (paused_business_seconds >= 0),
  constraint complaint_sla_snapshots_state_ck check (state in ('ACTIVE', 'PAUSED', 'COMPLETED')),
  constraint complaint_sla_snapshots_completed_ck check (completed_at is null or state = 'COMPLETED'),
  constraint complaint_sla_snapshots_row_version_ck check (row_version > 0)
);

create index if not exists complaint_sla_snapshots_due_idx
  on public.complaint_sla_snapshots (tenant_id, state, response_due_at, resolution_due_at, id);
create index if not exists complaint_sla_snapshots_complaint_idx
  on public.complaint_sla_snapshots (tenant_id, complaint_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'complaints_sla_snapshot_fk'
      and conrelid = 'public.complaints'::regclass
  ) then
    alter table public.complaints
      add constraint complaints_sla_snapshot_fk foreign key (tenant_id, sla_snapshot_id)
      references public.complaint_sla_snapshots (tenant_id, id) on delete restrict;
  end if;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'business_calendars', 'business_calendar_days', 'sla_rule_versions', 'complaint_sla_snapshots'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'business_calendars', 'business_calendar_days', 'sla_rule_versions', 'complaint_sla_snapshots'
  ] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function private.touch_mutable_row()',
      table_name, table_name
    );
  end loop;
end;
$$;

-- Explicit policies preserve tenant isolation and keep SLA snapshots a trusted
-- server/worker write path. There is intentionally no authenticated snapshot write.
drop policy if exists business_calendars_read_scoped on public.business_calendars;
create policy business_calendars_read_scoped on public.business_calendars
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));
drop policy if exists business_calendars_insert_manage on public.business_calendars;
create policy business_calendars_insert_manage on public.business_calendars
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
drop policy if exists business_calendars_update_manage on public.business_calendars;
create policy business_calendars_update_manage on public.business_calendars
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

drop policy if exists business_calendar_days_read_scoped on public.business_calendar_days;
create policy business_calendar_days_read_scoped on public.business_calendar_days
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));
drop policy if exists business_calendar_days_insert_manage on public.business_calendar_days;
create policy business_calendar_days_insert_manage on public.business_calendar_days
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
drop policy if exists business_calendar_days_update_manage on public.business_calendar_days;
create policy business_calendar_days_update_manage on public.business_calendar_days
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

drop policy if exists sla_rules_read_scoped on public.sla_rule_versions;
create policy sla_rules_read_scoped on public.sla_rule_versions
  for select to authenticated
  using (
    (select private.can_read_tenant(tenant_id))
    and (
      department_id is null
      or (select private.can_read_department(tenant_id, department_id))
    )
  );
drop policy if exists sla_rules_insert_manage on public.sla_rule_versions;
create policy sla_rules_insert_manage on public.sla_rule_versions
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
drop policy if exists sla_rules_update_manage on public.sla_rule_versions;
create policy sla_rules_update_manage on public.sla_rule_versions
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

drop policy if exists complaint_sla_snapshots_read_staff on public.complaint_sla_snapshots;
create policy complaint_sla_snapshots_read_staff on public.complaint_sla_snapshots
  for select to authenticated
  using ((select private.can_mutate_complaint(tenant_id)));

grant select on table
  public.business_calendars,
  public.business_calendar_days,
  public.sla_rule_versions,
  public.complaint_sla_snapshots
to authenticated;
grant insert, update on table
  public.business_calendars,
  public.business_calendar_days,
  public.sla_rule_versions
to authenticated;
revoke insert, update, delete, truncate on table public.complaint_sla_snapshots from authenticated;

comment on table public.sla_rule_versions is 'Versioned SLA configuration; active rules are selected by category/priority/department precedence.';
comment on table public.business_calendars is 'Tenant business hours, holidays, timezone and DST-aware calendar configuration.';
comment on table public.complaint_sla_snapshots is 'Complaint-time SLA snapshot; rule changes never rewrite this record without an audited explicit override.';
