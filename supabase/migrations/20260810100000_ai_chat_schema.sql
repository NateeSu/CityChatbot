-- CityChatbot AI chat session, trace and feedback schema
-- Requirements: RF-01, RF-05, RF-07, RF-08, RF-09, RF-13, RF-14, RF-16, RF-17
-- Depends on core, RLS hardening, knowledge document and AI registry migrations.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  channel text not null,
  external_user_hash text not null,
  status text not null default 'ACTIVE',
  locale text not null default 'th-TH',
  topic_key text,
  handoff_topic_key text,
  context_json jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  last_message_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint ai_chat_sessions_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint ai_chat_sessions_tenant_id_uq unique (tenant_id, id),
  constraint ai_chat_sessions_channel_ck check (channel in ('LINE', 'LIFF', 'WEB')),
  constraint ai_chat_sessions_hash_ck check (external_user_hash ~ '^[a-f0-9]{64}$'),
  constraint ai_chat_sessions_status_ck check (status in ('ACTIVE', 'HANDOFF', 'CLOSED', 'EXPIRED', 'CANCELLED')),
  constraint ai_chat_sessions_locale_ck check (locale in ('th-TH', 'en-US')),
  constraint ai_chat_sessions_topic_ck check (
    (topic_key is null or topic_key ~ '^[a-f0-9]{24}$')
    and (handoff_topic_key is null or handoff_topic_key ~ '^[a-f0-9]{24}$')
  ),
  constraint ai_chat_sessions_context_ck check (jsonb_typeof(context_json) = 'array'),
  constraint ai_chat_sessions_row_version_ck check (row_version > 0)
);

create unique index if not exists ai_chat_sessions_active_identity_uq
  on public.ai_chat_sessions (tenant_id, channel, external_user_hash)
  where status in ('ACTIVE', 'HANDOFF');
create index if not exists ai_chat_sessions_expiry_idx
  on public.ai_chat_sessions (tenant_id, status, expires_at);
create index if not exists ai_chat_sessions_activity_idx
  on public.ai_chat_sessions (tenant_id, last_message_at desc, id);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null,
  event_id text not null,
  kind text not null,
  content_redacted text not null,
  content_hash text not null,
  outcome text,
  reason_code text,
  source_labels_json jsonb not null default '[]'::jsonb,
  sequence_no integer not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint ai_chat_messages_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint ai_chat_messages_session_fk foreign key (tenant_id, session_id)
    references public.ai_chat_sessions (tenant_id, id) on delete restrict,
  constraint ai_chat_messages_tenant_id_uq unique (tenant_id, id),
  constraint ai_chat_messages_event_kind_uq unique (tenant_id, event_id, kind),
  constraint ai_chat_messages_event_ck check (length(btrim(event_id)) between 1 and 255 and event_id !~ '[[:cntrl:]]'),
  constraint ai_chat_messages_kind_ck check (kind in ('USER', 'BOT', 'SYSTEM', 'FEEDBACK')),
  constraint ai_chat_messages_content_ck check (length(content_redacted) between 1 and 20000),
  constraint ai_chat_messages_hash_ck check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint ai_chat_messages_outcome_ck check (outcome is null or outcome in ('ANSWER', 'CLARIFY', 'HANDOFF')),
  constraint ai_chat_messages_reason_ck check (reason_code is null or reason_code in (
    'ANSWERABLE', 'AMBIGUOUS_ENTITY', 'MISSING_TIME', 'AMBIGUOUS_INTENT',
    'NO_EVIDENCE', 'CONFLICTING_EVIDENCE', 'LOW_EVIDENCE', 'SENSITIVE',
    'PERSON_SPECIFIC', 'POLICY_REFUSAL', 'SECURITY', 'STAFF_REQUESTED', 'SYSTEM_ERROR'
  )),
  constraint ai_chat_messages_source_labels_ck check (jsonb_typeof(source_labels_json) = 'array'),
  constraint ai_chat_messages_sequence_ck check (sequence_no > 0)
);
create index if not exists ai_chat_messages_session_idx
  on public.ai_chat_messages (tenant_id, session_id, sequence_no, id);
create index if not exists ai_chat_messages_event_idx
  on public.ai_chat_messages (tenant_id, event_id);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null,
  message_id uuid,
  request_id uuid not null,
  correlation_id uuid not null,
  status text not null,
  outcome text,
  reason_code text,
  route_key text,
  model_revision text,
  retrieval_policy_version integer,
  latency_ms integer,
  input_characters integer not null default 0,
  output_characters integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_cost_cents numeric(12,4) not null default 0,
  error_code text,
  error_detail_redacted text,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  constraint ai_runs_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint ai_runs_session_fk foreign key (tenant_id, session_id)
    references public.ai_chat_sessions (tenant_id, id) on delete restrict,
  constraint ai_runs_message_fk foreign key (tenant_id, message_id)
    references public.ai_chat_messages (tenant_id, id) on delete restrict,
  constraint ai_runs_tenant_id_uq unique (tenant_id, id),
  constraint ai_runs_request_uq unique (tenant_id, request_id),
  constraint ai_runs_status_ck check (status in ('SUCCEEDED', 'HANDOFF', 'FAILED', 'CANCELLED')),
  constraint ai_runs_outcome_ck check (outcome is null or outcome in ('ANSWER', 'CLARIFY', 'HANDOFF')),
  constraint ai_runs_reason_ck check (reason_code is null or reason_code in (
    'ANSWERABLE', 'AMBIGUOUS_ENTITY', 'MISSING_TIME', 'AMBIGUOUS_INTENT',
    'NO_EVIDENCE', 'CONFLICTING_EVIDENCE', 'LOW_EVIDENCE', 'SENSITIVE',
    'PERSON_SPECIFIC', 'POLICY_REFUSAL', 'SECURITY', 'STAFF_REQUESTED', 'SYSTEM_ERROR'
  )),
  constraint ai_runs_latency_ck check (latency_ms is null or latency_ms >= 0),
  constraint ai_runs_counts_ck check (
    input_characters >= 0 and output_characters >= 0
    and input_tokens >= 0 and output_tokens >= 0
    and total_cost_cents >= 0
  ),
  constraint ai_runs_completion_ck check (completed_at is not null),
  constraint ai_runs_error_ck check (error_detail_redacted is null or length(error_detail_redacted) <= 2000)
);
create index if not exists ai_runs_session_idx
  on public.ai_runs (tenant_id, session_id, created_at desc, id);
create index if not exists ai_runs_outcome_idx
  on public.ai_runs (tenant_id, outcome, created_at desc);

create table if not exists public.ai_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_id uuid not null,
  claim_key text not null,
  claim_text_redacted text not null,
  material boolean not null default true,
  evidence_ids_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint ai_claims_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint ai_claims_run_fk foreign key (tenant_id, run_id)
    references public.ai_runs (tenant_id, id) on delete restrict,
  constraint ai_claims_tenant_id_uq unique (tenant_id, id),
  constraint ai_claims_key_uq unique (tenant_id, run_id, claim_key),
  constraint ai_claims_key_ck check (length(btrim(claim_key)) between 1 and 255),
  constraint ai_claims_text_ck check (length(btrim(claim_text_redacted)) between 1 and 10000),
  constraint ai_claims_evidence_ck check (jsonb_typeof(evidence_ids_json) = 'array')
);
create index if not exists ai_claims_run_idx on public.ai_claims (tenant_id, run_id, id);

create table if not exists public.ai_citations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_id uuid not null,
  claim_id uuid,
  evidence_id text not null,
  document_version_id uuid,
  locator_json jsonb not null,
  title text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint ai_citations_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint ai_citations_run_fk foreign key (tenant_id, run_id)
    references public.ai_runs (tenant_id, id) on delete restrict,
  constraint ai_citations_claim_fk foreign key (tenant_id, claim_id)
    references public.ai_claims (tenant_id, id) on delete restrict,
  constraint ai_citations_document_fk foreign key (tenant_id, document_version_id)
    references public.knowledge_document_versions (tenant_id, id) on delete restrict,
  constraint ai_citations_tenant_id_uq unique (tenant_id, id),
  constraint ai_citations_evidence_ck check (length(btrim(evidence_id)) between 1 and 255),
  constraint ai_citations_locator_ck check (jsonb_typeof(locator_json) = 'object'),
  constraint ai_citations_title_ck check (length(btrim(title)) between 1 and 500)
);
create index if not exists ai_citations_run_idx on public.ai_citations (tenant_id, run_id, id);
create index if not exists ai_citations_document_idx on public.ai_citations (tenant_id, document_version_id, id);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null,
  message_id uuid not null,
  external_user_hash text not null,
  value text not null,
  comment_redacted text,
  created_at timestamptz not null default statement_timestamp(),
  constraint ai_feedback_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint ai_feedback_session_fk foreign key (tenant_id, session_id)
    references public.ai_chat_sessions (tenant_id, id) on delete restrict,
  constraint ai_feedback_message_fk foreign key (tenant_id, message_id)
    references public.ai_chat_messages (tenant_id, id) on delete restrict,
  constraint ai_feedback_tenant_id_uq unique (tenant_id, id),
  constraint ai_feedback_identity_uq unique (tenant_id, message_id, external_user_hash),
  constraint ai_feedback_hash_ck check (external_user_hash ~ '^[a-f0-9]{64}$'),
  constraint ai_feedback_value_ck check (value in ('HELPFUL', 'INCORRECT')),
  constraint ai_feedback_comment_ck check (comment_redacted is null or length(comment_redacted) <= 4000)
);
create index if not exists ai_feedback_session_idx on public.ai_feedback (tenant_id, session_id, created_at desc);

create or replace function private.reject_ai_chat_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'AI chat trace is append-only';
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['ai_chat_messages', 'ai_runs', 'ai_claims', 'ai_citations', 'ai_feedback'] loop
    execute format('drop trigger if exists %I_append_only on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_append_only before update or delete on public.%I for each row execute function private.reject_ai_chat_mutation()',
      table_name, table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['ai_chat_sessions', 'ai_chat_messages', 'ai_runs', 'ai_claims', 'ai_citations', 'ai_feedback'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('drop policy if exists %I_read_current_tenant on public.%I', table_name, table_name);
    execute format(
      'create policy %I_read_current_tenant on public.%I for select to authenticated using ((select private.can_read_tenant(tenant_id)))',
      table_name, table_name
    );
    execute format('revoke insert, update, delete, truncate on table public.%I from authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

revoke all on function private.reject_ai_chat_mutation() from public;
comment on function private.reject_ai_chat_mutation() is 'AI chat messages, runs, claims, citations and feedback are append-only and privacy-minimized';
comment on table public.ai_chat_sessions is 'Tenant-scoped conversation state; raw LINE identity is never stored';
comment on table public.ai_chat_messages is 'Redacted append-only citizen/bot/system chat messages with canonical outcome';
comment on table public.ai_runs is 'Privacy-minimized AI run metadata; no provider request/response body or secret';
