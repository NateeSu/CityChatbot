-- PostgreSQL contract assertions for P3-CMP-001.
-- Run with ON_ERROR_STOP=1 after every migration and the synthetic seed.

\set ON_ERROR_STOP on
set timezone = 'UTC';

do $$
declare
  required_table text;
  required_tables text[] := array[
    'complaint_categories', 'intake_queues', 'complaint_number_allocations',
    'complaints', 'complaint_attachments', 'complaint_assignments',
    'complaint_status_logs', 'complaint_comments', 'complaint_routing_runs',
    'complaint_duplicate_links', 'complaint_surveys'
  ];
  rel record;
begin
  foreach required_table in array required_tables loop
    if to_regclass(format('public.%I', required_table)) is null then
      raise exception 'missing complaint table public.%', required_table;
    end if;
    select c.relrowsecurity, c.relforcerowsecurity
      into rel
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = required_table;
    if not rel.relrowsecurity or not rel.relforcerowsecurity then
      raise exception 'complaint RLS must be enabled and forced on public.%', required_table;
    end if;
  end loop;
end;
$$;

do $$
declare
  first_prefix text;
  first_sequence bigint;
  second_prefix text;
  second_sequence bigint;
begin
  select prefix, sequence_number into first_prefix, first_sequence
    from private.reserve_complaint_number('00000000-0000-4000-8000-000000000001', 2569);
  select prefix, sequence_number into second_prefix, second_sequence
    from private.reserve_complaint_number('00000000-0000-4000-8000-000000000001', 2569);
  if first_prefix <> second_prefix or first_sequence = second_sequence or first_sequence <= 0 or second_sequence <= 0 then
    raise exception 'complaint number allocator is not atomic/unique';
  end if;
end;
$$;

begin;
  do $$
  declare
    v_total integer;
    v_distinct integer;
  begin
    create temporary table complaint_number_contract_allocations (sequence_number bigint) on commit drop;
    insert into complaint_number_contract_allocations (sequence_number)
      select allocation.sequence_number
        from generate_series(1, 1000) as requested(number)
        cross join lateral private.reserve_complaint_number(
          '00000000-0000-4000-8000-000000000001',
          2569 + requested.number - requested.number
        ) as allocation;
    select count(*), count(distinct sequence_number)
      into v_total, v_distinct
      from complaint_number_contract_allocations;
    if v_total <> 1000 or v_distinct <> 1000 then
      raise exception 'complaint allocator produced duplicate sequence values';
    end if;
  end;
  $$;

  do $$
  declare
    v_rolled_back bigint;
    v_after_rollback bigint;
  begin
    begin
      select sequence_number into v_rolled_back
        from private.reserve_complaint_number(
          '00000000-0000-4000-8000-000000000001',
          2569
        );
      raise exception using message = 'intentional allocator rollback';
    exception when others then
      if sqlerrm not like '%intentional allocator rollback%' then
        raise;
      end if;
    end;
    select sequence_number into v_after_rollback
      from private.reserve_complaint_number(
        '00000000-0000-4000-8000-000000000001',
        2569
      );
    if v_after_rollback = v_rolled_back then
      raise exception 'complaint allocator reused a rolled-back number';
    end if;
  end;
  $$;

  do $$
  declare
    v_complaint_id uuid := '60000000-0000-4000-8000-000000000001';
    v_tenant_id uuid := '00000000-0000-4000-8000-000000000001';
    v_category_id uuid := '33000000-0000-4000-8000-000000000001';
    v_queue_id uuid := '34000000-0000-4000-8000-000000000001';
    v_number_prefix text;
    v_number_sequence bigint;
    v_complaint_no text;
    v_status_count integer;
    v_outbox_count integer;
  begin
    select prefix, sequence_number into v_number_prefix, v_number_sequence
      from private.reserve_complaint_number(v_tenant_id, 2569);
    v_complaint_no := v_number_prefix || '-2569-' || lpad(v_number_sequence::text, 6, '0');
    insert into public.complaints (
      id, tenant_id, complaint_no, complaint_year, complaint_sequence,
      line_user_id, category_id, title, description, intake_queue_id
    ) values (
      v_complaint_id, v_tenant_id, v_complaint_no, 2569, v_number_sequence,
      'U11111111111111111111111111111111', v_category_id,
      'Synthetic complaint', 'Synthetic complaint description', v_queue_id
    );

    select count(*) into v_status_count
      from public.complaint_status_logs as status_log
     where status_log.tenant_id = v_tenant_id and status_log.complaint_id = v_complaint_id and status_log.to_status = 'RECEIVED';
    select count(*) into v_outbox_count
      from public.domain_outbox as outbox
     where outbox.tenant_id = v_tenant_id and outbox.aggregate_id = v_complaint_id and outbox.event_type = 'complaint.created';
    if v_status_count <> 1 or v_outbox_count <> 1 then
      raise exception 'complaint create must atomically create initial timeline and outbox';
    end if;

    begin
      update public.complaints set canonical_status = 'CLOSED' where id = v_complaint_id;
      raise exception 'invalid complaint transition unexpectedly succeeded';
    exception when others then
      if sqlerrm not like '%INVALID_STATE_TRANSITION%' then
        raise;
      end if;
    end;

    update public.complaints set canonical_status = 'UNDER_REVIEW' where id = v_complaint_id;
    if not exists (
      select 1 from public.complaint_status_logs as status_log
       where status_log.tenant_id = v_tenant_id and status_log.complaint_id = v_complaint_id
         and status_log.from_status = 'RECEIVED' and status_log.to_status = 'UNDER_REVIEW'
    ) then
      raise exception 'allowed transition did not create timeline';
    end if;
  end;
  $$;
rollback;

select 'COMPLAINT_SQL_CONTRACT_PASS' as contract;
