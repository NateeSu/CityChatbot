-- PostgreSQL/Supabase integration assertions for P1-RLS-001.
-- Run after core migration, RLS hardening migration, and synthetic seed.

\set ON_ERROR_STOP on
set timezone = 'UTC';
set role authenticated;

begin;
select set_config(
  'request.jwt.claims',
  '{"tenant_id":"00000000-0000-4000-8000-000000000001","account_id":"10000000-0000-4000-8000-000000000001"}',
  false
);

do $$
declare
  a1_visible integer;
  a2_visible integer;
  b1_visible integer;
  b_tenant_visible integer;
  a1_scope_visible integer;
  a2_scope_visible integer;
begin
  select count(*) into a1_visible from public.departments where id = '30000000-0000-4000-8000-000000000001';
  select count(*) into a2_visible from public.departments where id = '30000000-0000-4000-8000-000000000002';
  select count(*) into b1_visible from public.departments where id = '30000000-0000-4000-8000-000000000003';
  select count(*) into b_tenant_visible from public.departments where tenant_id = '00000000-0000-4000-8000-000000000002';
  select count(*) into a1_scope_visible from public.department_work_scope_versions where department_id = '30000000-0000-4000-8000-000000000001';
  select count(*) into a2_scope_visible from public.department_work_scope_versions where department_id = '30000000-0000-4000-8000-000000000002';

  if a1_visible <> 1 or a2_visible <> 0 or b1_visible <> 0 or b_tenant_visible <> 0 then
    raise exception 'staff A1 department isolation failed: A1=%, A2=%, B1=%, Btenant=%', a1_visible, a2_visible, b1_visible, b_tenant_visible;
  end if;
  if a1_scope_visible <> 1 or a2_scope_visible <> 0 then
    raise exception 'staff A1 work-scope isolation failed: A1=%, A2=%', a1_scope_visible, a2_scope_visible;
  end if;

  begin
    insert into public.departments (tenant_id, code, name)
    values ('00000000-0000-4000-8000-000000000001', 'A9', 'Must be denied to staff');
    raise exception 'staff insert unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;
rollback;

begin;
select set_config(
  'request.jwt.claims',
  '{"tenant_id":"00000000-0000-4000-8000-000000000001","account_id":"10000000-0000-4000-8000-000000000004"}',
  false
);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.departments where tenant_id = '00000000-0000-4000-8000-000000000001';
  if visible_count <> 2 then
    raise exception 'tenant admin should see both tenant A departments, got %', visible_count;
  end if;

  insert into public.departments (tenant_id, code, name)
  values ('00000000-0000-4000-8000-000000000001', 'A9', 'Rolled back admin write');

  update public.tenant_settings
     set settings_json = '{"seed":"synthetic","rls_test":true}'::jsonb
   where tenant_id = '00000000-0000-4000-8000-000000000001';
end;
$$;
rollback;

begin;
select set_config(
  'request.jwt.claims',
  '{"tenant_id":"00000000-0000-4000-8000-000000000001","account_id":"10000000-0000-4000-8000-000000000003"}',
  false
);

do $$
declare
  a1_visible integer;
  a2_visible integer;
begin
  select count(*) into a1_visible from public.departments where id = '30000000-0000-4000-8000-000000000001';
  select count(*) into a2_visible from public.departments where id = '30000000-0000-4000-8000-000000000002';
  if a1_visible <> 0 or a2_visible <> 1 then
    raise exception 'staff A2 department isolation failed: A1=%, A2=%', a1_visible, a2_visible;
  end if;
end;
$$;
rollback;

reset role;
