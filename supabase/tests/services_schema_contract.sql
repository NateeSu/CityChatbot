set search_path = public, private;
do $$ begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'service_feature_flags') then raise exception 'service_feature_flags missing'; end if;
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'service_posts') then raise exception 'service_posts missing'; end if;
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'service_revisions') then raise exception 'service_revisions missing'; end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'service_posts_department_fk') then raise exception 'service_posts_department_fk missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'service_revisions_service_fk') then raise exception 'service_revisions_service_fk missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'service_revisions_source_ck') then raise exception 'service_revisions_source_ck missing'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'service_revisions_guard') then raise exception 'service_revisions_guard missing'; end if;
end $$;
do $$ begin
  if not (select relforcerowsecurity from pg_class where oid = 'public.service_posts'::regclass) then raise exception 'service_posts RLS is not forced'; end if;
  if not (select relforcerowsecurity from pg_class where oid = 'public.service_revisions'::regclass) then raise exception 'service_revisions RLS is not forced'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('service_posts','service_revisions') and cmd in ('INSERT','UPDATE','DELETE')) then raise exception 'browser mutation policy exists'; end if;
end $$;
select 'SERVICES_SCHEMA_SQL_CONTRACT_PASS';
