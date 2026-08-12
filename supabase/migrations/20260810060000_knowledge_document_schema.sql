-- Requirements: RF-07, RF-10, RF-13, RF-17
-- P4-DOC-001: document governance, immutable versions, ingestion runs and
-- retrieval-safe chunks. Uploads are always quarantined; activation is only
-- available through the audited atomic publish function below.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.knowledge_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  display_name text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint knowledge_categories_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint knowledge_categories_tenant_id_uq unique (tenant_id, id),
  constraint knowledge_categories_code_uq unique (tenant_id, code),
  constraint knowledge_categories_code_ck check (code ~ '^[A-Z][A-Z0-9_-]{1,63}$'),
  constraint knowledge_categories_name_ck check (length(btrim(display_name)) between 1 and 200),
  constraint knowledge_categories_status_ck check (status in ('ACTIVE', 'INACTIVE')),
  constraint knowledge_categories_row_version_ck check (row_version > 0)
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  source_key text not null,
  title text not null,
  owner_department_id uuid not null,
  knowledge_category_id uuid not null,
  status text not null default 'ACTIVE',
  current_active_version_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint knowledge_documents_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint knowledge_documents_owner_department_fk foreign key (tenant_id, owner_department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint knowledge_documents_category_fk foreign key (tenant_id, knowledge_category_id)
    references public.knowledge_categories (tenant_id, id) on delete restrict,
  constraint knowledge_documents_tenant_id_uq unique (tenant_id, id),
  constraint knowledge_documents_source_key_uq unique (tenant_id, source_key),
  constraint knowledge_documents_source_key_ck check (source_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,254}$'),
  constraint knowledge_documents_title_ck check (length(btrim(title)) between 1 and 500),
  constraint knowledge_documents_status_ck check (status in ('ACTIVE', 'RETIRED')),
  constraint knowledge_documents_row_version_ck check (row_version > 0)
);

create table if not exists public.knowledge_document_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  document_id uuid not null,
  version integer not null,
  title text not null,
  original_filename text not null,
  mime_type text not null,
  checksum_sha256 text not null,
  source_object_key text not null,
  owner_department_id uuid not null,
  knowledge_category_id uuid not null,
  visibility text not null,
  authority_level smallint not null,
  document_number text,
  issued_at timestamptz,
  effective_from timestamptz,
  effective_until timestamptz,
  effective_date_unknown boolean not null default false,
  supersedes_version_id uuid,
  state text not null default 'QUARANTINED',
  approval_status text not null default 'PENDING',
  approved_by uuid,
  approved_at timestamptz,
  review_due_at timestamptz not null,
  parser_name text,
  parser_version text,
  extraction_quality_score numeric(5,4),
  extraction_warnings jsonb not null default '[]'::jsonb,
  failure_code text,
  failure_detail_redacted text,
  active_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint knowledge_versions_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint knowledge_versions_document_fk foreign key (tenant_id, document_id)
    references public.knowledge_documents (tenant_id, id) on delete restrict,
  constraint knowledge_versions_owner_department_fk foreign key (tenant_id, owner_department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint knowledge_versions_category_fk foreign key (tenant_id, knowledge_category_id)
    references public.knowledge_categories (tenant_id, id) on delete restrict,
  constraint knowledge_versions_supersedes_fk foreign key (tenant_id, supersedes_version_id)
    references public.knowledge_document_versions (tenant_id, id) on delete restrict,
  constraint knowledge_versions_approved_by_fk foreign key (approved_by) references public.user_accounts (id) on delete restrict,
  constraint knowledge_versions_tenant_id_uq unique (tenant_id, id),
  constraint knowledge_versions_version_uq unique (tenant_id, document_id, version),
  constraint knowledge_versions_checksum_uq unique (tenant_id, checksum_sha256),
  constraint knowledge_versions_version_ck check (version > 0),
  constraint knowledge_versions_filename_ck check (length(btrim(original_filename)) between 1 and 255),
  constraint knowledge_versions_mime_ck check (length(btrim(mime_type)) between 3 and 255),
  constraint knowledge_versions_checksum_ck check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  constraint knowledge_versions_object_key_ck check (length(btrim(source_object_key)) between 1 and 500 and source_object_key not like '%..%'),
  constraint knowledge_versions_visibility_ck check (visibility in ('PUBLIC', 'INTERNAL', 'RESTRICTED')),
  constraint knowledge_versions_authority_ck check (authority_level between 0 and 100),
  constraint knowledge_versions_state_ck check (state in (
    'QUARANTINED', 'VALIDATING', 'MALWARE_SCANNING', 'PARSING', 'NORMALIZING',
    'EXTRACTING_FACTS', 'NEEDS_REVIEW', 'CONFLICT_CHECK', 'INDEXING', 'EVALUATING',
    'APPROVED', 'ACTIVE', 'FAILED', 'RETIRED'
  )),
  constraint knowledge_versions_approval_ck check (approval_status in ('PENDING', 'APPROVED', 'REJECTED')),
  constraint knowledge_versions_window_ck check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint knowledge_versions_unknown_date_ck check (not effective_date_unknown or (effective_from is null and effective_until is null)),
  constraint knowledge_versions_quality_ck check (extraction_quality_score is null or extraction_quality_score between 0 and 1),
  constraint knowledge_versions_warnings_ck check (jsonb_typeof(extraction_warnings) = 'array'),
  constraint knowledge_versions_active_approval_ck check (state <> 'ACTIVE' or (approval_status = 'APPROVED' and approved_by is not null and approved_at is not null)),
  constraint knowledge_versions_active_timestamp_ck check (state <> 'ACTIVE' or active_at is not null),
  constraint knowledge_versions_row_version_ck check (row_version > 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.knowledge_documents'::regclass
       and conname = 'knowledge_documents_current_version_fk'
  ) then
    alter table public.knowledge_documents
      add constraint knowledge_documents_current_version_fk foreign key (tenant_id, current_active_version_id)
      references public.knowledge_document_versions (tenant_id, id) on delete restrict;
  end if;
end;
$$;

create table if not exists public.knowledge_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  document_version_id uuid not null,
  artifact_type text not null,
  artifact_version integer not null default 1,
  parser_name text not null,
  parser_version text not null,
  artifact_hash text not null,
  content_json jsonb not null,
  extraction_warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint knowledge_artifacts_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint knowledge_artifacts_version_fk foreign key (tenant_id, document_version_id)
    references public.knowledge_document_versions (tenant_id, id) on delete restrict,
  constraint knowledge_artifacts_tenant_id_uq unique (tenant_id, id),
  constraint knowledge_artifacts_version_type_uq unique (tenant_id, document_version_id, artifact_type, artifact_version),
  constraint knowledge_artifacts_type_ck check (artifact_type ~ '^[A-Z][A-Z0-9_.-]{2,63}$'),
  constraint knowledge_artifacts_version_ck check (artifact_version > 0),
  constraint knowledge_artifacts_hash_ck check (length(btrim(artifact_hash)) between 8 and 255),
  constraint knowledge_artifacts_content_ck check (jsonb_typeof(content_json) = 'object'),
  constraint knowledge_artifacts_warnings_ck check (jsonb_typeof(extraction_warnings) = 'array')
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  document_version_id uuid not null,
  parent_chunk_id uuid,
  chunk_type text not null,
  chunk_index integer not null,
  display_text text not null,
  search_text text not null,
  entity_keys jsonb not null default '[]'::jsonb,
  topic_keys jsonb not null default '[]'::jsonb,
  fact_types jsonb not null default '[]'::jsonb,
  visibility text not null,
  authority_level smallint not null,
  valid_from timestamptz,
  valid_until timestamptz,
  source_locator_json jsonb not null,
  source_hash text not null,
  token_count integer not null,
  language text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint knowledge_chunks_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint knowledge_chunks_version_fk foreign key (tenant_id, document_version_id)
    references public.knowledge_document_versions (tenant_id, id) on delete restrict,
  constraint knowledge_chunks_parent_fk foreign key (tenant_id, parent_chunk_id)
    references public.knowledge_chunks (tenant_id, id) on delete restrict,
  constraint knowledge_chunks_tenant_id_uq unique (tenant_id, id),
  constraint knowledge_chunks_version_index_uq unique (tenant_id, document_version_id, chunk_index),
  constraint knowledge_chunks_type_ck check (chunk_type in ('DOCUMENT_SUMMARY', 'SECTION_PARENT', 'ATOMIC_FAQ', 'ATOMIC_FACT_GROUP', 'TABLE_ROW', 'PROCEDURE_BLOCK', 'CONTACT_BLOCK')),
  constraint knowledge_chunks_index_ck check (chunk_index >= 0),
  constraint knowledge_chunks_text_ck check (length(btrim(display_text)) > 0 and length(btrim(search_text)) > 0),
  constraint knowledge_chunks_keys_ck check (jsonb_typeof(entity_keys) = 'array' and jsonb_typeof(topic_keys) = 'array' and jsonb_typeof(fact_types) = 'array'),
  constraint knowledge_chunks_visibility_ck check (visibility in ('PUBLIC', 'INTERNAL', 'RESTRICTED')),
  constraint knowledge_chunks_authority_ck check (authority_level between 0 and 100),
  constraint knowledge_chunks_window_ck check (valid_until is null or valid_from is null or valid_until > valid_from),
  constraint knowledge_chunks_locator_ck check (jsonb_typeof(source_locator_json) = 'object'),
  constraint knowledge_chunks_hash_ck check (length(btrim(source_hash)) between 8 and 255),
  constraint knowledge_chunks_token_ck check (token_count between 0 and 700),
  constraint knowledge_chunks_language_ck check (language in ('th', 'en', 'mixed'))
);

create table if not exists public.knowledge_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  document_version_id uuid not null,
  decision text not null,
  reviewer_account_id uuid not null,
  reason text not null,
  effective_date_confirmed boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  constraint knowledge_approvals_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint knowledge_approvals_version_fk foreign key (tenant_id, document_version_id)
    references public.knowledge_document_versions (tenant_id, id) on delete restrict,
  constraint knowledge_approvals_reviewer_fk foreign key (reviewer_account_id) references public.user_accounts (id) on delete restrict,
  constraint knowledge_approvals_tenant_id_uq unique (tenant_id, id),
  constraint knowledge_approvals_decision_ck check (decision in ('APPROVED', 'REJECTED', 'NEEDS_CHANGES')),
  constraint knowledge_approvals_reason_ck check (length(btrim(reason)) between 3 and 2000)
);

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  document_version_id uuid not null,
  job_id uuid,
  idempotency_key text not null,
  dedupe_key text not null,
  stage text not null default 'QUARANTINED',
  status text not null default 'QUEUED',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default statement_timestamp(),
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  error_code text,
  error_detail_redacted text,
  created_at timestamptz not null default statement_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint ingestion_runs_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint ingestion_runs_version_fk foreign key (tenant_id, document_version_id)
    references public.knowledge_document_versions (tenant_id, id) on delete restrict,
  constraint ingestion_runs_job_fk foreign key (tenant_id, job_id)
    references public.jobs (tenant_id, id) on delete restrict,
  constraint ingestion_runs_tenant_id_uq unique (tenant_id, id),
  constraint ingestion_runs_idempotency_uq unique (tenant_id, document_version_id, idempotency_key),
  constraint ingestion_runs_dedupe_uq unique (tenant_id, dedupe_key),
  constraint ingestion_runs_stage_ck check (stage in (
    'QUARANTINED', 'VALIDATING', 'MALWARE_SCANNING', 'PARSING', 'NORMALIZING',
    'EXTRACTING_FACTS', 'NEEDS_REVIEW', 'CONFLICT_CHECK', 'INDEXING', 'EVALUATING',
    'APPROVED', 'ACTIVE', 'FAILED', 'RETIRED'
  )),
  constraint ingestion_runs_status_ck check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'RETRY_WAIT', 'DEAD', 'CANCELLED')),
  constraint ingestion_runs_attempt_ck check (attempt_count >= 0 and attempt_count <= max_attempts),
  constraint ingestion_runs_max_attempts_ck check (max_attempts between 1 and 100),
  constraint ingestion_runs_lease_ck check (lease_expires_at is null or lease_owner is not null),
  constraint ingestion_runs_completion_ck check (completed_at is null or status in ('SUCCEEDED', 'DEAD', 'CANCELLED')),
  constraint ingestion_runs_row_version_ck check (row_version > 0)
);

create unique index if not exists knowledge_versions_active_uq
  on public.knowledge_document_versions (tenant_id, document_id)
  where state = 'ACTIVE';
create index if not exists knowledge_versions_retrieval_idx
  on public.knowledge_document_versions (tenant_id, state, visibility, effective_from, effective_until, document_id);
create index if not exists knowledge_versions_department_idx
  on public.knowledge_document_versions (tenant_id, owner_department_id, state, effective_until);
create index if not exists knowledge_chunks_retrieval_idx
  on public.knowledge_chunks (tenant_id, document_version_id, visibility, chunk_index);
create index if not exists knowledge_artifacts_version_idx
  on public.knowledge_artifacts (tenant_id, document_version_id, created_at desc);
create index if not exists ingestion_runs_claim_idx
  on public.ingestion_runs (tenant_id, status, next_attempt_at, id);
create index if not exists ingestion_runs_lease_idx
  on public.ingestion_runs (tenant_id, lease_expires_at)
  where status = 'RUNNING';

create or replace function private.reject_knowledge_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000', message = 'knowledge artifact/chunk/approval records are append-only';
end;
$$;

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
      or (old.state = 'RETIRED' and coalesce(current_setting('citychatbot.knowledge_rollback', true), '') = 'atomic')
    ) then
      raise exception using errcode = '55000', message = 'ACTIVE requires atomic approved publish';
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

drop trigger if exists knowledge_versions_mutation_guard on public.knowledge_document_versions;
create trigger knowledge_versions_mutation_guard
  before insert or update on public.knowledge_document_versions
  for each row execute function private.guard_knowledge_version_mutation();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'knowledge_categories', 'knowledge_documents', 'knowledge_document_versions', 'knowledge_artifacts',
    'knowledge_chunks', 'knowledge_approvals', 'ingestion_runs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['knowledge_categories', 'knowledge_documents', 'knowledge_document_versions', 'ingestion_runs'] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function private.touch_mutable_row()',
      table_name, table_name
    );
  end loop;
end;
$$;

drop trigger if exists knowledge_artifacts_append_only on public.knowledge_artifacts;
create trigger knowledge_artifacts_append_only before update or delete on public.knowledge_artifacts
  for each row execute function private.reject_knowledge_append_only();
drop trigger if exists knowledge_chunks_append_only on public.knowledge_chunks;
create trigger knowledge_chunks_append_only before update or delete on public.knowledge_chunks
  for each row execute function private.reject_knowledge_append_only();
drop trigger if exists knowledge_approvals_append_only on public.knowledge_approvals;
create trigger knowledge_approvals_append_only before update or delete on public.knowledge_approvals
  for each row execute function private.reject_knowledge_append_only();

create or replace function private.approve_knowledge_document_version(
  p_tenant_id uuid,
  p_document_version_id uuid,
  p_reviewer_account_id uuid,
  p_reason text,
  p_confirm_unknown_effective_date boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.knowledge_document_versions%rowtype;
begin
  if p_reviewer_account_id is null
     or p_reviewer_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'knowledge.manage.tenant') then
    raise exception using errcode = '42501', message = 'knowledge approval permission denied';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 or length(btrim(p_reason)) > 2000 then
    raise exception using errcode = '22023', message = 'approval reason is invalid';
  end if;
  select * into target
    from public.knowledge_document_versions
   where tenant_id = p_tenant_id and id = p_document_version_id
   for update;
  if not found then raise exception using errcode = 'P0002', message = 'knowledge version not found'; end if;
  if target.state <> 'EVALUATING' then
    raise exception using errcode = '55000', message = 'only an evaluated version can be approved';
  end if;
  if target.extraction_quality_score is null then
    raise exception using errcode = '55000', message = 'extraction quality is missing';
  end if;
  if target.review_due_at <= statement_timestamp() then
    raise exception using errcode = '55000', message = 'knowledge review due date has passed';
  end if;
  if target.effective_date_unknown and not p_confirm_unknown_effective_date then
    raise exception using errcode = '55000', message = 'unknown effective date requires explicit approval';
  end if;

  insert into public.knowledge_approvals (
    tenant_id, document_version_id, decision, reviewer_account_id, reason, effective_date_confirmed
  ) values (
    p_tenant_id, target.id, 'APPROVED', p_reviewer_account_id, btrim(p_reason), p_confirm_unknown_effective_date
  );
  update public.knowledge_document_versions
     set state = 'APPROVED', approval_status = 'APPROVED', approved_by = p_reviewer_account_id, approved_at = statement_timestamp()
   where tenant_id = p_tenant_id and id = target.id;
  return target.id;
end;
$$;

create or replace function private.activate_knowledge_document_version(
  p_tenant_id uuid,
  p_document_version_id uuid,
  p_actor_account_id uuid
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
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'knowledge.manage.tenant') then
    raise exception using errcode = '42501', message = 'knowledge activation permission denied';
  end if;

  select * into target
    from public.knowledge_document_versions
   where tenant_id = p_tenant_id and id = p_document_version_id
   for update;
  if not found then raise exception using errcode = 'P0002', message = 'knowledge version not found'; end if;
  if target.state <> 'APPROVED' or target.approval_status <> 'APPROVED' or target.approved_by is null then
    raise exception using errcode = '55000', message = 'only an approved version can be activated';
  end if;
  if target.effective_from is not null and target.effective_from > statement_timestamp() then
    raise exception using errcode = '55000', message = 'knowledge version is not effective yet';
  end if;
  if target.effective_until is not null and target.effective_until <= statement_timestamp() then
    raise exception using errcode = '55000', message = 'knowledge version is expired';
  end if;
  if target.effective_date_unknown and not exists (
    select 1 from public.knowledge_approvals as approval
     where approval.tenant_id = p_tenant_id
       and approval.document_version_id = target.id
       and approval.decision = 'APPROVED'
       and approval.effective_date_confirmed
  ) then
    raise exception using errcode = '55000', message = 'unknown effective date requires explicit approval';
  end if;

  select * into document
    from public.knowledge_documents
   where tenant_id = p_tenant_id and id = target.document_id
   for update;
  if not found then raise exception using errcode = 'P0002', message = 'knowledge document not found'; end if;

  if document.current_active_version_id is not null and document.current_active_version_id <> target.id then
    select * into previous
      from public.knowledge_document_versions
     where tenant_id = p_tenant_id and id = document.current_active_version_id
     for update;
    if found then
      update public.knowledge_document_versions
         set state = 'RETIRED', retired_at = statement_timestamp()
       where tenant_id = p_tenant_id and id = previous.id;
    end if;
  end if;

  perform set_config('citychatbot.knowledge_activation', 'atomic', true);
  update public.knowledge_document_versions
     set state = 'ACTIVE', active_at = coalesce(active_at, statement_timestamp()), retired_at = null
   where tenant_id = p_tenant_id and id = target.id;
  update public.knowledge_documents
     set current_active_version_id = target.id, status = 'ACTIVE'
   where tenant_id = p_tenant_id and id = document.id;
  return target.id;
end;
$$;

create or replace function private.rollback_knowledge_document_version(
  p_tenant_id uuid,
  p_document_version_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.knowledge_document_versions%rowtype;
  document public.knowledge_documents%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'knowledge.manage.tenant') then
    raise exception using errcode = '42501', message = 'knowledge rollback permission denied';
  end if;
  select * into target
    from public.knowledge_document_versions
   where tenant_id = p_tenant_id and id = p_document_version_id
   for update;
  if not found then raise exception using errcode = 'P0002', message = 'knowledge version not found'; end if;
  if target.state <> 'RETIRED' or target.approval_status <> 'APPROVED' or target.approved_by is null then
    raise exception using errcode = '55000', message = 'rollback requires a retained approved version';
  end if;
  if target.effective_from is not null and target.effective_from > statement_timestamp() then
    raise exception using errcode = '55000', message = 'knowledge version is not effective yet';
  end if;
  if target.effective_until is not null and target.effective_until <= statement_timestamp() then
    raise exception using errcode = '55000', message = 'knowledge version is expired';
  end if;
  if target.effective_date_unknown and not exists (
    select 1 from public.knowledge_approvals as approval
     where approval.tenant_id = p_tenant_id
       and approval.document_version_id = target.id
       and approval.decision = 'APPROVED'
       and approval.effective_date_confirmed
  ) then
    raise exception using errcode = '55000', message = 'unknown effective date requires explicit approval';
  end if;
  select * into document
    from public.knowledge_documents
   where tenant_id = p_tenant_id and id = target.document_id
   for update;
  if not found then raise exception using errcode = 'P0002', message = 'knowledge document not found'; end if;
  if document.current_active_version_id is not null and document.current_active_version_id <> target.id then
    update public.knowledge_document_versions
       set state = 'RETIRED', retired_at = statement_timestamp()
     where tenant_id = p_tenant_id and id = document.current_active_version_id;
  end if;
  perform set_config('citychatbot.knowledge_rollback', 'atomic', true);
  update public.knowledge_document_versions
     set state = 'ACTIVE', active_at = statement_timestamp(), retired_at = null
   where tenant_id = p_tenant_id and id = target.id;
  update public.knowledge_documents
     set current_active_version_id = target.id, status = 'ACTIVE'
   where tenant_id = p_tenant_id and id = document.id;
  return target.id;
end;
$$;

drop policy if exists knowledge_categories_read_scoped on public.knowledge_categories;
create policy knowledge_categories_read_scoped on public.knowledge_categories
  for select to authenticated using ((select private.can_read_tenant(tenant_id)));
drop policy if exists knowledge_categories_insert_manage on public.knowledge_categories;
create policy knowledge_categories_insert_manage on public.knowledge_categories
  for insert to authenticated with check ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')));
drop policy if exists knowledge_categories_update_manage on public.knowledge_categories;
create policy knowledge_categories_update_manage on public.knowledge_categories
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')));

drop policy if exists knowledge_documents_read_scoped on public.knowledge_documents;
create policy knowledge_documents_read_scoped on public.knowledge_documents
  for select to authenticated using ((select private.can_read_tenant(tenant_id)));
drop policy if exists knowledge_documents_insert_manage on public.knowledge_documents;
create policy knowledge_documents_insert_manage on public.knowledge_documents
  for insert to authenticated with check ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')));
drop policy if exists knowledge_documents_update_manage on public.knowledge_documents;
create policy knowledge_documents_update_manage on public.knowledge_documents
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')));

drop policy if exists knowledge_versions_read_scoped on public.knowledge_document_versions;
create policy knowledge_versions_read_scoped on public.knowledge_document_versions
  for select to authenticated
  using (
    (select private.can_read_tenant(tenant_id))
    and (
      visibility = 'PUBLIC'
      or (select private.can_read_department(tenant_id, owner_department_id))
    )
  );
drop policy if exists knowledge_versions_insert_quarantine on public.knowledge_document_versions;
create policy knowledge_versions_insert_quarantine on public.knowledge_document_versions
  for insert to authenticated
  with check (
    state = 'QUARANTINED'
    and (select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant'))
  );

drop policy if exists knowledge_artifacts_read_scoped on public.knowledge_artifacts;
create policy knowledge_artifacts_read_scoped on public.knowledge_artifacts
  for select to authenticated using ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')));
drop policy if exists knowledge_chunks_read_scoped on public.knowledge_chunks;
create policy knowledge_chunks_read_scoped on public.knowledge_chunks
  for select to authenticated
  using (
    (select private.can_read_tenant(tenant_id))
    and (
      visibility = 'PUBLIC'
      or exists (
        select 1 from public.knowledge_document_versions as version
         where version.tenant_id = knowledge_chunks.tenant_id
           and version.id = knowledge_chunks.document_version_id
           and (select private.can_read_department(version.tenant_id, version.owner_department_id))
      )
    )
  );
drop policy if exists knowledge_approvals_read_manage on public.knowledge_approvals;
create policy knowledge_approvals_read_manage on public.knowledge_approvals
  for select to authenticated using ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')));
drop policy if exists ingestion_runs_read_manage on public.ingestion_runs;
create policy ingestion_runs_read_manage on public.ingestion_runs
  for select to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')) or (select private.has_tenant_permission(tenant_id, 'job.manage.tenant')));

grant usage on schema private to authenticated;
grant execute on function private.approve_knowledge_document_version(uuid, uuid, uuid, text, boolean) to authenticated;
grant execute on function private.activate_knowledge_document_version(uuid, uuid, uuid) to authenticated;
grant execute on function private.rollback_knowledge_document_version(uuid, uuid, uuid) to authenticated;
grant select on table
  public.knowledge_categories,
  public.knowledge_documents,
  public.knowledge_document_versions,
  public.knowledge_artifacts,
  public.knowledge_chunks,
  public.knowledge_approvals,
  public.ingestion_runs
to authenticated;
grant insert, update on table public.knowledge_categories, public.knowledge_documents to authenticated;
grant insert on table public.knowledge_document_versions to authenticated;
revoke update, delete, truncate on table
  public.knowledge_document_versions,
  public.knowledge_artifacts,
  public.knowledge_chunks,
  public.knowledge_approvals,
  public.ingestion_runs
from authenticated;

revoke all on table
  public.knowledge_categories,
  public.knowledge_documents,
  public.knowledge_document_versions,
  public.knowledge_artifacts,
  public.knowledge_chunks,
  public.knowledge_approvals,
  public.ingestion_runs
from anon;

comment on table public.knowledge_document_versions is 'Immutable document revision; upload always starts QUARANTINED and only approved revisions can be atomically activated.';
comment on table public.knowledge_chunks is 'Immutable source-lineage chunks; retrieval must join ACTIVE version and effective window.';
comment on table public.ingestion_runs is 'Tenant-scoped ingestion execution record; durable job claim/retry uses lease fields and idempotency.';
comment on function private.activate_knowledge_document_version(uuid, uuid, uuid) is 'Atomic approved-version switch; retires previous active revision before publishing the candidate.';
comment on function private.rollback_knowledge_document_version(uuid, uuid, uuid) is 'Audited atomic rollback to a retained approved revision; the normal RETIRED state remains terminal outside this function.';
