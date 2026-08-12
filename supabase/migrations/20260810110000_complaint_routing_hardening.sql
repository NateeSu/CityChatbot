-- Requirements: RF-06, RF-08, RF-10, RF-16
-- Additive hardening for P4-ROUTE-001. AI routing remains a versioned,
-- append-only suggestion log; it never writes complaints.assigned_department_id.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

alter table public.complaint_routing_runs
  add column if not exists request_key text,
  add column if not exists request_hash text,
  add column if not exists run_type text not null default 'SUGGESTION',
  add column if not exists source_run_id uuid,
  add column if not exists original_output jsonb not null default '{}'::jsonb,
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists decision text not null default 'DEFAULT_INTAKE',
  add column if not exists recommended_department_id uuid,
  add column if not exists suggested_category text,
  add column if not exists suggested_priority text,
  add column if not exists suggested_risk text,
  add column if not exists confidence numeric,
  add column if not exists duplicate_candidate_ids jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_source_fk'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_source_fk
      foreign key (tenant_id, source_run_id)
      references public.complaint_routing_runs (tenant_id, id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_recommended_department_fk'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_recommended_department_fk
      foreign key (tenant_id, recommended_department_id)
      references public.departments (tenant_id, id)
      on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_request_key_ck'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_request_key_ck
      check (request_key is null or length(btrim(request_key)) between 8 and 255);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_request_hash_ck'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_request_hash_ck
      check (request_hash is null or request_hash ~ '^[a-f0-9]{64}$');
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_type_ck'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_type_ck
      check (run_type in ('SUGGESTION', 'CORRECTION'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_source_ck'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_source_ck
      check ((run_type = 'SUGGESTION' and source_run_id is null) or (run_type = 'CORRECTION' and source_run_id is not null));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_output_ck'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_output_ck
      check (jsonb_typeof(original_output) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_evidence_ck'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_evidence_ck
      check (jsonb_typeof(evidence) = 'array');
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_decision_ck'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_decision_ck
      check (decision in ('SUGGESTION', 'DEFAULT_INTAKE', 'CORRECTED'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_confidence_ck'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_confidence_ck
      check (confidence is null or (confidence >= 0 and confidence <= 1));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_duplicate_ids_ck'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_duplicate_ids_ck
      check (jsonb_typeof(duplicate_candidate_ids) = 'array');
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_priority_ck'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_priority_ck
      check (suggested_priority is null or suggested_priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'complaint_routing_runs_risk_ck'
       and conrelid = 'public.complaint_routing_runs'::regclass
  ) then
    alter table public.complaint_routing_runs
      add constraint complaint_routing_runs_risk_ck
      check (suggested_risk is null or suggested_risk in ('STANDARD', 'SENSITIVE', 'HIGH'));
  end if;
end;
$$;

create unique index if not exists complaint_routing_runs_request_uq
  on public.complaint_routing_runs (tenant_id, complaint_id, request_key)
  where request_key is not null;

create index if not exists complaint_routing_runs_source_idx
  on public.complaint_routing_runs (tenant_id, source_run_id, created_at desc);

comment on column public.complaint_routing_runs.original_output is
  'Validated and privacy-minimized structured model output; never raw provider content.';
comment on column public.complaint_routing_runs.recommended_department_id is
  'AI recommendation only; staff acceptance is required before complaint assignment.';
comment on column public.complaint_routing_runs.final_department_id is
  'Staff-reviewed final department for this routing run; does not mutate complaints.assignment.';
