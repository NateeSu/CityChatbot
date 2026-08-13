-- Requirements: RAG-CORPUS-008, INV-AUDIT-001, INV-TENANT-001
-- P9-KNOW-001: parallel machine-only receipt for index generation activation.
-- A document version may be activated by SYSTEM_UNIT_GATE without a human
-- approval; its corresponding generation must carry the same auditable proof.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

alter table public.knowledge_index_generations
  add column if not exists activation_status text not null default 'UNIT_GATE_PENDING',
  add column if not exists activated_by text,
  add column if not exists unit_gate_manifest_version text,
  add column if not exists unit_gate_report_hash text,
  add column if not exists unit_gate_passed_test_ids jsonb not null default '[]'::jsonb;

update public.knowledge_index_generations
   set activation_status = case when state = 'ACTIVE' then 'ACTIVE' when state = 'RETIRED' then 'RETIRED' else 'UNIT_GATE_PENDING' end
 where activation_status = 'UNIT_GATE_PENDING'
   and state in ('ACTIVE', 'RETIRED');

alter table public.knowledge_index_generations
  drop constraint if exists knowledge_index_generations_activation_status_ck;
alter table public.knowledge_index_generations
  add constraint knowledge_index_generations_activation_status_ck
    check (activation_status in ('UNIT_GATE_PENDING', 'UNIT_GATED', 'ACTIVE', 'RETIRED'));

alter table public.knowledge_index_generations
  drop constraint if exists knowledge_index_generations_activated_by_ck;
alter table public.knowledge_index_generations
  add constraint knowledge_index_generations_activated_by_ck
    check (activated_by is null or activated_by = 'SYSTEM_UNIT_GATE');

alter table public.knowledge_index_generations
  drop constraint if exists knowledge_index_generations_unit_gate_hash_ck;
alter table public.knowledge_index_generations
  add constraint knowledge_index_generations_unit_gate_hash_ck
    check (unit_gate_report_hash is null or unit_gate_report_hash ~ '^sha256:[a-f0-9]{64}$');

alter table public.knowledge_index_generations
  drop constraint if exists knowledge_index_generations_unit_gate_tests_ck;
alter table public.knowledge_index_generations
  add constraint knowledge_index_generations_unit_gate_tests_ck
    check (jsonb_typeof(unit_gate_passed_test_ids) = 'array');

alter table public.knowledge_index_generations
  drop constraint if exists knowledge_index_generations_unit_gate_activation_ck;
alter table public.knowledge_index_generations
  add constraint knowledge_index_generations_unit_gate_activation_ck check (
    activation_status <> 'UNIT_GATED'
    or (
      state = 'ACTIVE'
      and activated_by = 'SYSTEM_UNIT_GATE'
      and unit_gate_manifest_version is not null
      and unit_gate_report_hash is not null
      and jsonb_array_length(unit_gate_passed_test_ids) > 0
    )
  );

create index if not exists knowledge_index_generations_unit_gate_idx
  on public.knowledge_index_generations (tenant_id, activation_status, unit_gate_report_hash);

create or replace function private.activate_knowledge_index_generation_unit_gated(
  p_tenant_id uuid,
  p_generation_id uuid,
  p_manifest_version text,
  p_report_hash text,
  p_passed_test_ids jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.knowledge_index_generations%rowtype;
begin
  if p_tenant_id is null or p_generation_id is null or p_manifest_version is null
     or p_manifest_version = '' or p_report_hash !~ '^sha256:[a-f0-9]{64}$'
     or jsonb_typeof(p_passed_test_ids) <> 'array' or jsonb_array_length(p_passed_test_ids) = 0 then
    raise exception using errcode = '22023', message = 'invalid index unit gate receipt';
  end if;

  select * into target
    from public.knowledge_index_generations
   where tenant_id = p_tenant_id and id = p_generation_id
   for update;
  if not found then raise exception using errcode = 'P0002', message = 'knowledge index generation not found'; end if;

  if target.state = 'ACTIVE'
     and target.activation_status = 'UNIT_GATED'
     and target.unit_gate_manifest_version = p_manifest_version
     and target.unit_gate_report_hash = p_report_hash
     and target.unit_gate_passed_test_ids = p_passed_test_ids then
    return target.id;
  end if;
  if target.state <> 'READY' then
    raise exception using errcode = '55000', message = 'only a READY index generation can pass the unit gate';
  end if;
  if not exists (
    select 1 from public.knowledge_document_versions as version
     where version.tenant_id = p_tenant_id
       and version.id = target.document_version_id
       and version.state = 'ACTIVE'
       and version.activation_status = 'UNIT_GATED'
  ) then
    raise exception using errcode = '55000', message = 'index activation requires an active unit-gated document version';
  end if;
  if not exists (
    select 1 from public.knowledge_chunks as chunk
     where chunk.tenant_id = p_tenant_id and chunk.index_generation_id = target.id
  ) then
    raise exception using errcode = '55000', message = 'index generation requires at least one chunk';
  end if;
  if exists (
    select 1 from public.knowledge_facts as fact
     where fact.tenant_id = p_tenant_id
       and fact.index_generation_id = target.id
       and fact.review_status <> 'APPROVED'
  ) then
    raise exception using errcode = '55000', message = 'all index facts require unit-gated review before activation';
  end if;

  update public.knowledge_index_generations
     set state = 'RETIRED', activation_status = 'RETIRED', retired_at = statement_timestamp()
   where tenant_id = p_tenant_id
     and document_version_id = target.document_version_id
     and state = 'ACTIVE'
     and id <> target.id;

  update public.knowledge_index_generations
     set state = 'ACTIVE', activation_status = 'UNIT_GATED', activated_by = 'SYSTEM_UNIT_GATE',
         unit_gate_manifest_version = p_manifest_version, unit_gate_report_hash = p_report_hash,
         unit_gate_passed_test_ids = p_passed_test_ids,
         activated_at = coalesce(activated_at, statement_timestamp()), retired_at = null
   where tenant_id = p_tenant_id and id = target.id;
  return target.id;
end;
$$;

revoke all on function private.activate_knowledge_index_generation_unit_gated(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'citychatbot_app') then
    grant usage on schema private to citychatbot_app;
    grant execute on function private.activate_knowledge_index_generation_unit_gated(uuid, uuid, text, text, jsonb) to citychatbot_app;
  end if;
end;
$$;

comment on function private.activate_knowledge_index_generation_unit_gated(uuid, uuid, text, text, jsonb) is
  'Machine-only atomic index activation from READY using a complete SYSTEM_UNIT_GATE receipt; no human approval dependency.';
