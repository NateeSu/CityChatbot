-- Tenant-scoped privacy, retention, legal-hold and data-subject request contract.
-- Requirements: RF-03, RF-04, RF-13, RF-14, RF-15, RF-17, NFR-DR-001.
-- This migration is additive and fail-closed: missing policy never authorizes purge,
-- active legal holds always block purge, and application roles cannot hard-delete.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.privacy_notice_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version text not null,
  state text not null default 'DRAFT',
  notice_text text not null,
  notice_sha256 text not null,
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint privacy_notice_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint privacy_notice_tenant_id_uq unique (tenant_id, id),
  constraint privacy_notice_version_uq unique (tenant_id, version),
  constraint privacy_notice_version_ck check (length(btrim(version)) between 1 and 128),
  constraint privacy_notice_state_ck check (state in ('DRAFT', 'ACTIVE', 'RETIRED')),
  constraint privacy_notice_text_ck check (length(btrim(notice_text)) between 1 and 200000),
  constraint privacy_notice_hash_ck check (notice_sha256 ~ '^[a-f0-9]{64}$'),
  constraint privacy_notice_window_ck check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint privacy_notice_row_version_ck check (row_version > 0)
);

create table if not exists public.retention_policy_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  policy_key text not null,
  version integer not null,
  state text not null default 'DRAFT',
  retention_days integer not null,
  effective_from timestamptz,
  effective_until timestamptz,
  activated_by text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint retention_policy_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint retention_policy_tenant_id_uq unique (tenant_id, id),
  constraint retention_policy_version_uq unique (tenant_id, policy_key, version),
  constraint retention_policy_key_ck check (policy_key in ('COMPLAINT', 'CHAT', 'SUPPORT', 'AUDIT', 'FILE', 'AI_TRACE', 'BACKUP')),
  constraint retention_policy_version_ck check (version > 0),
  constraint retention_policy_state_ck check (state in ('DRAFT', 'ACTIVE', 'RETIRED')),
  constraint retention_policy_days_ck check (retention_days >= 0),
  constraint retention_policy_window_ck check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint retention_policy_actor_ck check (activated_by is null or activated_by = 'SYSTEM_UNIT_GATE'),
  constraint retention_policy_row_version_ck check (row_version > 0)
);

create table if not exists public.legal_holds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  hold_key text not null,
  state text not null default 'ACTIVE',
  reason text not null,
  scope_keys jsonb not null default '["ALL"]'::jsonb,
  starts_at timestamptz not null default statement_timestamp(),
  released_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint legal_hold_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint legal_hold_tenant_id_uq unique (tenant_id, id),
  constraint legal_hold_key_uq unique (tenant_id, hold_key),
  constraint legal_hold_key_ck check (length(btrim(hold_key)) between 8 and 255),
  constraint legal_hold_state_ck check (state in ('ACTIVE', 'RELEASED')),
  constraint legal_hold_reason_ck check (length(btrim(reason)) between 3 and 2000),
  constraint legal_hold_scope_ck check (
    jsonb_typeof(scope_keys) = 'array'
    and jsonb_array_length(scope_keys) > 0
    and jsonb_array_length(scope_keys) <= 8
    and scope_keys <@ '["ALL", "COMPLAINT", "CHAT", "SUPPORT", "AUDIT", "FILE", "AI_TRACE", "BACKUP"]'::jsonb
  ),
  constraint legal_hold_release_ck check ((state = 'ACTIVE' and released_at is null) or (state = 'RELEASED' and released_at is not null)),
  constraint legal_hold_row_version_ck check (row_version > 0)
);

create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  request_key text not null,
  subject_hash text not null,
  request_type text not null,
  state text not null default 'REQUESTED',
  requested_at timestamptz not null default statement_timestamp(),
  due_at timestamptz not null,
  completed_at timestamptz,
  result_redacted_json jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint data_subject_request_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint data_subject_request_tenant_id_uq unique (tenant_id, id),
  constraint data_subject_request_key_uq unique (tenant_id, request_key),
  constraint data_subject_request_key_ck check (length(btrim(request_key)) between 8 and 255),
  constraint data_subject_request_subject_ck check (subject_hash ~ '^sha256:[a-f0-9]{64}$'),
  constraint data_subject_request_type_ck check (request_type in ('ACCESS', 'RECTIFICATION', 'ERASURE', 'RESTRICTION')),
  constraint data_subject_request_state_ck check (state in ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED')),
  constraint data_subject_request_due_ck check (due_at >= requested_at),
  constraint data_subject_request_result_ck check (result_redacted_json is null or jsonb_typeof(result_redacted_json) = 'object'),
  constraint data_subject_request_completion_ck check ((state = 'COMPLETED' and completed_at is not null) or state <> 'COMPLETED'),
  constraint data_subject_request_row_version_ck check (row_version > 0)
);

create index if not exists privacy_notice_active_idx on public.privacy_notice_versions (tenant_id, state, effective_from desc);
create index if not exists retention_policy_active_idx on public.retention_policy_versions (tenant_id, policy_key, state, effective_from desc);
create index if not exists legal_holds_active_idx on public.legal_holds (tenant_id, state, starts_at desc);
create index if not exists data_subject_requests_subject_idx on public.data_subject_requests (tenant_id, subject_hash, state, requested_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['privacy_notice_versions', 'retention_policy_versions', 'legal_holds', 'data_subject_requests'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function private.touch_mutable_row()', table_name, table_name);
  end loop;
end;
$$;

drop policy if exists privacy_notice_read_manage on public.privacy_notice_versions;
create policy privacy_notice_read_manage on public.privacy_notice_versions
  for select to authenticated using ((select private.can_read_tenant(tenant_id)));
drop policy if exists privacy_notice_write_manage on public.privacy_notice_versions;
create policy privacy_notice_write_manage on public.privacy_notice_versions
  for insert to authenticated with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
drop policy if exists retention_policy_read_manage on public.retention_policy_versions;
create policy retention_policy_read_manage on public.retention_policy_versions
  for select to authenticated using ((select private.can_read_tenant(tenant_id)));
drop policy if exists retention_policy_write_manage on public.retention_policy_versions;
create policy retention_policy_write_manage on public.retention_policy_versions
  for insert to authenticated with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
drop policy if exists legal_holds_read_manage on public.legal_holds;
create policy legal_holds_read_manage on public.legal_holds
  for select to authenticated using ((select private.has_tenant_permission(tenant_id, 'support.access.tenant')) or (select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
drop policy if exists legal_holds_write_manage on public.legal_holds;
create policy legal_holds_write_manage on public.legal_holds
  for insert to authenticated with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
drop policy if exists data_subject_requests_read_manage on public.data_subject_requests;
create policy data_subject_requests_read_manage on public.data_subject_requests
  for select to authenticated using ((select private.has_tenant_permission(tenant_id, 'support.access.tenant')) or (select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
drop policy if exists data_subject_requests_write_manage on public.data_subject_requests;
create policy data_subject_requests_write_manage on public.data_subject_requests
  for insert to authenticated with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

grant select on table public.privacy_notice_versions, public.retention_policy_versions, public.legal_holds, public.data_subject_requests to authenticated;
revoke update, delete, truncate on table public.privacy_notice_versions, public.retention_policy_versions, public.legal_holds, public.data_subject_requests from anon, authenticated;
revoke all on table public.privacy_notice_versions, public.retention_policy_versions, public.legal_holds, public.data_subject_requests from anon;

create or replace function private.retention_purge_allowed(
  p_tenant_id uuid,
  p_policy_key text,
  p_record_created_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  policy_row public.retention_policy_versions%rowtype;
begin
  if p_tenant_id is null or p_policy_key not in ('COMPLAINT', 'CHAT', 'SUPPORT', 'AUDIT', 'FILE', 'AI_TRACE', 'BACKUP') or p_record_created_at is null then
    return false;
  end if;
  if exists (
    select 1 from public.legal_holds as hold
    where hold.tenant_id = p_tenant_id
      and hold.state = 'ACTIVE'
      and hold.starts_at <= statement_timestamp()
      and (hold.scope_keys ? 'ALL' or hold.scope_keys ? p_policy_key)
  ) then
    return false;
  end if;
  select * into policy_row
    from public.retention_policy_versions
   where tenant_id = p_tenant_id
     and policy_key = p_policy_key
     and state = 'ACTIVE'
     and (effective_from is null or effective_from <= statement_timestamp())
     and (effective_until is null or effective_until > statement_timestamp())
   order by version desc
   limit 1;
  if not found then return false; end if;
  return p_record_created_at + make_interval(days => policy_row.retention_days) <= statement_timestamp();
end;
$$;

revoke all on function private.retention_purge_allowed(uuid, text, timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'citychatbot_app') then
    grant usage on schema private to citychatbot_app;
    grant execute on function private.retention_purge_allowed(uuid, text, timestamptz) to citychatbot_app;
  end if;
end;
$$;

comment on table public.privacy_notice_versions is 'Versioned tenant privacy notices; activation and retirement are audited server workflows.';
comment on table public.retention_policy_versions is 'Versioned per-store retention policy; absent policy fails closed and SYSTEM_UNIT_GATE is the only activation actor.';
comment on table public.legal_holds is 'Tenant legal holds; ACTIVE holds always prevent retention purge for matching scope.';
comment on table public.data_subject_requests is 'Privacy subject workflow using pseudonymous subject hashes; raw PII is not stored.';
comment on function private.retention_purge_allowed(uuid, text, timestamptz) is 'Fail-closed retention decision: active legal hold or missing/expired policy denies purge.';
