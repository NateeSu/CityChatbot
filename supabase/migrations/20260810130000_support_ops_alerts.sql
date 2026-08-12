-- CityChatbot support operations alerts and durable reconciliation boundary.
-- Requirements: RF-09, RF-15
-- Depends on the core/IAM migrations and 20260810120000_support_handoff_schema.sql.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.support_ops_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  alert_key text not null,
  kind text not null,
  status text not null default 'OPEN',
  severity text not null,
  recipient_scope text not null,
  ticket_id uuid,
  public_ticket_id text,
  conversation_id text,
  department_id uuid,
  policy_version text not null,
  boundary_at timestamptz,
  opened_at timestamptz not null default statement_timestamp(),
  last_seen_at timestamptz not null default statement_timestamp(),
  resolved_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version bigint not null default 1,
  constraint support_ops_alerts_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint support_ops_alerts_ticket_fk foreign key (tenant_id, ticket_id)
    references public.support_tickets (tenant_id, id) on delete restrict,
  constraint support_ops_alerts_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint support_ops_alerts_tenant_id_uq unique (tenant_id, id),
  constraint support_ops_alerts_key_uq unique (tenant_id, alert_key),
  constraint support_ops_alerts_key_ck check (alert_key ~ '^[A-Za-z0-9._:-]{1,255}$'),
  constraint support_ops_alerts_kind_ck check (kind in (
    'UNASSIGNED', 'STALE', 'RESPONSE_SLA_WARNING', 'RESPONSE_SLA_BREACHED',
    'RESOLUTION_SLA_WARNING', 'RESOLUTION_SLA_BREACHED', 'ORPHAN_CONVERSATION'
  )),
  constraint support_ops_alerts_status_ck check (status in ('OPEN', 'RESOLVED')),
  constraint support_ops_alerts_severity_ck check (severity in ('INFO', 'WARNING', 'CRITICAL')),
  constraint support_ops_alerts_recipient_ck check (recipient_scope in ('CENTRAL_QUEUE', 'DEPARTMENT_HEAD')),
  constraint support_ops_alerts_public_id_ck check (
    public_ticket_id is null or public_ticket_id ~ '^[A-Z][A-Z0-9_-]{1,11}-[0-9]{4}-[0-9]{6,}$'
  ),
  constraint support_ops_alerts_conversation_ck check (
    conversation_id is null or conversation_id ~ '^[A-Za-z0-9._:-]{1,255}$'
  ),
  constraint support_ops_alerts_policy_ck check (length(btrim(policy_version)) between 1 and 128),
  constraint support_ops_alerts_dates_ck check (
    last_seen_at >= opened_at
    and updated_at >= created_at
    and (resolved_at is null or resolved_at >= opened_at)
    and (status = 'OPEN' or resolved_at is not null)
  ),
  constraint support_ops_alerts_row_version_ck check (row_version > 0)
);

create index if not exists support_ops_alerts_queue_idx
  on public.support_ops_alerts (tenant_id, status, recipient_scope, severity, last_seen_at desc, id);
create index if not exists support_ops_alerts_ticket_idx
  on public.support_ops_alerts (tenant_id, ticket_id, kind, status, id);
create index if not exists support_ops_alerts_department_idx
  on public.support_ops_alerts (tenant_id, department_id, status, kind, id);

create or replace function private.touch_support_ops_alert()
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

drop trigger if exists support_ops_alerts_touch_updated_at on public.support_ops_alerts;
create trigger support_ops_alerts_touch_updated_at
  before update on public.support_ops_alerts
  for each row execute function private.touch_support_ops_alert();

alter table public.support_ops_alerts enable row level security;
alter table public.support_ops_alerts force row level security;

drop policy if exists support_ops_alerts_read_scoped on public.support_ops_alerts;
create policy support_ops_alerts_read_scoped on public.support_ops_alerts
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));

-- Alert upserts and reconciliation writes are trusted worker/RPC operations.
-- Browser clients receive scoped reads only and cannot manufacture alerts.
revoke insert, update, delete, truncate on table public.support_ops_alerts from authenticated;
grant select on table public.support_ops_alerts to authenticated;

comment on table public.support_ops_alerts is 'Tenant-scoped durable SLA/ownership/orphan alerts; body and raw citizen identity are never stored.';
