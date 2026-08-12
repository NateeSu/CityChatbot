-- CityChatbot complaint domain schema, numbering and tenant-safe RLS.
-- Requirements: RF-04, RF-06, RF-13, RF-15, RF-17
-- Depends on 20260810000000_core_schema.sql and 20260810010000_rls_policy_hardening.sql.
-- This migration is additive and safe to re-run on a fresh/test database.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create or replace function private.current_line_user_id()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  claims jsonb;
  line_user_id text;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return null;
  end;
  line_user_id := claims ->> 'line_user_id';
  if line_user_id is null or btrim(line_user_id) = '' or line_user_id ~ '[[:cntrl:]]' then
    return null;
  end if;
  return line_user_id;
end;
$$;

create or replace function private.can_read_citizen(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_tenant_id = private.current_tenant_id()
    and private.current_line_user_id() is not null;
$$;

create or replace function private.can_read_complaint(
  p_tenant_id uuid,
  p_line_user_id text,
  p_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    private.can_read_tenant(p_tenant_id)
    or (
      private.can_read_citizen(p_tenant_id)
      and p_line_user_id = private.current_line_user_id()
    )
    or (
      p_department_id is not null
      and private.can_read_department(p_tenant_id, p_department_id)
    );
$$;

create or replace function private.can_mutate_complaint(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    private.has_tenant_permission(p_tenant_id, 'complaint.assign.department')
    or private.has_tenant_permission(p_tenant_id, 'settings.manage.tenant')
    or private.has_tenant_permission(p_tenant_id, 'staff.manage.tenant');
$$;

-- Tenant configuration owns the display prefix; the allocator keeps a safe
-- slug-derived fallback for existing tenants and fresh installs.
alter table public.tenants
  add column if not exists complaint_number_prefix text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.tenants'::regclass
       and conname = 'tenants_complaint_number_prefix_ck'
  ) then
    alter table public.tenants
      add constraint tenants_complaint_number_prefix_ck
      check (complaint_number_prefix is null or complaint_number_prefix ~ '^[A-Z0-9]{2,12}$');
  end if;
end;
$$;

create table if not exists public.complaint_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  public_name text not null,
  description text,
  status text not null default 'ACTIVE',
  default_priority text not null default 'NORMAL',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint complaint_categories_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint complaint_categories_tenant_id_uq unique (tenant_id, id),
  constraint complaint_categories_code_uq unique (tenant_id, code),
  constraint complaint_categories_code_ck check (code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  constraint complaint_categories_name_ck check (length(btrim(public_name)) between 1 and 200),
  constraint complaint_categories_status_ck check (status in ('ACTIVE', 'INACTIVE')),
  constraint complaint_categories_priority_ck check (default_priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  constraint complaint_categories_row_version_ck check (row_version > 0)
);

create table if not exists public.intake_queues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  department_id uuid not null,
  code text not null,
  display_name text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint intake_queues_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint intake_queues_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint intake_queues_tenant_id_uq unique (tenant_id, id),
  constraint intake_queues_code_uq unique (tenant_id, code),
  constraint intake_queues_code_ck check (code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  constraint intake_queues_name_ck check (length(btrim(display_name)) between 1 and 200),
  constraint intake_queues_status_ck check (status in ('ACTIVE', 'INACTIVE')),
  constraint intake_queues_row_version_ck check (row_version > 0)
);
create index if not exists intake_queues_department_idx on public.intake_queues (tenant_id, department_id, status);

-- A global identity-backed allocation is intentionally used for the sequence
-- portion. Identity values are not rolled back, so a failed transaction never
-- reuses a complaint number.
create table if not exists public.complaint_number_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  complaint_year integer not null,
  prefix text not null,
  allocation_sequence bigint generated always as identity,
  allocated_at timestamptz not null default statement_timestamp(),
  constraint complaint_number_allocations_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint complaint_number_allocations_tenant_id_uq unique (tenant_id, id),
  constraint complaint_number_allocations_number_uq unique (tenant_id, complaint_year, allocation_sequence),
  constraint complaint_number_allocations_year_ck check (complaint_year between 2000 and 3000),
  constraint complaint_number_allocations_prefix_ck check (prefix ~ '^[A-Z0-9]{2,12}$')
);

create or replace function private.reserve_complaint_number(p_tenant_id uuid, p_complaint_year integer)
returns table(prefix text, sequence_number bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_complaint_year < 2000 or p_complaint_year > 3000 then
    raise exception using errcode = '22023', message = 'complaint year is invalid';
  end if;

  return query
  insert into public.complaint_number_allocations (tenant_id, complaint_year, prefix)
  select
    tenant.id,
    p_complaint_year,
    coalesce(
      nullif(upper(tenant.complaint_number_prefix), ''),
      nullif(upper(regexp_replace(left(tenant.slug, 12), '[^a-zA-Z0-9]', '', 'g')), ''),
      'CCM'
    )
  from public.tenants as tenant
  where tenant.id = p_tenant_id
  returning complaint_number_allocations.prefix, complaint_number_allocations.allocation_sequence;

  if not found then
    raise exception using errcode = '23503', message = 'tenant does not exist';
  end if;
end;
$$;

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  complaint_no text not null,
  complaint_year integer not null,
  complaint_sequence bigint not null,
  line_user_id text not null,
  citizen_name text,
  citizen_phone_encrypted text,
  category_id uuid,
  category_uncertain boolean not null default false,
  title text not null,
  description text not null,
  location_text text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  canonical_status text not null default 'RECEIVED',
  priority text not null default 'NORMAL',
  risk_level text not null default 'STANDARD',
  intake_queue_id uuid not null,
  assigned_department_id uuid,
  assigned_membership_id uuid,
  sla_snapshot_id uuid,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version bigint not null default 1,
  constraint complaints_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint complaints_category_fk foreign key (tenant_id, category_id)
    references public.complaint_categories (tenant_id, id) on delete restrict,
  constraint complaints_intake_queue_fk foreign key (tenant_id, intake_queue_id)
    references public.intake_queues (tenant_id, id) on delete restrict,
  constraint complaints_assigned_department_fk foreign key (tenant_id, assigned_department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint complaints_assigned_membership_fk foreign key (tenant_id, assigned_membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint complaints_number_fk foreign key (tenant_id, complaint_year, complaint_sequence)
    references public.complaint_number_allocations (tenant_id, complaint_year, allocation_sequence) on delete restrict,
  constraint complaints_tenant_id_uq unique (tenant_id, id),
  constraint complaints_no_uq unique (tenant_id, complaint_no),
  constraint complaints_number_parts_ck check (complaint_year between 2000 and 3000 and complaint_sequence > 0),
  constraint complaints_no_ck check (complaint_no ~ '^[A-Z0-9]{2,12}-[0-9]{4}-[0-9]{6,}$'),
  constraint complaints_line_user_ck check (line_user_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  constraint complaints_citizen_name_ck check (citizen_name is null or length(btrim(citizen_name)) between 1 and 200),
  constraint complaints_phone_ck check (citizen_phone_encrypted is null or length(citizen_phone_encrypted) between 16 and 2048),
  constraint complaints_category_xor_ck check ((category_id is null) = category_uncertain),
  constraint complaints_title_ck check (length(btrim(title)) between 1 and 240),
  constraint complaints_description_ck check (length(btrim(description)) between 1 and 20000),
  constraint complaints_location_pair_ck check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null)),
  constraint complaints_latitude_ck check (latitude is null or latitude between -90 and 90),
  constraint complaints_longitude_ck check (longitude is null or longitude between -180 and 180),
  constraint complaints_status_ck check (canonical_status in ('RECEIVED', 'UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CITIZEN', 'RESOLVED', 'CLOSED', 'OUT_OF_JURISDICTION', 'CANCELLED')),
  constraint complaints_priority_ck check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  constraint complaints_risk_ck check (risk_level in ('STANDARD', 'SENSITIVE', 'HIGH')),
  constraint complaints_dates_ck check (resolved_at is null or resolved_at >= created_at),
  constraint complaints_closed_dates_ck check (closed_at is null or (resolved_at is not null and closed_at >= resolved_at)),
  constraint complaints_row_version_ck check (row_version > 0)
);
create index if not exists complaints_citizen_idx on public.complaints (tenant_id, line_user_id, created_at desc, id);
create index if not exists complaints_status_idx on public.complaints (tenant_id, canonical_status, priority, created_at, id);
create index if not exists complaints_assignment_idx on public.complaints (tenant_id, assigned_department_id, assigned_membership_id, canonical_status, id);

create or replace function private.validate_complaint_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.canonical_status = old.canonical_status then
    return new;
  end if;

  if not (
    (old.canonical_status = 'RECEIVED' and new.canonical_status in ('UNDER_REVIEW', 'ASSIGNED', 'OUT_OF_JURISDICTION', 'CANCELLED'))
    or (old.canonical_status = 'UNDER_REVIEW' and new.canonical_status in ('ASSIGNED', 'OUT_OF_JURISDICTION', 'CANCELLED'))
    or (old.canonical_status = 'ASSIGNED' and new.canonical_status in ('IN_PROGRESS', 'OUT_OF_JURISDICTION'))
    or (old.canonical_status = 'IN_PROGRESS' and new.canonical_status in ('WAITING_FOR_CITIZEN', 'RESOLVED', 'OUT_OF_JURISDICTION'))
    or (old.canonical_status = 'WAITING_FOR_CITIZEN' and new.canonical_status = 'IN_PROGRESS')
    or (old.canonical_status = 'RESOLVED' and new.canonical_status in ('CLOSED', 'IN_PROGRESS'))
    or (old.canonical_status = 'CLOSED' and new.canonical_status = 'IN_PROGRESS')
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE_TRANSITION';
  end if;
  return new;
end;
$$;

create or replace function private.record_complaint_domain_events()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_type text := case
    when private.current_line_user_id() is not null then 'CITIZEN'
    when private.current_account_id() is not null then 'STAFF'
    else 'SYSTEM'
  end;
begin
  if tg_op = 'INSERT' then
    insert into public.complaint_status_logs (
      tenant_id, complaint_id, from_status, to_status, actor_type,
      actor_account_id, reason, public_visible
    ) values (
      new.tenant_id, new.id, null, new.canonical_status, actor_type,
      private.current_account_id(), 'Complaint created', true
    );
    insert into public.domain_outbox (
      tenant_id, event_type, event_version, aggregate_type, aggregate_id,
      idempotency_key, payload_json
    ) values (
      new.tenant_id, 'complaint.created', 1, 'COMPLAINT', new.id,
      'complaint.created:' || new.id::text,
      jsonb_build_object('tenantId', new.tenant_id, 'complaintId', new.id, 'complaintNo', new.complaint_no)
    ) on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing;
  elsif new.canonical_status <> old.canonical_status then
    insert into public.complaint_status_logs (
      tenant_id, complaint_id, from_status, to_status, actor_type,
      actor_account_id, reason, public_visible
    ) values (
      new.tenant_id, new.id, old.canonical_status, new.canonical_status, actor_type,
      private.current_account_id(), 'Complaint status changed', true
    );
    insert into public.domain_outbox (
      tenant_id, event_type, event_version, aggregate_type, aggregate_id,
      idempotency_key, payload_json
    ) values (
      new.tenant_id, 'complaint.status_changed', 1, 'COMPLAINT', new.id,
      'complaint.status_changed:' || new.id::text || ':' || new.row_version::text,
      jsonb_build_object(
        'tenantId', new.tenant_id,
        'complaintId', new.id,
        'fromStatus', old.canonical_status,
        'toStatus', new.canonical_status
      )
    ) on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_validate_transition on public.complaints;
create trigger complaints_validate_transition
  before update of canonical_status on public.complaints
  for each row execute function private.validate_complaint_transition();

drop trigger if exists complaints_domain_events on public.complaints;
create trigger complaints_domain_events
  after insert or update of canonical_status on public.complaints
  for each row execute function private.record_complaint_domain_events();

create table if not exists public.complaint_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  complaint_id uuid not null,
  storage_attachment_id uuid not null,
  state text not null default 'QUARANTINED',
  caption text,
  is_public boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint complaint_attachments_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint complaint_attachments_complaint_fk foreign key (tenant_id, complaint_id)
    references public.complaints (tenant_id, id) on delete restrict,
  constraint complaint_attachments_tenant_id_uq unique (tenant_id, id),
  constraint complaint_attachments_storage_uq unique (tenant_id, storage_attachment_id),
  constraint complaint_attachments_state_ck check (state in ('QUARANTINED', 'READY', 'REJECTED', 'DELETED')),
  constraint complaint_attachments_caption_ck check (caption is null or length(caption) <= 1000),
  constraint complaint_attachments_row_version_ck check (row_version > 0)
);

create table if not exists public.complaint_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  complaint_id uuid not null,
  department_id uuid not null,
  membership_id uuid,
  assigned_by_account_id uuid,
  reason text,
  is_current boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint complaint_assignments_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint complaint_assignments_complaint_fk foreign key (tenant_id, complaint_id)
    references public.complaints (tenant_id, id) on delete restrict,
  constraint complaint_assignments_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint complaint_assignments_membership_fk foreign key (tenant_id, membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint complaint_assignments_actor_fk foreign key (assigned_by_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint complaint_assignments_tenant_id_uq unique (tenant_id, id),
  constraint complaint_assignments_reason_ck check (reason is null or length(btrim(reason)) between 3 and 2000),
  constraint complaint_assignments_row_version_ck check (row_version > 0)
);
create unique index if not exists complaint_assignments_current_uq
  on public.complaint_assignments (tenant_id, complaint_id)
  where is_current;

create table if not exists public.complaint_status_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  complaint_id uuid not null,
  from_status text,
  to_status text not null,
  actor_type text not null,
  actor_account_id uuid,
  actor_membership_id uuid,
  reason text,
  public_visible boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  constraint complaint_status_logs_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint complaint_status_logs_complaint_fk foreign key (tenant_id, complaint_id)
    references public.complaints (tenant_id, id) on delete restrict,
  constraint complaint_status_logs_actor_fk foreign key (actor_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint complaint_status_logs_membership_fk foreign key (tenant_id, actor_membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint complaint_status_logs_tenant_id_uq unique (tenant_id, id),
  constraint complaint_status_logs_from_ck check (from_status is null or from_status in ('RECEIVED', 'UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CITIZEN', 'RESOLVED', 'CLOSED', 'OUT_OF_JURISDICTION', 'CANCELLED')),
  constraint complaint_status_logs_to_ck check (to_status in ('RECEIVED', 'UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CITIZEN', 'RESOLVED', 'CLOSED', 'OUT_OF_JURISDICTION', 'CANCELLED')),
  constraint complaint_status_logs_actor_ck check (actor_type in ('CITIZEN', 'STAFF', 'SYSTEM', 'SUPER_ADMIN')),
  constraint complaint_status_logs_reason_ck check (reason is null or length(btrim(reason)) between 3 and 2000)
);
create index if not exists complaint_status_logs_timeline_idx on public.complaint_status_logs (tenant_id, complaint_id, created_at, id);

create table if not exists public.complaint_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  complaint_id uuid not null,
  author_type text not null,
  author_account_id uuid,
  author_membership_id uuid,
  body text not null,
  visibility text not null default 'INTERNAL',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint complaint_comments_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint complaint_comments_complaint_fk foreign key (tenant_id, complaint_id)
    references public.complaints (tenant_id, id) on delete restrict,
  constraint complaint_comments_actor_fk foreign key (author_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint complaint_comments_membership_fk foreign key (tenant_id, author_membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint complaint_comments_tenant_id_uq unique (tenant_id, id),
  constraint complaint_comments_author_ck check (author_type in ('CITIZEN', 'STAFF', 'SYSTEM', 'SUPER_ADMIN')),
  constraint complaint_comments_body_ck check (length(btrim(body)) between 1 and 20000),
  constraint complaint_comments_visibility_ck check (visibility in ('PUBLIC', 'INTERNAL')),
  constraint complaint_comments_row_version_ck check (row_version > 0)
);

create table if not exists public.complaint_routing_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  complaint_id uuid not null,
  policy_version text not null,
  candidate_departments jsonb not null default '[]'::jsonb,
  final_department_id uuid,
  accepted_by_account_id uuid,
  accepted boolean not null default false,
  reason text,
  created_at timestamptz not null default statement_timestamp(),
  constraint complaint_routing_runs_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint complaint_routing_runs_complaint_fk foreign key (tenant_id, complaint_id)
    references public.complaints (tenant_id, id) on delete restrict,
  constraint complaint_routing_runs_department_fk foreign key (tenant_id, final_department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint complaint_routing_runs_actor_fk foreign key (accepted_by_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint complaint_routing_runs_tenant_id_uq unique (tenant_id, id),
  constraint complaint_routing_runs_policy_ck check (length(btrim(policy_version)) between 1 and 128),
  constraint complaint_routing_runs_candidates_ck check (jsonb_typeof(candidate_departments) = 'array'),
  constraint complaint_routing_runs_reason_ck check (reason is null or length(btrim(reason)) between 3 and 2000)
);

create table if not exists public.complaint_duplicate_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  complaint_id uuid not null,
  candidate_complaint_id uuid not null,
  decision text not null default 'UNRESOLVED',
  decided_by_account_id uuid,
  reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint complaint_duplicate_links_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint complaint_duplicate_links_complaint_fk foreign key (tenant_id, complaint_id)
    references public.complaints (tenant_id, id) on delete restrict,
  constraint complaint_duplicate_links_candidate_fk foreign key (tenant_id, candidate_complaint_id)
    references public.complaints (tenant_id, id) on delete restrict,
  constraint complaint_duplicate_links_actor_fk foreign key (decided_by_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint complaint_duplicate_links_tenant_id_uq unique (tenant_id, id),
  constraint complaint_duplicate_links_distinct_ck check (complaint_id <> candidate_complaint_id),
  constraint complaint_duplicate_links_decision_ck check (decision in ('UNRESOLVED', 'LINK', 'MERGE_REFERENCE', 'NOT_DUPLICATE')),
  constraint complaint_duplicate_links_reason_ck check (reason is null or length(btrim(reason)) between 3 and 2000),
  constraint complaint_duplicate_links_row_version_ck check (row_version > 0)
);
create unique index if not exists complaint_duplicate_links_pair_uq
  on public.complaint_duplicate_links (tenant_id, least(complaint_id, candidate_complaint_id), greatest(complaint_id, candidate_complaint_id));

create table if not exists public.complaint_surveys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  complaint_id uuid not null,
  line_user_id text not null,
  rating smallint not null,
  comment text,
  submitted_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint complaint_surveys_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint complaint_surveys_complaint_fk foreign key (tenant_id, complaint_id)
    references public.complaints (tenant_id, id) on delete restrict,
  constraint complaint_surveys_tenant_id_uq unique (tenant_id, id),
  constraint complaint_surveys_once_uq unique (tenant_id, complaint_id, line_user_id),
  constraint complaint_surveys_line_user_ck check (line_user_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  constraint complaint_surveys_rating_ck check (rating between 1 and 5),
  constraint complaint_surveys_comment_ck check (comment is null or length(comment) <= 4000)
);

create or replace function private.reject_complaint_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000', message = 'complaint timeline records are append-only';
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'complaint_categories', 'intake_queues', 'complaint_number_allocations', 'complaints',
    'complaint_attachments', 'complaint_assignments', 'complaint_status_logs',
    'complaint_comments', 'complaint_routing_runs', 'complaint_duplicate_links',
    'complaint_surveys'
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
    'complaint_categories', 'intake_queues', 'complaints', 'complaint_attachments',
    'complaint_assignments', 'complaint_comments', 'complaint_duplicate_links'
  ] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function private.touch_mutable_row()',
      table_name, table_name
    );
  end loop;
end;
$$;

drop trigger if exists complaint_status_logs_append_only on public.complaint_status_logs;
create trigger complaint_status_logs_append_only
  before update or delete on public.complaint_status_logs
  for each row execute function private.reject_complaint_append_only();

drop trigger if exists complaint_routing_runs_append_only on public.complaint_routing_runs;
create trigger complaint_routing_runs_append_only
  before update or delete on public.complaint_routing_runs
  for each row execute function private.reject_complaint_append_only();

drop trigger if exists complaint_surveys_append_only on public.complaint_surveys;
create trigger complaint_surveys_append_only
  before update or delete on public.complaint_surveys
  for each row execute function private.reject_complaint_append_only();

-- Explicit policies; there is no broad authenticated FOR ALL policy.
drop policy if exists complaint_categories_read_scoped on public.complaint_categories;
create policy complaint_categories_read_scoped on public.complaint_categories
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)) or (select private.can_read_citizen(tenant_id)));
drop policy if exists complaint_categories_insert_manage on public.complaint_categories;
create policy complaint_categories_insert_manage on public.complaint_categories
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
drop policy if exists complaint_categories_update_manage on public.complaint_categories;
create policy complaint_categories_update_manage on public.complaint_categories
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

drop policy if exists intake_queues_read_scoped on public.intake_queues;
create policy intake_queues_read_scoped on public.intake_queues
  for select to authenticated
  using ((select private.can_read_department(tenant_id, department_id)) or (select private.can_read_citizen(tenant_id)));
drop policy if exists intake_queues_insert_manage on public.intake_queues;
create policy intake_queues_insert_manage on public.intake_queues
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
drop policy if exists intake_queues_update_manage on public.intake_queues;
create policy intake_queues_update_manage on public.intake_queues
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

drop policy if exists complaints_read_scoped on public.complaints;
create policy complaints_read_scoped on public.complaints
  for select to authenticated
  using ((select private.can_read_complaint(tenant_id, line_user_id, assigned_department_id)));
drop policy if exists complaints_insert_citizen on public.complaints;
create policy complaints_insert_citizen on public.complaints
  for insert to authenticated
  with check (
    tenant_id = (select private.current_tenant_id())
    and line_user_id = (select private.current_line_user_id())
    and canonical_status = 'RECEIVED'
  );
drop policy if exists complaints_insert_staff on public.complaints;
create policy complaints_insert_staff on public.complaints
  for insert to authenticated
  with check ((select private.can_mutate_complaint(tenant_id)));
drop policy if exists complaints_update_staff on public.complaints;
create policy complaints_update_staff on public.complaints
  for update to authenticated
  using ((select private.can_mutate_complaint(tenant_id)))
  with check ((select private.can_mutate_complaint(tenant_id)));

drop policy if exists complaint_attachments_read_scoped on public.complaint_attachments;
create policy complaint_attachments_read_scoped on public.complaint_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.complaints as complaint
      where complaint.tenant_id = complaint_attachments.tenant_id
        and complaint.id = complaint_attachments.complaint_id
        and private.can_read_complaint(complaint.tenant_id, complaint.line_user_id, complaint.assigned_department_id)
        and (complaint_attachments.is_public or private.can_mutate_complaint(complaint.tenant_id))
    )
  );
drop policy if exists complaint_attachments_insert_owner on public.complaint_attachments;
create policy complaint_attachments_insert_owner on public.complaint_attachments
  for insert to authenticated
  with check (
    state = 'QUARANTINED'
    and exists (
      select 1 from public.complaints as complaint
      where complaint.tenant_id = complaint_attachments.tenant_id
        and complaint.id = complaint_attachments.complaint_id
        and complaint.line_user_id = private.current_line_user_id()
        and complaint.tenant_id = private.current_tenant_id()
    )
  );
drop policy if exists complaint_attachments_update_manage on public.complaint_attachments;
create policy complaint_attachments_update_manage on public.complaint_attachments
  for update to authenticated
  using ((select private.can_mutate_complaint(tenant_id)))
  with check ((select private.can_mutate_complaint(tenant_id)));

drop policy if exists complaint_assignments_read_scoped on public.complaint_assignments;
create policy complaint_assignments_read_scoped on public.complaint_assignments
  for select to authenticated
  using (
    exists (
      select 1 from public.complaints as complaint
      where complaint.tenant_id = complaint_assignments.tenant_id
        and complaint.id = complaint_assignments.complaint_id
        and private.can_read_complaint(complaint.tenant_id, complaint.line_user_id, complaint.assigned_department_id)
    )
  );
drop policy if exists complaint_assignments_insert_manage on public.complaint_assignments;
create policy complaint_assignments_insert_manage on public.complaint_assignments
  for insert to authenticated
  with check ((select private.can_mutate_complaint(tenant_id)));
drop policy if exists complaint_assignments_update_manage on public.complaint_assignments;
create policy complaint_assignments_update_manage on public.complaint_assignments
  for update to authenticated
  using ((select private.can_mutate_complaint(tenant_id)))
  with check ((select private.can_mutate_complaint(tenant_id)));

drop policy if exists complaint_status_logs_read_scoped on public.complaint_status_logs;
create policy complaint_status_logs_read_scoped on public.complaint_status_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.complaints as complaint
      where complaint.tenant_id = complaint_status_logs.tenant_id
        and complaint.id = complaint_status_logs.complaint_id
        and private.can_read_complaint(complaint.tenant_id, complaint.line_user_id, complaint.assigned_department_id)
        and (complaint_status_logs.public_visible or private.can_mutate_complaint(complaint.tenant_id))
    )
  );

drop policy if exists complaint_comments_read_scoped on public.complaint_comments;
create policy complaint_comments_read_scoped on public.complaint_comments
  for select to authenticated
  using (
    exists (
      select 1 from public.complaints as complaint
      where complaint.tenant_id = complaint_comments.tenant_id
        and complaint.id = complaint_comments.complaint_id
        and private.can_read_complaint(complaint.tenant_id, complaint.line_user_id, complaint.assigned_department_id)
        and (complaint_comments.visibility = 'PUBLIC' or private.can_mutate_complaint(complaint.tenant_id))
    )
  );
drop policy if exists complaint_comments_insert_owner_or_staff on public.complaint_comments;
create policy complaint_comments_insert_owner_or_staff on public.complaint_comments
  for insert to authenticated
  with check (
    (
      visibility = 'PUBLIC'
      and author_type = 'CITIZEN'
      and exists (
        select 1 from public.complaints as complaint
        where complaint.tenant_id = complaint_comments.tenant_id
          and complaint.id = complaint_comments.complaint_id
          and complaint.tenant_id = private.current_tenant_id()
          and complaint.line_user_id = private.current_line_user_id()
      )
    )
    or (select private.can_mutate_complaint(tenant_id))
  );
drop policy if exists complaint_comments_update_staff on public.complaint_comments;
create policy complaint_comments_update_staff on public.complaint_comments
  for update to authenticated
  using ((select private.can_mutate_complaint(tenant_id)))
  with check ((select private.can_mutate_complaint(tenant_id)));

drop policy if exists complaint_routing_runs_read_manage on public.complaint_routing_runs;
create policy complaint_routing_runs_read_manage on public.complaint_routing_runs
  for select to authenticated
  using ((select private.can_mutate_complaint(tenant_id)));

drop policy if exists complaint_duplicate_links_read_manage on public.complaint_duplicate_links;
create policy complaint_duplicate_links_read_manage on public.complaint_duplicate_links
  for select to authenticated
  using ((select private.can_mutate_complaint(tenant_id)));
drop policy if exists complaint_duplicate_links_insert_manage on public.complaint_duplicate_links;
create policy complaint_duplicate_links_insert_manage on public.complaint_duplicate_links
  for insert to authenticated
  with check ((select private.can_mutate_complaint(tenant_id)));
drop policy if exists complaint_duplicate_links_update_manage on public.complaint_duplicate_links;
create policy complaint_duplicate_links_update_manage on public.complaint_duplicate_links
  for update to authenticated
  using ((select private.can_mutate_complaint(tenant_id)))
  with check ((select private.can_mutate_complaint(tenant_id)));

drop policy if exists complaint_surveys_read_scoped on public.complaint_surveys;
create policy complaint_surveys_read_scoped on public.complaint_surveys
  for select to authenticated
  using (
    (tenant_id = (select private.current_tenant_id()) and line_user_id = (select private.current_line_user_id()))
    or (select private.can_mutate_complaint(tenant_id))
  );
drop policy if exists complaint_surveys_insert_owner on public.complaint_surveys;
create policy complaint_surveys_insert_owner on public.complaint_surveys
  for insert to authenticated
  with check (
    tenant_id = (select private.current_tenant_id())
    and line_user_id = (select private.current_line_user_id())
    and exists (
      select 1 from public.complaints as complaint
      where complaint.tenant_id = complaint_surveys.tenant_id
        and complaint.id = complaint_surveys.complaint_id
        and complaint.line_user_id = complaint_surveys.line_user_id
        and complaint.canonical_status in ('RESOLVED', 'CLOSED')
    )
  );

grant execute on function private.current_line_user_id() to authenticated;
grant execute on function private.can_read_citizen(uuid) to authenticated;
grant execute on function private.can_read_complaint(uuid, text, uuid) to authenticated;
grant execute on function private.can_mutate_complaint(uuid) to authenticated;

grant select on table
  public.complaint_categories,
  public.intake_queues,
  public.complaints,
  public.complaint_attachments,
  public.complaint_assignments,
  public.complaint_status_logs,
  public.complaint_comments,
  public.complaint_routing_runs,
  public.complaint_duplicate_links,
  public.complaint_surveys
to authenticated;
grant insert, update on table
  public.complaint_categories,
  public.intake_queues,
  public.complaints,
  public.complaint_attachments,
  public.complaint_assignments,
  public.complaint_comments,
  public.complaint_duplicate_links
to authenticated;
grant insert on table public.complaint_surveys to authenticated;

revoke insert, update, delete, truncate on table
  public.complaint_number_allocations,
  public.complaint_status_logs,
  public.complaint_routing_runs
from authenticated;

comment on table public.complaints is 'Canonical complaint state is database truth; mutations require optimistic row_version checks.';
comment on table public.complaint_status_logs is 'Immutable complaint timeline; public_visible controls citizen projection.';
comment on function private.reserve_complaint_number(uuid, integer) is 'Atomic non-reusing complaint number allocation; called by trusted server transaction.';
