-- Durable LINE/LIFF integration schema
-- Requirements: RF-03, RF-04, RF-05, RF-06, RF-13, RF-15, RF-16, RF-17
-- Provider credentials remain encrypted by the trusted server boundary. Browser
-- roles can read only non-secret configuration metadata for their tenant.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.line_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  line_channel_id text not null,
  destination text not null,
  state text not null default 'DRAFT',
  encrypted_channel_secret text not null,
  encrypted_access_token text not null,
  credential_key_version text not null,
  credential_version integer not null default 1,
  webhook_key_hash text not null,
  health text not null default 'UNKNOWN',
  quota_snapshot_json jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint line_channels_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint line_channels_tenant_id_uq unique (tenant_id, id),
  constraint line_channels_provider_uq unique (line_channel_id),
  constraint line_channels_destination_uq unique (destination),
  constraint line_channels_webhook_key_uq unique (webhook_key_hash),
  constraint line_channels_identifier_ck check (line_channel_id ~ '^[0-9]{6,32}$' and destination ~ '^U[0-9a-fA-F]{8,64}$'),
  constraint line_channels_state_ck check (state in ('DRAFT', 'VALIDATING', 'ACTIVE', 'DEGRADED', 'DISABLED')),
  constraint line_channels_secret_ck check (length(encrypted_channel_secret) between 32 and 16384 and length(encrypted_access_token) between 32 and 16384),
  constraint line_channels_key_ck check (length(btrim(credential_key_version)) between 1 and 128 and credential_version > 0),
  constraint line_channels_webhook_hash_ck check (webhook_key_hash ~ '^[a-f0-9]{64}$'),
  constraint line_channels_health_ck check (health in ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'FAILED')),
  constraint line_channels_quota_ck check (jsonb_typeof(quota_snapshot_json) = 'object'),
  constraint line_channels_row_version_ck check (row_version > 0)
);

create table if not exists public.liff_apps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  line_channel_record_id uuid not null,
  liff_app_id text not null,
  channel_id text not null,
  callback_url text not null,
  allowed_return_urls jsonb not null default '[]'::jsonb,
  required_consent_version text,
  session_ttl_seconds integer not null default 300,
  enabled boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint liff_apps_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint liff_apps_channel_fk foreign key (tenant_id, line_channel_record_id) references public.line_channels (tenant_id, id) on delete restrict,
  constraint liff_apps_tenant_id_uq unique (tenant_id, id),
  constraint liff_apps_provider_uq unique (liff_app_id),
  constraint liff_apps_identifier_ck check (liff_app_id ~ '^[0-9]{6,32}-[A-Za-z0-9]{4,64}$' and channel_id ~ '^[0-9]{6,32}$'),
  constraint liff_apps_callback_ck check (callback_url ~ '^https://'),
  constraint liff_apps_returns_ck check (jsonb_typeof(allowed_return_urls) = 'array' and jsonb_array_length(allowed_return_urls) between 1 and 20),
  constraint liff_apps_consent_ck check (required_consent_version is null or length(btrim(required_consent_version)) between 1 and 128),
  constraint liff_apps_ttl_ck check (session_ttl_seconds between 60 and 900),
  constraint liff_apps_row_version_ck check (row_version > 0)
);

create table if not exists public.line_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  line_channel_record_id uuid not null,
  line_user_id text not null,
  status text not null default 'ACTIVE',
  first_verified_at timestamptz not null,
  last_verified_at timestamptz not null,
  blocked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint line_users_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint line_users_channel_fk foreign key (tenant_id, line_channel_record_id) references public.line_channels (tenant_id, id) on delete restrict,
  constraint line_users_tenant_id_uq unique (tenant_id, id),
  constraint line_users_identity_uq unique (tenant_id, line_channel_record_id, line_user_id),
  constraint line_users_identifier_ck check (line_user_id ~ '^U[0-9a-fA-F]{8,64}$'),
  constraint line_users_status_ck check (status in ('ACTIVE', 'BLOCKED', 'UNFOLLOWED', 'DELETED')),
  constraint line_users_verified_ck check (last_verified_at >= first_verified_at),
  constraint line_users_blocked_ck check (blocked_at is null or status in ('BLOCKED', 'UNFOLLOWED')),
  constraint line_users_row_version_ck check (row_version > 0)
);

create table if not exists public.line_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  line_channel_record_id uuid not null,
  webhook_event_id text not null,
  event_type text not null,
  event_timestamp timestamptz not null,
  redelivery boolean not null default false,
  supported boolean not null default true,
  payload_ciphertext text not null,
  payload_key_version text not null,
  payload_sha256 text not null,
  status text not null default 'RECEIVED',
  received_at timestamptz not null default statement_timestamp(),
  processed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint line_webhook_inbox_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint line_webhook_inbox_channel_fk foreign key (tenant_id, line_channel_record_id) references public.line_channels (tenant_id, id) on delete restrict,
  constraint line_webhook_inbox_tenant_id_uq unique (tenant_id, id),
  constraint line_webhook_inbox_event_uq unique (tenant_id, line_channel_record_id, webhook_event_id),
  constraint line_webhook_inbox_event_id_ck check (length(btrim(webhook_event_id)) between 1 and 128),
  constraint line_webhook_inbox_type_ck check (length(btrim(event_type)) between 1 and 64),
  constraint line_webhook_inbox_payload_ck check (length(payload_ciphertext) between 32 and 2000000 and length(btrim(payload_key_version)) between 1 and 128 and payload_sha256 ~ '^[a-f0-9]{64}$'),
  constraint line_webhook_inbox_status_ck check (status in ('RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DLQ', 'IGNORED')),
  constraint line_webhook_inbox_processed_ck check (processed_at is null or status in ('PROCESSED', 'FAILED', 'DLQ', 'IGNORED')),
  constraint line_webhook_inbox_row_version_ck check (row_version > 0)
);

create table if not exists public.line_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  line_channel_record_id uuid not null,
  line_user_id uuid,
  source_webhook_event_id uuid,
  direction text not null,
  route text,
  message_type text not null,
  recipient_hash text,
  content_ciphertext text,
  content_key_version text,
  content_sha256 text,
  template_key text,
  template_version integer,
  idempotency_key text not null,
  correlation_id uuid not null,
  status text not null default 'QUEUED',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default statement_timestamp(),
  provider_status integer,
  provider_message_id text,
  error_code text,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint line_messages_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint line_messages_channel_fk foreign key (tenant_id, line_channel_record_id) references public.line_channels (tenant_id, id) on delete restrict,
  constraint line_messages_user_fk foreign key (tenant_id, line_user_id) references public.line_users (tenant_id, id) on delete restrict,
  constraint line_messages_event_fk foreign key (tenant_id, source_webhook_event_id) references public.line_webhook_inbox (tenant_id, id) on delete restrict,
  constraint line_messages_tenant_id_uq unique (tenant_id, id),
  constraint line_messages_idempotency_uq unique (tenant_id, idempotency_key),
  constraint line_messages_direction_ck check (direction in ('INBOUND', 'OUTBOUND')),
  constraint line_messages_route_ck check (route is null or route in ('REPLY', 'PUSH')),
  constraint line_messages_type_ck check (message_type in ('TEXT', 'IMAGE', 'LOCATION', 'POSTBACK', 'FOLLOW', 'UNFOLLOW', 'UNSUPPORTED')),
  constraint line_messages_recipient_ck check (recipient_hash is null or length(recipient_hash) between 16 and 128),
  constraint line_messages_content_ck check ((content_ciphertext is null and content_key_version is null and content_sha256 is null) or (length(content_ciphertext) between 32 and 2000000 and length(btrim(content_key_version)) between 1 and 128 and content_sha256 ~ '^[a-f0-9]{64}$')),
  constraint line_messages_template_ck check ((template_key is null and template_version is null) or (template_key ~ '^[a-z][a-z0-9_.-]{1,127}$' and template_version > 0)),
  constraint line_messages_status_ck check (status in ('RECEIVED', 'QUEUED', 'SENDING', 'API_ACCEPTED', 'RETRY_WAIT', 'PROCESSED', 'FAILED', 'DLQ', 'IGNORED')),
  constraint line_messages_attempt_ck check (attempt_count >= 0 and max_attempts between 1 and 100 and attempt_count <= max_attempts),
  constraint line_messages_provider_ck check (provider_status is null or provider_status between 100 and 599),
  constraint line_messages_accepted_ck check (accepted_at is null or status in ('API_ACCEPTED', 'PROCESSED')),
  constraint line_messages_row_version_ck check (row_version > 0)
);

create table if not exists public.consent_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  line_user_id uuid not null,
  liff_app_record_id uuid not null,
  notice_version text not null,
  channel text not null default 'LIFF',
  accepted boolean not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint consent_events_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint consent_events_user_fk foreign key (tenant_id, line_user_id) references public.line_users (tenant_id, id) on delete restrict,
  constraint consent_events_liff_fk foreign key (tenant_id, liff_app_record_id) references public.liff_apps (tenant_id, id) on delete restrict,
  constraint consent_events_tenant_id_uq unique (tenant_id, id),
  constraint consent_events_version_ck check (length(btrim(notice_version)) between 1 and 128),
  constraint consent_events_channel_ck check (channel = 'LIFF'),
  constraint consent_events_row_version_ck check (row_version > 0)
);

create index if not exists line_channels_tenant_state_idx on public.line_channels (tenant_id, state, updated_at desc);
create index if not exists liff_apps_tenant_enabled_idx on public.liff_apps (tenant_id, enabled, liff_app_id);
create index if not exists line_users_identity_idx on public.line_users (tenant_id, line_user_id, status);
create index if not exists line_webhook_inbox_claim_idx on public.line_webhook_inbox (tenant_id, status, received_at, id);
create index if not exists line_messages_claim_idx on public.line_messages (tenant_id, status, next_attempt_at, id);
create index if not exists line_messages_user_idx on public.line_messages (tenant_id, line_user_id, created_at desc, id);
create index if not exists consent_events_user_idx on public.consent_events (tenant_id, line_user_id, occurred_at desc, id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'line_channels', 'liff_apps', 'line_users', 'line_webhook_inbox', 'line_messages', 'consent_events'
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

drop policy if exists line_channels_read_manage on public.line_channels;
create policy line_channels_read_manage on public.line_channels
  for select to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

drop policy if exists liff_apps_read_current on public.liff_apps;
create policy liff_apps_read_current on public.liff_apps
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));

drop policy if exists line_users_read_support on public.line_users;
create policy line_users_read_support on public.line_users
  for select to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'support.access.tenant')));

drop policy if exists line_webhook_inbox_read_ops on public.line_webhook_inbox;
create policy line_webhook_inbox_read_ops on public.line_webhook_inbox
  for select to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'job.manage.tenant')));

drop policy if exists line_messages_read_support on public.line_messages;
create policy line_messages_read_support on public.line_messages
  for select to authenticated
  using (
    (select private.has_tenant_permission(tenant_id, 'support.access.tenant'))
    or (select private.has_tenant_permission(tenant_id, 'job.manage.tenant'))
  );

drop policy if exists consent_events_read_support on public.consent_events;
create policy consent_events_read_support on public.consent_events
  for select to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'support.access.tenant')));

grant select on table public.line_channels, public.liff_apps, public.line_users,
  public.line_webhook_inbox, public.line_messages, public.consent_events to authenticated;
revoke insert, update, delete, truncate on table public.line_channels, public.liff_apps,
  public.line_users, public.line_webhook_inbox, public.line_messages, public.consent_events from anon, authenticated;
revoke all on table public.line_channels, public.liff_apps, public.line_users,
  public.line_webhook_inbox, public.line_messages, public.consent_events from anon;

comment on table public.line_channels is 'Tenant-scoped LINE channel metadata; provider credentials and webhook keys are encrypted/hashed and server-only.';
comment on table public.line_webhook_inbox is 'Durable idempotent LINE ingress; raw payload is encrypted and never exposed to browser roles.';
comment on table public.line_messages is 'Durable inbound/outbound LINE delivery ledger; API_ACCEPTED is not equivalent to delivered/read.';
comment on table public.consent_events is 'Append-only LIFF consent decisions linked to the verified tenant-scoped LINE user.';
