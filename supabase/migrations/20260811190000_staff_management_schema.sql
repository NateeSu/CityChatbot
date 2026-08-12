begin;

-- P6-USR-001: the raw invitation secret never lives in Postgres. Only a
-- one-way digest is stored, and browser roles receive no read/write grant.
create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  invitee_email_digest text not null,
  token_digest text not null,
  status text not null default 'PENDING',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by_account_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint staff_invitations_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint staff_invitations_membership_fk foreign key (tenant_id, membership_id)
    references public.tenant_memberships (tenant_id, id) on delete restrict,
  constraint staff_invitations_creator_fk foreign key (created_by_account_id) references public.user_accounts (id) on delete restrict,
  constraint staff_invitations_tenant_id_uq unique (tenant_id, id),
  constraint staff_invitations_email_digest_ck check (invitee_email_digest ~ '^[0-9a-f]{64}$'),
  constraint staff_invitations_token_digest_ck check (token_digest ~ '^[0-9a-f]{64}$'),
  constraint staff_invitations_token_uq unique (token_digest),
  constraint staff_invitations_status_ck check (status in ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  constraint staff_invitations_dates_ck check ((accepted_at is null or accepted_at >= created_at) and (revoked_at is null or revoked_at >= created_at)),
  constraint staff_invitations_row_version_ck check (row_version > 0)
);

create table if not exists public.staff_invitation_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invitation_id uuid not null,
  role_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint staff_invitation_roles_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint staff_invitation_roles_invitation_fk foreign key (tenant_id, invitation_id)
    references public.staff_invitations (tenant_id, id) on delete cascade,
  constraint staff_invitation_roles_role_fk foreign key (tenant_id, role_id)
    references public.roles (tenant_id, id) on delete restrict,
  constraint staff_invitation_roles_tenant_id_uq unique (tenant_id, id),
  constraint staff_invitation_roles_unique unique (tenant_id, invitation_id, role_id),
  constraint staff_invitation_roles_row_version_ck check (row_version > 0)
);

create table if not exists public.staff_invitation_departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invitation_id uuid not null,
  department_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint staff_invitation_departments_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint staff_invitation_departments_invitation_fk foreign key (tenant_id, invitation_id)
    references public.staff_invitations (tenant_id, id) on delete cascade,
  constraint staff_invitation_departments_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint staff_invitation_departments_tenant_id_uq unique (tenant_id, id),
  constraint staff_invitation_departments_unique unique (tenant_id, invitation_id, department_id),
  constraint staff_invitation_departments_row_version_ck check (row_version > 0)
);

create index if not exists staff_invitations_pending_idx on public.staff_invitations (tenant_id, status, expires_at);
create index if not exists staff_invitation_roles_invitation_idx on public.staff_invitation_roles (tenant_id, invitation_id);
create index if not exists staff_invitation_departments_invitation_idx on public.staff_invitation_departments (tenant_id, invitation_id);

alter table public.staff_invitations enable row level security;
alter table public.staff_invitations force row level security;
alter table public.staff_invitation_roles enable row level security;
alter table public.staff_invitation_roles force row level security;
alter table public.staff_invitation_departments enable row level security;
alter table public.staff_invitation_departments force row level security;

revoke all on table public.staff_invitations from anon, authenticated;
revoke all on table public.staff_invitation_roles from anon, authenticated;
revoke all on table public.staff_invitation_departments from anon, authenticated;

create or replace function private.guard_staff_invitation_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.tenant_id <> old.tenant_id
    or new.membership_id <> old.membership_id
    or new.invitee_email_digest <> old.invitee_email_digest
    or new.token_digest <> old.token_digest
    or new.created_by_account_id <> old.created_by_account_id
    or new.created_at <> old.created_at then
    raise exception 'staff invitation identity is immutable';
  end if;
  if old.status = 'ACCEPTED' and new.status <> old.status then
    raise exception 'accepted invitation is immutable';
  end if;
  if old.status in ('EXPIRED', 'REVOKED') and new.status <> old.status then
    raise exception 'closed invitation is immutable';
  end if;
  new.updated_at = statement_timestamp();
  new.row_version = old.row_version + 1;
  return new;
end;
$$;

drop trigger if exists staff_invitation_immutability on public.staff_invitations;
create trigger staff_invitation_immutability
before update on public.staff_invitations
for each row execute function private.guard_staff_invitation_immutability();

create or replace function private.guard_last_tenant_admin_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'ACTIVE' and new.status <> 'ACTIVE'
    and exists (
      select 1 from public.membership_roles as mr
      join public.roles as role on role.tenant_id = mr.tenant_id and role.id = mr.role_id
      where mr.tenant_id = old.tenant_id and mr.membership_id = old.id and role.code = 'TENANT_ADMIN'
    )
    and not exists (
      select 1 from public.tenant_memberships as membership
      join public.membership_roles as mr on mr.tenant_id = membership.tenant_id and mr.membership_id = membership.id
      join public.roles as role on role.tenant_id = mr.tenant_id and role.id = mr.role_id
      where membership.tenant_id = old.tenant_id and membership.id <> old.id and membership.status = 'ACTIVE' and role.code = 'TENANT_ADMIN'
    ) then
    raise exception 'last active tenant admin guard';
  end if;
  return new;
end;
$$;

drop trigger if exists tenant_memberships_last_admin_guard on public.tenant_memberships;
create trigger tenant_memberships_last_admin_guard
before update on public.tenant_memberships
for each row execute function private.guard_last_tenant_admin_membership();

create or replace function private.guard_last_tenant_admin_role_removal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.roles where tenant_id = old.tenant_id and id = old.role_id and code = 'TENANT_ADMIN')
    and exists (select 1 from public.tenant_memberships where tenant_id = old.tenant_id and id = old.membership_id and status = 'ACTIVE')
    and not exists (
      select 1 from public.membership_roles as mr
      join public.tenant_memberships as membership on membership.tenant_id = mr.tenant_id and membership.id = mr.membership_id
      join public.roles as role on role.tenant_id = mr.tenant_id and role.id = mr.role_id
      where mr.tenant_id = old.tenant_id and mr.id <> old.id and membership.status = 'ACTIVE' and role.code = 'TENANT_ADMIN'
    ) then
    raise exception 'last active tenant admin role guard';
  end if;
  return old;
end;
$$;

drop trigger if exists membership_roles_last_admin_guard on public.membership_roles;
create trigger membership_roles_last_admin_guard
before delete on public.membership_roles
for each row execute function private.guard_last_tenant_admin_role_removal();

create or replace function private.accept_staff_invitation(
  p_tenant_id uuid,
  p_token_digest text,
  p_auth_subject text,
  p_display_name text,
  p_now timestamptz default statement_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  invitation public.staff_invitations%rowtype;
  target_account uuid;
begin
  select * into invitation from public.staff_invitations where tenant_id = p_tenant_id and token_digest = p_token_digest for update;
  if not found or invitation.status <> 'PENDING' then raise exception 'invitation unavailable'; end if;
  if invitation.expires_at <= p_now then
    update public.staff_invitations set status = 'EXPIRED', updated_at = p_now, row_version = row_version + 1 where id = invitation.id;
    raise exception 'invitation expired';
  end if;
  if length(btrim(p_auth_subject)) < 8 or length(btrim(p_display_name)) < 1 then raise exception 'invalid identity'; end if;
  select account_id into target_account from public.tenant_memberships where tenant_id = p_tenant_id and id = invitation.membership_id for update;
  update public.user_accounts set auth_subject = p_auth_subject, status = 'ACTIVE', updated_at = p_now, row_version = row_version + 1 where id = target_account;
  update public.tenant_memberships set status = 'ACTIVE', display_name = btrim(p_display_name), activated_at = p_now, updated_at = p_now, row_version = row_version + 1 where tenant_id = p_tenant_id and id = invitation.membership_id;
  update public.staff_invitations set status = 'ACCEPTED', accepted_at = p_now, updated_at = p_now, row_version = row_version + 1 where id = invitation.id;
  return invitation.membership_id;
end;
$$;

create or replace function private.deactivate_staff_membership(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_expected_version integer,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_status not in ('ACTIVE', 'SUSPENDED', 'DEACTIVATED') then raise exception 'invalid staff status'; end if;
  update public.tenant_memberships
  set status = p_status, updated_at = statement_timestamp(), row_version = row_version + 1
  where tenant_id = p_tenant_id and id = p_membership_id and row_version = p_expected_version;
  if not found then return false; end if;
  return true;
end;
$$;

comment on table public.staff_invitations is 'P6-USR-001: token/email digests only; raw invitation secrets and PII are never persisted';
comment on function private.accept_staff_invitation(uuid, text, text, text, timestamptz) is 'Trusted server-only invitation acceptance; token replay and expiry are fail-closed';
comment on function private.deactivate_staff_membership(uuid, uuid, integer, text) is 'Trusted server-only status mutation with optimistic version and last-admin trigger';

commit;
