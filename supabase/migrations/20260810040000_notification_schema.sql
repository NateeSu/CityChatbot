-- CityChatbot versioned notification templates and delivery records
-- Requirements: RF-03, RF-04, RF-05, RF-06, RF-15, RF-16
-- Depends on the core, RLS, complaint and SLA migrations.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.notification_template_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_key text not null,
  version integer not null,
  channel text not null default 'LINE',
  locale text not null default 'th-TH',
  state text not null default 'DRAFT',
  body_text text not null,
  variables jsonb not null default '[]'::jsonb,
  theme_version integer not null default 1,
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint notification_templates_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint notification_templates_tenant_id_uq unique (tenant_id, id),
  constraint notification_templates_version_uq unique (tenant_id, template_key, version),
  constraint notification_templates_key_ck check (template_key ~ '^[a-z][a-z0-9_.-]{1,127}$'),
  constraint notification_templates_version_ck check (version > 0),
  constraint notification_templates_channel_ck check (channel in ('LINE')),
  constraint notification_templates_locale_ck check (locale in ('th-TH', 'en-US')),
  constraint notification_templates_state_ck check (state in ('DRAFT', 'ACTIVE', 'RETIRED')),
  constraint notification_templates_body_ck check (length(btrim(body_text)) between 1 and 5000),
  constraint notification_templates_variables_ck check (jsonb_typeof(variables) = 'array'),
  constraint notification_templates_theme_ck check (theme_version > 0),
  constraint notification_templates_window_ck check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint notification_templates_row_version_ck check (row_version > 0)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  outbox_id uuid,
  event_type text not null,
  aggregate_id uuid not null,
  channel text not null default 'LINE',
  recipient_scope text not null default 'CITIZEN',
  recipient_hash text not null,
  template_key text not null,
  template_version integer not null,
  locale text not null,
  theme_version integer not null,
  idempotency_key text not null,
  status text not null default 'QUEUED',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default statement_timestamp(),
  provider_status integer,
  provider_message_id text,
  last_error_code text,
  last_error_detail_redacted text,
  accepted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint notification_deliveries_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint notification_deliveries_outbox_fk foreign key (tenant_id, outbox_id)
    references public.domain_outbox (tenant_id, id) on delete restrict,
  constraint notification_deliveries_template_fk foreign key (tenant_id, template_key, template_version)
    references public.notification_template_versions (tenant_id, template_key, version) on delete restrict,
  constraint notification_deliveries_tenant_id_uq unique (tenant_id, id),
  constraint notification_deliveries_idempotency_uq unique (tenant_id, idempotency_key),
  constraint notification_deliveries_event_ck check (event_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  constraint notification_deliveries_channel_ck check (channel in ('LINE')),
  constraint notification_deliveries_scope_ck check (recipient_scope in ('CITIZEN', 'STAFF')),
  constraint notification_deliveries_hash_ck check (length(btrim(recipient_hash)) between 16 and 128),
  constraint notification_deliveries_template_version_ck check (template_version > 0),
  constraint notification_deliveries_locale_ck check (locale in ('th-TH', 'en-US')),
  constraint notification_deliveries_theme_ck check (theme_version > 0),
  constraint notification_deliveries_status_ck check (status in ('QUEUED', 'SENDING', 'API_ACCEPTED', 'RETRY_WAIT', 'FAILED', 'DLQ', 'SKIPPED')),
  constraint notification_deliveries_attempts_ck check (attempt_count >= 0 and attempt_count <= max_attempts),
  constraint notification_deliveries_max_attempts_ck check (max_attempts between 1 and 100),
  constraint notification_deliveries_provider_status_ck check (provider_status is null or provider_status between 100 and 599),
  constraint notification_deliveries_error_ck check (last_error_detail_redacted is null or length(btrim(last_error_detail_redacted)) between 1 and 2000),
  constraint notification_deliveries_accepted_ck check (accepted_at is null or status = 'API_ACCEPTED'),
  constraint notification_deliveries_row_version_ck check (row_version > 0)
);

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

create index if not exists notification_deliveries_claim_idx
  on public.notification_deliveries (tenant_id, status, next_attempt_at, id);
create index if not exists notification_deliveries_event_idx
  on public.notification_deliveries (tenant_id, event_type, aggregate_id, created_at desc, id);
create index if not exists staff_notifications_inbox_idx
  on public.staff_notifications (tenant_id, membership_id, read_at, created_at desc, id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'notification_template_versions', 'notification_deliveries', 'staff_notifications'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function private.touch_mutable_row()',
      table_name, table_name
    );
  end loop;
end;
$$;

drop policy if exists notification_templates_read_scoped on public.notification_template_versions;
create policy notification_templates_read_scoped on public.notification_template_versions
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));
drop policy if exists notification_templates_insert_manage on public.notification_template_versions;
create policy notification_templates_insert_manage on public.notification_template_versions
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
drop policy if exists notification_templates_update_manage on public.notification_template_versions;
create policy notification_templates_update_manage on public.notification_template_versions
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

drop policy if exists notification_deliveries_read_scoped on public.notification_deliveries;
create policy notification_deliveries_read_scoped on public.notification_deliveries
  for select to authenticated
  using (
    (select private.has_tenant_permission(tenant_id, 'job.manage.tenant'))
    or (select private.can_mutate_complaint(tenant_id))
  );

drop policy if exists staff_notifications_read_self on public.staff_notifications;
create policy staff_notifications_read_self on public.staff_notifications
  for select to authenticated
  using (
    exists (
      select 1 from public.tenant_memberships as membership
      where membership.tenant_id = staff_notifications.tenant_id
        and membership.id = staff_notifications.membership_id
        and membership.account_id = private.current_account_id()
        and membership.status = 'ACTIVE'
    )
    or (select private.has_tenant_permission(tenant_id, 'staff.manage.tenant'))
  );
drop policy if exists staff_notifications_update_self on public.staff_notifications;
create policy staff_notifications_update_self on public.staff_notifications
  for update to authenticated
  using (
    exists (
      select 1 from public.tenant_memberships as membership
      where membership.tenant_id = staff_notifications.tenant_id
        and membership.id = staff_notifications.membership_id
        and membership.account_id = private.current_account_id()
        and membership.status = 'ACTIVE'
    )
    or (select private.has_tenant_permission(tenant_id, 'staff.manage.tenant'))
  )
  with check (
    exists (
      select 1 from public.tenant_memberships as membership
      where membership.tenant_id = staff_notifications.tenant_id
        and membership.id = staff_notifications.membership_id
        and membership.account_id = private.current_account_id()
        and membership.status = 'ACTIVE'
    )
    or (select private.has_tenant_permission(tenant_id, 'staff.manage.tenant'))
  );

grant select on table
  public.notification_template_versions,
  public.notification_deliveries,
  public.staff_notifications
to authenticated;
grant insert, update on table public.notification_template_versions to authenticated;
grant update on table public.staff_notifications to authenticated;
revoke insert, update, delete, truncate on table public.notification_deliveries from authenticated;
revoke insert, delete, truncate on table public.staff_notifications from authenticated;

comment on table public.notification_template_versions is 'Versioned, allowlisted notification templates; unknown variables are blocked before activation.';
comment on table public.notification_deliveries is 'Redacted delivery state; recipient identity/content are not exposed and provider failures retain retry/DLQ state.';
comment on table public.staff_notifications is 'Tenant-scoped staff inbox; read mutation is limited to the owning membership or staff manager.';
