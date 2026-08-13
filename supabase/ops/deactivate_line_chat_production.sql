-- Idempotent fail-closed rollback for the dedicated CityChatbot LINE channel.
begin;

select pg_advisory_xact_lock(hashtextextended('citychatbot:line-chat:production-activation', 0));

do $$
declare
  target_channel public.line_channels%rowtype;
  target_settings public.tenant_settings%rowtype;
begin
  select * into strict target_channel
    from public.line_channels
   where state = 'ACTIVE'
   for update;

  select * into strict target_settings
    from public.tenant_settings
   where tenant_id = target_channel.tenant_id
   for update;

  update public.tenant_settings
     set ai_chat_enabled = false,
         settings_json = settings_json - 'lineChatActivation'
   where tenant_id = target_channel.tenant_id
     and ai_chat_enabled = true;

  update public.line_channels
     set health = 'DEGRADED'
   where tenant_id = target_channel.tenant_id
     and id = target_channel.id
     and health <> 'DEGRADED';

  if target_settings.ai_chat_enabled then
    insert into public.audit_logs (tenant_id, actor_type, action, resource_type, resource_id, before_redacted_json, after_redacted_json, reason)
    values (target_channel.tenant_id, 'SYSTEM', 'AI_CHAT_DISABLED', 'TENANT_SETTINGS', target_settings.id,
      jsonb_build_object('aiChatEnabled', true), jsonb_build_object('aiChatEnabled', false),
      'Fail-closed production rollback');
    insert into public.audit_logs (tenant_id, actor_type, action, resource_type, resource_id, before_redacted_json, after_redacted_json, reason)
    values (target_channel.tenant_id, 'SYSTEM', 'LINE_CHANNEL_DEGRADED', 'LINE_CHANNEL', target_channel.id,
      jsonb_build_object('health', target_channel.health), jsonb_build_object('health', 'DEGRADED'),
      'Fail-closed production rollback');
  end if;
end;
$$;

commit;
