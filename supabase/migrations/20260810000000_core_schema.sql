-- CityChatbot core schema
-- Requirements: RF-03, RF-04, RF-15, RF-17
-- This migration is deliberately additive and safe to re-run on a fresh/partially
-- provisioned Supabase project. Production data migrations must use a separate,
-- reviewed migration and backup rehearsal.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create extension if not exists "pgcrypto";
create schema if not exists private;

-- The request context is supplied by the trusted API boundary. The database does
-- not accept tenant_id from an untrusted client as an authorization decision.
create or replace function private.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  claims jsonb;
  claim text;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return null;
  end;

  claim := claims ->> 'tenant_id';
  if claim is null or btrim(claim) = '' then
    return null;
  end if;

  begin
    return claim::uuid;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function private.current_account_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  claims jsonb;
  claim text;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return null;
  end;

  claim := coalesce(claims ->> 'account_id', claims ->> 'sub');
  if claim is null or btrim(claim) = '' then
    return null;
  end if;

  begin
    return claim::uuid;
  exception when others then
    return null;
  end;
end;
$$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  display_name text not null,
  status text not null default 'ACTIVE',
  default_timezone text not null default 'Asia/Bangkok',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint tenants_slug_ck check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  constraint tenants_display_name_ck check (length(btrim(display_name)) between 1 and 200),
  constraint tenants_status_ck check (status in ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  constraint tenants_timezone_ck check (length(btrim(default_timezone)) between 1 and 64),
  constraint tenants_row_version_ck check (row_version > 0)
);
create unique index if not exists tenants_slug_uq on public.tenants (slug);

create table if not exists public.user_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_subject text not null,
  status text not null default 'ACTIVE',
  system_role text not null default 'NONE',
  display_name text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint user_accounts_auth_subject_ck check (length(btrim(auth_subject)) between 1 and 255),
  constraint user_accounts_status_ck check (status in ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
  constraint user_accounts_system_role_ck check (system_role in ('NONE', 'SUPER_ADMIN')),
  constraint user_accounts_display_name_ck check (display_name is null or length(btrim(display_name)) between 1 and 200),
  constraint user_accounts_row_version_ck check (row_version > 0)
);
create unique index if not exists user_accounts_auth_subject_uq on public.user_accounts (auth_subject);

create table if not exists public.tenant_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  locale text not null default 'th-TH',
  display_timezone text not null default 'Asia/Bangkok',
  ai_chat_enabled boolean not null default false,
  complaint_ai_routing_enabled boolean not null default false,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint tenant_settings_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint tenant_settings_tenant_uq unique (tenant_id),
  constraint tenant_settings_tenant_id_uq unique (tenant_id, id),
  constraint tenant_settings_locale_ck check (locale in ('th-TH', 'en-US')),
  constraint tenant_settings_timezone_ck check (length(btrim(display_timezone)) between 1 and 64),
  constraint tenant_settings_json_ck check (jsonb_typeof(settings_json) = 'object'),
  constraint tenant_settings_row_version_ck check (row_version > 0)
);

create table if not exists public.feature_flag_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  feature_key text not null,
  version integer not null,
  state text not null default 'DRAFT',
  enabled boolean not null default false,
  config_json jsonb not null default '{}'::jsonb,
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint feature_flags_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint feature_flags_tenant_id_uq unique (tenant_id, id),
  constraint feature_flags_version_uq unique (tenant_id, feature_key, version),
  constraint feature_flags_key_ck check (feature_key ~ '^[a-z][a-z0-9_.-]{1,127}$'),
  constraint feature_flags_version_ck check (version > 0),
  constraint feature_flags_state_ck check (state in ('DRAFT', 'ACTIVE', 'RETIRED')),
  constraint feature_flags_json_ck check (jsonb_typeof(config_json) = 'object'),
  constraint feature_flags_window_ck check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint feature_flags_row_version_ck check (row_version > 0)
);

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null,
  status text not null default 'INVITED',
  display_name text not null,
  invited_at timestamptz,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint tenant_memberships_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint tenant_memberships_account_fk foreign key (account_id) references public.user_accounts (id) on delete restrict,
  constraint tenant_memberships_tenant_id_uq unique (tenant_id, id),
  constraint tenant_memberships_account_uq unique (tenant_id, account_id),
  constraint tenant_memberships_status_ck check (status in ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
  constraint tenant_memberships_display_name_ck check (length(btrim(display_name)) between 1 and 200),
  constraint tenant_memberships_dates_ck check (
    (activated_at is null or invited_at is null or activated_at >= invited_at)
    and (deactivated_at is null or activated_at is null or deactivated_at >= activated_at)
  ),
  constraint tenant_memberships_row_version_ck check (row_version > 0)
);
create index if not exists tenant_memberships_account_idx on public.tenant_memberships (account_id, tenant_id);

create or replace function private.can_read_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p_tenant_id = private.current_tenant_id()
    and exists (
      select 1
      from public.tenant_memberships as membership
      where membership.tenant_id = p_tenant_id
        and membership.account_id = private.current_account_id()
        and membership.status = 'ACTIVE'
    );
$$;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  name text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint departments_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint departments_tenant_id_uq unique (tenant_id, id),
  constraint departments_code_uq unique (tenant_id, code),
  constraint departments_code_ck check (code ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
  constraint departments_name_ck check (length(btrim(name)) between 1 and 200),
  constraint departments_status_ck check (status in ('ACTIVE', 'INACTIVE')),
  constraint departments_row_version_ck check (row_version > 0)
);

create table if not exists public.department_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  department_id uuid not null,
  role_in_department text not null default 'STAFF',
  is_primary boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint department_memberships_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint department_memberships_membership_fk foreign key (tenant_id, membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint department_memberships_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint department_memberships_tenant_id_uq unique (tenant_id, id),
  constraint department_memberships_membership_department_uq unique (tenant_id, membership_id, department_id),
  constraint department_memberships_role_ck check (role_in_department in ('STAFF', 'HEAD', 'KNOWLEDGE', 'PR')),
  constraint department_memberships_row_version_ck check (row_version > 0)
);
create index if not exists department_memberships_department_idx on public.department_memberships (tenant_id, department_id);
create unique index if not exists department_memberships_primary_uq
  on public.department_memberships (tenant_id, membership_id)
  where is_primary;

create table if not exists public.department_work_scope_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  department_id uuid not null,
  version integer not null,
  state text not null default 'DRAFT',
  scope_rules jsonb not null default '{}'::jsonb,
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint department_scopes_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint department_scopes_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint department_scopes_tenant_id_uq unique (tenant_id, id),
  constraint department_scopes_version_uq unique (tenant_id, department_id, version),
  constraint department_scopes_version_ck check (version > 0),
  constraint department_scopes_state_ck check (state in ('DRAFT', 'ACTIVE', 'RETIRED')),
  constraint department_scopes_json_ck check (jsonb_typeof(scope_rules) = 'object'),
  constraint department_scopes_window_ck check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint department_scopes_row_version_ck check (row_version > 0)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  display_name text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint roles_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint roles_tenant_id_uq unique (tenant_id, id),
  constraint roles_code_uq unique (tenant_id, code),
  constraint roles_code_ck check (code ~ '^[A-Z][A-Z0-9_-]{1,63}$'),
  constraint roles_display_name_ck check (length(btrim(display_name)) between 1 and 160),
  constraint roles_status_ck check (status in ('ACTIVE', 'INACTIVE')),
  constraint roles_row_version_ck check (row_version > 0)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  resource text not null,
  action text not null,
  scope text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint permissions_code_uq unique (code),
  constraint permissions_code_ck check (code ~ '^[a-z][a-z0-9_.:-]{2,127}$'),
  constraint permissions_resource_ck check (resource in ('COMPLAINT', 'SUPPORT_TICKET', 'KNOWLEDGE', 'NEWS', 'SERVICE', 'KPI', 'SETTINGS', 'STAFF', 'AUDIT', 'JOB')),
  constraint permissions_action_ck check (action in ('VIEW', 'CREATE', 'UPDATE', 'ASSIGN', 'FORWARD', 'REPLY', 'RESOLVE', 'CLOSE', 'PUBLISH', 'EXPORT', 'MANAGE', 'SUPPORT_ACCESS')),
  constraint permissions_scope_ck check (scope in ('OWN', 'ASSIGNED', 'DEPARTMENT', 'TENANT', 'SYSTEM')),
  constraint permissions_row_version_ck check (row_version > 0)
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  role_id uuid not null,
  permission_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint role_permissions_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint role_permissions_role_fk foreign key (tenant_id, role_id)
    references public.roles (tenant_id, id) on delete cascade,
  constraint role_permissions_permission_fk foreign key (permission_id) references public.permissions (id) on delete restrict,
  constraint role_permissions_tenant_id_uq unique (tenant_id, id),
  constraint role_permissions_role_permission_uq unique (tenant_id, role_id, permission_id),
  constraint role_permissions_row_version_ck check (row_version > 0)
);
create index if not exists role_permissions_permission_idx on public.role_permissions (permission_id, tenant_id);

create table if not exists public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint membership_roles_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint membership_roles_membership_fk foreign key (tenant_id, membership_id)
    references public.tenant_memberships (tenant_id, id) on delete cascade,
  constraint membership_roles_role_fk foreign key (tenant_id, role_id)
    references public.roles (tenant_id, id) on delete cascade,
  constraint membership_roles_tenant_id_uq unique (tenant_id, id),
  constraint membership_roles_membership_role_uq unique (tenant_id, membership_id, role_id),
  constraint membership_roles_row_version_ck check (row_version > 0)
);
create index if not exists membership_roles_role_idx on public.membership_roles (tenant_id, role_id);

create table if not exists public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  granted_by_account_id uuid not null,
  approved_by_account_id uuid,
  resource_type text not null,
  resource_id uuid,
  reason text not null,
  status text not null default 'REQUESTED',
  granted_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint support_grants_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint support_grants_membership_fk foreign key (tenant_id, membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint support_grants_granted_by_fk foreign key (granted_by_account_id) references public.user_accounts (id) on delete restrict,
  constraint support_grants_approved_by_fk foreign key (approved_by_account_id) references public.user_accounts (id) on delete restrict,
  constraint support_grants_tenant_id_uq unique (tenant_id, id),
  constraint support_grants_resource_type_ck check (resource_type in ('TENANT', 'COMPLAINT', 'SUPPORT_TICKET', 'KNOWLEDGE', 'AUDIT')),
  constraint support_grants_status_ck check (status in ('REQUESTED', 'APPROVED', 'REVOKED', 'EXPIRED')),
  constraint support_grants_reason_ck check (length(btrim(reason)) between 3 and 2000),
  constraint support_grants_expiry_ck check (expires_at > granted_at),
  constraint support_grants_revoked_ck check (revoked_at is null or revoked_at >= granted_at),
  constraint support_grants_row_version_ck check (row_version > 0)
);
create index if not exists support_grants_active_idx
  on public.support_access_grants (tenant_id, membership_id, expires_at)
  where status = 'APPROVED';

create table if not exists public.sla_rule_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  department_id uuid not null,
  version integer not null,
  state text not null default 'DRAFT',
  response_target_seconds bigint not null,
  resolution_target_seconds bigint not null,
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint sla_rules_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint sla_rules_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint sla_rules_tenant_id_uq unique (tenant_id, id),
  constraint sla_rules_version_uq unique (tenant_id, department_id, version),
  constraint sla_rules_version_ck check (version > 0),
  constraint sla_rules_state_ck check (state in ('DRAFT', 'ACTIVE', 'RETIRED')),
  constraint sla_rules_response_target_ck check (response_target_seconds > 0),
  constraint sla_rules_resolution_target_ck check (resolution_target_seconds >= response_target_seconds),
  constraint sla_rules_window_ck check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint sla_rules_row_version_ck check (row_version > 0)
);

create table if not exists public.department_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  department_id uuid not null,
  contact_type text not null,
  label text not null,
  value text not null,
  is_public boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint department_contacts_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint department_contacts_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint department_contacts_tenant_id_uq unique (tenant_id, id),
  constraint department_contacts_type_ck check (contact_type in ('PHONE', 'EMAIL', 'URL', 'LOCATION', 'LINE')),
  constraint department_contacts_label_ck check (length(btrim(label)) between 1 and 160),
  constraint department_contacts_value_ck check (length(btrim(value)) between 1 and 500),
  constraint department_contacts_row_version_ck check (row_version > 0)
);
create index if not exists department_contacts_department_idx on public.department_contacts (tenant_id, department_id, is_public);

create table if not exists public.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_account_id uuid not null,
  route text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer,
  response_json jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  row_version integer not null default 1,
  constraint idempotency_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint idempotency_actor_fk foreign key (actor_account_id) references public.user_accounts (id) on delete restrict,
  constraint idempotency_tenant_id_uq unique (tenant_id, id),
  constraint idempotency_key_uq unique (tenant_id, actor_account_id, route, idempotency_key),
  constraint idempotency_route_ck check (route like '/api/%'),
  constraint idempotency_key_ck check (length(btrim(idempotency_key)) between 8 and 255),
  constraint idempotency_hash_ck check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint idempotency_status_ck check (response_status is null or response_status between 100 and 599),
  constraint idempotency_response_ck check (response_json is null or jsonb_typeof(response_json) = 'object'),
  constraint idempotency_expiry_ck check (expires_at > created_at),
  constraint idempotency_row_version_ck check (row_version > 0)
);
create index if not exists idempotency_expiry_idx on public.idempotency_records (tenant_id, expires_at);

create table if not exists public.domain_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_type text not null,
  event_version integer not null default 1,
  aggregate_type text not null,
  aggregate_id uuid not null,
  idempotency_key text,
  payload_json jsonb not null,
  occurred_at timestamptz not null default statement_timestamp(),
  available_at timestamptz not null default statement_timestamp(),
  published_at timestamptz,
  attempt_count integer not null default 0,
  last_error_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint outbox_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint outbox_tenant_id_uq unique (tenant_id, id),
  constraint outbox_event_version_ck check (event_version > 0),
  constraint outbox_event_type_ck check (event_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  constraint outbox_aggregate_type_ck check (aggregate_type ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  constraint outbox_payload_ck check (jsonb_typeof(payload_json) = 'object'),
  constraint outbox_attempt_count_ck check (attempt_count >= 0),
  constraint outbox_published_ck check (published_at is null or published_at >= occurred_at),
  constraint outbox_row_version_ck check (row_version > 0)
);
create unique index if not exists outbox_idempotency_uq
  on public.domain_outbox (tenant_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists outbox_claim_idx on public.domain_outbox (tenant_id, available_at, published_at, id);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  job_type text not null,
  job_version integer not null default 1,
  dedupe_key text not null,
  payload_json jsonb not null,
  status text not null default 'QUEUED',
  priority integer not null default 100,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default statement_timestamp(),
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  error_code text,
  error_detail_redacted text,
  created_at timestamptz not null default statement_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint jobs_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint jobs_tenant_id_uq unique (tenant_id, id),
  constraint jobs_dedupe_uq unique (tenant_id, job_type, dedupe_key),
  constraint jobs_type_ck check (job_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  constraint jobs_version_ck check (job_version > 0),
  constraint jobs_payload_ck check (jsonb_typeof(payload_json) = 'object'),
  constraint jobs_status_ck check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'RETRY_WAIT', 'DEAD', 'CANCELLED')),
  constraint jobs_priority_ck check (priority between 0 and 1000),
  constraint jobs_attempt_count_ck check (attempt_count >= 0 and attempt_count <= max_attempts),
  constraint jobs_max_attempts_ck check (max_attempts between 1 and 100),
  constraint jobs_lease_ck check (lease_expires_at is null or lease_owner is not null),
  constraint jobs_completion_ck check (completed_at is null or status in ('SUCCEEDED', 'DEAD', 'CANCELLED')),
  constraint jobs_row_version_ck check (row_version > 0)
);
create index if not exists jobs_claim_idx
  on public.jobs (tenant_id, status, next_attempt_at, priority desc, created_at, id);
create index if not exists jobs_lease_idx on public.jobs (tenant_id, lease_expires_at) where status = 'RUNNING';

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_account_id uuid,
  actor_membership_id uuid,
  actor_type text not null,
  support_access_grant_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid not null,
  before_redacted_json jsonb,
  after_redacted_json jsonb,
  reason text,
  request_id uuid,
  correlation_id uuid,
  ip_hash text,
  user_agent_summary text,
  created_at timestamptz not null default statement_timestamp(),
  constraint audit_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint audit_actor_account_fk foreign key (actor_account_id) references public.user_accounts (id) on delete restrict,
  constraint audit_actor_membership_fk foreign key (tenant_id, actor_membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint audit_support_grant_fk foreign key (tenant_id, support_access_grant_id)
    references public.support_access_grants (tenant_id, id) on delete restrict,
  constraint audit_tenant_id_uq unique (tenant_id, id),
  constraint audit_actor_type_ck check (actor_type in ('CITIZEN', 'STAFF', 'SYSTEM', 'SUPER_ADMIN')),
  constraint audit_action_ck check (action ~ '^[A-Z][A-Z0-9_.:-]{2,127}$'),
  constraint audit_resource_type_ck check (resource_type ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  constraint audit_before_json_ck check (before_redacted_json is null or jsonb_typeof(before_redacted_json) = 'object'),
  constraint audit_after_json_ck check (after_redacted_json is null or jsonb_typeof(after_redacted_json) = 'object'),
  constraint audit_reason_ck check (reason is null or length(btrim(reason)) between 3 and 2000)
);
create index if not exists audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc, id);
create index if not exists audit_logs_resource_idx on public.audit_logs (tenant_id, resource_type, resource_id, created_at desc);

-- Every mutable core row gets a monotonic version and UTC update timestamp.
create or replace function private.touch_mutable_row()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := statement_timestamp();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create or replace function private.reject_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000', message = 'audit_logs are append-only';
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenants', 'user_accounts', 'tenant_settings', 'feature_flag_versions',
    'tenant_memberships', 'departments', 'department_memberships',
    'department_work_scope_versions', 'roles', 'permissions', 'role_permissions',
    'membership_roles', 'support_access_grants', 'sla_rule_versions',
    'department_contacts', 'idempotency_records', 'domain_outbox', 'jobs'
  ] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function private.touch_mutable_row()',
      table_name, table_name
    );
  end loop;
end;
$$;

drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function private.reject_audit_mutation();

-- RLS is enabled and forced now. Mutation policies are intentionally absent until
-- P1-IAM-001/P1-RLS-001 install the role/action matrix; deny-by-default is safer
-- than exposing a broad authenticated write policy from the schema bootstrap.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenants', 'user_accounts', 'tenant_settings', 'feature_flag_versions',
    'tenant_memberships', 'departments', 'department_memberships',
    'department_work_scope_versions', 'roles', 'permissions', 'role_permissions',
    'membership_roles', 'support_access_grants', 'sla_rule_versions',
    'department_contacts', 'idempotency_records', 'domain_outbox', 'jobs', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

-- Authenticated reads are scoped by the trusted tenant claim. The next IAM/RLS
-- task adds explicit action policies and membership/department scope checks.
drop policy if exists tenants_read_current on public.tenants;
create policy tenants_read_current on public.tenants
  for select to authenticated
  using ((select private.can_read_tenant(id)));

drop policy if exists user_accounts_read_self on public.user_accounts;
create policy user_accounts_read_self on public.user_accounts
  for select to authenticated
  using (id = (select private.current_account_id()));

drop policy if exists permissions_read_authenticated on public.permissions;
create policy permissions_read_authenticated on public.permissions
  for select to authenticated
  using (true);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_settings', 'feature_flag_versions', 'tenant_memberships', 'departments',
    'department_memberships', 'department_work_scope_versions', 'roles',
    'role_permissions', 'membership_roles', 'support_access_grants',
    'sla_rule_versions', 'department_contacts', 'idempotency_records',
    'domain_outbox', 'jobs', 'audit_logs'
  ] loop
    execute format('drop policy if exists %I_read_current_tenant on public.%I', table_name, table_name);
    execute format(
      'create policy %I_read_current_tenant on public.%I for select to authenticated using ((select private.can_read_tenant(tenant_id)))',
      table_name, table_name
    );
  end loop;
end;
$$;

-- Function/schema privileges are explicit for the Supabase authenticated role;
-- the private schema remains hidden from anon and browser clients.
revoke all on schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.current_tenant_id() to authenticated;
grant execute on function private.current_account_id() to authenticated;
grant execute on function private.can_read_tenant(uuid) to authenticated;

grant usage on schema public to authenticated;
grant select on table
  public.tenants,
  public.user_accounts,
  public.tenant_settings,
  public.feature_flag_versions,
  public.tenant_memberships,
  public.departments,
  public.department_memberships,
  public.department_work_scope_versions,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.membership_roles,
  public.support_access_grants,
  public.sla_rule_versions,
  public.department_contacts,
  public.idempotency_records,
  public.domain_outbox,
  public.jobs,
  public.audit_logs
to authenticated;

comment on schema private is 'CityChatbot security-definer helpers; never expose through the API schema';
comment on table public.domain_outbox is 'Transactional outbox; write in same transaction as the domain record';
comment on table public.jobs is 'Durable job queue; claim with FOR UPDATE SKIP LOCKED and lease fields';
comment on table public.audit_logs is 'Append-only redacted audit trail';
