-- Requirements: RF-07, RF-09, RF-10, RF-18
-- FAQ candidates are explicit, human-governed knowledge proposals. A public
-- staff reply is only a source after a user selects it; this table never
-- receives an automatic learning event.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.faq_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ticket_id uuid,
  source_message_id uuid,
  source_type text not null,
  source_event_id text,
  retrieval_trace_id text,
  evidence_ids jsonb not null default '[]'::jsonb,
  source_hash text not null,
  question text not null,
  answer text not null,
  department_id uuid not null,
  knowledge_category_id uuid not null,
  visibility text not null,
  effective_from timestamptz,
  effective_until timestamptz,
  effective_date_unknown boolean not null default false,
  privacy_reviewed boolean not null default false,
  duplicate_status text not null default 'CLEAR',
  duplicate_check jsonb not null default '{}'::jsonb,
  canonical_status text not null default 'PENDING_OWNER_REVIEW',
  created_by_account_id uuid not null,
  owner_reviewed_by uuid,
  owner_reviewed_at timestamptz,
  owner_review_reason text,
  coordinator_approved_by uuid,
  coordinator_approved_at timestamptz,
  knowledge_document_id uuid,
  knowledge_document_version_id uuid,
  published_index_snapshot_id text,
  revoked_by uuid,
  revoked_at timestamptz,
  revoked_reason text,
  rejected_by uuid,
  rejected_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version bigint not null default 1,
  constraint faq_candidates_tenant_fk foreign key (tenant_id)
    references public.tenants (id) on delete restrict,
  constraint faq_candidates_ticket_fk foreign key (tenant_id, ticket_id)
    references public.support_tickets (tenant_id, id) on delete restrict,
  constraint faq_candidates_source_message_fk foreign key (tenant_id, source_message_id)
    references public.support_ticket_messages (tenant_id, id) on delete restrict,
  constraint faq_candidates_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id) on delete restrict,
  constraint faq_candidates_category_fk foreign key (tenant_id, knowledge_category_id)
    references public.knowledge_categories (tenant_id, id) on delete restrict,
  constraint faq_candidates_document_fk foreign key (tenant_id, knowledge_document_id)
    references public.knowledge_documents (tenant_id, id) on delete restrict,
  constraint faq_candidates_version_fk foreign key (tenant_id, knowledge_document_version_id)
    references public.knowledge_document_versions (tenant_id, id) on delete restrict,
  constraint faq_candidates_created_by_fk foreign key (created_by_account_id)
    references public.user_accounts (id) on delete restrict,
  constraint faq_candidates_owner_reviewed_by_fk foreign key (owner_reviewed_by)
    references public.user_accounts (id) on delete restrict,
  constraint faq_candidates_coordinator_fk foreign key (coordinator_approved_by)
    references public.user_accounts (id) on delete restrict,
  constraint faq_candidates_revoked_by_fk foreign key (revoked_by)
    references public.user_accounts (id) on delete restrict,
  constraint faq_candidates_rejected_by_fk foreign key (rejected_by)
    references public.user_accounts (id) on delete restrict,
  constraint faq_candidates_tenant_id_uq unique (tenant_id, id),
  constraint faq_candidates_source_type_ck check (source_type in ('TICKET_MESSAGE', 'KNOWLEDGE_DOCUMENT', 'MANUAL')),
  constraint faq_candidates_source_fields_ck check (
    (source_type = 'TICKET_MESSAGE' and ticket_id is not null and source_message_id is not null and source_event_id is not null)
    or (source_type <> 'TICKET_MESSAGE')
  ),
  constraint faq_candidates_source_event_ck check (source_event_id is null or source_event_id ~ '^[A-Za-z0-9._:-]{1,255}$'),
  constraint faq_candidates_trace_ck check (retrieval_trace_id is null or retrieval_trace_id ~ '^[A-Za-z0-9._:-]{1,255}$'),
  constraint faq_candidates_evidence_ck check (jsonb_typeof(evidence_ids) = 'array' and jsonb_array_length(evidence_ids) > 0),
  constraint faq_candidates_hash_ck check (source_hash ~ '^[0-9a-f]{64}$'),
  constraint faq_candidates_question_ck check (length(btrim(question)) between 4 and 4000),
  constraint faq_candidates_answer_ck check (length(btrim(answer)) between 1 and 4000),
  constraint faq_candidates_visibility_ck check (visibility in ('PUBLIC', 'INTERNAL', 'RESTRICTED')),
  constraint faq_candidates_effective_ck check (
    (effective_date_unknown and effective_from is null and effective_until is null)
    or (not effective_date_unknown and (effective_from is not null or effective_until is not null))
  ),
  constraint faq_candidates_dates_ck check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint faq_candidates_duplicate_ck check (duplicate_status in ('CLEAR', 'DUPLICATE', 'CONFLICT') and jsonb_typeof(duplicate_check) = 'object'),
  constraint faq_candidates_status_ck check (canonical_status in (
    'DRAFT', 'PENDING_OWNER_REVIEW', 'PENDING_COORDINATOR_APPROVAL', 'APPROVED',
    'PUBLISHED', 'CONFLICT', 'REJECTED', 'REVOKED'
  )),
  constraint faq_candidates_review_pair_ck check ((owner_reviewed_by is null) = (owner_reviewed_at is null)),
  constraint faq_candidates_approval_pair_ck check ((coordinator_approved_by is null) = (coordinator_approved_at is null)),
  constraint faq_candidates_revoke_pair_ck check ((revoked_by is null) = (revoked_at is null)),
  constraint faq_candidates_reject_pair_ck check ((rejected_by is null) = (rejected_at is null)),
  constraint faq_candidates_published_lineage_ck check (canonical_status <> 'PUBLISHED' or (knowledge_document_id is not null and knowledge_document_version_id is not null and published_index_snapshot_id is not null)),
  constraint faq_candidates_row_version_ck check (row_version > 0),
  constraint faq_candidates_updated_ck check (updated_at >= created_at)
);

create index if not exists faq_candidates_review_queue_idx
  on public.faq_candidates (tenant_id, department_id, canonical_status, updated_at desc, id);
create index if not exists faq_candidates_source_idx
  on public.faq_candidates (tenant_id, ticket_id, source_message_id, created_at desc, id);
create index if not exists faq_candidates_active_idx
  on public.faq_candidates (tenant_id, visibility, effective_from, effective_until, id)
  where canonical_status = 'PUBLISHED';

create or replace function private.validate_faq_candidate_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.canonical_status <> old.canonical_status and not (
    (old.canonical_status = 'DRAFT' and new.canonical_status in ('PENDING_OWNER_REVIEW', 'CONFLICT', 'REJECTED'))
    or (old.canonical_status = 'PENDING_OWNER_REVIEW' and new.canonical_status in ('PENDING_COORDINATOR_APPROVAL', 'CONFLICT', 'REJECTED'))
    or (old.canonical_status = 'CONFLICT' and new.canonical_status in ('PENDING_OWNER_REVIEW', 'REJECTED'))
    or (old.canonical_status = 'PENDING_COORDINATOR_APPROVAL' and new.canonical_status in ('APPROVED', 'REJECTED'))
    or (old.canonical_status = 'APPROVED' and new.canonical_status in ('PUBLISHED', 'REVOKED'))
    or (old.canonical_status = 'PUBLISHED' and new.canonical_status = 'REVOKED')
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_FAQ_STATE_TRANSITION';
  end if;

  if old.canonical_status = 'PUBLISHED' and new.canonical_status <> 'REVOKED' then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_FAQ_IS_IMMUTABLE_UNTIL_REVOKED';
  end if;
  if new.canonical_status = 'PUBLISHED' and (new.knowledge_document_version_id is null or new.published_index_snapshot_id is null) then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_FAQ_REQUIRES_APPROVED_DOCUMENT_AND_INDEX';
  end if;
  return new;
end;
$$;

drop trigger if exists faq_candidates_transition on public.faq_candidates;
create trigger faq_candidates_transition
  before update on public.faq_candidates
  for each row execute function private.validate_faq_candidate_transition();
drop trigger if exists faq_candidates_touch_updated_at on public.faq_candidates;
create trigger faq_candidates_touch_updated_at
  before update on public.faq_candidates
  for each row execute function private.touch_mutable_row();

create or replace function private.record_faq_candidate_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  action_name text;
  actor_id uuid;
  actor_kind text;
begin
  actor_id := coalesce(private.current_account_id(), new.coordinator_approved_by, new.owner_reviewed_by, new.created_by_account_id);
  actor_kind := case when actor_id is null then 'SYSTEM' else 'STAFF' end;
  if tg_op = 'INSERT' then
    action_name := 'FAQ_CANDIDATE_CREATED';
    insert into public.audit_logs (tenant_id, actor_account_id, actor_type, action, resource_type, resource_id, after_redacted_json, reason)
    values (new.tenant_id, actor_id, actor_kind, action_name, 'FAQ_CANDIDATE', new.id,
      jsonb_build_object('status', new.canonical_status, 'sourceType', new.source_type, 'departmentId', new.department_id),
      'Explicit FAQ proposal created');
    return new;
  end if;
  action_name := case
    when old.canonical_status <> new.canonical_status and new.canonical_status = 'PENDING_COORDINATOR_APPROVAL' then 'FAQ_CANDIDATE_OWNER_REVIEWED'
    when old.canonical_status <> new.canonical_status and new.canonical_status = 'APPROVED' then 'FAQ_CANDIDATE_APPROVED'
    when old.canonical_status <> new.canonical_status and new.canonical_status = 'PUBLISHED' then 'FAQ_CANDIDATE_PUBLISHED'
    when old.canonical_status <> new.canonical_status and new.canonical_status = 'REVOKED' then 'FAQ_CANDIDATE_REVOKED'
    when old.canonical_status <> new.canonical_status and new.canonical_status = 'REJECTED' then 'FAQ_CANDIDATE_REJECTED'
    else 'FAQ_CANDIDATE_EDITED'
  end;
  insert into public.audit_logs (tenant_id, actor_account_id, actor_type, action, resource_type, resource_id, before_redacted_json, after_redacted_json, reason)
  values (new.tenant_id, actor_id, actor_kind, action_name, 'FAQ_CANDIDATE', new.id,
    jsonb_build_object('status', old.canonical_status, 'rowVersion', old.row_version),
    jsonb_build_object('status', new.canonical_status, 'rowVersion', new.row_version, 'documentVersionId', new.knowledge_document_version_id),
    coalesce(new.revoked_reason, new.rejected_reason, new.owner_review_reason, 'FAQ candidate workflow mutation'));
  return new;
end;
$$;

drop trigger if exists faq_candidates_audit_insert on public.faq_candidates;
create trigger faq_candidates_audit_insert
  after insert on public.faq_candidates
  for each row execute function private.record_faq_candidate_audit();
drop trigger if exists faq_candidates_audit_update on public.faq_candidates;
create trigger faq_candidates_audit_update
  after update on public.faq_candidates
  for each row execute function private.record_faq_candidate_audit();

alter table public.faq_candidates enable row level security;
alter table public.faq_candidates force row level security;

drop policy if exists faq_candidates_read_scoped on public.faq_candidates;
create policy faq_candidates_read_scoped on public.faq_candidates
  for select to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')));
drop policy if exists faq_candidates_insert_scoped on public.faq_candidates;
create policy faq_candidates_insert_scoped on public.faq_candidates
  for insert to authenticated
  with check ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')));
drop policy if exists faq_candidates_update_scoped on public.faq_candidates;
create policy faq_candidates_update_scoped on public.faq_candidates
  for update to authenticated
  using ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')))
  with check ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')));

revoke delete, truncate on table public.faq_candidates from authenticated;
grant select, insert, update on table public.faq_candidates to authenticated;
revoke all on table public.faq_candidates from anon;

comment on table public.faq_candidates is 'Explicit FAQ proposal with source lineage, two-step approval, immutable document version link and active-index rollback state; staff replies are never auto-learned.';
comment on column public.faq_candidates.evidence_ids is 'Redacted source/evidence identifiers only; no citizen identity, reply token, secret, or raw prompt.';
comment on column public.faq_candidates.published_index_snapshot_id is 'The incremental FAQ index snapshot switched atomically with publication; revoke/rollback retains candidate history.';

