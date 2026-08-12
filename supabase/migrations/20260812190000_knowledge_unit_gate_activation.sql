-- Machine-only knowledge activation hardening.
-- Requirements: RF-07, RF-10, RF-13, RF-17, SPEC-AUTO-001
-- Human/reviewer columns remain advisory/history metadata; activation is
-- allowed only from a complete SYSTEM_UNIT_GATE receipt.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

alter table public.knowledge_document_versions
  add column if not exists activation_status text not null default 'UNIT_GATE_PENDING',
  add column if not exists activated_by text,
  add column if not exists unit_gate_manifest_version text,
  add column if not exists unit_gate_report_hash text,
  add column if not exists unit_gate_passed_test_ids jsonb not null default '[]'::jsonb;

update public.knowledge_document_versions
   set activation_status = case when state = 'ACTIVE' then 'ACTIVE' when state = 'RETIRED' then 'RETIRED' else 'UNIT_GATE_PENDING' end
 where activation_status is null;

alter table public.knowledge_document_versions
  drop constraint if exists knowledge_versions_activation_status_ck;
alter table public.knowledge_document_versions
  add constraint knowledge_versions_activation_status_ck check (activation_status in ('UNIT_GATE_PENDING', 'UNIT_GATED', 'ACTIVE', 'RETIRED'));
alter table public.knowledge_document_versions
  drop constraint if exists knowledge_versions_activated_by_ck;
alter table public.knowledge_document_versions
  add constraint knowledge_versions_activated_by_ck check (activated_by is null or activated_by = 'SYSTEM_UNIT_GATE');
alter table public.knowledge_document_versions
  drop constraint if exists knowledge_versions_unit_gate_hash_ck;
alter table public.knowledge_document_versions
  add constraint knowledge_versions_unit_gate_hash_ck check (unit_gate_report_hash is null or unit_gate_report_hash ~ '^sha256:[a-f0-9]{64}$');
alter table public.knowledge_document_versions
  drop constraint if exists knowledge_versions_unit_gate_tests_ck;
alter table public.knowledge_document_versions
  add constraint knowledge_versions_unit_gate_tests_ck check (jsonb_typeof(unit_gate_passed_test_ids) = 'array');
alter table public.knowledge_document_versions
  drop constraint if exists knowledge_versions_unit_activation_ck;
alter table public.knowledge_document_versions
  add constraint knowledge_versions_unit_activation_ck check (
    activation_status <> 'UNIT_GATED'
    or (state = 'ACTIVE' and activated_by = 'SYSTEM_UNIT_GATE' and unit_gate_manifest_version is not null and unit_gate_report_hash is not null and jsonb_array_length(unit_gate_passed_test_ids) > 0)
  );

-- ACTIVE is still protected by a database invariant.  The machine-only path
-- is the second valid proof: a complete SYSTEM_UNIT_GATE receipt.  Legacy
-- APPROVED rows remain valid for backwards-compatible rollback/audit history,
-- but a human approval is not required for the new path.
alter table public.knowledge_document_versions
  drop constraint if exists knowledge_versions_active_approval_ck;
alter table public.knowledge_document_versions
  add constraint knowledge_versions_active_approval_ck check (
    state <> 'ACTIVE'
    or (
      (approval_status = 'APPROVED' and approved_by is not null and approved_at is not null)
      or (
        activation_status = 'UNIT_GATED'
        and activated_by = 'SYSTEM_UNIT_GATE'
        and unit_gate_report_hash is not null
        and jsonb_array_length(unit_gate_passed_test_ids) > 0
      )
    )
  );

create index if not exists knowledge_versions_unit_gate_idx
  on public.knowledge_document_versions (tenant_id, activation_status, unit_gate_report_hash);

comment on column public.knowledge_document_versions.activation_status is 'Machine-only activation state; UNIT_GATED is written by SYSTEM_UNIT_GATE.';
comment on column public.knowledge_document_versions.activated_by is 'SYSTEM_UNIT_GATE only; reviewer columns are advisory/history metadata.';
comment on column public.knowledge_document_versions.unit_gate_report_hash is 'Immutable unit-gate receipt hash required for activation traceability.';

-- Extend the existing state machine with the autonomous EVALUATING -> ACTIVE
-- transition.  The setting is only raised inside the security-definer
-- function below, so direct table writes remain rejected.
create or replace function private.guard_knowledge_version_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' and new.state <> 'QUARANTINED' then
    raise exception using errcode = '23514', message = 'knowledge uploads must start in QUARANTINED';
  end if;
  if tg_op = 'UPDATE' then
    if old.tenant_id <> new.tenant_id
       or old.document_id <> new.document_id
       or old.version <> new.version
       or old.title <> new.title
       or old.original_filename <> new.original_filename
       or old.mime_type <> new.mime_type
       or old.checksum_sha256 <> new.checksum_sha256
       or old.source_object_key <> new.source_object_key
       or old.owner_department_id <> new.owner_department_id
       or old.knowledge_category_id <> new.knowledge_category_id
       or old.visibility <> new.visibility
       or old.authority_level <> new.authority_level
       or old.effective_from is distinct from new.effective_from
       or old.effective_until is distinct from new.effective_until
       or old.effective_date_unknown <> new.effective_date_unknown
       or old.supersedes_version_id is distinct from new.supersedes_version_id then
      raise exception using errcode = '55000', message = 'knowledge document versions are immutable after upload';
    end if;
    if old.state in ('APPROVED', 'ACTIVE', 'RETIRED') and (
      old.approved_by is distinct from new.approved_by
      or old.approved_at is distinct from new.approved_at
      or old.review_due_at is distinct from new.review_due_at
      or old.parser_name is distinct from new.parser_name
      or old.parser_version is distinct from new.parser_version
      or old.extraction_quality_score is distinct from new.extraction_quality_score
      or old.extraction_warnings is distinct from new.extraction_warnings
    ) then
      raise exception using errcode = '55000', message = 'published knowledge version metadata is immutable';
    end if;
    if old.state <> new.state and not (
      (old.state = 'QUARANTINED' and new.state in ('VALIDATING', 'FAILED'))
      or (old.state = 'VALIDATING' and new.state in ('MALWARE_SCANNING', 'QUARANTINED', 'FAILED'))
      or (old.state = 'MALWARE_SCANNING' and new.state in ('PARSING', 'QUARANTINED', 'FAILED'))
      or (old.state = 'PARSING' and new.state in ('NORMALIZING', 'FAILED'))
      or (old.state = 'NORMALIZING' and new.state in ('EXTRACTING_FACTS', 'FAILED'))
      or (old.state = 'EXTRACTING_FACTS' and new.state in ('NEEDS_REVIEW', 'CONFLICT_CHECK', 'FAILED'))
      or (old.state = 'NEEDS_REVIEW' and new.state in ('CONFLICT_CHECK', 'FAILED'))
      or (old.state = 'CONFLICT_CHECK' and new.state in ('INDEXING', 'EVALUATING', 'FAILED'))
      or (old.state = 'INDEXING' and new.state in ('EVALUATING', 'FAILED'))
      or (old.state = 'EVALUATING' and new.state in ('APPROVED', 'FAILED'))
      or (old.state = 'EVALUATING' and new.state = 'ACTIVE'
          and coalesce(current_setting('citychatbot.knowledge_unit_gate', true), '') = 'atomic')
      or (old.state = 'APPROVED' and new.state in ('ACTIVE', 'FAILED'))
      or (old.state = 'ACTIVE' and new.state = 'RETIRED')
      or (old.state = 'FAILED' and new.state = 'QUARANTINED')
      or (old.state = 'RETIRED' and new.state = 'ACTIVE'
          and coalesce(current_setting('citychatbot.knowledge_rollback', true), '') = 'atomic')
    ) then
      raise exception using errcode = '55000', message = 'invalid knowledge ingestion state transition';
    end if;
    if new.state = 'ACTIVE' and not (
      (old.state = 'APPROVED' and coalesce(current_setting('citychatbot.knowledge_activation', true), '') = 'atomic')
      or (old.state = 'EVALUATING' and coalesce(current_setting('citychatbot.knowledge_unit_gate', true), '') = 'atomic')
      or (old.state = 'RETIRED' and coalesce(current_setting('citychatbot.knowledge_rollback', true), '') = 'atomic')
    ) then
      raise exception using errcode = '55000', message = 'ACTIVE requires atomic publish';
    end if;
    if old.state = 'ACTIVE' and new.state <> 'RETIRED' then
      raise exception using errcode = '55000', message = 'ACTIVE can only transition to RETIRED';
    end if;
    if old.state = 'RETIRED' and new.state <> 'RETIRED'
       and not (new.state = 'ACTIVE' and coalesce(current_setting('citychatbot.knowledge_rollback', true), '') = 'atomic') then
      raise exception using errcode = '55000', message = 'RETIRED versions are terminal';
    end if;
    if old.state = 'FAILED' and new.state <> 'QUARANTINED' then
      raise exception using errcode = '55000', message = 'FAILED versions must be quarantined before retry';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.activate_knowledge_document_version_unit_gated(
  p_tenant_id uuid,
  p_document_version_id uuid,
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
  target public.knowledge_document_versions%rowtype;
  previous public.knowledge_document_versions%rowtype;
  document public.knowledge_documents%rowtype;
begin
  if p_tenant_id is null or p_document_version_id is null or p_manifest_version is null
     or p_manifest_version = '' or p_report_hash !~ '^sha256:[a-f0-9]{64}$'
     or jsonb_typeof(p_passed_test_ids) <> 'array' or jsonb_array_length(p_passed_test_ids) = 0 then
    raise exception using errcode = '22023', message = 'invalid unit gate receipt';
  end if;
  select * into target from public.knowledge_document_versions
   where tenant_id = p_tenant_id and id = p_document_version_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'knowledge version not found'; end if;
  if target.state <> 'EVALUATING' then raise exception using errcode = '55000', message = 'only evaluated version can pass unit gate'; end if;
  if target.extraction_quality_score is null then raise exception using errcode = '55000', message = 'extraction quality is missing'; end if;
  if target.review_due_at <= statement_timestamp() then raise exception using errcode = '55000', message = 'knowledge review due date has passed'; end if;
  if target.effective_from is not null and target.effective_from > statement_timestamp() then raise exception using errcode = '55000', message = 'knowledge version is not effective yet'; end if;
  if target.effective_until is not null and target.effective_until <= statement_timestamp() then raise exception using errcode = '55000', message = 'knowledge version is expired'; end if;

  select * into document from public.knowledge_documents
   where tenant_id = p_tenant_id and id = target.document_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'knowledge document not found'; end if;
  if document.current_active_version_id is not null and document.current_active_version_id <> target.id then
    select * into previous from public.knowledge_document_versions
     where tenant_id = p_tenant_id and id = document.current_active_version_id for update;
    if found then
      update public.knowledge_document_versions
         set state = 'RETIRED', activation_status = 'RETIRED', retired_at = statement_timestamp()
       where tenant_id = p_tenant_id and id = previous.id;
    end if;
  end if;
  perform set_config('citychatbot.knowledge_unit_gate', 'atomic', true);
  update public.knowledge_document_versions
     set state = 'ACTIVE', activation_status = 'UNIT_GATED', activated_by = 'SYSTEM_UNIT_GATE',
         unit_gate_manifest_version = p_manifest_version, unit_gate_report_hash = p_report_hash,
         unit_gate_passed_test_ids = p_passed_test_ids, active_at = coalesce(active_at, statement_timestamp()), retired_at = null
   where tenant_id = p_tenant_id and id = target.id;
  update public.knowledge_documents
     set current_active_version_id = target.id, status = 'ACTIVE'
   where tenant_id = p_tenant_id and id = document.id;
  return target.id;
end;
$$;

revoke all on function private.activate_knowledge_document_version_unit_gated(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'citychatbot_app') then
    grant usage on schema private to citychatbot_app;
    grant execute on function private.activate_knowledge_document_version_unit_gated(uuid, uuid, text, text, jsonb) to citychatbot_app;
  end if;
end;
$$;

comment on function private.activate_knowledge_document_version_unit_gated(uuid, uuid, text, text, jsonb) is 'Machine-only atomic activation from EVALUATING using a complete SYSTEM_UNIT_GATE receipt; no human approval dependency.';
