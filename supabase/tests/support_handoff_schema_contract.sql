-- PostgreSQL contract assertions for P5-HO-001.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  table_name text;
  relation record;
begin
  foreach table_name in array array[
    'support_tickets', 'support_ticket_messages', 'support_ticket_assignments',
    'support_ticket_status_logs', 'support_ticket_audit'
  ] loop
    select c.relrowsecurity, c.relforcerowsecurity into relation
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = table_name;
    if not found then raise exception 'missing support table: %', table_name; end if;
    if not relation.relrowsecurity or not relation.relforcerowsecurity then
      raise exception 'support table must use forced RLS: %', table_name;
    end if;
  end loop;
end;
$$;

do $$
declare
  policy_table text;
begin
  foreach policy_table in array array[
    'support_tickets', 'support_ticket_messages', 'support_ticket_assignments',
    'support_ticket_status_logs', 'support_ticket_audit'
  ] loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public'
         and tablename = policy_table
         and policyname like policy_table || '_read_%'
         and cmd = 'SELECT'
    ) then
      raise exception 'support read policy is missing: %', policy_table;
    end if;
    if exists (
      select 1 from pg_policies
       where schemaname = 'public'
         and tablename = policy_table
         and cmd = 'ALL'
    ) then
      raise exception 'broad support policy is forbidden: %', policy_table;
    end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'support_tickets_request_uq') then
    raise exception 'support request idempotency index is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'support_tickets_source_event_uq') then
    raise exception 'support source event idempotency index is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'support_tickets_citizen_topic_idx') then
    raise exception 'support active citizen/topic dedupe index is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'support_tickets_transition') then
    raise exception 'support state transition trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'support_ticket_messages_append_only') then
    raise exception 'support message append-only trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'support_ticket_assignments_append_only') then
    raise exception 'support assignment append-only trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'support_ticket_status_logs_append_only') then
    raise exception 'support status append-only trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'support_ticket_audit_append_only') then
    raise exception 'support audit append-only trigger is missing';
  end if;
end;
$$;

do $$
declare
  constraint_name text;
begin
  foreach constraint_name in array array[
    'support_tickets_intake_queue_fk', 'support_tickets_suggested_department_fk',
    'support_tickets_assigned_department_fk', 'support_tickets_assigned_membership_fk',
    'support_ticket_messages_ticket_fk', 'support_ticket_assignments_ticket_fk',
    'support_ticket_assignments_department_fk', 'support_ticket_status_logs_ticket_fk',
    'support_ticket_audit_ticket_fk'
  ] loop
    if not exists (select 1 from pg_constraint where conname = constraint_name) then
      raise exception 'support tenant composite constraint is missing: %', constraint_name;
    end if;
  end loop;
end;
$$;

do $$
declare
  rel_name text;
begin
  foreach rel_name in array array[
    'support_tickets', 'support_ticket_messages', 'support_ticket_assignments',
    'support_ticket_status_logs', 'support_ticket_audit'
  ] loop
    if exists (
      select 1 from information_schema.role_table_grants as grants
       where grants.table_schema = 'public'
         and grants.table_name = rel_name
         and grants.grantee = 'authenticated'
         and grants.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    ) then
      raise exception 'authenticated support writes must be denied: %', rel_name;
    end if;
  end loop;
end;
$$;

select 'SUPPORT_HANDOFF_SQL_CONTRACT_PASS' as contract;
