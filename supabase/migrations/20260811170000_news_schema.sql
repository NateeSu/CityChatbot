-- Tenant-scoped, versioned news content and delivery boundaries.
-- Requirements: RF-01, RF-05, RF-10, RF-11, RF-13, RF-18.
-- Browser-facing roles receive read access only; trusted application functions
-- own publish/archive transitions so published revisions remain immutable.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.news_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  slug text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_categories_tenant_id_uq unique (tenant_id, id),
  constraint news_categories_slug_uq unique (tenant_id, slug),
  constraint news_categories_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint news_categories_slug_ck check (slug ~ '^[a-z][a-z0-9-]{2,80}$'),
  constraint news_categories_name_ck check (length(btrim(name)) between 1 and 120 and name !~ '[[:cntrl:]]')
);

create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  slug text not null,
  status text not null default 'DRAFT',
  current_revision_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint news_posts_tenant_id_uq unique (tenant_id, id),
  constraint news_posts_slug_uq unique (tenant_id, slug),
  constraint news_posts_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint news_posts_approver_fk foreign key (approved_by) references public.user_accounts (id) on delete restrict,
  constraint news_posts_slug_ck check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  constraint news_posts_status_ck check (status in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')),
  constraint news_posts_row_version_ck check (row_version > 0),
  constraint news_posts_approval_ck check (status in ('DRAFT', 'IN_REVIEW') or (approved_by is not null and approved_at is not null)),
  constraint news_posts_publish_timestamp_ck check (status <> 'PUBLISHED' or published_at is not null)
);

create table if not exists public.news_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  post_id uuid not null,
  revision integer not null,
  title text not null,
  excerpt text not null,
  body_html text not null,
  tags text[] not null default '{}',
  attachments jsonb not null default '[]'::jsonb,
  effective_from timestamptz not null,
  expires_at timestamptz,
  timezone text not null default 'Asia/Bangkok',
  ai_draft boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  published_at timestamptz,
  immutable boolean not null default false,
  constraint news_revisions_tenant_id_uq unique (tenant_id, id),
  constraint news_revisions_post_version_uq unique (tenant_id, post_id, revision),
  constraint news_revisions_post_fk foreign key (tenant_id, post_id) references public.news_posts (tenant_id, id) on delete restrict,
  constraint news_revisions_creator_fk foreign key (created_by) references public.user_accounts (id) on delete restrict,
  constraint news_revisions_revision_ck check (revision > 0),
  constraint news_revisions_title_ck check (length(btrim(title)) between 1 and 160 and title !~ '[[:cntrl:]]'),
  constraint news_revisions_excerpt_ck check (length(btrim(excerpt)) between 1 and 300 and excerpt !~ '[[:cntrl:]]'),
  constraint news_revisions_body_ck check (
    length(body_html) between 1 and 20000
    and body_html !~* '<[[:space:]]*(script|iframe|object|embed|style|form|input|meta|link)([[:space:]>])'
    and body_html !~* '(javascript|data):'
  ),
  constraint news_revisions_attachment_shape_ck check (jsonb_typeof(attachments) = 'array'),
  constraint news_revisions_window_ck check (expires_at is null or expires_at > effective_from),
  constraint news_revisions_timezone_ck check (timezone = 'Asia/Bangkok'),
  constraint news_revisions_immutable_ck check (immutable in (true, false))
);

alter table public.news_posts
  drop constraint if exists news_posts_current_revision_fk;
alter table public.news_posts
  add constraint news_posts_current_revision_fk
  foreign key (tenant_id, current_revision_id)
  references public.news_revisions (tenant_id, id)
  on delete restrict;

create table if not exists public.news_revision_categories (
  tenant_id uuid not null,
  revision_id uuid not null,
  category_id uuid not null,
  constraint news_revision_categories_pk primary key (tenant_id, revision_id, category_id),
  constraint news_revision_categories_revision_fk foreign key (tenant_id, revision_id) references public.news_revisions (tenant_id, id) on delete restrict,
  constraint news_revision_categories_category_fk foreign key (tenant_id, category_id) references public.news_categories (tenant_id, id) on delete restrict
);

create table if not exists public.news_delivery_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  post_id uuid not null,
  revision_id uuid not null,
  status text not null default 'PREVIEWED',
  audience_count integer not null default 0,
  quota_remaining integer not null default 0,
  estimated_cost_minor numeric(20, 4) not null default 0,
  idempotency_key text not null,
  request_hash text not null,
  accepted_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_delivery_runs_tenant_id_uq unique (tenant_id, id),
  constraint news_delivery_runs_idempotency_uq unique (tenant_id, idempotency_key),
  constraint news_delivery_runs_post_fk foreign key (tenant_id, post_id) references public.news_posts (tenant_id, id) on delete restrict,
  constraint news_delivery_runs_revision_fk foreign key (tenant_id, revision_id) references public.news_revisions (tenant_id, id) on delete restrict,
  constraint news_delivery_runs_status_ck check (status in ('PREVIEWED', 'QUEUED', 'SENT', 'FAILED', 'CANCELLED')),
  constraint news_delivery_runs_counts_ck check (audience_count >= 0 and quota_remaining >= 0 and accepted_count >= 0 and failed_count >= 0 and accepted_count + failed_count <= audience_count),
  constraint news_delivery_runs_cost_ck check (estimated_cost_minor >= 0),
  constraint news_delivery_runs_hash_ck check (request_hash ~ '^[a-f0-9]{64}$'),
  constraint news_delivery_runs_key_ck check (length(btrim(idempotency_key)) between 8 and 255 and idempotency_key !~ '[[:cntrl:]]')
);

create index if not exists news_posts_status_idx on public.news_posts (tenant_id, status, updated_at desc);
create index if not exists news_revisions_effective_idx on public.news_revisions (tenant_id, effective_from, expires_at);
create index if not exists news_delivery_runs_lookup_idx on public.news_delivery_runs (tenant_id, post_id, created_at desc);
create unique index if not exists news_posts_published_slug_uq on public.news_posts (tenant_id, slug) where status in ('SCHEDULED', 'PUBLISHED');

alter table public.news_categories enable row level security;
alter table public.news_categories force row level security;
alter table public.news_posts enable row level security;
alter table public.news_posts force row level security;
alter table public.news_revisions enable row level security;
alter table public.news_revisions force row level security;
alter table public.news_revision_categories enable row level security;
alter table public.news_revision_categories force row level security;
alter table public.news_delivery_runs enable row level security;
alter table public.news_delivery_runs force row level security;

drop trigger if exists news_posts_touch_updated_at on public.news_posts;
create trigger news_posts_touch_updated_at before update on public.news_posts for each row execute function private.touch_mutable_row();
drop trigger if exists news_delivery_runs_touch_updated_at on public.news_delivery_runs;
create trigger news_delivery_runs_touch_updated_at before update on public.news_delivery_runs for each row execute function private.touch_mutable_row();

create or replace function private.guard_news_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and old.immutable then
    if new.tenant_id <> old.tenant_id or new.post_id <> old.post_id or new.revision <> old.revision
       or new.title <> old.title or new.excerpt <> old.excerpt or new.body_html <> old.body_html
       or new.tags <> old.tags or new.attachments <> old.attachments or new.effective_from <> old.effective_from
       or new.expires_at is distinct from old.expires_at or new.timezone <> old.timezone
       or new.ai_draft <> old.ai_draft or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception using errcode = '55000', message = 'published news revision is immutable; create a new revision';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists news_revisions_guard on public.news_revisions;
create trigger news_revisions_guard before update on public.news_revisions for each row execute function private.guard_news_revision();

drop policy if exists news_categories_read_current_tenant on public.news_categories;
create policy news_categories_read_current_tenant on public.news_categories for select to authenticated using ((select private.can_read_tenant(tenant_id)));
drop policy if exists news_posts_read_current_tenant on public.news_posts;
create policy news_posts_read_current_tenant on public.news_posts for select to authenticated using ((select private.can_read_tenant(tenant_id)));
drop policy if exists news_revisions_read_current_tenant on public.news_revisions;
create policy news_revisions_read_current_tenant on public.news_revisions for select to authenticated using ((select private.can_read_tenant(tenant_id)));
drop policy if exists news_revision_categories_read_current_tenant on public.news_revision_categories;
create policy news_revision_categories_read_current_tenant on public.news_revision_categories for select to authenticated using ((select private.can_read_tenant(tenant_id)));
drop policy if exists news_delivery_runs_read_current_tenant on public.news_delivery_runs;
create policy news_delivery_runs_read_current_tenant on public.news_delivery_runs for select to authenticated using ((select private.can_read_tenant(tenant_id)));

revoke insert, update, delete, truncate on public.news_categories, public.news_posts, public.news_revisions, public.news_revision_categories, public.news_delivery_runs from anon, authenticated;
grant select on public.news_categories, public.news_posts, public.news_revisions, public.news_revision_categories, public.news_delivery_runs to authenticated;

create or replace function private.publish_news_revision(
  p_tenant_id uuid,
  p_post_id uuid,
  p_revision_id uuid,
  p_actor_account_id uuid,
  p_scheduled boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.news_posts%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'content.publish.news') then
    raise exception using errcode = '42501', message = 'news publish permission denied';
  end if;
  select * into target from public.news_posts where tenant_id = p_tenant_id and id = p_post_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'news post not found'; end if;
  if target.status <> 'APPROVED' or target.current_revision_id <> p_revision_id then raise exception using errcode = '55000', message = 'only the approved current news revision can be published'; end if;
  update public.news_revisions set immutable = true, published_at = case when p_scheduled then null else statement_timestamp() end where tenant_id = p_tenant_id and id = p_revision_id and post_id = p_post_id;
  update public.news_posts set status = case when p_scheduled then 'SCHEDULED' else 'PUBLISHED' end, published_at = case when p_scheduled then null else statement_timestamp() end, row_version = row_version + 1 where tenant_id = p_tenant_id and id = p_post_id;
  return p_revision_id;
end;
$$;

create or replace function private.archive_news_post(
  p_tenant_id uuid,
  p_post_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'content.publish.news') then
    raise exception using errcode = '42501', message = 'news archive permission denied';
  end if;
  update public.news_posts set status = 'ARCHIVED', archived_at = statement_timestamp(), row_version = row_version + 1 where tenant_id = p_tenant_id and id = p_post_id and status in ('SCHEDULED', 'PUBLISHED');
  if not found then raise exception using errcode = 'P0002', message = 'published or scheduled news post not found'; end if;
  return p_post_id;
end;
$$;

grant execute on function private.publish_news_revision(uuid, uuid, uuid, uuid, boolean) to authenticated;
grant execute on function private.archive_news_post(uuid, uuid, uuid) to authenticated;

comment on table public.news_posts is 'Tenant-scoped news aggregate; workflow transitions are audited and published revisions cannot be mutated.';
comment on table public.news_delivery_runs is 'Audience/quota/cost preview and idempotent delivery reconciliation boundary; provider delivery is asynchronous.';
