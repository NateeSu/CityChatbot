-- Forward-only production fix for LIFF identity persistence.
-- The original function used output-column names that shadowed record fields in
-- its final SELECT. PostgreSQL therefore raised "column reference ... is
-- ambiguous" after LINE token verification and before issuing a session.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create or replace function private.persist_liff_identity(
  p_liff_app_id text,
  p_line_user_id text,
  p_verified_at timestamptz,
  p_consent_version text default null,
  p_consent_accepted boolean default false
)
returns table (
  tenant_id uuid,
  tenant_display_name text,
  liff_app_record_id uuid,
  liff_app_id text,
  line_channel_record_id uuid,
  channel_id text,
  line_user_record_id uuid,
  required_consent_version text,
  session_ttl_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  app_record public.liff_apps%rowtype;
  tenant_record public.tenants%rowtype;
  channel_record public.line_channels%rowtype;
  user_record public.line_users%rowtype;
begin
  if p_line_user_id is null or p_line_user_id !~ '^U[0-9A-Za-z]{8,64}$' then
    raise exception using errcode = '22023', message = 'LINE user identity is invalid';
  end if;

  select app.* into app_record
    from public.liff_apps as app
   where app.liff_app_id = p_liff_app_id
     and app.enabled = true
   for share;
  if not found then raise exception using errcode = '42501', message = 'LIFF app unavailable'; end if;

  select tenant.* into tenant_record
    from public.tenants as tenant
   where tenant.id = app_record.tenant_id
     and tenant.status = 'ACTIVE'
   for share;
  if not found then raise exception using errcode = '42501', message = 'LIFF tenant unavailable'; end if;

  select channel.* into channel_record
    from public.line_channels as channel
   where channel.tenant_id = app_record.tenant_id
     and channel.id = app_record.line_channel_record_id
     and channel.state = 'ACTIVE'
   for share;
  if not found then raise exception using errcode = '42501', message = 'LIFF channel unavailable'; end if;

  if app_record.required_consent_version is not null
     and (p_consent_accepted is not true or p_consent_version is distinct from app_record.required_consent_version) then
    raise exception using errcode = '22023', message = 'required privacy consent is missing or outdated';
  end if;

  insert into public.line_users as target_user (
    tenant_id, line_channel_record_id, line_user_id, status, first_verified_at, last_verified_at
  ) values (
    app_record.tenant_id, app_record.line_channel_record_id, p_line_user_id, 'ACTIVE', p_verified_at, p_verified_at
  )
  on conflict on constraint line_users_identity_uq do update
    set status = 'ACTIVE', blocked_at = null, last_verified_at = excluded.last_verified_at,
        updated_at = statement_timestamp(), row_version = target_user.row_version + 1
  returning * into user_record;

  if p_consent_version is not null and p_consent_accepted is true then
    insert into public.consent_events (
      tenant_id, line_user_id, liff_app_record_id, notice_version, channel, accepted, occurred_at
    ) values (
      app_record.tenant_id, user_record.id, app_record.id, p_consent_version, 'LIFF', true, p_verified_at
    );
  end if;

  return query
    select app_record.tenant_id,
           tenant_record.display_name,
           app_record.id,
           app_record.liff_app_id,
           app_record.line_channel_record_id,
           app_record.channel_id,
           user_record.id,
           app_record.required_consent_version,
           app_record.session_ttl_seconds;
end;
$$;

revoke all on function private.persist_liff_identity(text, text, timestamptz, text, boolean) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'citychatbot_app') then
    grant usage on schema private to citychatbot_app;
    grant execute on function private.persist_liff_identity(text, text, timestamptz, text, boolean) to citychatbot_app;
  end if;
end;
$$;

comment on function private.persist_liff_identity(text, text, timestamptz, text, boolean)
  is 'Atomically upserts a verified tenant-scoped LINE user and appends accepted LIFF consent; output fields are explicitly qualified.';
