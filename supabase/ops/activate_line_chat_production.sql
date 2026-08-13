-- Idempotent production activation for the single dedicated CityChatbot LINE channel.
-- No provider credential, webhook key, citizen identifier, or raw content is read.
begin;

select pg_advisory_xact_lock(hashtextextended('citychatbot:line-chat:production-activation', 0));

do $$
declare
  active_channel_count integer;
  target_channel public.line_channels%rowtype;
  target_settings public.tenant_settings%rowtype;
begin
  select count(*) into active_channel_count
    from public.line_channels
   where state = 'ACTIVE';
  if active_channel_count <> 1 then
    raise exception 'expected exactly one ACTIVE LINE channel, found %', active_channel_count;
  end if;

  select * into strict target_channel
    from public.line_channels
   where state = 'ACTIVE'
   for update;

  select * into strict target_settings
    from public.tenant_settings
   where tenant_id = target_channel.tenant_id
   for update;

  if exists (select 1 from public.line_webhook_inbox where tenant_id = target_channel.tenant_id and status in ('FAILED', 'DLQ'))
     or exists (select 1 from public.line_messages where tenant_id = target_channel.tenant_id and status in ('FAILED', 'DLQ')) then
    raise exception 'LINE durable queue contains FAILED or DLQ work';
  end if;

  update public.line_channels
     set health = 'HEALTHY',
         last_verified_at = statement_timestamp()
   where tenant_id = target_channel.tenant_id
     and id = target_channel.id
     and (health <> 'HEALTHY' or last_verified_at is null);

  update public.tenant_settings
     set ai_chat_enabled = true,
         settings_json = jsonb_set(settings_json, '{lineChatActivation}', jsonb_build_object(
           'mode', 'SAFE_ABSTENTION',
           'activatedBy', 'SYSTEM_UNIT_GATE',
           'activatedAt', statement_timestamp()
         ), true)
   where tenant_id = target_channel.tenant_id
     and ai_chat_enabled = false;

  if not exists (
    select 1 from public.audit_logs
     where tenant_id = target_channel.tenant_id
       and resource_type = 'LINE_CHANNEL'
       and resource_id = target_channel.id
       and action = 'LINE_WEBHOOK_VERIFIED'
       and after_redacted_json ->> 'deploymentRegion' = 'sin1'
  ) then
    insert into public.audit_logs (tenant_id, actor_type, action, resource_type, resource_id, before_redacted_json, after_redacted_json, reason)
    values (target_channel.tenant_id, 'SYSTEM', 'LINE_WEBHOOK_VERIFIED', 'LINE_CHANNEL', target_channel.id,
      jsonb_build_object('health', target_channel.health),
      jsonb_build_object('health', 'HEALTHY', 'deploymentRegion', 'sin1'),
      'LINE Developers verification succeeded after regional colocation');
  end if;

  if not exists (
    select 1 from public.audit_logs
     where tenant_id = target_channel.tenant_id
       and resource_type = 'TENANT_SETTINGS'
       and resource_id = target_settings.id
       and action = 'AI_CHAT_ENABLED'
       and after_redacted_json ->> 'mode' = 'SAFE_ABSTENTION'
  ) then
    insert into public.audit_logs (tenant_id, actor_type, action, resource_type, resource_id, before_redacted_json, after_redacted_json, reason)
    values (target_channel.tenant_id, 'SYSTEM', 'AI_CHAT_ENABLED', 'TENANT_SETTINGS', target_settings.id,
      jsonb_build_object('aiChatEnabled', target_settings.ai_chat_enabled),
      jsonb_build_object('aiChatEnabled', true, 'mode', 'SAFE_ABSTENTION'),
      'P9-CAN-001 automatic unit gate and production dependency probe passed');
  end if;
end;
$$;

commit;
