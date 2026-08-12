-- PostgreSQL integration assertions for P3-DUP-001.
-- Run with ON_ERROR_STOP=1 after all migrations and synthetic seed.

do $$
declare
  rel record;
begin
  select c.relrowsecurity, c.relforcerowsecurity
    into rel
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'complaint_duplicate_links';
  if not rel.relrowsecurity or not rel.relforcerowsecurity then
    raise exception 'duplicate links must retain forced RLS';
  end if;
  if to_regprocedure('private.find_complaint_duplicate_candidates(uuid,uuid,numeric,integer,integer)') is null then
    raise exception 'duplicate candidate function is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'complaints_duplicate_candidate_idx') then
    raise exception 'duplicate candidate lookup index is missing';
  end if;
end;
$$;

do $$
declare
  tenant_a uuid := '00000000-0000-4000-8000-000000000001';
  tenant_b uuid := '00000000-0000-4000-8000-000000000002';
begin
  if exists (
    select 1
      from public.complaints as complaint
     where complaint.tenant_id = tenant_a
       and complaint.line_user_id like 'Utenantb%'
  ) then
    raise exception 'synthetic tenant fixture unexpectedly crosses tenant boundary';
  end if;
  if tenant_a = tenant_b then
    raise exception 'synthetic duplicate tenant ids must differ';
  end if;
end;
$$;
