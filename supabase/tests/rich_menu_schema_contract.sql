do $$
declare
  missing_count integer;
begin
  select count(*) into missing_count
  from (values
    ('public.rich_menu_versions'),
    ('public.rich_menu_areas')
  ) as required(table_name)
  where to_regclass(required.table_name) is null;
  if missing_count <> 0 then raise exception 'rich menu tables missing'; end if;

  if not exists (select 1 from pg_constraint where conname = 'rich_menu_versions_tenant_id_uq') then raise exception 'rich menu version tenant identity missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'rich_menu_areas_version_fk') then raise exception 'rich menu area composite version FK missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'rich_menu_versions_state_ck') then raise exception 'rich menu state check missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'rich_menu_versions_dimensions_ck') then raise exception 'rich menu image geometry check missing'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'rich_menu_versions_state_transition') then raise exception 'rich menu state trigger missing'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'rich_menu_versions_publish_outbox') then raise exception 'rich menu outbox trigger missing'; end if;

  if not exists (select 1 from pg_class where oid = 'public.rich_menu_versions'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'rich menu version RLS is not forced'; end if;
  if not exists (select 1 from pg_class where oid = 'public.rich_menu_areas'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'rich menu area RLS is not forced'; end if;

  if has_table_privilege('authenticated', 'public.rich_menu_versions', 'INSERT')
    or has_table_privilege('authenticated', 'public.rich_menu_versions', 'UPDATE')
    or has_table_privilege('authenticated', 'public.rich_menu_versions', 'DELETE')
    or has_table_privilege('authenticated', 'public.rich_menu_areas', 'INSERT')
    or has_table_privilege('authenticated', 'public.rich_menu_areas', 'UPDATE')
    or has_table_privilege('authenticated', 'public.rich_menu_areas', 'DELETE') then
    raise exception 'authenticated rich menu writes must be denied';
  end if;

  raise notice 'RICH_MENU_SCHEMA_SQL_CONTRACT_PASS';
end;
$$;
