-- Requirements: RF-03, RF-07, RF-17
-- P4-INDEX-001: immutable index generations, exact facts and database-side
-- active/effective/review filters. Embeddings remain optional until OD-011
-- selects a certified model/dimension; lexical/exact indexing is fail-safe.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create extension if not exists pg_trgm;

create table if not exists public.knowledge_index_generations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  document_version_id uuid not null,
  generation integer not null,
  namespace text not null,
  config_hash text not null,
  state text not null default 'BUILDING',
  embedding_model_id text,
  embedding_dimension integer,
  chunk_count integer not null default 0,
  fact_count integer not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  activated_at timestamptz,
  retired_at timestamptz,
  row_version integer not null default 1,
  constraint knowledge_index_generations_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint knowledge_index_generations_version_fk foreign key (tenant_id, document_version_id)
    references public.knowledge_document_versions (tenant_id, id) on delete restrict,
  constraint knowledge_index_generations_tenant_id_uq unique (tenant_id, id),
  constraint knowledge_index_generations_version_number_uq unique (tenant_id, document_version_id, generation),
  constraint knowledge_index_generations_namespace_uq unique (tenant_id, namespace),
  constraint knowledge_index_generations_generation_ck check (generation > 0),
  constraint knowledge_index_generations_namespace_ck check (namespace ~ '^knowledge/[A-Za-z0-9._:-]+/[A-Za-z0-9._:-]+/[a-f0-9]{8,64}$'),
  constraint knowledge_index_generations_config_ck check (config_hash ~ '^[a-f0-9]{64}$'),
  constraint knowledge_index_generations_state_ck check (state in ('BUILDING', 'READY', 'ACTIVE', 'RETIRED', 'FAILED')),
  constraint knowledge_index_generations_embedding_ck check (
    (embedding_model_id is null and embedding_dimension is null)
    or (embedding_model_id is not null and embedding_dimension is not null and embedding_dimension > 0)
  ),
  constraint knowledge_index_generations_count_ck check (chunk_count >= 0 and fact_count >= 0),
  constraint knowledge_index_generations_active_timestamp_ck check (state <> 'ACTIVE' or activated_at is not null),
  constraint knowledge_index_generations_row_version_ck check (row_version > 0)
);

create table if not exists public.knowledge_facts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  document_version_id uuid not null,
  index_generation_id uuid not null,
  entity_type text not null,
  entity_key text not null,
  entity_display_name text not null default '',
  fact_type text not null,
  fact_key text not null,
  value_json jsonb not null,
  normalized_value text not null,
  unit text,
  valid_from timestamptz,
  valid_until timestamptz,
  authority_level smallint not null,
  visibility text not null,
  source_chunk_id uuid not null,
  source_locator_json jsonb not null,
  source_quote text not null,
  extraction_method text not null,
  review_status text not null default 'PENDING',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint knowledge_facts_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint knowledge_facts_version_fk foreign key (tenant_id, document_version_id)
    references public.knowledge_document_versions (tenant_id, id) on delete restrict,
  constraint knowledge_facts_generation_fk foreign key (tenant_id, index_generation_id)
    references public.knowledge_index_generations (tenant_id, id) on delete restrict,
  constraint knowledge_facts_source_chunk_fk foreign key (tenant_id, source_chunk_id)
    references public.knowledge_chunks (tenant_id, id) on delete restrict,
  constraint knowledge_facts_reviewer_fk foreign key (reviewed_by) references public.user_accounts (id) on delete restrict,
  constraint knowledge_facts_tenant_id_uq unique (tenant_id, id),
  constraint knowledge_facts_key_uq unique (tenant_id, index_generation_id, fact_key),
  constraint knowledge_facts_entity_type_ck check (length(btrim(entity_type)) between 1 and 128),
  constraint knowledge_facts_key_ck check (length(btrim(entity_key)) between 1 and 255 and length(btrim(fact_key)) between 1 and 500),
  constraint knowledge_facts_value_ck check (jsonb_typeof(value_json) in ('object', 'array', 'string', 'number', 'boolean')),
  constraint knowledge_facts_normalized_ck check (length(btrim(normalized_value)) > 0),
  constraint knowledge_facts_window_ck check (valid_until is null or valid_from is null or valid_until > valid_from),
  constraint knowledge_facts_authority_ck check (authority_level between 0 and 100),
  constraint knowledge_facts_visibility_ck check (visibility in ('PUBLIC', 'INTERNAL', 'RESTRICTED')),
  constraint knowledge_facts_locator_ck check (jsonb_typeof(source_locator_json) = 'object'),
  constraint knowledge_facts_quote_ck check (length(btrim(source_quote)) between 1 and 5000),
  constraint knowledge_facts_method_ck check (extraction_method in ('RULE', 'MODEL', 'HUMAN')),
  constraint knowledge_facts_review_ck check (review_status in ('PENDING', 'APPROVED', 'REJECTED')),
  constraint knowledge_facts_reviewed_ck check (review_status = 'PENDING' or (reviewed_by is not null and reviewed_at is not null))
);

alter table public.knowledge_chunks add column if not exists index_generation_id uuid;
alter table public.knowledge_chunks add column if not exists embedding_model_id text;
alter table public.knowledge_chunks add column if not exists embedding_dimension integer;
alter table public.knowledge_chunks add column if not exists embedding_json jsonb;
alter table public.knowledge_chunks add column if not exists search_terms jsonb not null default '[]'::jsonb;
alter table public.knowledge_chunks add column if not exists previous_chunk_id uuid;
alter table public.knowledge_chunks add column if not exists next_chunk_id uuid;

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.knowledge_chunks'::regclass
       and conname = 'knowledge_chunks_version_index_uq'
  ) then
    alter table public.knowledge_chunks drop constraint knowledge_chunks_version_index_uq;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.knowledge_chunks'::regclass
       and conname = 'knowledge_chunks_generation_fk'
  ) then
    alter table public.knowledge_chunks add constraint knowledge_chunks_generation_fk foreign key (tenant_id, index_generation_id)
      references public.knowledge_index_generations (tenant_id, id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.knowledge_chunks'::regclass
       and conname = 'knowledge_chunks_previous_fk'
  ) then
    alter table public.knowledge_chunks add constraint knowledge_chunks_previous_fk foreign key (tenant_id, previous_chunk_id)
      references public.knowledge_chunks (tenant_id, id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.knowledge_chunks'::regclass
       and conname = 'knowledge_chunks_next_fk'
  ) then
    alter table public.knowledge_chunks add constraint knowledge_chunks_next_fk foreign key (tenant_id, next_chunk_id)
      references public.knowledge_chunks (tenant_id, id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.knowledge_chunks'::regclass
       and conname = 'knowledge_chunks_generation_index_ck'
  ) then
    alter table public.knowledge_chunks add constraint knowledge_chunks_generation_index_ck check (index_generation_id is not null);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.knowledge_chunks'::regclass
       and conname = 'knowledge_chunks_embedding_ck'
  ) then
    alter table public.knowledge_chunks add constraint knowledge_chunks_embedding_ck check (
      (embedding_json is null and embedding_dimension is null)
      or (embedding_json is not null and embedding_dimension is not null and embedding_dimension > 0
          and jsonb_typeof(embedding_json) = 'array' and jsonb_array_length(embedding_json) = embedding_dimension)
    );
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.knowledge_chunks'::regclass
       and conname = 'knowledge_chunks_search_terms_ck'
  ) then
    alter table public.knowledge_chunks add constraint knowledge_chunks_search_terms_ck check (jsonb_typeof(search_terms) = 'array');
  end if;
end;
$$;

create unique index if not exists knowledge_chunks_generation_index_uq
  on public.knowledge_chunks (tenant_id, index_generation_id, chunk_index);
create unique index if not exists knowledge_index_generations_active_uq
  on public.knowledge_index_generations (tenant_id, document_version_id)
  where state = 'ACTIVE';
create index if not exists knowledge_chunks_search_trgm_idx
  on public.knowledge_chunks using gin (search_text gin_trgm_ops);
create index if not exists knowledge_chunks_generation_idx
  on public.knowledge_chunks (tenant_id, index_generation_id, chunk_index);
create index if not exists knowledge_facts_exact_idx
  on public.knowledge_facts (tenant_id, fact_type, normalized_value, valid_from, valid_until);
create index if not exists knowledge_facts_source_idx
  on public.knowledge_facts (tenant_id, document_version_id, source_chunk_id);
create index if not exists knowledge_index_generation_claim_idx
  on public.knowledge_index_generations (tenant_id, state, document_version_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['knowledge_index_generations', 'knowledge_facts'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

do $$
begin
  drop trigger if exists knowledge_index_generations_touch_updated_at on public.knowledge_index_generations;
  create trigger knowledge_index_generations_touch_updated_at before update on public.knowledge_index_generations
    for each row execute function private.touch_mutable_row();
end;
$$;

drop policy if exists knowledge_chunks_read_scoped on public.knowledge_chunks;
create policy knowledge_chunks_read_scoped on public.knowledge_chunks
  for select to authenticated
  using (
    (select private.can_read_tenant(tenant_id))
    and exists (
      select 1 from public.knowledge_document_versions as version
       where version.tenant_id = knowledge_chunks.tenant_id
         and version.id = knowledge_chunks.document_version_id
         and version.state = 'ACTIVE'
         and (version.effective_from is null or version.effective_from <= statement_timestamp())
         and (version.effective_until is null or version.effective_until > statement_timestamp())
         and (
           knowledge_chunks.visibility = 'PUBLIC'
           or (select private.can_read_department(version.tenant_id, version.owner_department_id))
         )
    )
  );

drop policy if exists knowledge_facts_read_scoped on public.knowledge_facts;
create policy knowledge_facts_read_scoped on public.knowledge_facts
  for select to authenticated
  using (
    (select private.can_read_tenant(tenant_id))
    and review_status = 'APPROVED'
    and exists (
      select 1 from public.knowledge_document_versions as version
       where version.tenant_id = knowledge_facts.tenant_id
         and version.id = knowledge_facts.document_version_id
         and version.state = 'ACTIVE'
         and (version.effective_from is null or version.effective_from <= statement_timestamp())
        and (version.effective_until is null or version.effective_until > statement_timestamp())
        and (
           knowledge_facts.visibility = 'PUBLIC'
           or (select private.can_read_department(version.tenant_id, version.owner_department_id))
         )
    )
  );

drop policy if exists knowledge_index_generations_read_manage on public.knowledge_index_generations;
create policy knowledge_index_generations_read_manage on public.knowledge_index_generations
  for select to authenticated using ((select private.has_tenant_permission(tenant_id, 'knowledge.manage.tenant')));

grant select on table public.knowledge_index_generations, public.knowledge_facts to authenticated;
revoke insert, update, delete, truncate on table public.knowledge_index_generations, public.knowledge_facts from authenticated;

create or replace function private.activate_knowledge_index_generation(
  p_tenant_id uuid,
  p_generation_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.knowledge_index_generations%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'knowledge.manage.tenant') then
    raise exception using errcode = '42501', message = 'knowledge index activation permission denied';
  end if;
  select * into target from public.knowledge_index_generations
   where tenant_id = p_tenant_id and id = p_generation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'knowledge index generation not found'; end if;
  if target.state <> 'READY' then raise exception using errcode = '55000', message = 'index generation is not ready'; end if;
  if not exists (
    select 1 from public.knowledge_document_versions as version
     where version.tenant_id = p_tenant_id
       and version.id = target.document_version_id
       and version.state = 'ACTIVE'
       and version.approval_status = 'APPROVED'
  ) then
    raise exception using errcode = '55000', message = 'index activation requires an approved ACTIVE version';
  end if;
  if exists (
    select 1 from public.knowledge_facts as fact
     where fact.tenant_id = p_tenant_id
       and fact.index_generation_id = target.id
       and fact.review_status <> 'APPROVED'
  ) then
    raise exception using errcode = '55000', message = 'all index facts require review before activation';
  end if;
  update public.knowledge_index_generations
     set state = 'RETIRED', retired_at = statement_timestamp()
   where tenant_id = p_tenant_id
     and document_version_id = target.document_version_id
     and state = 'ACTIVE'
     and id <> target.id;
  update public.knowledge_index_generations
     set state = 'ACTIVE', activated_at = coalesce(activated_at, statement_timestamp()), retired_at = null
   where tenant_id = p_tenant_id and id = target.id;
  return target.id;
end;
$$;

create or replace function private.rollback_knowledge_index_generation(
  p_tenant_id uuid,
  p_generation_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.knowledge_index_generations%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'knowledge.manage.tenant') then
    raise exception using errcode = '42501', message = 'knowledge index rollback permission denied';
  end if;
  select * into target from public.knowledge_index_generations
   where tenant_id = p_tenant_id and id = p_generation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'knowledge index generation not found'; end if;
  if target.state <> 'RETIRED' then raise exception using errcode = '55000', message = 'rollback requires a retained index generation'; end if;
  if exists (
    select 1 from public.knowledge_facts as fact
     where fact.tenant_id = p_tenant_id
       and fact.index_generation_id = target.id
       and fact.review_status <> 'APPROVED'
  ) then
    raise exception using errcode = '55000', message = 'rollback target has unreviewed facts';
  end if;
  update public.knowledge_index_generations
     set state = 'RETIRED', retired_at = statement_timestamp()
   where tenant_id = p_tenant_id
     and document_version_id = target.document_version_id
     and state = 'ACTIVE'
     and id <> target.id;
  update public.knowledge_index_generations
     set state = 'ACTIVE', activated_at = statement_timestamp(), retired_at = null
   where tenant_id = p_tenant_id and id = target.id;
  return target.id;
end;
$$;

grant execute on function private.activate_knowledge_index_generation(uuid, uuid, uuid) to authenticated;
grant execute on function private.rollback_knowledge_index_generation(uuid, uuid, uuid) to authenticated;

comment on table public.knowledge_facts is 'Exact structured facts with source chunk/locator lineage; only approved facts from active versions are retrievable.';
comment on table public.knowledge_index_generations is 'Immutable config/index namespace; activation is per tenant/document version and atomic.';
comment on column public.knowledge_chunks.embedding_json is 'Optional provider output; never fabricated. Replace with certified pgvector mapping after OD-011.';
