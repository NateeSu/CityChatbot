-- Durable LINE chat consumer/provider runtime boundary.
-- Requirements: RF-05, RF-07, RF-08, RF-09, RF-13, RF-15, RF-16, RF-17
-- Only the private security-definer functions below may mutate or claim the
-- durable LINE/chat records. Browser roles never receive table access.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

alter table public.line_webhook_inbox
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_attempt_at timestamptz not null default statement_timestamp(),
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists error_code text,
  add column if not exists error_detail_redacted text,
  add column if not exists request_id uuid,
  add column if not exists correlation_id uuid;

alter table public.line_messages
  add column if not exists reply_token_ciphertext text,
  add column if not exists reply_token_key_version text,
  add column if not exists reply_token_sha256 text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.line_webhook_inbox'::regclass and conname = 'line_webhook_inbox_attempt_ck') then
    alter table public.line_webhook_inbox add constraint line_webhook_inbox_attempt_ck check (attempt_count >= 0 and max_attempts between 1 and 100 and attempt_count <= max_attempts);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.line_webhook_inbox'::regclass and conname = 'line_webhook_inbox_lease_ck') then
    alter table public.line_webhook_inbox add constraint line_webhook_inbox_lease_ck check (lease_expires_at is null or lease_owner is not null);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.line_webhook_inbox'::regclass and conname = 'line_webhook_inbox_error_ck') then
    alter table public.line_webhook_inbox add constraint line_webhook_inbox_error_ck check (error_detail_redacted is null or length(error_detail_redacted) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.line_messages'::regclass and conname = 'line_messages_reply_token_ck') then
    alter table public.line_messages add constraint line_messages_reply_token_ck check (
      (reply_token_ciphertext is null and reply_token_key_version is null and reply_token_sha256 is null)
      or (length(reply_token_ciphertext) between 32 and 2000000 and length(btrim(reply_token_key_version)) between 1 and 128 and reply_token_sha256 ~ '^[a-f0-9]{64}$')
    );
  end if;
end;
$$;

create index if not exists line_webhook_inbox_runtime_claim_idx
  on public.line_webhook_inbox (status, next_attempt_at, received_at, id);
create index if not exists line_messages_runtime_claim_idx
  on public.line_messages (status, next_attempt_at, created_at, id);

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
as $$
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
    from public.line_webhook_inbox
   where tenant_id = selected_job.tenant_id
     and id = (selected_job.payload_json->>'inboxId')::uuid
   for update;

  update public.jobs
     set status = 'RUNNING', attempt_count = attempt_count + 1,
         lease_owner = p_worker_id, lease_expires_at = lease_until,
         heartbeat_at = p_now, started_at = coalesce(started_at, p_now),
         updated_at = p_now, row_version = row_version + 1
   where tenant_id = selected_job.tenant_id and id = selected_job.id;

  update public.line_webhook_inbox
     set status = 'PROCESSING', attempt_count = attempt_count + 1,
         lease_owner = p_worker_id, lease_expires_at = lease_until,
         request_id = coalesce(request_id, (selected_job.payload_json->>'requestId')::uuid),
         correlation_id = coalesce(correlation_id, (selected_job.payload_json->>'correlationId')::uuid),
         updated_at = p_now, row_version = row_version + 1
   where tenant_id = selected_inbox.tenant_id and id = selected_inbox.id;

  return query
    select selected_job.id, selected_inbox.id, selected_inbox.tenant_id,
      selected_inbox.line_channel_record_id,
      (select destination from public.line_channels where tenant_id = selected_inbox.tenant_id and id = selected_inbox.line_channel_record_id),
      selected_inbox.event_timestamp,
      selected_inbox.webhook_event_id,
      selected_inbox.event_type, selected_inbox.redelivery,
      selected_inbox.payload_ciphertext, selected_inbox.payload_key_version,
      selected_inbox.payload_sha256,
      coalesce(selected_inbox.request_id, (selected_job.payload_json->>'requestId')::uuid),
      coalesce(selected_inbox.correlation_id, (selected_job.payload_json->>'correlationId')::uuid),
      selected_inbox.attempt_count + 1, selected_inbox.max_attempts, lease_until;
end;
$$;

create or replace function private.enqueue_line_chat_response(
  p_job_id uuid,
  p_inbox_id uuid,
  p_worker_id text,
  p_tenant_id uuid,
  p_channel_record_id uuid,
  p_line_user_id text,
  p_recipient_hash text,
  p_route text,
  p_reply_token_ciphertext text,
  p_reply_token_key_version text,
  p_reply_token_sha256 text,
  p_content_ciphertext text,
  p_content_key_version text,
  p_content_sha256 text,
  p_correlation_id uuid,
  p_idempotency_key text
)
returns table (delivery_id uuid, delivery_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_job public.jobs%rowtype;
  target_inbox public.line_webhook_inbox%rowtype;
  target_user public.line_users%rowtype;
  target_message_id uuid;
  inserted_message boolean := false;
begin
  select * into target_job from public.jobs where tenant_id = p_tenant_id and id = p_job_id for update;
  if not found or target_job.job_type <> 'line.webhook.process' or target_job.status <> 'RUNNING' or target_job.lease_owner <> p_worker_id or target_job.lease_expires_at < statement_timestamp() then
    raise exception using errcode = '55000', message = 'LINE webhook job lease is invalid';
  end if;
  select * into target_inbox from public.line_webhook_inbox where tenant_id = p_tenant_id and id = p_inbox_id for update;
  if not found or target_inbox.line_channel_record_id <> p_channel_record_id or target_inbox.status <> 'PROCESSING' then
    raise exception using errcode = '55000', message = 'LINE inbox lease is invalid';
  end if;
  if p_line_user_id is null or p_line_user_id !~ '^U[0-9a-fA-F]{8,64}$' then
    raise exception using errcode = '22023', message = 'LINE user identity is invalid';
  end if;
  if p_route not in ('REPLY', 'PUSH') then
    raise exception using errcode = '22023', message = 'LINE delivery route is invalid';
  end if;
  if p_route = 'REPLY' and p_reply_token_ciphertext is null then
    raise exception using errcode = '22023', message = 'reply delivery requires an encrypted reply token';
  end if;
  if p_recipient_hash is null or length(p_recipient_hash) < 16 or length(p_recipient_hash) > 128 then
    raise exception using errcode = '22023', message = 'LINE recipient hash is invalid';
  end if;
  if p_content_ciphertext is null or p_content_key_version is null or p_content_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'LINE response content envelope is invalid';
  end if;
  if p_route = 'REPLY' and (p_reply_token_key_version is null or p_reply_token_sha256 !~ '^[a-f0-9]{64}$') then
    raise exception using errcode = '22023', message = 'LINE reply token envelope is invalid';
  end if;

  insert into public.line_users (
    tenant_id, line_channel_record_id, line_user_id, status,
    first_verified_at, last_verified_at
  ) values (
    p_tenant_id, p_channel_record_id, p_line_user_id, 'ACTIVE',
    statement_timestamp(), statement_timestamp()
  ) on conflict (tenant_id, line_channel_record_id, line_user_id)
    do update set status = 'ACTIVE', last_verified_at = statement_timestamp(), updated_at = statement_timestamp(), row_version = public.line_users.row_version + 1
    returning * into target_user;

  insert into public.line_messages (
    tenant_id, line_channel_record_id, line_user_id, source_webhook_event_id,
    direction, route, message_type, recipient_hash,
    reply_token_ciphertext, reply_token_key_version, reply_token_sha256,
    content_ciphertext, content_key_version, content_sha256,
    idempotency_key, correlation_id, status, next_attempt_at
  ) values (
    p_tenant_id, p_channel_record_id, target_user.id, p_inbox_id,
    'OUTBOUND', p_route, 'TEXT', p_recipient_hash,
    p_reply_token_ciphertext, p_reply_token_key_version, p_reply_token_sha256,
    p_content_ciphertext, p_content_key_version, p_content_sha256,
    p_idempotency_key, p_correlation_id, 'QUEUED', statement_timestamp()
  ) on conflict (tenant_id, idempotency_key) do nothing
  returning id into target_message_id;

  if target_message_id is null then
    select id into target_message_id from public.line_messages where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
  else
    inserted_message := true;
    insert into public.jobs (tenant_id, job_type, job_version, dedupe_key, payload_json, status, max_attempts)
    values (
      p_tenant_id, 'line.message.delivery', 1,
      format('%s:%s', p_channel_record_id, p_idempotency_key),
      jsonb_build_object('deliveryId', target_message_id, 'channelRecordId', p_channel_record_id, 'sourceInboxId', p_inbox_id),
      'QUEUED', 3
    ) on conflict (tenant_id, job_type, dedupe_key) do nothing;
  end if;

  return query select target_message_id, case when inserted_message then 'QUEUED' else 'DUPLICATE' end;
end;
$$;

create or replace function private.complete_line_webhook_job(
  p_job_id uuid,
  p_inbox_id uuid,
  p_worker_id text,
  p_delivery_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  changed integer;
begin
  update public.jobs set status = 'SUCCEEDED', lease_owner = null, lease_expires_at = null,
    heartbeat_at = statement_timestamp(), completed_at = statement_timestamp(), updated_at = statement_timestamp(), row_version = row_version + 1
   where id = p_job_id and job_type = 'line.webhook.process' and status = 'RUNNING' and lease_owner = p_worker_id and lease_expires_at >= statement_timestamp();
  get diagnostics changed = row_count;
  if changed = 1 then
    update public.line_webhook_inbox set status = 'PROCESSED', processed_at = statement_timestamp(), lease_owner = null, lease_expires_at = null,
      error_code = null, error_detail_redacted = null, updated_at = statement_timestamp(), row_version = row_version + 1
     where id = p_inbox_id and status = 'PROCESSING';
    return true;
  end if;
  return exists (select 1 from public.line_webhook_inbox where id = p_inbox_id and status = 'PROCESSED');
end;
$$;

create or replace function private.fail_line_webhook_job(
  p_job_id uuid,
  p_inbox_id uuid,
  p_worker_id text,
  p_error_code text,
  p_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.jobs%rowtype;
  next_status text;
begin
  select * into target from public.jobs where id = p_job_id and job_type = 'line.webhook.process' for update;
  if not found or target.status <> 'RUNNING' or target.lease_owner <> p_worker_id then
    raise exception using errcode = '55000', message = 'LINE webhook job lease is invalid';
  end if;
  next_status := case when p_retryable and target.attempt_count < target.max_attempts then 'RETRY_WAIT' else 'DEAD' end;
  update public.jobs set status = next_status, next_attempt_at = case when next_status = 'RETRY_WAIT' then statement_timestamp() + make_interval(secs => least(60, greatest(1, target.attempt_count * 10))) else next_attempt_at end,
    lease_owner = null, lease_expires_at = null, error_code = left(p_error_code, 64), error_detail_redacted = left(p_error_code, 2000), completed_at = case when next_status = 'DEAD' then statement_timestamp() else null end,
    updated_at = statement_timestamp(), row_version = row_version + 1 where id = target.id;
  update public.line_webhook_inbox set status = case when next_status = 'RETRY_WAIT' then 'FAILED' else 'DLQ' end,
    next_attempt_at = case when next_status = 'RETRY_WAIT' then statement_timestamp() + make_interval(secs => least(60, greatest(1, target.attempt_count * 10))) else next_attempt_at end,
    lease_owner = null, lease_expires_at = null, error_code = left(p_error_code, 64), error_detail_redacted = left(p_error_code, 2000),
    updated_at = statement_timestamp(), row_version = row_version + 1 where id = p_inbox_id;
  return next_status;
end;
$$;

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
as $$
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
    from public.jobs j
    join public.line_messages m on m.tenant_id = j.tenant_id and m.id = (j.payload_json->>'deliveryId')::uuid
   where j.job_type = 'line.message.delivery' and j.attempt_count < j.max_attempts
     and ((j.status in ('QUEUED', 'RETRY_WAIT') and j.next_attempt_at <= p_now) or (j.status = 'RUNNING' and j.lease_expires_at < p_now))
     and m.status in ('QUEUED', 'RETRY_WAIT', 'SENDING')
   order by j.priority desc, j.next_attempt_at, j.created_at, j.id
   for update of j, m skip locked limit 1;
  if not found then return; end if;
  select * into selected_message from public.line_messages where tenant_id = selected_job.tenant_id and id = (selected_job.payload_json->>'deliveryId')::uuid for update;
  select * into selected_channel from public.line_channels where tenant_id = selected_message.tenant_id and id = selected_message.line_channel_record_id and state in ('ACTIVE', 'DEGRADED');
  if not found then return; end if;
  if selected_message.route is null or lower(selected_message.route) not in ('reply', 'push') then return; end if;
  select * into selected_user from public.line_users where tenant_id = selected_message.tenant_id and id = selected_message.line_user_id and status = 'ACTIVE';
  if not found then return; end if;
  update public.jobs set status = 'RUNNING', attempt_count = attempt_count + 1, lease_owner = p_worker_id, lease_expires_at = lease_until, heartbeat_at = p_now, started_at = coalesce(started_at, p_now), updated_at = p_now, row_version = row_version + 1 where id = selected_job.id;
  update public.line_messages set status = 'SENDING', attempt_count = attempt_count + 1, updated_at = p_now, row_version = row_version + 1 where id = selected_message.id;
  return query select selected_job.id, selected_message.id, selected_message.tenant_id, selected_message.line_channel_record_id,
    lower(selected_message.route), selected_user.line_user_id, selected_message.reply_token_ciphertext, selected_message.reply_token_key_version,
    selected_message.content_ciphertext, selected_message.content_key_version, selected_message.idempotency_key, selected_message.correlation_id,
    selected_channel.encrypted_access_token, selected_channel.credential_key_version, selected_message.attempt_count + 1, selected_message.max_attempts, lease_until;
end;
$$;

create or replace function private.complete_line_message_job(
  p_job_id uuid,
  p_delivery_id uuid,
  p_worker_id text,
  p_provider_status integer,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare changed integer;
begin
  update public.jobs set status = 'SUCCEEDED', lease_owner = null, lease_expires_at = null, completed_at = statement_timestamp(), updated_at = statement_timestamp(), row_version = row_version + 1
   where id = p_job_id and job_type = 'line.message.delivery' and status = 'RUNNING' and lease_owner = p_worker_id and lease_expires_at >= statement_timestamp();
  get diagnostics changed = row_count;
  if changed = 1 then
    update public.line_messages set status = 'API_ACCEPTED', provider_status = p_provider_status, provider_message_id = left(p_provider_message_id, 255), accepted_at = statement_timestamp(), completed_at = statement_timestamp(), updated_at = statement_timestamp(), row_version = row_version + 1 where id = p_delivery_id and status = 'SENDING';
    return true;
  end if;
  return exists (select 1 from public.line_messages where id = p_delivery_id and status = 'API_ACCEPTED');
end;
$$;

create or replace function private.fail_line_message_job(
  p_job_id uuid,
  p_delivery_id uuid,
  p_worker_id text,
  p_provider_status integer,
  p_error_code text,
  p_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.jobs%rowtype; next_status text;
begin
  select * into target from public.jobs where id = p_job_id and job_type = 'line.message.delivery' for update;
  if not found or target.status <> 'RUNNING' or target.lease_owner <> p_worker_id then raise exception using errcode = '55000', message = 'LINE delivery job lease is invalid'; end if;
  next_status := case when p_retryable and target.attempt_count < target.max_attempts then 'RETRY_WAIT' else case when p_retryable then 'DEAD' else 'CANCELLED' end end;
  update public.jobs set status = next_status, next_attempt_at = case when next_status = 'RETRY_WAIT' then statement_timestamp() + make_interval(secs => least(60, greatest(1, target.attempt_count * 10))) else next_attempt_at end, lease_owner = null, lease_expires_at = null, error_code = left(p_error_code, 64), error_detail_redacted = left(p_error_code, 2000), completed_at = case when next_status <> 'RETRY_WAIT' then statement_timestamp() else null end, updated_at = statement_timestamp(), row_version = row_version + 1 where id = target.id;
  update public.line_messages set status = case when next_status = 'RETRY_WAIT' then 'RETRY_WAIT' when next_status = 'DEAD' then 'DLQ' else 'FAILED' end, provider_status = p_provider_status, error_code = left(p_error_code, 64), completed_at = case when next_status <> 'RETRY_WAIT' then statement_timestamp() else null end, next_attempt_at = case when next_status = 'RETRY_WAIT' then statement_timestamp() + make_interval(secs => least(60, greatest(1, target.attempt_count * 10))) else next_attempt_at end, updated_at = statement_timestamp(), row_version = row_version + 1 where id = p_delivery_id;
  return next_status;
end;
$$;

create or replace function private.list_public_active_knowledge_chunks(
  p_tenant_id uuid,
  p_at timestamptz
)
returns table (
  id uuid, tenant_id uuid, document_version_id uuid, parent_chunk_id uuid,
  chunk_type text, chunk_index integer, display_text text, search_text text,
  entity_keys jsonb, topic_keys jsonb, fact_types jsonb, visibility text,
  owner_department_id uuid, authority_level smallint, valid_from timestamptz,
  valid_until timestamptz, source_locator_json jsonb, source_hash text,
  token_count integer, language text, previous_chunk_id uuid, next_chunk_id uuid,
  created_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select c.id, c.tenant_id, c.document_version_id, c.parent_chunk_id, c.chunk_type,
    c.chunk_index, c.display_text, c.search_text, c.entity_keys, c.topic_keys,
    c.fact_types, c.visibility, v.owner_department_id, c.authority_level,
    c.valid_from, c.valid_until, c.source_locator_json, c.source_hash, c.token_count,
    c.language, c.previous_chunk_id, c.next_chunk_id, c.created_at
    from public.knowledge_chunks c
    join public.knowledge_index_generations g on g.tenant_id = c.tenant_id and g.id = c.index_generation_id and g.state = 'ACTIVE'
    join public.knowledge_document_versions v on v.tenant_id = c.tenant_id and v.id = c.document_version_id and v.state = 'ACTIVE'
   where c.tenant_id = p_tenant_id and c.visibility = 'PUBLIC'
     and (v.effective_from is null or v.effective_from <= p_at)
     and (v.effective_until is null or v.effective_until > p_at)
     and (c.valid_from is null or c.valid_from <= p_at)
     and (c.valid_until is null or c.valid_until > p_at)
   order by c.chunk_index, c.id;
$$;

create or replace function private.list_public_active_knowledge_facts(
  p_tenant_id uuid,
  p_at timestamptz
)
returns table (
  id uuid, tenant_id uuid, document_version_id uuid, entity_type text,
  entity_key text, entity_display_name text, fact_type text, fact_key text,
  value_json jsonb, normalized_value text, unit text, valid_from timestamptz,
  valid_until timestamptz, authority_level smallint, visibility text,
  source_chunk_id uuid, source_locator_json jsonb, source_quote text,
  extraction_method text, review_status text, reviewed_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select f.id, f.tenant_id, f.document_version_id, f.entity_type, f.entity_key,
    f.entity_display_name, f.fact_type, f.fact_key, f.value_json, f.normalized_value,
    f.unit, f.valid_from, f.valid_until, f.authority_level, f.visibility,
    f.source_chunk_id, f.source_locator_json, f.source_quote, f.extraction_method,
    f.review_status, f.reviewed_at
    from public.knowledge_facts f
    join public.knowledge_index_generations g on g.tenant_id = f.tenant_id and g.id = f.index_generation_id and g.state = 'ACTIVE'
    join public.knowledge_document_versions v on v.tenant_id = f.tenant_id and v.id = f.document_version_id and v.state = 'ACTIVE'
    join public.knowledge_chunks c on c.tenant_id = f.tenant_id and c.id = f.source_chunk_id and c.visibility = 'PUBLIC'
   where f.tenant_id = p_tenant_id and f.visibility = 'PUBLIC' and f.review_status = 'APPROVED'
     and (v.effective_from is null or v.effective_from <= p_at)
     and (v.effective_until is null or v.effective_until > p_at)
     and (f.valid_from is null or f.valid_from <= p_at)
     and (f.valid_until is null or f.valid_until > p_at)
   order by f.fact_key, f.id;
$$;

revoke all on function private.claim_line_webhook_job(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function private.enqueue_line_chat_response(uuid, uuid, text, uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function private.complete_line_webhook_job(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.fail_line_webhook_job(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function private.claim_line_message_job(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function private.complete_line_message_job(uuid, uuid, text, integer, text) from public, anon, authenticated;
revoke all on function private.fail_line_message_job(uuid, uuid, text, integer, text, boolean) from public, anon, authenticated;
revoke all on function private.list_public_active_knowledge_chunks(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.list_public_active_knowledge_facts(uuid, timestamptz) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'citychatbot_runtime') then
    grant usage on schema private to citychatbot_runtime;
    grant execute on function private.claim_line_webhook_job(text, timestamptz, integer), private.enqueue_line_chat_response(uuid, uuid, text, uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text), private.complete_line_webhook_job(uuid, uuid, text, uuid), private.fail_line_webhook_job(uuid, uuid, text, text, boolean), private.claim_line_message_job(text, timestamptz, integer), private.complete_line_message_job(uuid, uuid, text, integer, text), private.fail_line_message_job(uuid, uuid, text, integer, text, boolean), private.list_public_active_knowledge_chunks(uuid, timestamptz), private.list_public_active_knowledge_facts(uuid, timestamptz) to citychatbot_runtime;
  end if;
  if exists (select 1 from pg_roles where rolname = 'citychatbot_app') then
    grant usage on schema private to citychatbot_app;
    grant execute on function private.claim_line_webhook_job(text, timestamptz, integer), private.enqueue_line_chat_response(uuid, uuid, text, uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text), private.complete_line_webhook_job(uuid, uuid, text, uuid), private.fail_line_webhook_job(uuid, uuid, text, text, boolean), private.claim_line_message_job(text, timestamptz, integer), private.complete_line_message_job(uuid, uuid, text, integer, text), private.fail_line_message_job(uuid, uuid, text, integer, text, boolean), private.list_public_active_knowledge_chunks(uuid, timestamptz), private.list_public_active_knowledge_facts(uuid, timestamptz) to citychatbot_app;
  end if;
end;
$$;

comment on function private.claim_line_webhook_job(text, timestamptz, integer) is 'Tenant-safe leased claim for one durable LINE inbox job; never exposes a table to browser roles.';
comment on function private.claim_line_message_job(text, timestamptz, integer) is 'Tenant-safe leased claim for one durable LINE provider delivery.';
comment on function private.list_public_active_knowledge_chunks(uuid, timestamptz) is 'Returns only tenant-scoped PUBLIC ACTIVE effective knowledge for citizen retrieval.';
