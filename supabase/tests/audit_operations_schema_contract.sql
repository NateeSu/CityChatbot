-- PostgreSQL contract assertions for P6-AUD-001.
-- Run with ON_ERROR_STOP=1 after all migrations and synthetic seed.

set timezone = 'UTC';

do $$
declare
  table_name text;
  required_tables text[] := array['audit_logs', 'staff_notifications', 'exports'];
  relation record;
begin
  foreach table_name in array required_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'missing audit operations table public.%', table_name;
    end if;
    select c.relrowsecurity, c.relforcerowsecurity
      into relation
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = table_name;
    if not relation.relrowsecurity or not relation.relforcerowsecurity then
      raise exception 'audit operations table RLS must be enabled and forced on public.%', table_name;
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'exports_requested_membership_fk') then
    raise exception 'exports must keep requested membership tenant composite FK';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exports_approved_membership_fk') then
    raise exception 'exports must keep approved membership tenant composite FK';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exports_job_fk') then
    raise exception 'exports must remain attached to tenant-scoped jobs';
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.audit_logs'::regclass and attname = 'integrity_hash')
     or not exists (select 1 from pg_attribute where attrelid = 'public.audit_logs'::regclass and attname = 'previous_hash') then
    raise exception 'audit hash-chain hardening columns are missing';
  end if;
  if not exists (select 1 from pg_proc where pronamespace = 'private'::regnamespace and proname = 'mark_staff_notification_read')
     or not exists (select 1 from pg_proc where pronamespace = 'private'::regnamespace and proname = 'revoke_export') then
    raise exception 'audit operations private mutation functions are missing';
  end if;
end;
$$;

-- Browser roles must not receive direct export table grants.
do $$
begin
  if has_table_privilege('authenticated', 'public.exports', 'insert')
     or has_table_privilege('authenticated', 'public.exports', 'update')
     or has_table_privilege('authenticated', 'public.exports', 'delete') then
    raise exception 'authenticated export mutation privilege unexpectedly exists';
  end if;
end;
$$;

