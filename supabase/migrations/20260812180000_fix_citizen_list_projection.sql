-- Forward-only production fix for the citizen complaint list projection.
-- The first runtime migration selected `more.has_more` beside jsonb_agg()
-- without grouping it, so PostgreSQL rejected every list request with 42803.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create or replace function private.list_citizen_complaints(
  p_tenant_id uuid,
  p_line_user_id text,
  p_status text,
  p_limit integer,
  p_cursor integer
)
returns table(items jsonb, next_cursor text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  normalized_status text := coalesce(p_status, 'ALL');
  normalized_limit integer := coalesce(p_limit, 20);
  normalized_cursor integer := coalesce(p_cursor, 0);
begin
  if normalized_status not in ('ALL', 'ACTIVE', 'CLOSED')
     or normalized_limit not between 1 and 50
     or normalized_cursor < 0
     or normalized_cursor > 100000 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  if not exists (
    select 1
      from public.line_users as line_user
     where line_user.tenant_id = p_tenant_id
       and line_user.line_user_id = p_line_user_id
       and line_user.status = 'ACTIVE'
  ) then
    return query select '[]'::jsonb, null::text;
    return;
  end if;

  return query
  with filtered as (
    select complaint.id, complaint.created_at
      from public.complaints as complaint
     where complaint.tenant_id = p_tenant_id
       and complaint.line_user_id = p_line_user_id
       and (
         normalized_status = 'ALL'
         or (normalized_status = 'CLOSED' and complaint.canonical_status in ('CLOSED', 'CANCELLED', 'OUT_OF_JURISDICTION'))
         or (normalized_status = 'ACTIVE' and complaint.canonical_status not in ('CLOSED', 'CANCELLED', 'OUT_OF_JURISDICTION'))
       )
     order by complaint.created_at desc, complaint.id desc
  ), page as (
    select filtered.id, filtered.created_at
      from filtered
     offset normalized_cursor
     limit normalized_limit
  ), more as (
    select exists(select 1 from filtered offset normalized_cursor + normalized_limit) as has_more
  )
  select coalesce(
           jsonb_agg(private.citizen_public_view(p_tenant_id, p_line_user_id, page.id)
             order by page.created_at desc, page.id desc),
           '[]'::jsonb
         ),
         case when more.has_more then (normalized_cursor + normalized_limit)::text else null end
    from page
    cross join more
   group by more.has_more;
end;
$$;

revoke all on function private.list_citizen_complaints(uuid, text, text, integer, integer) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'citychatbot_app') then
    grant usage on schema private to citychatbot_app;
    grant execute on function private.list_citizen_complaints(uuid, text, text, integer, integer) to citychatbot_app;
  end if;
end;
$$;

comment on function private.list_citizen_complaints(uuid, text, text, integer, integer)
  is 'Tenant- and LINE-user-scoped complaint list with a grouped pagination flag.';
