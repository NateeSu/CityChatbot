do $$
declare
  missing text[] := array[]::text[];
  table_name text;
begin
  foreach table_name in array array['staff_invitations', 'staff_invitation_roles', 'staff_invitation_departments'] loop
    if to_regclass('public.' || table_name) is null then missing := array_append(missing, table_name); end if;
  end loop;
  if cardinality(missing) > 0 then raise exception 'missing staff management table(s): %', array_to_string(missing, ', '); end if;

  if not exists (select 1 from pg_constraint where conname = 'staff_invitations_membership_fk') then raise exception 'staff invitation membership composite FK missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_invitation_roles_role_fk') then raise exception 'staff invitation role composite FK missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_invitation_departments_department_fk') then raise exception 'staff invitation department composite FK missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_invitations_token_uq') then raise exception 'token digest uniqueness missing'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'staff_invitation_immutability') then raise exception 'invitation immutability trigger missing'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'tenant_memberships_last_admin_guard') then raise exception 'last admin membership guard missing'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'membership_roles_last_admin_guard') then raise exception 'last admin role guard missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'accept_staff_invitation') then raise exception 'accept invitation function missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'deactivate_staff_membership') then raise exception 'deactivate membership function missing'; end if;
  if not exists (select 1 from pg_class where relname = 'staff_invitations' and relforcerowsecurity) then raise exception 'staff invitations RLS is not forced'; end if;
  if not exists (select 1 from pg_class where relname = 'staff_invitation_roles' and relforcerowsecurity) then raise exception 'staff invitation roles RLS is not forced'; end if;
  if not exists (select 1 from pg_class where relname = 'staff_invitation_departments' and relforcerowsecurity) then raise exception 'staff invitation departments RLS is not forced'; end if;
end;
$$;

do $$
declare
  grants text;
begin
  select string_agg(privilege_type, ',') into grants from information_schema.role_table_grants where table_schema = 'public' and table_name = 'staff_invitations' and grantee = 'authenticated';
  if grants is not null then raise exception 'browser access must remain denied for staff_invitations: %', grants; end if;
end;
$$;

select 'STAFF_MANAGEMENT_SCHEMA_SQL_CONTRACT_PASS' as contract;
