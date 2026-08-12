-- Run as a database owner that can SET ROLE authenticated.
-- The migration grants SELECT only and installs no authenticated write policy.

\set ON_ERROR_STOP on
set timezone = 'UTC';
set role authenticated;
select set_config(
  'request.jwt.claims',
  '{"tenant_id":"00000000-0000-4000-8000-000000000001","account_id":"10000000-0000-4000-8000-000000000001"}',
  false
);

do $$
declare
  visible_a integer;
  visible_b integer;
begin
  select count(*) into visible_a
  from public.departments
  where tenant_id = '00000000-0000-4000-8000-000000000001';

  select count(*) into visible_b
  from public.departments
  where tenant_id = '00000000-0000-4000-8000-000000000002';

  if visible_a <> 1 then
    raise exception 'tenant A staff A1 should see 1 department, got %', visible_a;
  end if;
  if visible_b <> 0 then
    raise exception 'tenant A must not see tenant B departments, got %', visible_b;
  end if;

  begin
    insert into public.departments (tenant_id, code, name)
    values ('00000000-0000-4000-8000-000000000001', 'ZZ_WRITE_DENY', 'Write must be denied');
    raise exception 'authenticated write unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;
