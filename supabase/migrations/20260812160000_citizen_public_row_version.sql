-- Expose only the optimistic-concurrency token in the citizen public projection.
-- Requirements: RF-04, RF-06, RF-14, RF-15, RF-17
-- The underlying projection stays private-field safe; this wrapper adds the
-- non-sensitive row version required by every complaint mutation contract.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

do $$
begin
  if to_regprocedure('private.citizen_public_view(uuid,text,uuid)') is not null
     and to_regprocedure('private.citizen_public_view_base(uuid,text,uuid)') is null then
    execute 'alter function private.citizen_public_view(uuid,text,uuid) rename to citizen_public_view_base';
  end if;
end;
$$;

create or replace function private.citizen_public_view(
  p_tenant_id uuid,
  p_line_user_id text,
  p_complaint_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  base_view jsonb;
  version_value bigint;
begin
  base_view := private.citizen_public_view_base(p_tenant_id, p_line_user_id, p_complaint_id);
  if base_view is null then
    return null;
  end if;

  select complaint.row_version into version_value
  from public.complaints complaint
  where complaint.tenant_id = p_tenant_id
    and complaint.line_user_id = p_line_user_id
    and complaint.id = p_complaint_id;
  if not found then
    return null;
  end if;

  return base_view || jsonb_build_object('rowVersion', version_value);
end;
$$;

revoke all on function private.citizen_public_view_base(uuid, text, uuid) from public, anon, authenticated, citychatbot_app;
revoke all on function private.citizen_public_view(uuid, text, uuid) from public, anon, authenticated;
grant execute on function private.citizen_public_view(uuid, text, uuid) to citychatbot_app;

comment on function private.citizen_public_view(uuid, text, uuid)
  is 'Citizen-safe complaint projection plus non-sensitive rowVersion for optimistic mutation concurrency.';
