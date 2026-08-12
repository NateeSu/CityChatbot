-- Requirements: RF-08, RF-13, RF-17
-- P4-AIGW-001: tenant-scoped provider/model route registry. Secrets never live
-- here; api_key_env is an environment variable name only.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.ai_model_registry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  route_key text not null,
  purpose text not null,
  provider_id text not null,
  provider_kind text not null,
  endpoint text not null,
  model_id text not null,
  model_revision text not null,
  state text not null default 'DRAFT',
  privacy_profile text not null,
  api_key_env text not null,
  supports_structured_output boolean not null default false,
  embedding_dimension integer,
  supported_parameters jsonb not null default '{}'::jsonb,
  config_json jsonb not null default '{}'::jsonb,
  config_hash text not null,
  approved_by uuid,
  approved_at timestamptz,
  certified_by uuid,
  certified_at timestamptz,
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint ai_model_registry_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint ai_model_registry_approver_fk foreign key (approved_by) references public.user_accounts (id) on delete restrict,
  constraint ai_model_registry_certifier_fk foreign key (certified_by) references public.user_accounts (id) on delete restrict,
  constraint ai_model_registry_tenant_id_uq unique (tenant_id, id),
  constraint ai_model_registry_route_revision_uq unique (tenant_id, route_key, model_revision),
  constraint ai_model_registry_key_ck check (route_key ~ '^[a-z][a-z0-9._:-]{2,127}$'),
  constraint ai_model_registry_purpose_ck check (purpose in ('CHAT', 'EMBEDDING', 'ROUTING')),
  constraint ai_model_registry_provider_ck check (provider_kind in ('OPENROUTER', 'CUSTOM')),
  constraint ai_model_registry_state_ck check (state in ('DRAFT', 'UNIT_APPROVED', 'CERTIFIED', 'RETIRED')),
  constraint ai_model_registry_privacy_ck check (privacy_profile in ('PUBLIC_SAFE', 'CONFIDENTIAL_REDACTED')),
  constraint ai_model_registry_endpoint_ck check (endpoint ~ '^https://'),
  constraint ai_model_registry_env_ck check (api_key_env ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  constraint ai_model_registry_dimension_ck check (embedding_dimension is null or embedding_dimension > 0),
  constraint ai_model_registry_supported_ck check (jsonb_typeof(supported_parameters) = 'object'),
  constraint ai_model_registry_config_ck check (jsonb_typeof(config_json) = 'object'),
  constraint ai_model_registry_hash_ck check (config_hash ~ '^[a-f0-9]{64}$'),
  constraint ai_model_registry_approval_ck check (
    state = 'DRAFT' or (approved_by is not null and approved_at is not null)
  ),
  constraint ai_model_registry_certification_ck check (
    state <> 'CERTIFIED' or (certified_by is not null and certified_at is not null)
  ),
  constraint ai_model_registry_window_ck check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint ai_model_registry_row_version_ck check (row_version > 0)
);

create unique index if not exists ai_model_registry_route_active_uq
  on public.ai_model_registry (tenant_id, route_key)
  where state in ('UNIT_APPROVED', 'CERTIFIED');
create index if not exists ai_model_registry_lookup_idx
  on public.ai_model_registry (tenant_id, purpose, state, effective_until, updated_at desc);

alter table public.ai_model_registry enable row level security;
alter table public.ai_model_registry force row level security;

do $$
begin
  drop trigger if exists ai_model_registry_touch_updated_at on public.ai_model_registry;
  create trigger ai_model_registry_touch_updated_at before update on public.ai_model_registry
    for each row execute function private.touch_mutable_row();
end;
$$;

create or replace function private.guard_ai_model_registry_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and old.state in ('UNIT_APPROVED', 'CERTIFIED', 'RETIRED') then
    if new.provider_id <> old.provider_id or new.model_id <> old.model_id or new.model_revision <> old.model_revision
       or new.endpoint <> old.endpoint or new.config_hash <> old.config_hash or new.config_json <> old.config_json
       or new.supported_parameters <> old.supported_parameters or new.api_key_env <> old.api_key_env then
      raise exception using errcode = '55000', message = 'approved AI model route configuration is immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_model_registry_state_guard on public.ai_model_registry;
create trigger ai_model_registry_state_guard before insert or update on public.ai_model_registry
  for each row execute function private.guard_ai_model_registry_state();

drop policy if exists ai_model_registry_read_approved on public.ai_model_registry;
create policy ai_model_registry_read_approved on public.ai_model_registry
  for select to authenticated
  using (
    state in ('UNIT_APPROVED', 'CERTIFIED')
    and (effective_from is null or effective_from <= statement_timestamp())
    and (effective_until is null or effective_until > statement_timestamp())
    and (select private.can_read_tenant(tenant_id))
  );

grant select on table public.ai_model_registry to authenticated;
revoke insert, update, delete, truncate on table public.ai_model_registry from authenticated;

create or replace function private.approve_ai_model_route(
  p_tenant_id uuid,
  p_route_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.ai_model_registry%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'knowledge.manage.tenant') then
    raise exception using errcode = '42501', message = 'AI model route approval permission denied';
  end if;
  select * into target from public.ai_model_registry where tenant_id = p_tenant_id and id = p_route_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'AI model route not found'; end if;
  if target.state <> 'DRAFT' then raise exception using errcode = '55000', message = 'only draft AI model route can be approved'; end if;
  update public.ai_model_registry set state = 'UNIT_APPROVED', approved_by = p_actor_account_id, approved_at = statement_timestamp()
   where tenant_id = p_tenant_id and id = p_route_id;
  return p_route_id;
end;
$$;

create or replace function private.retire_ai_model_route(
  p_tenant_id uuid,
  p_route_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.ai_model_registry%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'knowledge.manage.tenant') then
    raise exception using errcode = '42501', message = 'AI model route retirement permission denied';
  end if;
  select * into target from public.ai_model_registry where tenant_id = p_tenant_id and id = p_route_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'AI model route not found'; end if;
  if target.state not in ('UNIT_APPROVED', 'CERTIFIED') then raise exception using errcode = '55000', message = 'only approved AI model route can be retired'; end if;
  update public.ai_model_registry set state = 'RETIRED', effective_until = coalesce(effective_until, statement_timestamp())
   where tenant_id = p_tenant_id and id = p_route_id;
  return p_route_id;
end;
$$;

grant execute on function private.approve_ai_model_route(uuid, uuid, uuid) to authenticated;
grant execute on function private.retire_ai_model_route(uuid, uuid, uuid) to authenticated;

comment on table public.ai_model_registry is 'Tenant-scoped provider/model route registry; credentials are external environment references only.';
comment on column public.ai_model_registry.api_key_env is 'Environment variable name, never a provider secret or token.';
