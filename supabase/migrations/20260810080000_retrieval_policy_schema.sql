-- Requirements: RF-07, RF-08, RF-17
-- P4-RET-001: versioned retrieval policy values. Runtime retrieval may use a
-- checked-in fail-safe default only until an ACTIVE tenant policy is loaded.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.retrieval_policy_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  policy_key text not null,
  version integer not null,
  state text not null default 'DRAFT',
  policy_hash text not null,
  rrf_k integer not null,
  dense_candidate_k integer not null,
  lexical_candidate_k integer not null,
  rerank_k integer not null,
  evidence_k integer not null,
  context_budget_tokens integer not null,
  max_per_source_hash integer not null,
  max_per_section integer not null,
  max_per_version integer not null,
  min_calibrated_score numeric(5,4) not null,
  lexical_weight numeric(8,6) not null,
  dense_weight numeric(8,6) not null,
  exact_boost numeric(8,6) not null,
  authority_weight numeric(8,6) not null,
  entity_boost numeric(8,6) not null,
  freshness_weight numeric(8,6) not null,
  config_json jsonb not null default '{}'::jsonb,
  effective_from timestamptz,
  effective_until timestamptz,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint retrieval_policy_versions_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint retrieval_policy_versions_creator_fk foreign key (created_by) references public.user_accounts (id) on delete restrict,
  constraint retrieval_policy_versions_approver_fk foreign key (approved_by) references public.user_accounts (id) on delete restrict,
  constraint retrieval_policy_versions_tenant_id_uq unique (tenant_id, id),
  constraint retrieval_policy_versions_key_version_uq unique (tenant_id, policy_key, version),
  constraint retrieval_policy_versions_key_ck check (policy_key ~ '^[a-z][a-z0-9._:-]{2,127}$'),
  constraint retrieval_policy_versions_version_ck check (version > 0),
  constraint retrieval_policy_versions_state_ck check (state in ('DRAFT', 'APPROVED', 'ACTIVE', 'RETIRED')),
  constraint retrieval_policy_versions_hash_ck check (policy_hash ~ '^[a-f0-9]{64}$'),
  constraint retrieval_policy_versions_positive_ck check (
    rrf_k > 0 and dense_candidate_k > 0 and lexical_candidate_k > 0 and rerank_k > 0
    and evidence_k > 0 and evidence_k <= rerank_k and context_budget_tokens > 0
    and max_per_source_hash > 0 and max_per_section > 0 and max_per_version > 0
  ),
  constraint retrieval_policy_versions_score_ck check (min_calibrated_score between 0 and 1),
  constraint retrieval_policy_versions_weight_ck check (
    lexical_weight >= 0 and dense_weight >= 0 and exact_boost >= 0
    and authority_weight >= 0 and entity_boost >= 0 and freshness_weight >= 0
  ),
  constraint retrieval_policy_versions_json_ck check (jsonb_typeof(config_json) = 'object'),
  constraint retrieval_policy_versions_window_ck check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint retrieval_policy_versions_approval_ck check (
    state = 'DRAFT' or (approved_by is not null and approved_at is not null)
  ),
  constraint retrieval_policy_versions_active_ck check (state <> 'ACTIVE' or activated_at is not null),
  constraint retrieval_policy_versions_row_version_ck check (row_version > 0)
);

create unique index if not exists retrieval_policy_versions_active_uq
  on public.retrieval_policy_versions (tenant_id, policy_key)
  where state = 'ACTIVE';
create index if not exists retrieval_policy_versions_lookup_idx
  on public.retrieval_policy_versions (tenant_id, policy_key, state, effective_until, version desc);

alter table public.retrieval_policy_versions enable row level security;
alter table public.retrieval_policy_versions force row level security;

do $$
begin
  drop trigger if exists retrieval_policy_versions_touch_updated_at on public.retrieval_policy_versions;
  create trigger retrieval_policy_versions_touch_updated_at before update on public.retrieval_policy_versions
    for each row execute function private.touch_mutable_row();
end;
$$;

create or replace function private.guard_retrieval_policy_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  activation_mode text := current_setting('citychatbot.retrieval_policy_activation', true);
begin
  if tg_op = 'UPDATE' and old.state in ('ACTIVE', 'RETIRED') then
    if new.policy_hash <> old.policy_hash or new.config_json <> old.config_json
       or new.rrf_k <> old.rrf_k or new.dense_candidate_k <> old.dense_candidate_k
       or new.lexical_candidate_k <> old.lexical_candidate_k or new.rerank_k <> old.rerank_k
       or new.evidence_k <> old.evidence_k or new.context_budget_tokens <> old.context_budget_tokens then
      raise exception using errcode = '55000', message = 'approved retrieval policy configuration is immutable';
    end if;
  end if;
  if new.state = 'ACTIVE' and activation_mode <> 'atomic' then
    raise exception using errcode = '55000', message = 'retrieval policy activation must use atomic function';
  end if;
  return new;
end;
$$;

drop trigger if exists retrieval_policy_versions_state_guard on public.retrieval_policy_versions;
create trigger retrieval_policy_versions_state_guard before insert or update on public.retrieval_policy_versions
  for each row execute function private.guard_retrieval_policy_state();

drop policy if exists retrieval_policy_versions_read_active on public.retrieval_policy_versions;
create policy retrieval_policy_versions_read_active on public.retrieval_policy_versions
  for select to authenticated
  using (
    state = 'ACTIVE'
    and (effective_from is null or effective_from <= statement_timestamp())
    and (effective_until is null or effective_until > statement_timestamp())
    and (select private.can_read_tenant(tenant_id))
  );

grant select on table public.retrieval_policy_versions to authenticated;
revoke insert, update, delete, truncate on table public.retrieval_policy_versions from authenticated;

create or replace function private.approve_retrieval_policy_version(
  p_tenant_id uuid,
  p_policy_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.retrieval_policy_versions%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'knowledge.manage.tenant') then
    raise exception using errcode = '42501', message = 'retrieval policy approval permission denied';
  end if;
  select * into target from public.retrieval_policy_versions
   where tenant_id = p_tenant_id and id = p_policy_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'retrieval policy version not found'; end if;
  if target.state <> 'DRAFT' then raise exception using errcode = '55000', message = 'only draft retrieval policy can be approved'; end if;
  perform set_config('citychatbot.retrieval_policy_activation', 'atomic', true);
  update public.retrieval_policy_versions
     set state = 'APPROVED', approved_by = p_actor_account_id, approved_at = statement_timestamp()
   where tenant_id = p_tenant_id and id = p_policy_id;
  return p_policy_id;
end;
$$;

create or replace function private.activate_retrieval_policy_version(
  p_tenant_id uuid,
  p_policy_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.retrieval_policy_versions%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'knowledge.manage.tenant') then
    raise exception using errcode = '42501', message = 'retrieval policy activation permission denied';
  end if;
  select * into target from public.retrieval_policy_versions
   where tenant_id = p_tenant_id and id = p_policy_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'retrieval policy version not found'; end if;
  if target.state <> 'APPROVED' then raise exception using errcode = '55000', message = 'retrieval policy must be approved before activation'; end if;
  if target.effective_from is not null and target.effective_from > statement_timestamp() then raise exception using errcode = '55000', message = 'retrieval policy effective window has not started'; end if;
  if target.effective_until is not null and target.effective_until <= statement_timestamp() then raise exception using errcode = '55000', message = 'retrieval policy is expired'; end if;
  perform set_config('citychatbot.retrieval_policy_activation', 'atomic', true);
  update public.retrieval_policy_versions
     set state = 'RETIRED', retired_at = statement_timestamp()
   where tenant_id = p_tenant_id and policy_key = target.policy_key and state = 'ACTIVE' and id <> target.id;
  update public.retrieval_policy_versions
     set state = 'ACTIVE', activated_at = statement_timestamp(), retired_at = null
   where tenant_id = p_tenant_id and id = target.id;
  return p_policy_id;
end;
$$;

create or replace function private.rollback_retrieval_policy_version(
  p_tenant_id uuid,
  p_policy_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.retrieval_policy_versions%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'knowledge.manage.tenant') then
    raise exception using errcode = '42501', message = 'retrieval policy rollback permission denied';
  end if;
  select * into target from public.retrieval_policy_versions
   where tenant_id = p_tenant_id and id = p_policy_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'retrieval policy version not found'; end if;
  if target.state <> 'RETIRED' then raise exception using errcode = '55000', message = 'rollback requires a retained retrieval policy'; end if;
  perform set_config('citychatbot.retrieval_policy_activation', 'atomic', true);
  update public.retrieval_policy_versions
     set state = 'RETIRED', retired_at = statement_timestamp()
   where tenant_id = p_tenant_id and policy_key = target.policy_key and state = 'ACTIVE' and id <> target.id;
  update public.retrieval_policy_versions
     set state = 'ACTIVE', activated_at = statement_timestamp(), retired_at = null
   where tenant_id = p_tenant_id and id = target.id;
  return p_policy_id;
end;
$$;

create or replace function private.get_active_retrieval_policy(
  p_tenant_id uuid,
  p_policy_key text default 'default'
)
returns table (
  id uuid,
  tenant_id uuid,
  policy_key text,
  version integer,
  policy_hash text,
  config_json jsonb,
  effective_from timestamptz,
  effective_until timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.can_read_tenant(p_tenant_id) then
    raise exception using errcode = '42501', message = 'retrieval policy tenant access denied';
  end if;
  return query
    select policy.id, policy.tenant_id, policy.policy_key, policy.version, policy.policy_hash,
           policy.config_json, policy.effective_from, policy.effective_until
      from public.retrieval_policy_versions as policy
     where policy.tenant_id = p_tenant_id
       and policy.policy_key = p_policy_key
       and policy.state = 'ACTIVE'
       and (policy.effective_from is null or policy.effective_from <= statement_timestamp())
       and (policy.effective_until is null or policy.effective_until > statement_timestamp());
end;
$$;

grant execute on function private.approve_retrieval_policy_version(uuid, uuid, uuid) to authenticated;
grant execute on function private.activate_retrieval_policy_version(uuid, uuid, uuid) to authenticated;
grant execute on function private.rollback_retrieval_policy_version(uuid, uuid, uuid) to authenticated;
grant execute on function private.get_active_retrieval_policy(uuid, text) to authenticated;

comment on table public.retrieval_policy_versions is 'Versioned tenant retrieval thresholds/config; top-k and score gates are never authoritative constants in runtime code.';
comment on function private.get_active_retrieval_policy(uuid, text) is 'Returns only the tenant-scoped active/effective retrieval policy.';
