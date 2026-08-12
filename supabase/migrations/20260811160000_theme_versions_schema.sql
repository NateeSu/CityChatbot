-- Versioned tenant branding/theme configuration with a database-owned publish boundary.
-- Requirements: RF-01, RF-02, RF-03, RF-10, RF-13, RF-18.
-- Token shape is structured JSON only for the repeated per-mode color map; the
-- table still enforces required keys, color format, tenant integrity and RLS.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.theme_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  settings_key text not null default 'municipality-default',
  version integer not null,
  state text not null default 'DRAFT',
  brand_name text not null,
  landmark text not null,
  logo_asset_path text,
  font_scale text not null default 'DEFAULT',
  density text not null default 'COMFORTABLE',
  radius text not null default 'STANDARD',
  light_tokens jsonb not null,
  dark_tokens jsonb not null,
  high_contrast_tokens jsonb not null,
  config_hash text not null,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint theme_versions_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint theme_versions_creator_fk foreign key (created_by) references public.user_accounts (id) on delete restrict,
  constraint theme_versions_approver_fk foreign key (approved_by) references public.user_accounts (id) on delete restrict,
  constraint theme_versions_tenant_id_uq unique (tenant_id, id),
  constraint theme_versions_key_version_uq unique (tenant_id, settings_key, version),
  constraint theme_versions_key_ck check (settings_key ~ '^[a-z][a-z0-9._:-]{2,127}$'),
  constraint theme_versions_version_ck check (version > 0),
  constraint theme_versions_state_ck check (state in ('DRAFT', 'UNIT_APPROVED', 'PUBLISHED', 'SUPERSEDED', 'ROLLED_BACK')),
  constraint theme_versions_font_scale_ck check (font_scale in ('DEFAULT', 'LARGE')),
  constraint theme_versions_density_ck check (density in ('COMFORTABLE', 'COMPACT')),
  constraint theme_versions_radius_ck check (radius in ('STANDARD', 'SOFT')),
  constraint theme_versions_copy_ck check (
    length(btrim(brand_name)) between 1 and 80
    and length(btrim(landmark)) between 1 and 120
    and brand_name !~ '[[:cntrl:]]'
    and landmark !~ '[[:cntrl:]]'
  ),
  constraint theme_versions_asset_ck check (logo_asset_path is null or logo_asset_path ~ '^/[^/?#[:space:]][^?#[:space:]]{0,254}$'),
  constraint theme_versions_token_shape_ck check (
    jsonb_typeof(light_tokens) = 'object'
    and jsonb_typeof(dark_tokens) = 'object'
    and jsonb_typeof(high_contrast_tokens) = 'object'
    and light_tokens ?& array['background','surface','surfaceSubtle','surfaceElevated','textPrimary','textSecondary','border','focusRing','primary','primaryHover','primaryContrast','accent','accentContrast','statusInfo','statusSuccess','statusWarning','statusDanger','statusNeutral']
    and dark_tokens ?& array['background','surface','surfaceSubtle','surfaceElevated','textPrimary','textSecondary','border','focusRing','primary','primaryHover','primaryContrast','accent','accentContrast','statusInfo','statusSuccess','statusWarning','statusDanger','statusNeutral']
    and high_contrast_tokens ?& array['background','surface','surfaceSubtle','surfaceElevated','textPrimary','textSecondary','border','focusRing','primary','primaryHover','primaryContrast','accent','accentContrast','statusInfo','statusSuccess','statusWarning','statusDanger','statusNeutral']
  ),
  constraint theme_versions_color_shape_ck check (
    (light_tokens->>'background') ~* '^#[0-9a-f]{6}$' and (light_tokens->>'surface') ~* '^#[0-9a-f]{6}$'
    and (light_tokens->>'surfaceSubtle') ~* '^#[0-9a-f]{6}$' and (light_tokens->>'surfaceElevated') ~* '^#[0-9a-f]{6}$'
    and (light_tokens->>'textPrimary') ~* '^#[0-9a-f]{6}$' and (light_tokens->>'textSecondary') ~* '^#[0-9a-f]{6}$'
    and (light_tokens->>'border') ~* '^#[0-9a-f]{6}$' and (light_tokens->>'focusRing') ~* '^#[0-9a-f]{6}$'
    and (light_tokens->>'primary') ~* '^#[0-9a-f]{6}$' and (light_tokens->>'primaryHover') ~* '^#[0-9a-f]{6}$'
    and (light_tokens->>'primaryContrast') ~* '^#[0-9a-f]{6}$' and (light_tokens->>'accent') ~* '^#[0-9a-f]{6}$'
    and (light_tokens->>'accentContrast') ~* '^#[0-9a-f]{6}$' and (light_tokens->>'statusInfo') ~* '^#[0-9a-f]{6}$'
    and (light_tokens->>'statusSuccess') ~* '^#[0-9a-f]{6}$' and (light_tokens->>'statusWarning') ~* '^#[0-9a-f]{6}$'
    and (light_tokens->>'statusDanger') ~* '^#[0-9a-f]{6}$' and (light_tokens->>'statusNeutral') ~* '^#[0-9a-f]{6}$'
    and (dark_tokens->>'background') ~* '^#[0-9a-f]{6}$' and (dark_tokens->>'surface') ~* '^#[0-9a-f]{6}$'
    and (dark_tokens->>'surfaceSubtle') ~* '^#[0-9a-f]{6}$' and (dark_tokens->>'surfaceElevated') ~* '^#[0-9a-f]{6}$'
    and (dark_tokens->>'textPrimary') ~* '^#[0-9a-f]{6}$' and (dark_tokens->>'textSecondary') ~* '^#[0-9a-f]{6}$'
    and (dark_tokens->>'border') ~* '^#[0-9a-f]{6}$' and (dark_tokens->>'focusRing') ~* '^#[0-9a-f]{6}$'
    and (dark_tokens->>'primary') ~* '^#[0-9a-f]{6}$' and (dark_tokens->>'primaryHover') ~* '^#[0-9a-f]{6}$'
    and (dark_tokens->>'primaryContrast') ~* '^#[0-9a-f]{6}$' and (dark_tokens->>'accent') ~* '^#[0-9a-f]{6}$'
    and (dark_tokens->>'accentContrast') ~* '^#[0-9a-f]{6}$' and (dark_tokens->>'statusInfo') ~* '^#[0-9a-f]{6}$'
    and (dark_tokens->>'statusSuccess') ~* '^#[0-9a-f]{6}$' and (dark_tokens->>'statusWarning') ~* '^#[0-9a-f]{6}$'
    and (dark_tokens->>'statusDanger') ~* '^#[0-9a-f]{6}$' and (dark_tokens->>'statusNeutral') ~* '^#[0-9a-f]{6}$'
    and (high_contrast_tokens->>'background') ~* '^#[0-9a-f]{6}$' and (high_contrast_tokens->>'surface') ~* '^#[0-9a-f]{6}$'
    and (high_contrast_tokens->>'surfaceSubtle') ~* '^#[0-9a-f]{6}$' and (high_contrast_tokens->>'surfaceElevated') ~* '^#[0-9a-f]{6}$'
    and (high_contrast_tokens->>'textPrimary') ~* '^#[0-9a-f]{6}$' and (high_contrast_tokens->>'textSecondary') ~* '^#[0-9a-f]{6}$'
    and (high_contrast_tokens->>'border') ~* '^#[0-9a-f]{6}$' and (high_contrast_tokens->>'focusRing') ~* '^#[0-9a-f]{6}$'
    and (high_contrast_tokens->>'primary') ~* '^#[0-9a-f]{6}$' and (high_contrast_tokens->>'primaryHover') ~* '^#[0-9a-f]{6}$'
    and (high_contrast_tokens->>'primaryContrast') ~* '^#[0-9a-f]{6}$' and (high_contrast_tokens->>'accent') ~* '^#[0-9a-f]{6}$'
    and (high_contrast_tokens->>'accentContrast') ~* '^#[0-9a-f]{6}$' and (high_contrast_tokens->>'statusInfo') ~* '^#[0-9a-f]{6}$'
    and (high_contrast_tokens->>'statusSuccess') ~* '^#[0-9a-f]{6}$' and (high_contrast_tokens->>'statusWarning') ~* '^#[0-9a-f]{6}$'
    and (high_contrast_tokens->>'statusDanger') ~* '^#[0-9a-f]{6}$' and (high_contrast_tokens->>'statusNeutral') ~* '^#[0-9a-f]{6}$'),
  constraint theme_versions_hash_ck check (config_hash ~ '^[a-f0-9]{64}$'),
  constraint theme_versions_approval_ck check (state = 'DRAFT' or (approved_by is not null and approved_at is not null)),
  constraint theme_versions_published_ck check (state not in ('PUBLISHED', 'SUPERSEDED', 'ROLLED_BACK') or published_at is not null),
  constraint theme_versions_row_version_ck check (row_version > 0)
);

create unique index if not exists theme_versions_published_uq
  on public.theme_versions (tenant_id, settings_key)
  where state = 'PUBLISHED';
create index if not exists theme_versions_lookup_idx
  on public.theme_versions (tenant_id, settings_key, state, version desc);

alter table public.theme_versions enable row level security;
alter table public.theme_versions force row level security;

drop trigger if exists theme_versions_touch_updated_at on public.theme_versions;
create trigger theme_versions_touch_updated_at
  before update on public.theme_versions
  for each row execute function private.touch_mutable_row();

create or replace function private.guard_theme_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and old.state in ('UNIT_APPROVED', 'PUBLISHED', 'SUPERSEDED', 'ROLLED_BACK') then
    if new.brand_name <> old.brand_name or new.landmark <> old.landmark or new.logo_asset_path is distinct from old.logo_asset_path
       or new.font_scale <> old.font_scale or new.density <> old.density or new.radius <> old.radius
       or new.light_tokens <> old.light_tokens or new.dark_tokens <> old.dark_tokens
       or new.high_contrast_tokens <> old.high_contrast_tokens or new.config_hash <> old.config_hash then
      raise exception using errcode = '55000', message = 'approved theme settings are immutable; create a new version';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists theme_versions_guard on public.theme_versions;
create trigger theme_versions_guard
  before insert or update on public.theme_versions
  for each row execute function private.guard_theme_version();

drop policy if exists theme_versions_read_current_tenant on public.theme_versions;
create policy theme_versions_read_current_tenant on public.theme_versions
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));

revoke insert, update, delete, truncate on public.theme_versions from anon, authenticated;
grant select on public.theme_versions to authenticated;

create or replace function private.publish_theme_version(
  p_tenant_id uuid,
  p_theme_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.theme_versions%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'settings.manage.tenant') then
    raise exception using errcode = '42501', message = 'theme publish permission denied';
  end if;
  select * into target from public.theme_versions where tenant_id = p_tenant_id and id = p_theme_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'theme version not found'; end if;
  if target.state <> 'DRAFT' then raise exception using errcode = '55000', message = 'only draft theme settings can be published'; end if;
  update public.theme_versions
     set state = 'SUPERSEDED', row_version = row_version + 1
   where tenant_id = p_tenant_id and settings_key = target.settings_key and state = 'PUBLISHED';
  update public.theme_versions
     set state = 'PUBLISHED', approved_by = p_actor_account_id, approved_at = statement_timestamp(), published_at = statement_timestamp(), row_version = row_version + 1
   where tenant_id = p_tenant_id and id = p_theme_id;
  return p_theme_id;
end;
$$;

create or replace function private.rollback_theme_version(
  p_tenant_id uuid,
  p_theme_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.theme_versions%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'settings.manage.tenant') then
    raise exception using errcode = '42501', message = 'theme rollback permission denied';
  end if;
  select * into target from public.theme_versions where tenant_id = p_tenant_id and id = p_theme_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'theme version not found'; end if;
  if target.state not in ('SUPERSEDED', 'ROLLED_BACK') then raise exception using errcode = '55000', message = 'rollback requires a retained theme version'; end if;
  update public.theme_versions
     set state = 'ROLLED_BACK', row_version = row_version + 1
   where tenant_id = p_tenant_id and settings_key = target.settings_key and state = 'PUBLISHED';
  update public.theme_versions
     set state = 'PUBLISHED', published_at = statement_timestamp(), row_version = row_version + 1
   where tenant_id = p_tenant_id and id = p_theme_id;
  return p_theme_id;
end;
$$;

grant execute on function private.publish_theme_version(uuid, uuid, uuid) to authenticated;
grant execute on function private.rollback_theme_version(uuid, uuid, uuid) to authenticated;

comment on table public.theme_versions is 'Tenant-scoped versioned branding/theme configuration with forced RLS and atomic publish/rollback.';
comment on column public.theme_versions.light_tokens is 'Validated semantic token map for the light theme; application contrast gate checks WCAG AA before publish.';
