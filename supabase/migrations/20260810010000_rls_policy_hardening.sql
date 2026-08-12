-- CityChatbot permission-aware RLS hardening
-- Requirements: RF-03, RF-04, RF-07, RF-13, RF-16
-- Depends on 20260810000000_core_schema.sql and its deterministic permission seed.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create or replace function private.has_tenant_permission(
  p_tenant_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p_tenant_id = private.current_tenant_id()
    and exists (
      select 1
      from public.user_accounts as account
      join public.tenant_memberships as membership
        on membership.account_id = account.id
       and membership.tenant_id = p_tenant_id
       and membership.status = 'ACTIVE'
      join public.membership_roles as membership_role
        on membership_role.tenant_id = membership.tenant_id
       and membership_role.membership_id = membership.id
      join public.roles as role
        on role.tenant_id = membership_role.tenant_id
       and role.id = membership_role.role_id
       and role.status = 'ACTIVE'
      join public.role_permissions as role_permission
        on role_permission.tenant_id = role.tenant_id
       and role_permission.role_id = role.id
      join public.permissions as permission
        on permission.id = role_permission.permission_id
      where account.id = private.current_account_id()
        and account.status = 'ACTIVE'
        and permission.code = p_permission_code
    );
$$;

create or replace function private.can_read_department(
  p_tenant_id uuid,
  p_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    private.has_tenant_permission(p_tenant_id, 'settings.manage.tenant')
    or private.has_tenant_permission(p_tenant_id, 'staff.manage.tenant')
    or exists (
      select 1
      from public.tenant_memberships as membership
      join public.department_memberships as department_membership
        on department_membership.tenant_id = membership.tenant_id
       and department_membership.membership_id = membership.id
       and department_membership.department_id = p_department_id
      where membership.tenant_id = p_tenant_id
        and membership.account_id = private.current_account_id()
        and membership.status = 'ACTIVE'
    );
$$;

create or replace function private.can_manage_support_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.has_tenant_permission(p_tenant_id, 'support.access.tenant');
$$;

grant execute on function private.has_tenant_permission(uuid, text) to authenticated;
grant execute on function private.can_read_department(uuid, uuid) to authenticated;
grant execute on function private.can_manage_support_access(uuid) to authenticated;

-- Replace the bootstrap read-only policies atomically. There is no broad
-- authenticated FOR ALL policy: every mutation below has an explicit
-- permission-backed USING/WITH CHECK boundary and DELETE remains denied.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'tenants', 'user_accounts', 'tenant_settings', 'feature_flag_versions',
        'tenant_memberships', 'departments', 'department_memberships',
        'department_work_scope_versions', 'roles', 'permissions', 'role_permissions',
        'membership_roles', 'support_access_grants', 'sla_rule_versions',
        'department_contacts', 'idempotency_records', 'domain_outbox', 'jobs', 'audit_logs'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end;
$$;

create policy tenants_read_current on public.tenants
  for select to authenticated
  using ((select private.can_read_tenant(id)));

create policy tenants_update_settings on public.tenants
  for update to authenticated
  using ((select private.has_tenant_permission(id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(id, 'settings.manage.tenant')));

create policy user_accounts_read_self on public.user_accounts
  for select to authenticated
  using (id = (select private.current_account_id()));

create policy permissions_read_authenticated on public.permissions
  for select to authenticated
  using (true);

create policy tenant_settings_read_current on public.tenant_settings
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));
create policy tenant_settings_insert_manage on public.tenant_settings
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
create policy tenant_settings_update_manage on public.tenant_settings
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

create policy feature_flags_read_current on public.feature_flag_versions
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));
create policy feature_flags_insert_manage on public.feature_flag_versions
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
create policy feature_flags_update_manage on public.feature_flag_versions
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

create policy tenant_memberships_read_current on public.tenant_memberships
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));
create policy tenant_memberships_insert_manage on public.tenant_memberships
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')));
create policy tenant_memberships_update_manage on public.tenant_memberships
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')));

create policy departments_read_scoped on public.departments
  for select to authenticated
  using ((select private.can_read_department(tenant_id, id)));
create policy departments_insert_manage on public.departments
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
create policy departments_update_manage on public.departments
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

create policy department_memberships_read_scoped on public.department_memberships
  for select to authenticated
  using ((select private.can_read_department(tenant_id, department_id)));
create policy department_memberships_insert_manage on public.department_memberships
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')));
create policy department_memberships_update_manage on public.department_memberships
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')));

create policy department_scopes_read_scoped on public.department_work_scope_versions
  for select to authenticated
  using ((select private.can_read_department(tenant_id, department_id)));
create policy department_scopes_insert_manage on public.department_work_scope_versions
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
create policy department_scopes_update_manage on public.department_work_scope_versions
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

create policy roles_read_current on public.roles
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));
create policy roles_insert_manage on public.roles
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')));
create policy roles_update_manage on public.roles
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')));

create policy role_permissions_read_current on public.role_permissions
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));
create policy role_permissions_insert_manage on public.role_permissions
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')));
create policy role_permissions_update_manage on public.role_permissions
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')));

create policy membership_roles_read_current on public.membership_roles
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));
create policy membership_roles_insert_manage on public.membership_roles
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')));
create policy membership_roles_update_manage on public.membership_roles
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'staff.manage.tenant')));

create policy support_grants_read_manage on public.support_access_grants
  for select to authenticated
  using ((select private.can_manage_support_access(tenant_id)));
create policy support_grants_insert_manage on public.support_access_grants
  for insert to authenticated
  with check ((select private.can_manage_support_access(tenant_id)));
create policy support_grants_update_manage on public.support_access_grants
  for update to authenticated
  using ((select private.can_manage_support_access(tenant_id)))
  with check ((select private.can_manage_support_access(tenant_id)));

create policy sla_rules_read_scoped on public.sla_rule_versions
  for select to authenticated
  using ((select private.can_read_department(tenant_id, department_id)));
create policy sla_rules_insert_manage on public.sla_rule_versions
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
create policy sla_rules_update_manage on public.sla_rule_versions
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

create policy department_contacts_read_scoped on public.department_contacts
  for select to authenticated
  using ((select private.can_read_department(tenant_id, department_id)));
create policy department_contacts_insert_manage on public.department_contacts
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));
create policy department_contacts_update_manage on public.department_contacts
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'settings.manage.tenant')));

create policy idempotency_read_actor on public.idempotency_records
  for select to authenticated
  using (
    (tenant_id = (select private.current_tenant_id()) and actor_account_id = (select private.current_account_id()))
    or (select private.has_tenant_permission(tenant_id, 'job.manage.tenant'))
  );
create policy idempotency_insert_actor on public.idempotency_records
  for insert to authenticated
  with check (
    tenant_id = (select private.current_tenant_id())
    and actor_account_id = (select private.current_account_id())
    and (select private.can_read_tenant(tenant_id))
  );
create policy idempotency_update_actor on public.idempotency_records
  for update to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and actor_account_id = (select private.current_account_id())
  )
  with check (
    tenant_id = (select private.current_tenant_id())
    and actor_account_id = (select private.current_account_id())
  );

create policy jobs_read_manage on public.jobs
  for select to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'job.manage.tenant')));

create policy audit_logs_read_manage on public.audit_logs
  for select to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'audit.view.tenant')));

-- No authenticated insert/update/delete/truncate is granted for outbox, jobs,
-- audit, permissions or user_accounts. Workers and audit writers must use a
-- constrained server-side path, never a browser service-role client.
revoke insert, update, delete, truncate on table
  public.domain_outbox,
  public.jobs,
  public.audit_logs,
  public.permissions,
  public.user_accounts
from authenticated;

comment on function private.has_tenant_permission(uuid, text) is 'Permission-aware RLS helper; validates active account, membership, role and permission in the current trusted tenant';
comment on function private.can_read_department(uuid, uuid) is 'Department RLS helper; tenant managers or active department membership only';

grant update on table public.tenants to authenticated;
grant insert, update on table
  public.tenant_settings,
  public.feature_flag_versions,
  public.tenant_memberships,
  public.departments,
  public.department_memberships,
  public.department_work_scope_versions,
  public.roles,
  public.role_permissions,
  public.membership_roles,
  public.support_access_grants,
  public.sla_rule_versions,
  public.department_contacts,
  public.idempotency_records
to authenticated;
