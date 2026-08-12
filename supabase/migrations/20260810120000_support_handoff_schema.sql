-- CityChatbot support handoff ticket, SLA snapshot and append-only history schema.
-- Requirements: RF-04, RF-07, RF-09, RF-15
-- Depends on the core, IAM/RLS, complaint/intake-queue and notification migrations.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

-- The signed auth context may carry the backend-derived HMAC identity hash. The
-- raw LINE identifier is intentionally never read by the support ticket policy.
create or replace function private.current_citizen_identity_hash()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  claims jsonb;
  identity_hash text;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return null;
  end;
  identity_hash := claims ->> 'citizen_identity_hash';
  if identity_hash is null or identity_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  return lower(identity_hash);
end;
$$;

grant execute on function private.current_citizen_identity_hash() to authenticated;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  public_ticket_id text not null,
  request_key text not null,
  request_fingerprint text not null,
  source_event_id text not null,
  citizen_identity_hash text not null,
  topic_key text not null,
  channel text not null,
  reason_code text not null,
  reason_detail text not null,
  default_intake_queue_id uuid not null,
  suggested_department_id uuid,
  assigned_department_id uuid,
  assigned_membership_id uuid,
  priority text not null default 'NORMAL',
  confirmation_state text not null,
  canonical_status text not null default 'NEW',
  source_trace jsonb not null default '{}'::jsonb,
  sla_snapshot jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version bigint not null default 1,
  constraint support_tickets_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint support_tickets_intake_queue_fk foreign key (tenant_id, default_intake_queue_id)
    references public.intake_queues (tenant_id, id) on delete restrict,
  constraint support_tickets_suggested_department_fk foreign key (tenant_id, suggested_department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint support_tickets_assigned_department_fk foreign key (tenant_id, assigned_department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint support_tickets_assigned_membership_fk foreign key (tenant_id, assigned_membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint support_tickets_tenant_id_uq unique (tenant_id, id),
  constraint support_tickets_public_id_uq unique (tenant_id, public_ticket_id),
  constraint support_tickets_request_uq unique (tenant_id, request_key),
  constraint support_tickets_source_event_uq unique (tenant_id, source_event_id),
  constraint support_tickets_public_id_ck check (public_ticket_id ~ '^[A-Z][A-Z0-9_-]{1,11}-[0-9]{4}-[0-9]{6,}$'),
  constraint support_tickets_request_key_ck check (request_key ~ '^[A-Za-z0-9._:-]{8,255}$'),
  constraint support_tickets_hashes_ck check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
    and citizen_identity_hash ~ '^[0-9a-f]{64}$'
    and topic_key ~ '^[0-9a-f]{64}$'
  ),
  constraint support_tickets_source_event_ck check (source_event_id ~ '^[A-Za-z0-9._:-]{1,255}$'),
  constraint support_tickets_channel_ck check (channel in ('LINE', 'WEB', 'SYSTEM')),
  constraint support_tickets_reason_ck check (reason_code in (
    'NO_EVIDENCE', 'CONFLICTING_EVIDENCE', 'LOW_EVIDENCE', 'SENSITIVE',
    'PERSON_SPECIFIC', 'POLICY_REFUSAL', 'SECURITY', 'STAFF_REQUESTED', 'SYSTEM_ERROR'
  )),
  constraint support_tickets_reason_detail_ck check (length(btrim(reason_detail)) between 1 and 2000),
  constraint support_tickets_priority_ck check (priority in ('NORMAL', 'URGENT')),
  constraint support_tickets_confirmation_ck check (confirmation_state in ('CONFIRMED', 'URGENT_AUTOMATIC')),
  constraint support_tickets_status_ck check (canonical_status in (
    'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CITIZEN', 'ANSWERED', 'CLOSED', 'CANCELLED'
  )),
  constraint support_tickets_source_trace_ck check (
    jsonb_typeof(source_trace) = 'object'
    and not (source_trace ?| array['line_user_id', 'lineUserId', 'system_prompt', 'systemPrompt', 'secret', 'api_key'])
  ),
  constraint support_tickets_sla_snapshot_ck check (jsonb_typeof(sla_snapshot) = 'object'),
  constraint support_tickets_dates_ck check (updated_at >= created_at),
  constraint support_tickets_row_version_ck check (row_version > 0)
);

create index if not exists support_tickets_queue_status_idx
  on public.support_tickets (tenant_id, default_intake_queue_id, canonical_status, priority, created_at, id);
create index if not exists support_tickets_assignment_idx
  on public.support_tickets (tenant_id, assigned_department_id, assigned_membership_id, canonical_status, id);
create index if not exists support_tickets_citizen_topic_idx
  on public.support_tickets (tenant_id, citizen_identity_hash, topic_key, created_at desc, id)
  where canonical_status not in ('CLOSED', 'CANCELLED');

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ticket_id uuid not null,
  event_id text not null,
  sequence integer not null,
  author_type text not null,
  visibility text not null,
  body text not null,
  is_ai_draft boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  constraint support_ticket_messages_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint support_ticket_messages_ticket_fk foreign key (tenant_id, ticket_id)
    references public.support_tickets (tenant_id, id) on delete restrict,
  constraint support_ticket_messages_tenant_id_uq unique (tenant_id, id),
  constraint support_ticket_messages_event_uq unique (tenant_id, ticket_id, event_id),
  constraint support_ticket_messages_sequence_uq unique (tenant_id, ticket_id, sequence),
  constraint support_ticket_messages_event_ck check (event_id ~ '^[A-Za-z0-9._:-]{1,255}$'),
  constraint support_ticket_messages_sequence_ck check (sequence > 0),
  constraint support_ticket_messages_author_ck check (author_type in ('CITIZEN', 'BOT', 'STAFF', 'SYSTEM')),
  constraint support_ticket_messages_visibility_ck check (visibility in ('PUBLIC', 'INTERNAL')),
  constraint support_ticket_messages_body_ck check (length(btrim(body)) between 1 and 4000),
  constraint support_ticket_messages_ai_draft_ck check (not is_ai_draft or visibility = 'INTERNAL')
);
create index if not exists support_ticket_messages_ticket_idx
  on public.support_ticket_messages (tenant_id, ticket_id, sequence);

create table if not exists public.support_ticket_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ticket_id uuid not null,
  department_id uuid not null,
  membership_id uuid,
  actor_account_id uuid not null,
  reason text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint support_ticket_assignments_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint support_ticket_assignments_ticket_fk foreign key (tenant_id, ticket_id)
    references public.support_tickets (tenant_id, id) on delete restrict,
  constraint support_ticket_assignments_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint support_ticket_assignments_membership_fk foreign key (tenant_id, membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint support_ticket_assignments_actor_fk foreign key (actor_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint support_ticket_assignments_tenant_id_uq unique (tenant_id, id),
  constraint support_ticket_assignments_reason_ck check (length(btrim(reason)) between 2 and 2000)
);
create index if not exists support_ticket_assignments_ticket_idx
  on public.support_ticket_assignments (tenant_id, ticket_id, created_at, id);

create table if not exists public.support_ticket_status_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ticket_id uuid not null,
  from_status text,
  to_status text not null,
  actor_type text not null,
  actor_account_id uuid,
  reason text not null,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint support_ticket_status_logs_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint support_ticket_status_logs_ticket_fk foreign key (tenant_id, ticket_id)
    references public.support_tickets (tenant_id, id) on delete restrict,
  constraint support_ticket_status_logs_actor_fk foreign key (actor_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint support_ticket_status_logs_tenant_id_uq unique (tenant_id, id),
  constraint support_ticket_status_logs_from_ck check (from_status is null or from_status in (
    'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CITIZEN', 'ANSWERED', 'CLOSED', 'CANCELLED'
  )),
  constraint support_ticket_status_logs_to_ck check (to_status in (
    'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CITIZEN', 'ANSWERED', 'CLOSED', 'CANCELLED'
  )),
  constraint support_ticket_status_logs_actor_type_ck check (actor_type in ('CITIZEN', 'BOT', 'STAFF', 'SYSTEM')),
  constraint support_ticket_status_logs_reason_ck check (length(btrim(reason)) between 2 and 2000)
);
create index if not exists support_ticket_status_logs_ticket_idx
  on public.support_ticket_status_logs (tenant_id, ticket_id, occurred_at, id);

create table if not exists public.support_ticket_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ticket_id uuid not null,
  action text not null,
  actor_type text not null,
  actor_account_id uuid,
  before_version bigint not null,
  after_version bigint not null,
  reason text not null,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint support_ticket_audit_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint support_ticket_audit_ticket_fk foreign key (tenant_id, ticket_id)
    references public.support_tickets (tenant_id, id) on delete restrict,
  constraint support_ticket_audit_actor_fk foreign key (actor_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint support_ticket_audit_tenant_id_uq unique (tenant_id, id),
  constraint support_ticket_audit_action_ck check (action in (
    'SUPPORT_TICKET_CREATED', 'SUPPORT_TICKET_DEDUPLICATED', 'SUPPORT_TICKET_ASSIGNED',
    'SUPPORT_TICKET_STATUS_CHANGED', 'SUPPORT_TICKET_MESSAGE_ADDED'
  )),
  constraint support_ticket_audit_actor_type_ck check (actor_type in ('CITIZEN', 'BOT', 'STAFF', 'SYSTEM')),
  constraint support_ticket_audit_versions_ck check (before_version >= 0 and after_version >= before_version),
  constraint support_ticket_audit_reason_ck check (length(btrim(reason)) between 2 and 2000)
);
create index if not exists support_ticket_audit_ticket_idx
  on public.support_ticket_audit (tenant_id, ticket_id, occurred_at desc, id);

-- The app service performs the same transition validation before mutation. This
-- database trigger is the final fail-closed boundary for all other writers.
create or replace function private.validate_support_ticket_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.canonical_status = old.canonical_status then
    return new;
  end if;

  if not (
    (old.canonical_status not in ('CLOSED', 'CANCELLED') and new.canonical_status = 'CANCELLED')
    or (old.canonical_status = 'NEW' and new.canonical_status = 'ASSIGNED')
    or (old.canonical_status = 'ASSIGNED' and new.canonical_status = 'IN_PROGRESS')
    or (old.canonical_status = 'IN_PROGRESS' and new.canonical_status in ('WAITING_FOR_CITIZEN', 'ANSWERED'))
    or (old.canonical_status = 'WAITING_FOR_CITIZEN' and new.canonical_status = 'IN_PROGRESS')
    or (old.canonical_status = 'ANSWERED' and new.canonical_status = 'CLOSED')
    or (old.canonical_status = 'CLOSED' and new.canonical_status = 'IN_PROGRESS')
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE_TRANSITION';
  end if;
  return new;
end;
$$;

create or replace function private.touch_support_ticket()
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

create or replace function private.reject_support_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000', message = 'support history is append-only';
end;
$$;

drop trigger if exists support_tickets_transition on public.support_tickets;
create trigger support_tickets_transition
  before update on public.support_tickets
  for each row execute function private.validate_support_ticket_transition();
drop trigger if exists support_tickets_touch_updated_at on public.support_tickets;
create trigger support_tickets_touch_updated_at
  before update on public.support_tickets
  for each row execute function private.touch_support_ticket();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'support_ticket_messages', 'support_ticket_assignments',
    'support_ticket_status_logs', 'support_ticket_audit'
  ] loop
    execute format('drop trigger if exists %I_append_only on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_append_only before update or delete on public.%I for each row execute function private.reject_support_append_only()',
      table_name, table_name
    );
  end loop;
end;
$$;

-- Server-side event recording. The worker may add richer fields later, but the
-- database always retains the minimum status/audit/outbox lineage.
create or replace function private.record_support_ticket_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.support_ticket_status_logs (
    tenant_id, ticket_id, from_status, to_status, actor_type, reason, occurred_at
  ) values (
    new.tenant_id, new.id, null, new.canonical_status, 'SYSTEM', 'support handoff created', new.created_at
  );
  insert into public.support_ticket_audit (
    tenant_id, ticket_id, action, actor_type, before_version, after_version, reason, occurred_at
  ) values (
    new.tenant_id, new.id, 'SUPPORT_TICKET_CREATED', 'SYSTEM', 0, new.row_version, new.reason_code, new.created_at
  );
  insert into public.domain_outbox (
    tenant_id, event_type, event_version, aggregate_type, aggregate_id,
    idempotency_key, payload_json
  ) values (
    new.tenant_id, 'support.created', 1, 'SUPPORT_TICKET', new.id,
    'support.created:' || new.id::text,
    jsonb_build_object(
      'publicTicketId', new.public_ticket_id,
      'reasonCode', new.reason_code,
      'channel', new.channel,
      'recipientScope', 'CITIZEN_AND_SUPPORT_QUEUE'
    )
  ) on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$$;

create or replace function private.record_support_ticket_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.canonical_status <> old.canonical_status then
    insert into public.support_ticket_status_logs (
      tenant_id, ticket_id, from_status, to_status, actor_type, actor_account_id, reason, occurred_at
    ) values (
      new.tenant_id, new.id, old.canonical_status, new.canonical_status, 'SYSTEM', null,
      'support ticket status changed', new.updated_at
    );
    insert into public.support_ticket_audit (
      tenant_id, ticket_id, action, actor_type, before_version, after_version, reason, occurred_at
    ) values (
      new.tenant_id, new.id, 'SUPPORT_TICKET_STATUS_CHANGED', 'SYSTEM', old.row_version, new.row_version,
      new.canonical_status, new.updated_at
    );
  end if;
  if new.assigned_department_id is distinct from old.assigned_department_id
     and new.assigned_department_id is not null then
    insert into public.domain_outbox (
      tenant_id, event_type, event_version, aggregate_type, aggregate_id,
      idempotency_key, payload_json
    ) values (
      new.tenant_id, 'support.assigned', 1, 'SUPPORT_TICKET', new.id,
      'support.assigned:' || new.id::text || ':' || new.row_version::text,
      jsonb_build_object(
        'publicTicketId', new.public_ticket_id,
        'departmentId', new.assigned_department_id,
        'recipientScope', 'SUPPORT_STAFF'
      )
    ) on conflict (tenant_id, idempotency_key) where idempotency_key is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_record_created on public.support_tickets;
create trigger support_tickets_record_created
  after insert on public.support_tickets
  for each row execute function private.record_support_ticket_created();
drop trigger if exists support_tickets_record_update on public.support_tickets;
create trigger support_tickets_record_update
  after update on public.support_tickets
  for each row execute function private.record_support_ticket_update();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'support_tickets', 'support_ticket_messages', 'support_ticket_assignments',
    'support_ticket_status_logs', 'support_ticket_audit'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

drop policy if exists support_tickets_read_scoped on public.support_tickets;
create policy support_tickets_read_scoped on public.support_tickets
  for select to authenticated
  using (
    (select private.can_read_tenant(tenant_id))
    or (
      tenant_id = (select private.current_tenant_id())
      and citizen_identity_hash = (select private.current_citizen_identity_hash())
    )
  );

drop policy if exists support_ticket_messages_read_scoped on public.support_ticket_messages;
create policy support_ticket_messages_read_scoped on public.support_ticket_messages
  for select to authenticated
  using (
    (select private.can_read_tenant(tenant_id))
    or exists (
      select 1
      from public.support_tickets as ticket
      where ticket.tenant_id = support_ticket_messages.tenant_id
        and ticket.id = support_ticket_messages.ticket_id
        and ticket.citizen_identity_hash = (select private.current_citizen_identity_hash())
    )
  );

drop policy if exists support_ticket_assignments_read_scoped on public.support_ticket_assignments;
create policy support_ticket_assignments_read_scoped on public.support_ticket_assignments
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));

drop policy if exists support_ticket_status_logs_read_scoped on public.support_ticket_status_logs;
create policy support_ticket_status_logs_read_scoped on public.support_ticket_status_logs
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));

drop policy if exists support_ticket_audit_read_scoped on public.support_ticket_audit;
create policy support_ticket_audit_read_scoped on public.support_ticket_audit
  for select to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'audit.view.tenant')));

-- Browser clients can read only. Ticket creation, mutation and history writes
-- must go through the trusted server/RPC boundary with idempotency and audit.
revoke insert, update, delete, truncate on table
  public.support_tickets,
  public.support_ticket_messages,
  public.support_ticket_assignments,
  public.support_ticket_status_logs,
  public.support_ticket_audit
from authenticated;

grant select on table
  public.support_tickets,
  public.support_ticket_messages,
  public.support_ticket_assignments,
  public.support_ticket_status_logs,
  public.support_ticket_audit
to authenticated;

comment on table public.support_tickets is 'Tenant-scoped human handoff tickets; source trace and SLA are versioned snapshots; writes use trusted server boundary.';
comment on table public.support_ticket_messages is 'Append-only citizen/staff/system support messages; AI drafts are internal only.';
comment on table public.support_ticket_assignments is 'Append-only tenant-scoped ownership history for support tickets.';
comment on table public.support_ticket_status_logs is 'Append-only canonical support ticket state history.';
comment on table public.support_ticket_audit is 'Append-only support ticket audit lineage with before/after versions.';
