-- Rich Menu lifecycle schema
-- Requirements: RF-01, RF-02, RF-05, RF-10, RF-13, RF-15, RF-16
-- Browser clients may read only their current tenant's safe metadata. A trusted
-- API/worker owns image upload, LINE provider calls, publish and rollback writes.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.rich_menu_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version integer not null,
  state text not null default 'DRAFT',
  chat_bar_text text not null,
  image_content_type text not null,
  image_width integer not null,
  image_height integer not null,
  image_size_bytes integer not null,
  image_sha256 text not null,
  image_storage_key text not null,
  provider_menu_id text,
  published_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint rich_menu_versions_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint rich_menu_versions_tenant_id_uq unique (tenant_id, id),
  constraint rich_menu_versions_version_uq unique (tenant_id, version),
  constraint rich_menu_versions_version_ck check (version > 0),
  constraint rich_menu_versions_state_ck check (state in ('DRAFT', 'VALIDATED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'SUPERSEDED')),
  constraint rich_menu_versions_chat_bar_ck check (length(btrim(chat_bar_text)) between 1 and 14),
  constraint rich_menu_versions_mime_ck check (image_content_type in ('image/jpeg', 'image/png')),
  constraint rich_menu_versions_dimensions_ck check (image_width between 800 and 2500 and image_height >= 250 and image_width::numeric / image_height::numeric >= 1.45),
  constraint rich_menu_versions_size_ck check (image_size_bytes between 1 and 1000000),
  constraint rich_menu_versions_sha_ck check (image_sha256 ~ '^[a-f0-9]{64}$'),
  constraint rich_menu_versions_storage_ck check (image_storage_key like 'private/tenants/%/rich-menu/%' and image_storage_key not like '%..%'),
  constraint rich_menu_versions_provider_ck check (provider_menu_id is null or state in ('PUBLISHED', 'SUPERSEDED')),
  constraint rich_menu_versions_published_ck check (published_at is null or state in ('PUBLISHED', 'SUPERSEDED')),
  constraint rich_menu_versions_row_version_ck check (row_version > 0)
);

create table if not exists public.rich_menu_areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  rich_menu_version_id uuid not null,
  x integer not null,
  y integer not null,
  width integer not null,
  height integer not null,
  label text not null,
  sort_order integer not null,
  action_type text not null,
  action_uri text,
  action_data text,
  action_text text,
  feature_key text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint rich_menu_areas_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint rich_menu_areas_version_fk foreign key (tenant_id, rich_menu_version_id) references public.rich_menu_versions (tenant_id, id) on delete cascade,
  constraint rich_menu_areas_tenant_id_uq unique (tenant_id, id),
  constraint rich_menu_areas_sort_uq unique (tenant_id, rich_menu_version_id, sort_order),
  constraint rich_menu_areas_x_ck check (x >= 0 and y >= 0 and width > 0 and height > 0),
  constraint rich_menu_areas_label_ck check (length(btrim(label)) between 1 and 40),
  constraint rich_menu_areas_sort_ck check (sort_order between 0 and 19),
  constraint rich_menu_areas_action_ck check (action_type in ('URI', 'POSTBACK', 'MESSAGE')),
  constraint rich_menu_areas_uri_ck check (action_uri is null or action_uri ~ '^https://'),
  constraint rich_menu_areas_data_ck check (action_data is null or length(btrim(action_data)) between 1 and 300),
  constraint rich_menu_areas_text_ck check (action_text is null or length(btrim(action_text)) between 1 and 300),
  constraint rich_menu_areas_feature_ck check (feature_key is null or feature_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  constraint rich_menu_areas_row_version_ck check (row_version > 0),
  constraint rich_menu_areas_action_payload_ck check (
    (action_type = 'URI' and action_uri is not null and action_data is null and action_text is null)
    or (action_type = 'POSTBACK' and action_data is not null and action_uri is null and action_text is null)
    or (action_type = 'MESSAGE' and action_text is not null and action_uri is null and action_data is null)
  )
);

create index if not exists rich_menu_versions_tenant_state_idx on public.rich_menu_versions (tenant_id, state, version desc);
create index if not exists rich_menu_areas_version_idx on public.rich_menu_areas (tenant_id, rich_menu_version_id, sort_order);
create unique index if not exists domain_outbox_rich_menu_idempotency_uq
  on public.domain_outbox (tenant_id, event_type, idempotency_key)
  where event_type = 'rich_menu.published' and idempotency_key is not null;

create or replace function private.enforce_rich_menu_state_transition()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.state <> old.state then
    if old.state = 'DRAFT' and new.state <> 'VALIDATED' then
      raise exception using errcode = '23514', message = 'invalid rich menu state transition';
    elsif old.state = 'VALIDATED' and new.state <> 'PUBLISHING' then
      raise exception using errcode = '23514', message = 'invalid rich menu state transition';
    elsif old.state = 'PUBLISHING' and new.state not in ('PUBLISHED', 'FAILED') then
      raise exception using errcode = '23514', message = 'invalid rich menu state transition';
    elsif old.state = 'PUBLISHED' and new.state <> 'SUPERSEDED' then
      raise exception using errcode = '23514', message = 'invalid rich menu state transition';
    elsif old.state = 'FAILED' and new.state <> 'VALIDATED' then
      raise exception using errcode = '23514', message = 'invalid rich menu state transition';
    elsif old.state = 'SUPERSEDED' and new.state <> 'PUBLISHED' then
      raise exception using errcode = '23514', message = 'invalid rich menu state transition';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rich_menu_versions_state_transition on public.rich_menu_versions;
create trigger rich_menu_versions_state_transition
  before update on public.rich_menu_versions
  for each row execute function private.enforce_rich_menu_state_transition();

drop trigger if exists rich_menu_versions_touch_updated_at on public.rich_menu_versions;
create trigger rich_menu_versions_touch_updated_at
  before update on public.rich_menu_versions
  for each row execute function private.touch_mutable_row();

create or replace function private.reject_rich_menu_area_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  version_state text;
  target_tenant_id uuid;
  target_version_id uuid;
begin
  if tg_op = 'DELETE' then
    target_tenant_id := old.tenant_id;
    target_version_id := old.rich_menu_version_id;
  else
    target_tenant_id := new.tenant_id;
    target_version_id := new.rich_menu_version_id;
  end if;
  select state into version_state
  from public.rich_menu_versions
  where tenant_id = target_tenant_id
    and id = target_version_id;
  if version_state is null or version_state not in ('DRAFT', 'FAILED') then
    raise exception using errcode = '55000', message = 'rich menu areas are immutable after validation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rich_menu_areas_mutation_guard on public.rich_menu_areas;
create trigger rich_menu_areas_mutation_guard
  before insert or update or delete on public.rich_menu_areas
  for each row execute function private.reject_rich_menu_area_mutation();

drop trigger if exists rich_menu_areas_touch_updated_at on public.rich_menu_areas;
create trigger rich_menu_areas_touch_updated_at
  before update on public.rich_menu_areas
  for each row execute function private.touch_mutable_row();

create or replace function private.enqueue_rich_menu_published()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.state = 'PUBLISHED' and (tg_op = 'INSERT' or old.state is distinct from 'PUBLISHED' or old.provider_menu_id is distinct from new.provider_menu_id) then
    insert into public.domain_outbox (tenant_id, event_type, event_version, aggregate_type, aggregate_id, idempotency_key, payload_json)
    values (
      new.tenant_id,
      'rich_menu.published',
      1,
      'RICH_MENU_VERSION',
      new.id,
      format('rich-menu-published:%s:%s', new.tenant_id, new.id),
      jsonb_build_object('richMenuVersionId', new.id, 'version', new.version, 'providerMenuId', new.provider_menu_id)
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists rich_menu_versions_publish_outbox on public.rich_menu_versions;
create trigger rich_menu_versions_publish_outbox
  after insert or update on public.rich_menu_versions
  for each row execute function private.enqueue_rich_menu_published();

alter table public.rich_menu_versions enable row level security;
alter table public.rich_menu_versions force row level security;
alter table public.rich_menu_areas enable row level security;
alter table public.rich_menu_areas force row level security;

drop policy if exists rich_menu_versions_read_current_tenant on public.rich_menu_versions;
create policy rich_menu_versions_read_current_tenant on public.rich_menu_versions
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));

drop policy if exists rich_menu_areas_read_current_tenant on public.rich_menu_areas;
create policy rich_menu_areas_read_current_tenant on public.rich_menu_areas
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));

revoke insert, update, delete, truncate on public.rich_menu_versions from anon, authenticated;
revoke insert, update, delete, truncate on public.rich_menu_areas from anon, authenticated;
grant select on public.rich_menu_versions, public.rich_menu_areas to authenticated;
