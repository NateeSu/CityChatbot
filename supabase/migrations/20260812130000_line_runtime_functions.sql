-- Least-privilege durable LINE webhook runtime boundary.
-- Requirements: RF-03, RF-05, RF-13, RF-15, RF-17

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'citychatbot_runtime') then
    create role citychatbot_runtime nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end;
$$;

create or replace function private.resolve_line_webhook(p_webhook_key_hash text)
returns table (
  tenant_id uuid,
  channel_record_id uuid,
  destination text,
  encrypted_channel_secret text,
  credential_key_version text,
  state text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select channel.tenant_id, channel.id, channel.destination,
         channel.encrypted_channel_secret, channel.credential_key_version, channel.state
  from public.line_channels as channel
  where channel.webhook_key_hash = p_webhook_key_hash
    and channel.state in ('ACTIVE', 'DEGRADED')
  limit 1;
$$;

create or replace function private.ingest_line_webhook(
  p_webhook_key_hash text,
  p_events jsonb,
  p_request_id uuid,
  p_correlation_id uuid,
  p_received_at timestamptz
)
returns table (accepted_event_ids text[], duplicate_event_ids text[])
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  channel_record public.line_channels%rowtype;
  event_record jsonb;
  inbox_id uuid;
  accepted_ids text[] := array[]::text[];
  duplicate_ids text[] := array[]::text[];
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) < 1 or jsonb_array_length(p_events) > 100 then
    raise exception using errcode = '22023', message = 'invalid LINE event batch';
  end if;
  select * into channel_record
  from public.line_channels
  where webhook_key_hash = p_webhook_key_hash and state = 'ACTIVE'
  for share;
  if not found then raise exception using errcode = '42501', message = 'LINE channel unavailable'; end if;

  for event_record in select value from jsonb_array_elements(p_events)
  loop
    insert into public.line_webhook_inbox (
      tenant_id, line_channel_record_id, webhook_event_id, event_type,
      event_timestamp, redelivery, supported, payload_ciphertext,
      payload_key_version, payload_sha256, status, received_at
    ) values (
      channel_record.tenant_id, channel_record.id, event_record->>'webhookEventId',
      event_record->>'eventType', (event_record->>'timestamp')::timestamptz,
      coalesce((event_record->>'redelivery')::boolean, false),
      coalesce((event_record->>'supported')::boolean, false),
      event_record->>'payloadCiphertext', event_record->>'payloadKeyVersion',
      event_record->>'payloadSha256', 'QUEUED', p_received_at
    )
    on conflict (tenant_id, line_channel_record_id, webhook_event_id) do nothing
    returning id into inbox_id;

    if inbox_id is null then
      duplicate_ids := array_append(duplicate_ids, event_record->>'webhookEventId');
    else
      accepted_ids := array_append(accepted_ids, event_record->>'webhookEventId');
      insert into public.jobs (tenant_id, job_type, dedupe_key, payload_json)
      values (
        channel_record.tenant_id, 'line.webhook.process',
        format('%s:%s', channel_record.id, event_record->>'webhookEventId'),
        jsonb_build_object('inboxId', inbox_id, 'channelRecordId', channel_record.id,
          'requestId', p_request_id, 'correlationId', p_correlation_id)
      ) on conflict (tenant_id, job_type, dedupe_key) do nothing;
    end if;
    inbox_id := null;
  end loop;
  return query select accepted_ids, duplicate_ids;
end;
$$;

revoke all on function private.resolve_line_webhook(text) from public, anon, authenticated;
revoke all on function private.ingest_line_webhook(text, jsonb, uuid, uuid, timestamptz) from public, anon, authenticated;
grant usage on schema private to citychatbot_runtime;
grant execute on function private.resolve_line_webhook(text) to citychatbot_runtime;
grant execute on function private.ingest_line_webhook(text, jsonb, uuid, uuid, timestamptz) to citychatbot_runtime;
revoke all on all tables in schema public from citychatbot_runtime;

-- The production login is intentionally created/rotated outside source control.
-- Grant it only these functions when the role exists; never grant table access.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'citychatbot_app') then
    grant usage on schema private to citychatbot_app;
    grant execute on function private.resolve_line_webhook(text) to citychatbot_app;
    grant execute on function private.ingest_line_webhook(text, jsonb, uuid, uuid, timestamptz) to citychatbot_app;
    revoke all on all tables in schema public from citychatbot_app;
  end if;
end;
$$;

comment on function private.resolve_line_webhook(text) is 'Server-only exact hash lookup; does not accept or reveal a client tenant.';
comment on function private.ingest_line_webhook(text, jsonb, uuid, uuid, timestamptz) is 'Server-only transactional inbox and job insertion after application signature verification.';
