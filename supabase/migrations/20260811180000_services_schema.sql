-- Tenant-scoped structured service/contact facts with effective-dated publication.
-- Requirements: RF-01, RF-03, RF-07, RF-11, RF-13.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.service_feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  gold_price_enabled boolean not null default false,
  pawnshop_enabled boolean not null default false,
  row_version integer not null default 1,
  updated_at timestamptz not null default statement_timestamp(),
  constraint service_feature_flags_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint service_feature_flags_tenant_uq unique (tenant_id),
  constraint service_feature_flags_tenant_id_uq unique (tenant_id, id),
  constraint service_feature_flags_version_ck check (row_version > 0)
);

create table if not exists public.service_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  slug text not null,
  state text not null default 'DRAFT',
  module text not null default 'STANDARD',
  department_id uuid not null,
  current_revision_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint service_posts_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint service_posts_department_fk foreign key (tenant_id, department_id) references public.departments (tenant_id, id) on delete restrict,
  constraint service_posts_approver_fk foreign key (approved_by) references public.user_accounts (id) on delete restrict,
  constraint service_posts_tenant_id_uq unique (tenant_id, id),
  constraint service_posts_slug_uq unique (tenant_id, slug),
  constraint service_posts_slug_ck check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  constraint service_posts_state_ck check (state in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')),
  constraint service_posts_module_ck check (module in ('STANDARD', 'GOLD_PRICE', 'PAWNSHOP')),
  constraint service_posts_approval_ck check (state = 'DRAFT' or (approved_by is not null and approved_at is not null)),
  constraint service_posts_published_ck check (state not in ('PUBLISHED', 'SCHEDULED') or current_revision_id is not null),
  constraint service_posts_version_ck check (row_version > 0)
);

create table if not exists public.service_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  service_id uuid not null,
  revision integer not null,
  title text not null,
  summary text not null,
  module text not null,
  department_id uuid not null,
  steps jsonb not null,
  documents jsonb not null default '[]'::jsonb,
  fee text not null,
  hours text not null,
  location text not null,
  contact jsonb not null,
  requirements jsonb not null default '[]'::jsonb,
  source jsonb not null,
  module_facts jsonb,
  effective_from timestamptz not null,
  expires_at timestamptz,
  timezone text not null default 'Asia/Bangkok',
  created_by uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  published_at timestamptz,
  immutable boolean not null default false,
  constraint service_revisions_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint service_revisions_service_fk foreign key (tenant_id, service_id) references public.service_posts (tenant_id, id) on delete cascade,
  constraint service_revisions_department_fk foreign key (tenant_id, department_id) references public.departments (tenant_id, id) on delete restrict,
  constraint service_revisions_creator_fk foreign key (created_by) references public.user_accounts (id) on delete restrict,
  constraint service_revisions_tenant_id_uq unique (tenant_id, id),
  constraint service_revisions_version_uq unique (tenant_id, service_id, revision),
  constraint service_revisions_revision_ck check (revision > 0),
  constraint service_revisions_module_ck check (module in ('STANDARD', 'GOLD_PRICE', 'PAWNSHOP')),
  constraint service_revisions_copy_ck check (length(btrim(title)) between 1 and 180 and length(btrim(summary)) between 1 and 500 and length(btrim(fee)) between 1 and 240 and length(btrim(hours)) between 1 and 240 and length(btrim(location)) between 1 and 240),
  constraint service_revisions_structured_ck check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 20 and jsonb_typeof(documents) = 'array' and jsonb_array_length(documents) <= 20 and jsonb_typeof(requirements) = 'array' and jsonb_array_length(requirements) <= 20 and jsonb_typeof(contact) = 'object' and jsonb_typeof(source) = 'object'),
  constraint service_revisions_contact_ck check ((not (contact ? 'phone') or contact->>'phone' ~ '^\+?[0-9][0-9 ()-]{6,24}$') and (not (contact ? 'mapUrl') or contact->>'mapUrl' ~ '^https://')),
  constraint service_revisions_source_ck check (source ? 'sourceType' and source ? 'reference' and source ? 'ownerAccountId' and source ? 'lastReviewedAt' and source->>'sourceType' in ('APPROVED_DOCUMENT', 'ORG_CONFIG', 'MANUAL_APPROVAL')),
  constraint service_revisions_date_ck check (expires_at is null or expires_at > effective_from),
  constraint service_revisions_timezone_ck check (timezone = 'Asia/Bangkok'),
  constraint service_revisions_immutable_ck check (immutable in (true, false))
);

alter table public.service_posts drop constraint if exists service_posts_current_revision_fk;
alter table public.service_posts add constraint service_posts_current_revision_fk foreign key (tenant_id, current_revision_id) references public.service_revisions (tenant_id, id) on delete restrict;

create unique index if not exists service_posts_published_slug_uq on public.service_posts (tenant_id, slug) where state in ('PUBLISHED', 'SCHEDULED');
create index if not exists service_posts_lookup_idx on public.service_posts (tenant_id, state, module, updated_at desc);
create index if not exists service_revisions_effective_idx on public.service_revisions (tenant_id, effective_from, expires_at);

alter table public.service_feature_flags enable row level security;
alter table public.service_feature_flags force row level security;
alter table public.service_posts enable row level security;
alter table public.service_posts force row level security;
alter table public.service_revisions enable row level security;
alter table public.service_revisions force row level security;

drop trigger if exists service_feature_flags_touch_updated_at on public.service_feature_flags;
create trigger service_feature_flags_touch_updated_at before update on public.service_feature_flags for each row execute function private.touch_mutable_row();
drop trigger if exists service_revisions_guard on public.service_revisions;
create or replace function private.guard_service_revision()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' and old.immutable then
    if new.title <> old.title or new.summary <> old.summary or new.module <> old.module or new.department_id <> old.department_id
       or new.steps <> old.steps or new.documents <> old.documents or new.fee <> old.fee or new.hours <> old.hours
       or new.location <> old.location or new.contact <> old.contact or new.requirements <> old.requirements
       or new.source <> old.source or new.module_facts is distinct from old.module_facts or new.effective_from <> old.effective_from
       or new.expires_at is distinct from old.expires_at or new.timezone <> old.timezone then
      raise exception using errcode = '55000', message = 'published service revision is immutable; create a new revision';
    end if;
  end if;
  return new;
end;
$$;
create trigger service_revisions_guard before insert or update on public.service_revisions for each row execute function private.guard_service_revision();

drop policy if exists service_feature_flags_read_current_tenant on public.service_feature_flags;
create policy service_feature_flags_read_current_tenant on public.service_feature_flags for select to authenticated using ((select private.can_read_tenant(tenant_id)));
drop policy if exists service_posts_read_current_tenant on public.service_posts;
create policy service_posts_read_current_tenant on public.service_posts for select to authenticated using ((select private.can_read_tenant(tenant_id)));
drop policy if exists service_revisions_read_current_tenant on public.service_revisions;
create policy service_revisions_read_current_tenant on public.service_revisions for select to authenticated using ((select private.can_read_tenant(tenant_id)));

revoke insert, update, delete, truncate on public.service_feature_flags from anon, authenticated;
revoke insert, update, delete, truncate on public.service_posts from anon, authenticated;
revoke insert, update, delete, truncate on public.service_revisions from anon, authenticated;
grant select on public.service_feature_flags, public.service_posts, public.service_revisions to authenticated;

create or replace function private.publish_service_revision(p_tenant_id uuid, p_service_id uuid, p_actor_account_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare target public.service_posts%rowtype;
begin
  if p_actor_account_id is null or p_actor_account_id <> private.current_account_id() or not private.has_tenant_permission(p_tenant_id, 'content.publish') then raise exception using errcode = '42501', message = 'service publish permission denied'; end if;
  select * into target from public.service_posts where tenant_id = p_tenant_id and id = p_service_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'service not found'; end if;
  if target.state <> 'APPROVED' or target.current_revision_id is null then raise exception using errcode = '55000', message = 'only approved service can be published'; end if;
  update public.service_posts set state = 'ARCHIVED', archived_at = statement_timestamp(), row_version = row_version + 1 where tenant_id = p_tenant_id and slug = target.slug and state = 'PUBLISHED' and id <> target.id;
  update public.service_posts set state = case when (select effective_from > statement_timestamp() from public.service_revisions where tenant_id = p_tenant_id and id = target.current_revision_id) then 'SCHEDULED' else 'PUBLISHED' end, published_at = case when (select effective_from <= statement_timestamp() from public.service_revisions where tenant_id = p_tenant_id and id = target.current_revision_id) then statement_timestamp() else null end, row_version = row_version + 1 where tenant_id = p_tenant_id and id = target.id;
  update public.service_revisions set immutable = true, published_at = case when (select state = 'PUBLISHED' from public.service_posts where tenant_id = p_tenant_id and id = target.id) then statement_timestamp() else null end where tenant_id = p_tenant_id and id = target.current_revision_id;
  return target.current_revision_id;
end;
$$;

create or replace function private.archive_service(p_tenant_id uuid, p_service_id uuid, p_actor_account_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_actor_account_id is null or p_actor_account_id <> private.current_account_id() or not private.has_tenant_permission(p_tenant_id, 'content.publish') then raise exception using errcode = '42501', message = 'service archive permission denied'; end if;
  update public.service_posts set state = 'ARCHIVED', archived_at = statement_timestamp(), row_version = row_version + 1 where tenant_id = p_tenant_id and id = p_service_id and state in ('PUBLISHED', 'SCHEDULED');
  if not found then raise exception using errcode = '55000', message = 'service is not published or scheduled'; end if;
  return p_service_id;
end;
$$;
grant execute on function private.publish_service_revision(uuid, uuid, uuid) to authenticated;
grant execute on function private.archive_service(uuid, uuid, uuid) to authenticated;

comment on table public.service_revisions is 'Tenant-owned, effective-dated structured service facts; public reads require approved immutable revision and feature flag.';
comment on column public.service_revisions.source is 'Approved source metadata and last review; AI output is never authoritative service truth.';
