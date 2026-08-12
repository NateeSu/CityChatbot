-- CityChatbot audit viewer, notification read model and privileged exports.
-- Requirements: RF-10, RF-13, RF-14, RF-18.
-- The trusted API/worker writes audit/export rows; browser roles receive no
-- direct export or audit mutation grant.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

alter table if exists public.audit_logs
  add column if not exists integrity_hash text,
  add column if not exists previous_hash text;

create index if not exists audit_logs_integrity_idx
  on public.audit_logs (tenant_id, created_at, id, integrity_hash);

-- The notification migration normally creates this table earlier. Keeping an
-- additive guard here makes a partial local restore safe to resume without
-- weakening the tenant composite FK or RLS contract.
create table if not exists public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  source_outbox_id uuid,
  notification_type text not null,
  title text not null,
  body_text text not null,
  read_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint staff_notifications_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint staff_notifications_membership_fk foreign key (tenant_id, membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint staff_notifications_outbox_fk foreign key (tenant_id, source_outbox_id)
    references public.domain_outbox (tenant_id, id) on delete restrict,
  constraint staff_notifications_tenant_id_uq unique (tenant_id, id),
  constraint staff_notifications_type_ck check (notification_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  constraint staff_notifications_title_ck check (length(btrim(title)) between 1 and 200),
  constraint staff_notifications_body_ck check (length(btrim(body_text)) between 1 and 4000),
  constraint staff_notifications_row_version_ck check (row_version > 0)
);

create index if not exists staff_notifications_inbox_idx
  on public.staff_notifications (tenant_id, membership_id, read_at, created_at desc, id);
alter table public.staff_notifications enable row level security;
alter table public.staff_notifications force row level security;
drop trigger if exists staff_notifications_touch_updated_at on public.staff_notifications;
create trigger staff_notifications_touch_updated_at
  before update on public.staff_notifications
  for each row execute function private.touch_mutable_row();

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  requested_by_account_id uuid not null,
  requested_by_membership_id uuid not null,
  approved_by_account_id uuid,
  approved_by_membership_id uuid,
  job_id uuid,
  export_type text not null default 'REPORT',
  format text not null default 'CSV',
  status text not null default 'REQUESTED',
  filters_redacted_json jsonb not null default '{}'::jsonb,
  row_count bigint not null default 0,
  reason text not null,
  watermark text not null,
  signed_url_digest text,
  requested_at timestamptz not null default statement_timestamp(),
  approved_at timestamptz,
  ready_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  error_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint exports_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint exports_requested_account_fk foreign key (requested_by_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint exports_requested_membership_fk foreign key (tenant_id, requested_by_membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint exports_approved_account_fk foreign key (approved_by_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint exports_approved_membership_fk foreign key (tenant_id, approved_by_membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint exports_job_fk foreign key (tenant_id, job_id)
    references public.jobs (tenant_id, id) on delete restrict,
  constraint exports_tenant_id_uq unique (tenant_id, id),
  constraint exports_export_type_ck check (export_type in ('AUDIT_LOG', 'REPORT')),
  constraint exports_format_ck check (format in ('CSV')),
  constraint exports_status_ck check (status in ('REQUESTED', 'APPROVED', 'QUEUED', 'READY', 'EXPIRED', 'REVOKED', 'FAILED')),
  constraint exports_filters_ck check (jsonb_typeof(filters_redacted_json) = 'object'),
  constraint exports_row_count_ck check (row_count >= 0),
  constraint exports_reason_ck check (length(btrim(reason)) between 3 and 2000),
  constraint exports_watermark_ck check (length(btrim(watermark)) between 1 and 1000),
  constraint exports_signed_url_digest_ck check (signed_url_digest is null or length(btrim(signed_url_digest)) = 64),
  constraint exports_row_version_ck check (row_version > 0),
  constraint exports_ready_window_ck check (expires_at is null or ready_at is not null)
);

create index if not exists exports_tenant_requested_idx
  on public.exports (tenant_id, requested_at desc, id);
create index if not exists exports_tenant_status_idx
  on public.exports (tenant_id, status, updated_at desc, id);
create unique index if not exists exports_job_uq
  on public.exports (tenant_id, job_id)
  where job_id is not null;

alter table public.exports enable row level security;
alter table public.exports force row level security;
drop trigger if exists exports_touch_updated_at on public.exports;
create trigger exports_touch_updated_at
  before update on public.exports
  for each row execute function private.touch_mutable_row();

-- Export and audit data are server-side only. The API passes the verified
-- tenant/membership context to private functions or service-role adapters.
revoke all on table public.exports from anon, authenticated;
revoke insert, update, delete, truncate on table public.audit_logs from anon, authenticated;

create or replace function private.mark_staff_notification_read(
  p_tenant_id uuid,
  p_notification_id uuid,
  p_expected_version integer
)
returns public.staff_notifications
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  result public.staff_notifications;
begin
  if p_tenant_id is null or p_notification_id is null or p_expected_version is null then
    raise exception using errcode = '22023', message = 'notification read context is required';
  end if;
  update public.staff_notifications as notification
     set read_at = coalesce(notification.read_at, statement_timestamp())
   where notification.tenant_id = p_tenant_id
     and notification.id = p_notification_id
     and notification.row_version = p_expected_version
     and (
       exists (
         select 1
           from public.tenant_memberships as membership
          where membership.tenant_id = notification.tenant_id
            and membership.id = notification.membership_id
            and membership.account_id = private.current_account_id()
            and membership.status = 'ACTIVE'
       )
       or private.has_tenant_permission(p_tenant_id, 'staff.manage.tenant')
     )
  returning notification.* into result;
  if not found then
    raise exception using errcode = '40001', message = 'notification version or scope mismatch';
  end if;
  return result;
end;
$$;

create or replace function private.revoke_export(
  p_tenant_id uuid,
  p_export_id uuid,
  p_expected_version integer,
  p_reason text
)
returns public.exports
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  result public.exports;
begin
  if p_tenant_id is null or p_export_id is null or p_expected_version is null or length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'export revoke context is required';
  end if;
  update public.exports as export_row
     set status = 'REVOKED', revoked_at = statement_timestamp(), signed_url_digest = null
   where export_row.tenant_id = p_tenant_id
     and export_row.id = p_export_id
     and export_row.row_version = p_expected_version
     and export_row.status in ('REQUESTED', 'APPROVED', 'QUEUED', 'READY')
     and private.has_tenant_permission(p_tenant_id, 'settings.manage.tenant')
  returning export_row.* into result;
  if not found then
    raise exception using errcode = '40001', message = 'export version or scope mismatch';
  end if;
  return result;
end;
$$;

comment on table public.exports is 'Tenant-scoped, redacted export metadata; artifacts are background-built and signed links expire.';
comment on column public.audit_logs.integrity_hash is 'Optional production hardening hash over canonical redacted audit record.';
comment on column public.audit_logs.previous_hash is 'Optional production hardening previous per-tenant audit hash.';
