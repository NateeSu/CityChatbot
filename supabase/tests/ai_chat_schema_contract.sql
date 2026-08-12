-- PostgreSQL contract assertions for P4-CHAT-002.
-- Chat state and trace tables are tenant-isolated and append-only where required.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  table_name text;
  relation record;
begin
  foreach table_name in array array[
    'ai_chat_sessions', 'ai_chat_messages', 'ai_runs',
    'ai_claims', 'ai_citations', 'ai_feedback'
  ] loop
    select c.relrowsecurity, c.relforcerowsecurity into relation
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = table_name;
    if not found then raise exception 'missing AI chat table: %', table_name; end if;
    if not relation.relrowsecurity or not relation.relforcerowsecurity then
      raise exception 'AI chat table must use forced RLS: %', table_name;
    end if;
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public'
         and tablename = table_name
         and policyname = table_name || '_read_current_tenant'
    ) then
      raise exception 'tenant read policy is missing: %', table_name;
    end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'ai_chat_sessions_active_identity_uq') then
    raise exception 'active session identity idempotency invariant is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'ai_chat_messages_event_kind_uq') then
    raise exception 'message event idempotency invariant is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'ai_chat_messages_append_only') then
    raise exception 'append-only message trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'ai_runs_append_only') then
    raise exception 'append-only run trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'ai_feedback_append_only') then
    raise exception 'append-only feedback trigger is missing';
  end if;
end;
$$;

do $$
declare
  rel_name text;
begin
  foreach rel_name in array array[
    'ai_chat_sessions', 'ai_chat_messages', 'ai_runs',
    'ai_claims', 'ai_citations', 'ai_feedback'
  ] loop
    if exists (
      select 1 from information_schema.role_table_grants as grants
       where grants.table_schema = 'public'
         and grants.table_name = rel_name
         and grants.grantee = 'authenticated'
         and grants.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    ) then
      raise exception 'authenticated writes must be denied: %', rel_name;
    end if;
  end loop;
end;
$$;

select 'AI_CHAT_SCHEMA_SQL_CONTRACT_PASS' as contract;
