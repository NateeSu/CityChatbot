-- Versioned tenant bot personality, safety messages and policy-locked prompt settings.
-- Requirements: RF-01, RF-07, RF-08, RF-10, RF-13, RF-18.
-- The browser never writes this table. Trusted application functions own publish
-- and rollback so the mandatory safety policy cannot be edited by a tenant user.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

create table if not exists public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  settings_key text not null default 'citizen-default',
  version integer not null,
  state text not null default 'DRAFT',
  tone text not null default 'WARM',
  response_style text not null default 'GUIDED',
  locale text not null default 'th-TH',
  welcome_message text not null,
  disclaimer_message text not null,
  fallback_message text not null,
  handoff_message text not null,
  after_hours_message text not null,
  policy_json jsonb not null default jsonb_build_object(
    'aiDisclosureEnabled', true,
    'groundingRequired', true,
    'handoffEnabled', true,
    'tenantIsolationRequired', true,
    'safeAbstentionRequired', true,
    'allowedOutcomes', jsonb_build_array('ANSWER', 'CLARIFY', 'HANDOFF'),
    'allowedReasonCodes', jsonb_build_array(
      'ANSWERABLE', 'AMBIGUOUS_ENTITY', 'MISSING_TIME', 'AMBIGUOUS_INTENT',
      'NO_EVIDENCE', 'CONFLICTING_EVIDENCE', 'LOW_EVIDENCE', 'SENSITIVE',
      'PERSON_SPECIFIC', 'POLICY_REFUSAL', 'SECURITY', 'STAFF_REQUESTED', 'SYSTEM_ERROR'
    )
  ),
  config_hash text not null,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  certified_by uuid,
  certified_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint prompt_versions_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint prompt_versions_creator_fk foreign key (created_by) references public.user_accounts (id) on delete restrict,
  constraint prompt_versions_approver_fk foreign key (approved_by) references public.user_accounts (id) on delete restrict,
  constraint prompt_versions_certifier_fk foreign key (certified_by) references public.user_accounts (id) on delete restrict,
  constraint prompt_versions_tenant_id_uq unique (tenant_id, id),
  constraint prompt_versions_key_version_uq unique (tenant_id, settings_key, version),
  constraint prompt_versions_key_ck check (settings_key ~ '^[a-z][a-z0-9._:-]{2,127}$'),
  constraint prompt_versions_version_ck check (version > 0),
  constraint prompt_versions_state_ck check (state in ('DRAFT', 'UNIT_APPROVED', 'CERTIFIED', 'PUBLISHED', 'SUPERSEDED', 'ROLLED_BACK')),
  constraint prompt_versions_tone_ck check (tone in ('WARM', 'FORMAL', 'NEUTRAL')),
  constraint prompt_versions_style_ck check (response_style in ('CONCISE', 'GUIDED')),
  constraint prompt_versions_locale_ck check (locale in ('th-TH', 'en-US')),
  constraint prompt_versions_message_ck check (
    length(btrim(welcome_message)) between 1 and 500
    and length(btrim(disclaimer_message)) between 1 and 500
    and length(btrim(fallback_message)) between 1 and 500
    and length(btrim(handoff_message)) between 1 and 500
    and length(btrim(after_hours_message)) between 1 and 500
    and welcome_message !~ '[[:cntrl:]]'
    and disclaimer_message !~ '[[:cntrl:]]'
    and fallback_message !~ '[[:cntrl:]]'
    and handoff_message !~ '[[:cntrl:]]'
    and after_hours_message !~ '[[:cntrl:]]'
  ),
  constraint prompt_versions_policy_json_ck check (jsonb_typeof(policy_json) = 'object'),
  constraint prompt_versions_policy_lock_ck check (
    policy_json = jsonb_build_object(
      'aiDisclosureEnabled', true,
      'groundingRequired', true,
      'handoffEnabled', true,
      'tenantIsolationRequired', true,
      'safeAbstentionRequired', true,
      'allowedOutcomes', jsonb_build_array('ANSWER', 'CLARIFY', 'HANDOFF'),
      'allowedReasonCodes', jsonb_build_array(
        'ANSWERABLE', 'AMBIGUOUS_ENTITY', 'MISSING_TIME', 'AMBIGUOUS_INTENT',
        'NO_EVIDENCE', 'CONFLICTING_EVIDENCE', 'LOW_EVIDENCE', 'SENSITIVE',
        'PERSON_SPECIFIC', 'POLICY_REFUSAL', 'SECURITY', 'STAFF_REQUESTED', 'SYSTEM_ERROR'
      )
    )
  ),
  constraint prompt_versions_hash_ck check (config_hash ~ '^[a-f0-9]{64}$'),
  constraint prompt_versions_approval_ck check (
    state = 'DRAFT' or (approved_by is not null and approved_at is not null)
  ),
  constraint prompt_versions_certification_ck check (
    state <> 'CERTIFIED' or (certified_by is not null and certified_at is not null)
  ),
  constraint prompt_versions_published_ck check (
    state not in ('PUBLISHED', 'SUPERSEDED', 'ROLLED_BACK') or published_at is not null
  ),
  constraint prompt_versions_row_version_ck check (row_version > 0)
);

create unique index if not exists prompt_versions_published_uq
  on public.prompt_versions (tenant_id, settings_key)
  where state = 'PUBLISHED';
create index if not exists prompt_versions_lookup_idx
  on public.prompt_versions (tenant_id, settings_key, state, version desc);

alter table public.prompt_versions enable row level security;
alter table public.prompt_versions force row level security;

drop trigger if exists prompt_versions_touch_updated_at on public.prompt_versions;
create trigger prompt_versions_touch_updated_at
  before update on public.prompt_versions
  for each row execute function private.touch_mutable_row();

create or replace function private.guard_prompt_version_policy()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.policy_json <> jsonb_build_object(
    'aiDisclosureEnabled', true,
    'groundingRequired', true,
    'handoffEnabled', true,
    'tenantIsolationRequired', true,
    'safeAbstentionRequired', true,
    'allowedOutcomes', jsonb_build_array('ANSWER', 'CLARIFY', 'HANDOFF'),
    'allowedReasonCodes', jsonb_build_array(
      'ANSWERABLE', 'AMBIGUOUS_ENTITY', 'MISSING_TIME', 'AMBIGUOUS_INTENT',
      'NO_EVIDENCE', 'CONFLICTING_EVIDENCE', 'LOW_EVIDENCE', 'SENSITIVE',
      'PERSON_SPECIFIC', 'POLICY_REFUSAL', 'SECURITY', 'STAFF_REQUESTED', 'SYSTEM_ERROR'
    )
  ) then
    raise exception using errcode = '23514', message = 'mandatory bot safety policy is immutable';
  end if;
  if tg_op = 'UPDATE' and old.state in ('UNIT_APPROVED', 'CERTIFIED', 'PUBLISHED', 'SUPERSEDED', 'ROLLED_BACK') then
    if new.tone <> old.tone or new.response_style <> old.response_style or new.locale <> old.locale
       or new.welcome_message <> old.welcome_message or new.disclaimer_message <> old.disclaimer_message
       or new.fallback_message <> old.fallback_message or new.handoff_message <> old.handoff_message
       or new.after_hours_message <> old.after_hours_message or new.config_hash <> old.config_hash then
      raise exception using errcode = '55000', message = 'approved bot settings are immutable; create a new version';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prompt_versions_policy_guard on public.prompt_versions;
create trigger prompt_versions_policy_guard
  before insert or update on public.prompt_versions
  for each row execute function private.guard_prompt_version_policy();

drop policy if exists prompt_versions_read_current_tenant on public.prompt_versions;
create policy prompt_versions_read_current_tenant on public.prompt_versions
  for select to authenticated
  using ((select private.can_read_tenant(tenant_id)));

revoke insert, update, delete, truncate on public.prompt_versions from anon, authenticated;
grant select on public.prompt_versions to authenticated;

create or replace function private.publish_prompt_version(
  p_tenant_id uuid,
  p_prompt_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.prompt_versions%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'settings.manage.tenant') then
    raise exception using errcode = '42501', message = 'bot settings publish permission denied';
  end if;
  select * into target from public.prompt_versions where tenant_id = p_tenant_id and id = p_prompt_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'bot settings version not found'; end if;
  if target.state <> 'DRAFT' then raise exception using errcode = '55000', message = 'only draft bot settings can be published'; end if;
  update public.prompt_versions
     set state = 'SUPERSEDED', row_version = row_version + 1
   where tenant_id = p_tenant_id and settings_key = target.settings_key and state = 'PUBLISHED';
  update public.prompt_versions
     set state = 'PUBLISHED', approved_by = p_actor_account_id, approved_at = statement_timestamp(), published_at = statement_timestamp(), row_version = row_version + 1
   where tenant_id = p_tenant_id and id = p_prompt_id;
  return p_prompt_id;
end;
$$;

create or replace function private.rollback_prompt_version(
  p_tenant_id uuid,
  p_prompt_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.prompt_versions%rowtype;
begin
  if p_actor_account_id is null
     or p_actor_account_id <> private.current_account_id()
     or not private.has_tenant_permission(p_tenant_id, 'settings.manage.tenant') then
    raise exception using errcode = '42501', message = 'bot settings rollback permission denied';
  end if;
  select * into target from public.prompt_versions where tenant_id = p_tenant_id and id = p_prompt_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'bot settings version not found'; end if;
  if target.state not in ('SUPERSEDED', 'ROLLED_BACK') then raise exception using errcode = '55000', message = 'rollback requires a retained bot settings version'; end if;
  update public.prompt_versions
     set state = 'ROLLED_BACK', row_version = row_version + 1
   where tenant_id = p_tenant_id and settings_key = target.settings_key and state = 'PUBLISHED';
  update public.prompt_versions
     set state = 'PUBLISHED', published_at = statement_timestamp(), row_version = row_version + 1
   where tenant_id = p_tenant_id and id = p_prompt_id;
  return p_prompt_id;
end;
$$;

grant execute on function private.publish_prompt_version(uuid, uuid, uuid) to authenticated;
grant execute on function private.rollback_prompt_version(uuid, uuid, uuid) to authenticated;

comment on table public.prompt_versions is 'Tenant-scoped bot settings with immutable mandatory safety policy and auditable publish/rollback lifecycle.';
comment on column public.prompt_versions.policy_json is 'Canonical locked policy; ai disclosure, grounding, handoff, tenant isolation and safe abstention cannot be disabled.';
