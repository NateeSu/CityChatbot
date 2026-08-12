begin;

-- P6-TEN-001: onboarding is a durable, resumable state machine. Provider
-- credentials are references managed by the secret boundary, never values here.
create table if not exists public.tenant_provisioning_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  status text not null default 'RUNNING',
  created_by_account_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint tenant_provisioning_runs_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint tenant_provisioning_runs_creator_fk foreign key (created_by_account_id) references public.user_accounts (id) on delete restrict,
  constraint tenant_provisioning_runs_tenant_id_uq unique (tenant_id, id),
  constraint tenant_provisioning_runs_status_ck check (status in ('RUNNING', 'PARTIAL', 'COMPLETE', 'ROLLED_BACK')),
  constraint tenant_provisioning_runs_row_version_ck check (row_version > 0)
);

create table if not exists public.tenant_provisioning_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_id uuid not null,
  step_key text not null,
  status text not null default 'PENDING',
  attempt integer not null default 0,
  error_code text,
  detail text not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint tenant_provisioning_steps_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint tenant_provisioning_steps_run_fk foreign key (tenant_id, run_id)
    references public.tenant_provisioning_runs (tenant_id, id) on delete cascade,
  constraint tenant_provisioning_steps_tenant_id_uq unique (tenant_id, id),
  constraint tenant_provisioning_steps_unique unique (tenant_id, run_id, step_key),
  constraint tenant_provisioning_steps_key_ck check (step_key in ('TENANT', 'SETTINGS', 'CHANNEL', 'DEPARTMENTS', 'ADMIN', 'THEME', 'MENU', 'CONTACT', 'FLAGS')),
  constraint tenant_provisioning_steps_status_ck check (status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  constraint tenant_provisioning_steps_attempt_ck check (attempt >= 0),
  constraint tenant_provisioning_steps_detail_ck check (length(btrim(detail)) between 1 and 1000),
  constraint tenant_provisioning_steps_row_version_ck check (row_version > 0)
);

create table if not exists public.tenant_usage_limit_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  usage_key text not null,
  window_name text not null,
  limit_value bigint not null,
  version integer not null,
  state text not null default 'ACTIVE',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint tenant_usage_limits_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint tenant_usage_limits_tenant_id_uq unique (tenant_id, id),
  constraint tenant_usage_limits_version_uq unique (tenant_id, usage_key, version),
  constraint tenant_usage_limits_key_ck check (usage_key in ('staff_seats', 'line_events_daily', 'storage_bytes', 'ai_runs_monthly')),
  constraint tenant_usage_limits_window_ck check (window_name in ('DAY', 'MONTH')),
  constraint tenant_usage_limits_value_ck check (limit_value > 0),
  constraint tenant_usage_limits_state_ck check (state in ('ACTIVE', 'RETIRED')),
  constraint tenant_usage_limits_row_version_ck check (row_version > 0)
);

create table if not exists public.tenant_usage_counters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  usage_key text not null,
  window_name text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  used_value bigint not null default 0,
  limit_value bigint not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version integer not null default 1,
  constraint tenant_usage_counters_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint tenant_usage_counters_tenant_id_uq unique (tenant_id, id),
  constraint tenant_usage_counters_unique_period unique (tenant_id, usage_key, window_name, period_start),
  constraint tenant_usage_counters_key_ck check (usage_key in ('staff_seats', 'line_events_daily', 'storage_bytes', 'ai_runs_monthly')),
  constraint tenant_usage_counters_window_ck check (window_name in ('DAY', 'MONTH')),
  constraint tenant_usage_counters_period_ck check (period_end > period_start),
  constraint tenant_usage_counters_value_ck check (used_value >= 0 and limit_value > 0 and used_value <= limit_value),
  constraint tenant_usage_counters_row_version_ck check (row_version > 0)
);

create index if not exists tenant_provisioning_steps_run_idx on public.tenant_provisioning_steps (tenant_id, run_id, step_key);
create index if not exists tenant_usage_counters_window_idx on public.tenant_usage_counters (tenant_id, usage_key, period_end);

alter table public.tenant_provisioning_runs enable row level security;
alter table public.tenant_provisioning_runs force row level security;
alter table public.tenant_provisioning_steps enable row level security;
alter table public.tenant_provisioning_steps force row level security;
alter table public.tenant_usage_limit_versions enable row level security;
alter table public.tenant_usage_limit_versions force row level security;
alter table public.tenant_usage_counters enable row level security;
alter table public.tenant_usage_counters force row level security;

revoke all on table public.tenant_provisioning_runs from anon, authenticated;
revoke all on table public.tenant_provisioning_steps from anon, authenticated;
revoke all on table public.tenant_usage_limit_versions from anon, authenticated;
revoke all on table public.tenant_usage_counters from anon, authenticated;

create or replace function private.guard_tenant_provisioning_step()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.tenant_id <> old.tenant_id or new.run_id <> old.run_id or new.step_key <> old.step_key or old.status = 'SUCCEEDED' and new.status <> old.status then
    raise exception 'provisioning step identity/completed state is immutable';
  end if;
  if new.attempt < old.attempt then raise exception 'provisioning step attempts cannot decrease'; end if;
  new.updated_at = statement_timestamp();
  new.row_version = old.row_version + 1;
  return new;
end;
$$;

drop trigger if exists tenant_provisioning_step_guard on public.tenant_provisioning_steps;
create trigger tenant_provisioning_step_guard
before update on public.tenant_provisioning_steps
for each row execute function private.guard_tenant_provisioning_step();

create or replace function private.provision_tenant_step(
  p_tenant_id uuid,
  p_run_id uuid,
  p_step_key text,
  p_detail text,
  p_status text,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_status not in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED') then raise exception 'invalid provisioning step status'; end if;
  insert into public.tenant_provisioning_steps (tenant_id, run_id, step_key, status, attempt, detail, error_code, started_at, completed_at)
  values (p_tenant_id, p_run_id, p_step_key, p_status, case when p_status in ('RUNNING', 'SUCCEEDED', 'FAILED') then 1 else 0 end, btrim(p_detail), p_error_code, case when p_status in ('RUNNING', 'SUCCEEDED', 'FAILED') then statement_timestamp() end, case when p_status = 'SUCCEEDED' then statement_timestamp() end)
  on conflict (tenant_id, run_id, step_key) do update set status = excluded.status, attempt = public.tenant_provisioning_steps.attempt + 1, detail = excluded.detail, error_code = excluded.error_code;
  return true;
end;
$$;

create or replace function private.suspend_tenant(p_tenant_id uuid, p_expected_version integer)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.tenants set status = 'SUSPENDED', updated_at = statement_timestamp(), row_version = row_version + 1 where id = p_tenant_id and row_version = p_expected_version and status <> 'ARCHIVED';
  return found;
end;
$$;

create or replace function private.reactivate_tenant(p_tenant_id uuid, p_expected_version integer)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.tenant_provisioning_runs where tenant_id = p_tenant_id and status = 'COMPLETE') then return false; end if;
  update public.tenants set status = 'ACTIVE', updated_at = statement_timestamp(), row_version = row_version + 1 where id = p_tenant_id and row_version = p_expected_version and status = 'SUSPENDED';
  return found;
end;
$$;

create or replace function private.consume_tenant_usage(p_tenant_id uuid, p_usage_key text, p_window text, p_amount bigint, p_period_start timestamptz, p_period_end timestamptz)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_limit bigint;
begin
  if p_amount < 1 or p_period_end <= p_period_start then raise exception 'invalid usage request'; end if;
  select limit_value into current_limit from public.tenant_usage_limit_versions where tenant_id = p_tenant_id and usage_key = p_usage_key and window_name = p_window and state = 'ACTIVE' order by version desc limit 1;
  if current_limit is null then return false; end if;
  insert into public.tenant_usage_counters (tenant_id, usage_key, window_name, period_start, period_end, used_value, limit_value)
  values (p_tenant_id, p_usage_key, p_window, p_period_start, p_period_end, p_amount, current_limit)
  on conflict (tenant_id, usage_key, window_name, period_start) do update set used_value = public.tenant_usage_counters.used_value + excluded.used_value, limit_value = current_limit, updated_at = statement_timestamp();
  if exists (select 1 from public.tenant_usage_counters where tenant_id = p_tenant_id and usage_key = p_usage_key and window_name = p_window and period_start = p_period_start and used_value > limit_value) then raise exception 'tenant usage limit exceeded'; end if;
  return true;
end;
$$;

comment on table public.tenant_provisioning_runs is 'P6-TEN-001: resumable onboarding state; no credential values';
comment on function private.consume_tenant_usage(uuid, text, text, bigint, timestamptz, timestamptz) is 'Trusted server-only atomic usage limit enforcement';

commit;
