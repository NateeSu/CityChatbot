-- Fix PL/pgSQL output-column ambiguity in the production LINE worker claimers.
-- Keep all tenant and row references explicitly qualified so the worker cannot
-- fail before claiming a durable inbox or delivery job.

create or replace function private.claim_line_webhook_job(
  p_worker_id text,
  p_now timestamptz,
  p_lease_seconds integer default 30
)
returns table (
  job_id uuid,
  inbox_id uuid,
  tenant_id uuid,
  channel_record_id uuid,
  destination text,
  event_timestamp timestamptz,
  webhook_event_id text,
  event_type text,
  redelivery boolean,
  payload_ciphertext text,
  payload_key_version text,
  payload_sha256 text,
  request_id uuid,
  correlation_id uuid,
  attempt_count integer,
  max_attempts integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  selected_job public.jobs%rowtype;
  selected_inbox public.line_webhook_inbox%rowtype;
  lease_until timestamptz;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) = 0 or length(p_worker_id) > 128
     or p_worker_id ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid LINE chat worker id';
  end if;
  if p_lease_seconds < 5 or p_lease_seconds > 300 then
    raise exception using errcode = '22023', message = 'invalid LINE chat lease';
  end if;
  lease_until := p_now + make_interval(secs => p_lease_seconds);

  select j.* into selected_job
    from public.jobs as j
    join public.line_webhook_inbox as inbox
      on inbox.tenant_id = j.tenant_id
     and inbox.id = (j.payload_json->>'inboxId')::uuid
    join public.line_channels as channel
      on channel.tenant_id = inbox.tenant_id
     and channel.id = inbox.line_channel_record_id
     and channel.state in ('ACTIVE', 'DEGRADED')
    join public.tenants as tenant
      on tenant.id = j.tenant_id
     and tenant.status = 'ACTIVE'
    join public.tenant_settings as settings
      on settings.tenant_id = j.tenant_id
     and settings.ai_chat_enabled = true
   where j.job_type = 'line.webhook.process'
     and j.attempt_count < j.max_attempts
     and (
       (j.status in ('QUEUED', 'RETRY_WAIT') and j.next_attempt_at <= p_now)
       or (j.status = 'RUNNING' and j.lease_expires_at < p_now)
     )
     and inbox.status in ('QUEUED', 'FAILED', 'PROCESSING')
     and (inbox.status <> 'PROCESSING' or inbox.lease_expires_at < p_now or j.status = 'RUNNING')
   order by j.priority desc, j.next_attempt_at, j.created_at, j.id
   for update of j, inbox skip locked
   limit 1;
  if not found then return; end if;

  select * into selected_inbox
    from public.line_webhook_inbox as inbox
   where inbox.tenant_id = selected_job.tenant_id
     and inbox.id = (selected_job.payload_json->>'inboxId')::uuid
   for update;

  update public.jobs as job
     set status = 'RUNNING', attempt_count = job.attempt_count + 1,
         lease_owner = p_worker_id, lease_expires_at = lease_until,
         heartbeat_at = p_now, started_at = coalesce(job.started_at, p_now),
         updated_at = p_now, row_version = job.row_version + 1
   where job.tenant_id = selected_job.tenant_id and job.id = selected_job.id;

  update public.line_webhook_inbox as inbox
     set status = 'PROCESSING', attempt_count = inbox.attempt_count + 1,
         lease_owner = p_worker_id, lease_expires_at = lease_until,
         request_id = coalesce(inbox.request_id, (selected_job.payload_json->>'requestId')::uuid),
         correlation_id = coalesce(inbox.correlation_id, (selected_job.payload_json->>'correlationId')::uuid),
         updated_at = p_now, row_version = inbox.row_version + 1
   where inbox.tenant_id = selected_inbox.tenant_id and inbox.id = selected_inbox.id;

  return query
    select selected_job.id, selected_inbox.id, selected_inbox.tenant_id,
      selected_inbox.line_channel_record_id,
      (select channel.destination from public.line_channels as channel where channel.tenant_id = selected_inbox.tenant_id and channel.id = selected_inbox.line_channel_record_id),
      selected_inbox.event_timestamp,
      selected_inbox.webhook_event_id,
      selected_inbox.event_type, selected_inbox.redelivery,
      selected_inbox.payload_ciphertext, selected_inbox.payload_key_version,
      selected_inbox.payload_sha256,
      coalesce(selected_inbox.request_id, (selected_job.payload_json->>'requestId')::uuid),
      coalesce(selected_inbox.correlation_id, (selected_job.payload_json->>'correlationId')::uuid),
      selected_inbox.attempt_count + 1, selected_inbox.max_attempts, lease_until;
end;
$function$;

create or replace function private.claim_line_message_job(
  p_worker_id text,
  p_now timestamptz,
  p_lease_seconds integer default 30
)
returns table (
  job_id uuid,
  delivery_id uuid,
  tenant_id uuid,
  channel_record_id uuid,
  route text,
  recipient_id text,
  reply_token_ciphertext text,
  reply_token_key_version text,
  content_ciphertext text,
  content_key_version text,
  idempotency_key text,
  correlation_id uuid,
  encrypted_access_token text,
  credential_key_version text,
  attempt_count integer,
  max_attempts integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  selected_job public.jobs%rowtype;
  selected_message public.line_messages%rowtype;
  selected_channel public.line_channels%rowtype;
  selected_user public.line_users%rowtype;
  lease_until timestamptz;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) = 0 or length(p_worker_id) > 128
     or p_worker_id ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid LINE delivery worker id';
  end if;
  if p_lease_seconds < 5 or p_lease_seconds > 300 then raise exception using errcode = '22023', message = 'invalid LINE delivery lease'; end if;
  lease_until := p_now + make_interval(secs => p_lease_seconds);
  select j.* into selected_job
    from public.jobs as j
    join public.line_messages as line_message on line_message.tenant_id = j.tenant_id and line_message.id = (j.payload_json->>'deliveryId')::uuid
   where j.job_type = 'line.message.delivery' and j.attempt_count < j.max_attempts
     and ((j.status in ('QUEUED', 'RETRY_WAIT') and j.next_attempt_at <= p_now) or (j.status = 'RUNNING' and j.lease_expires_at < p_now))
     and line_message.status in ('QUEUED', 'RETRY_WAIT', 'SENDING')
   order by j.priority desc, j.next_attempt_at, j.created_at, j.id
   for update of j, line_message skip locked limit 1;
  if not found then return; end if;
  select * into selected_message from public.line_messages as line_message where line_message.tenant_id = selected_job.tenant_id and line_message.id = (selected_job.payload_json->>'deliveryId')::uuid for update;
  select * into selected_channel from public.line_channels as channel where channel.tenant_id = selected_message.tenant_id and channel.id = selected_message.line_channel_record_id and channel.state in ('ACTIVE', 'DEGRADED');
  if not found then return; end if;
  if selected_message.route is null or lower(selected_message.route) not in ('reply', 'push') then return; end if;
  select * into selected_user from public.line_users as line_user where line_user.tenant_id = selected_message.tenant_id and line_user.id = selected_message.line_user_id and line_user.status = 'ACTIVE';
  if not found then return; end if;
  update public.jobs as job set status = 'RUNNING', attempt_count = job.attempt_count + 1, lease_owner = p_worker_id, lease_expires_at = lease_until, heartbeat_at = p_now, started_at = coalesce(job.started_at, p_now), updated_at = p_now, row_version = job.row_version + 1 where job.id = selected_job.id;
  update public.line_messages as line_message set status = 'SENDING', attempt_count = line_message.attempt_count + 1, updated_at = p_now, row_version = line_message.row_version + 1 where line_message.id = selected_message.id;
  return query select selected_job.id, selected_message.id, selected_message.tenant_id, selected_message.line_channel_record_id,
    lower(selected_message.route), selected_user.line_user_id, selected_message.reply_token_ciphertext, selected_message.reply_token_key_version,
    selected_message.content_ciphertext, selected_message.content_key_version, selected_message.idempotency_key, selected_message.correlation_id,
    selected_channel.encrypted_access_token, selected_channel.credential_key_version, selected_message.attempt_count + 1, selected_message.max_attempts, lease_until;
end;
$function$;
