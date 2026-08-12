-- CityChatbot citizen complaint runtime boundary.
-- Requirements: RF-04, RF-06, RF-13, RF-14, RF-15, RF-17
-- This migration keeps browser clients away from complaint tables. The
-- citychatbot_app role receives EXECUTE only on the security-definer API.

set lock_timeout = '5s';
set statement_timeout = '60s';
set timezone = 'UTC';

alter table public.complaints
  add column if not exists citizen_idempotency_key text,
  add column if not exists citizen_request_hash text;

alter table public.complaint_comments
  add column if not exists citizen_line_user_id text,
  add column if not exists citizen_idempotency_key text,
  add column if not exists citizen_request_hash text;

alter table public.complaint_surveys
  add column if not exists citizen_idempotency_key text,
  add column if not exists citizen_request_hash text;

create unique index if not exists complaints_citizen_idempotency_uq
  on public.complaints (tenant_id, line_user_id, citizen_idempotency_key)
  where citizen_idempotency_key is not null;

create unique index if not exists complaint_comments_citizen_idempotency_uq
  on public.complaint_comments (tenant_id, complaint_id, citizen_line_user_id, citizen_idempotency_key)
  where citizen_line_user_id is not null and citizen_idempotency_key is not null;

create unique index if not exists complaint_surveys_citizen_idempotency_uq
  on public.complaint_surveys (tenant_id, complaint_id, line_user_id, citizen_idempotency_key)
  where citizen_idempotency_key is not null;

create or replace function private.citizen_runtime_context(
  p_tenant_id uuid,
  p_line_user_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('tenant_id', p_tenant_id, 'line_user_id', p_line_user_id)::text,
    true
  );
end;
$$;

create or replace function private.citizen_public_view(
  p_tenant_id uuid,
  p_line_user_id text,
  p_complaint_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  result jsonb;
begin
  select jsonb_strip_nulls(jsonb_build_object(
    'id', complaint.id,
    'complaintNo', complaint.complaint_no,
    'title', complaint.title,
    'categoryId', complaint.category_id,
    'canonicalStatus', complaint.canonical_status,
    'statusLabel', case complaint.canonical_status
      when 'RECEIVED' then 'รับเรื่องแล้ว'
      when 'UNDER_REVIEW' then 'กำลังตรวจสอบข้อมูล'
      when 'ASSIGNED' then 'ส่งต่อหน่วยงานแล้ว'
      when 'IN_PROGRESS' then 'กำลังดำเนินการ'
      when 'WAITING_FOR_CITIZEN' then 'รอข้อมูลเพิ่มเติม'
      when 'RESOLVED' then 'แก้ไขแล้ว'
      when 'CLOSED' then 'เสร็จสิ้น'
      when 'OUT_OF_JURISDICTION' then 'อยู่นอกขอบเขตหน่วยงาน'
      when 'CANCELLED' then 'ยกเลิกแล้ว'
      else complaint.canonical_status
    end,
    'priority', complaint.priority,
    'submittedAt', complaint.created_at,
    'location', case
      when complaint.location_text is null and complaint.latitude is null then null
      else jsonb_strip_nulls(jsonb_build_object(
        'text', complaint.location_text,
        'latitude', complaint.latitude,
        'longitude', complaint.longitude
      ))
    end,
    'departmentPublicName', department.name,
    'firstResponseAt', complaint.first_response_at,
    'resolvedAt', complaint.resolved_at,
    'closedAt', complaint.closed_at,
    'publicTimeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', status_log.id,
        'fromStatus', status_log.from_status,
        'toStatus', status_log.to_status,
        'statusLabel', case status_log.to_status
          when 'RECEIVED' then 'รับเรื่องแล้ว'
          when 'UNDER_REVIEW' then 'กำลังตรวจสอบข้อมูล'
          when 'ASSIGNED' then 'ส่งต่อหน่วยงานแล้ว'
          when 'IN_PROGRESS' then 'กำลังดำเนินการ'
          when 'WAITING_FOR_CITIZEN' then 'รอข้อมูลเพิ่มเติม'
          when 'RESOLVED' then 'แก้ไขแล้ว'
          when 'CLOSED' then 'เสร็จสิ้น'
          when 'OUT_OF_JURISDICTION' then 'อยู่นอกขอบเขตหน่วยงาน'
          when 'CANCELLED' then 'ยกเลิกแล้ว'
          else status_log.to_status
        end,
        'occurredAt', status_log.created_at
      ) order by status_log.created_at, status_log.id)
      from public.complaint_status_logs status_log
      where status_log.tenant_id = complaint.tenant_id
        and status_log.complaint_id = complaint.id
        and status_log.public_visible
    ), '[]'::jsonb),
    -- Upload storage is deliberately not enabled in this canary slice. The
    -- response remains an explicit empty allowlist until the quarantine
    -- attachment runtime is installed.
    'publicAttachments', '[]'::jsonb,
    'nextExpectedStep', case complaint.canonical_status
      when 'RECEIVED' then 'เจ้าหน้าที่จะตรวจสอบข้อมูลและส่งต่อหน่วยงานที่เกี่ยวข้อง'
      when 'UNDER_REVIEW' then 'กำลังตรวจสอบรายละเอียดและจัดหน่วยงานผู้รับผิดชอบ'
      when 'ASSIGNED' then 'หน่วยงานที่รับผิดชอบจะเริ่มดำเนินการ'
      when 'IN_PROGRESS' then 'เจ้าหน้าที่กำลังดำเนินการแก้ไขปัญหา'
      when 'WAITING_FOR_CITIZEN' then 'กรุณาส่งข้อมูลเพิ่มเติมเพื่อให้เจ้าหน้าที่ดำเนินการต่อ'
      when 'RESOLVED' then 'โปรดตรวจสอบผลการดำเนินการ หากยังไม่เรียบร้อยให้แจ้งเจ้าหน้าที่'
      when 'CLOSED' then 'เรื่องนี้ปิดการดำเนินการแล้ว ขอบคุณสำหรับความคิดเห็นของคุณ'
      when 'OUT_OF_JURISDICTION' then 'โปรดติดต่อหน่วยงานตามคำแนะนำในรายละเอียดเรื่อง'
      when 'CANCELLED' then 'เรื่องนี้ถูกยกเลิกแล้ว หากต้องการแจ้งใหม่ให้สร้างเรื่องใหม่'
      else 'โปรดติดตามความคืบหน้าผ่านหน้านี้'
    end,
    'requestForInformation', case when complaint.canonical_status = 'WAITING_FOR_CITIZEN' then (
      select status_log.reason
      from public.complaint_status_logs status_log
      where status_log.tenant_id = complaint.tenant_id
        and status_log.complaint_id = complaint.id
        and status_log.to_status = 'WAITING_FOR_CITIZEN'
        and status_log.public_visible
      order by status_log.created_at desc, status_log.id desc
      limit 1
    ) else null end,
    'survey', jsonb_build_object(
      'eligible', complaint.canonical_status in ('RESOLVED', 'CLOSED'),
      'submitted', exists (
        select 1 from public.complaint_surveys survey
        where survey.tenant_id = complaint.tenant_id
          and survey.complaint_id = complaint.id
          and survey.line_user_id = p_line_user_id
      )
    ),
    'publicComments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', comment.id,
        'body', comment.body,
        'createdAt', comment.created_at,
        'updatedAt', comment.updated_at
      ) order by comment.created_at, comment.id)
      from public.complaint_comments comment
      where comment.tenant_id = complaint.tenant_id
        and comment.complaint_id = complaint.id
        and comment.visibility = 'PUBLIC'
    ), '[]'::jsonb)
  )) into result
  from public.complaints complaint
  left join public.departments department
    on department.tenant_id = complaint.tenant_id
   and department.id = complaint.assigned_department_id
  where complaint.tenant_id = p_tenant_id
    and complaint.line_user_id = p_line_user_id
    and complaint.id = p_complaint_id;

  return result;
end;
$$;

create or replace function private.create_citizen_complaint(
  p_liff_app_id text,
  p_tenant_id uuid,
  p_line_user_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_category_id uuid,
  p_category_uncertain boolean,
  p_citizen_name text,
  p_citizen_phone_encrypted text,
  p_title text,
  p_description text,
  p_location_text text,
  p_latitude numeric,
  p_longitude numeric,
  p_intake_queue_id uuid
)
returns table(
  complaint_id uuid,
  complaint_no text,
  canonical_status text,
  created_at timestamptz,
  row_version bigint,
  idempotent_replay boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  app_record public.liff_apps%rowtype;
  existing public.complaints%rowtype;
  allocation record;
  new_id uuid;
  complaint_year integer := extract(year from statement_timestamp() at time zone 'Asia/Bangkok')::integer + 543;
begin
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 8 and 255 or p_idempotency_key ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if p_line_user_id is null or p_line_user_id !~ '^U[0-9a-fA-F]{8,64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 240 or p_title ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if p_description is null or length(btrim(p_description)) not between 1 and 20000 or p_description ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if p_citizen_name is not null and (length(btrim(p_citizen_name)) not between 1 and 200 or p_citizen_name ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if p_citizen_phone_encrypted is not null and length(p_citizen_phone_encrypted) not between 16 and 2048 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
    or p_latitude is not null and (p_latitude < -90 or p_latitude > 90)
    or p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if (p_category_id is null) <> coalesce(p_category_uncertain, false) then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  select app.* into app_record
  from public.liff_apps app
  join public.tenants tenant on tenant.id = app.tenant_id and tenant.status = 'ACTIVE'
  join public.line_channels channel on channel.tenant_id = app.tenant_id and channel.id = app.line_channel_record_id and channel.state = 'ACTIVE'
  where app.liff_app_id = p_liff_app_id
    and app.tenant_id = p_tenant_id
    and app.enabled
  limit 1;
  if not found then raise exception using errcode = '42501', message = 'FEATURE_DISABLED'; end if;

  if not exists (
    select 1 from public.line_users line_user
    where line_user.tenant_id = p_tenant_id
      and line_user.line_channel_record_id = app_record.line_channel_record_id
      and line_user.line_user_id = p_line_user_id
      and line_user.status = 'ACTIVE'
  ) then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  if not exists (
    select 1 from public.intake_queues queue
    where queue.tenant_id = p_tenant_id and queue.id = p_intake_queue_id and queue.status = 'ACTIVE'
  ) then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;
  if p_category_id is not null and not exists (
    select 1 from public.complaint_categories category
    where category.tenant_id = p_tenant_id and category.id = p_category_id and category.status = 'ACTIVE'
  ) then raise exception using errcode = '22023', message = 'VALIDATION_ERROR'; end if;

  perform private.citizen_runtime_context(p_tenant_id, p_line_user_id);
  select complaint.* into existing
  from public.complaints complaint
  where complaint.tenant_id = p_tenant_id
    and complaint.line_user_id = p_line_user_id
    and complaint.citizen_idempotency_key = p_idempotency_key
  limit 1;
  if found then
    if existing.citizen_request_hash <> p_request_hash then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return query select existing.id, existing.complaint_no, existing.canonical_status, existing.created_at, existing.row_version, true;
    return;
  end if;

  select * into allocation from private.reserve_complaint_number(p_tenant_id, complaint_year);
  new_id := gen_random_uuid();
  insert into public.complaints (
    id, tenant_id, complaint_no, complaint_year, complaint_sequence, line_user_id,
    citizen_name, citizen_phone_encrypted, category_id, category_uncertain,
    title, description, location_text, latitude, longitude, intake_queue_id,
    citizen_idempotency_key, citizen_request_hash
  ) values (
    new_id, p_tenant_id,
    allocation.prefix || '-' || complaint_year::text || '-' || lpad(allocation.sequence_number::text, 6, '0'),
    complaint_year, allocation.sequence_number, p_line_user_id,
    nullif(btrim(p_citizen_name), ''), p_citizen_phone_encrypted, p_category_id, coalesce(p_category_uncertain, false),
    btrim(p_title), btrim(p_description), nullif(btrim(p_location_text), ''), p_latitude, p_longitude, p_intake_queue_id,
    p_idempotency_key, p_request_hash
  ) returning complaints.id, complaints.complaint_no, complaints.canonical_status, complaints.created_at, complaints.row_version
  into complaint_id, complaint_no, canonical_status, created_at, row_version;
  idempotent_replay := false;
  return next;
end;
$$;

create or replace function private.list_citizen_complaints(
  p_tenant_id uuid,
  p_line_user_id text,
  p_status text,
  p_limit integer,
  p_cursor integer
)
returns table(items jsonb, next_cursor text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  normalized_status text := coalesce(p_status, 'ALL');
  normalized_limit integer := coalesce(p_limit, 20);
  normalized_cursor integer := coalesce(p_cursor, 0);
begin
  if normalized_status not in ('ALL', 'ACTIVE', 'CLOSED') or normalized_limit not between 1 and 50 or normalized_cursor < 0 or normalized_cursor > 100000 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  if not exists (select 1 from public.line_users where tenant_id = p_tenant_id and line_user_id = p_line_user_id and status = 'ACTIVE') then
    return query select '[]'::jsonb, null::text;
    return;
  end if;
  return query
  with filtered as (
    select complaint.id, complaint.created_at
    from public.complaints complaint
    where complaint.tenant_id = p_tenant_id
      and complaint.line_user_id = p_line_user_id
      and (
        normalized_status = 'ALL'
        or (normalized_status = 'CLOSED' and complaint.canonical_status in ('CLOSED', 'CANCELLED', 'OUT_OF_JURISDICTION'))
        or (normalized_status = 'ACTIVE' and complaint.canonical_status not in ('CLOSED', 'CANCELLED', 'OUT_OF_JURISDICTION'))
      )
    order by complaint.created_at desc, complaint.id desc
  ), page as (
    select filtered.id, filtered.created_at
    from filtered
    offset normalized_cursor limit normalized_limit
  ), more as (
    select exists(select 1 from filtered offset normalized_cursor + normalized_limit) as has_more
  )
  select coalesce(jsonb_agg(private.citizen_public_view(p_tenant_id, p_line_user_id, page.id) order by page.created_at desc, page.id desc), '[]'::jsonb),
         case when more.has_more then (normalized_cursor + normalized_limit)::text else null end
  from page cross join more;
end;
$$;

create or replace function private.get_citizen_complaint(
  p_tenant_id uuid,
  p_line_user_id text,
  p_complaint_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.citizen_public_view(p_tenant_id, p_line_user_id, p_complaint_id)
  where exists (
    select 1 from public.complaints complaint
    where complaint.tenant_id = p_tenant_id
      and complaint.line_user_id = p_line_user_id
      and complaint.id = p_complaint_id
  );
$$;

create or replace function private.add_citizen_comment(
  p_tenant_id uuid,
  p_line_user_id text,
  p_complaint_id uuid,
  p_expected_version bigint,
  p_body text,
  p_idempotency_key text,
  p_request_hash text
)
returns table(message_id uuid, item jsonb, idempotent_replay boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  complaint public.complaints%rowtype;
  existing public.complaint_comments%rowtype;
begin
  if p_body is null or length(btrim(p_body)) not between 1 and 20000 or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 8 and 255 or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  perform private.citizen_runtime_context(p_tenant_id, p_line_user_id);
  select * into complaint from public.complaints where tenant_id = p_tenant_id and id = p_complaint_id and line_user_id = p_line_user_id for update;
  if not found then raise exception using errcode = '02000', message = 'NOT_FOUND'; end if;
  select * into existing from public.complaint_comments comment
  where comment.tenant_id = p_tenant_id and comment.complaint_id = p_complaint_id and comment.citizen_line_user_id = p_line_user_id and comment.citizen_idempotency_key = p_idempotency_key;
  if found then
    if existing.citizen_request_hash <> p_request_hash then raise exception using errcode = '23505', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return query select existing.id, private.citizen_public_view(p_tenant_id, p_line_user_id, p_complaint_id), true;
    return;
  end if;
  if complaint.canonical_status <> 'WAITING_FOR_CITIZEN' or p_expected_version <> complaint.row_version then raise exception using errcode = '40001', message = 'CONFLICT'; end if;
  insert into public.complaint_comments (tenant_id, complaint_id, author_type, body, visibility, citizen_line_user_id, citizen_idempotency_key, citizen_request_hash)
  values (p_tenant_id, p_complaint_id, 'CITIZEN', btrim(p_body), 'PUBLIC', p_line_user_id, p_idempotency_key, p_request_hash)
  returning id into message_id;
  update public.complaints set canonical_status = 'IN_PROGRESS' where tenant_id = p_tenant_id and id = p_complaint_id and row_version = p_expected_version;
  if not found then raise exception using errcode = '40001', message = 'CONFLICT'; end if;
  item := private.citizen_public_view(p_tenant_id, p_line_user_id, p_complaint_id);
  idempotent_replay := false;
  return next;
end;
$$;

create or replace function private.submit_citizen_survey(
  p_tenant_id uuid,
  p_line_user_id text,
  p_complaint_id uuid,
  p_rating smallint,
  p_comment text,
  p_idempotency_key text,
  p_request_hash text
)
returns table(survey jsonb, idempotent_replay boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  complaint public.complaints%rowtype;
  existing public.complaint_surveys%rowtype;
  survey_id uuid;
  submitted_at timestamptz;
begin
  if p_rating is null or p_rating not between 1 and 5 or p_comment is not null and length(p_comment) > 4000 or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 8 and 255 or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  perform private.citizen_runtime_context(p_tenant_id, p_line_user_id);
  select * into complaint from public.complaints where tenant_id = p_tenant_id and id = p_complaint_id and line_user_id = p_line_user_id;
  if not found then raise exception using errcode = '02000', message = 'NOT_FOUND'; end if;
  select * into existing from public.complaint_surveys survey where survey.tenant_id = p_tenant_id and survey.complaint_id = p_complaint_id and survey.line_user_id = p_line_user_id and survey.citizen_idempotency_key = p_idempotency_key;
  if found then
    if existing.citizen_request_hash <> p_request_hash then raise exception using errcode = '23505', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return query select jsonb_build_object('id', existing.id, 'complaintId', existing.complaint_id, 'rating', existing.rating, 'comment', existing.comment, 'submittedAt', existing.submitted_at), true;
    return;
  end if;
  if complaint.canonical_status not in ('RESOLVED', 'CLOSED') then raise exception using errcode = '40001', message = 'CONFLICT'; end if;
  if exists (select 1 from public.complaint_surveys where tenant_id = p_tenant_id and complaint_id = p_complaint_id and line_user_id = p_line_user_id) then raise exception using errcode = '23505', message = 'CONFLICT'; end if;
  insert into public.complaint_surveys (tenant_id, complaint_id, line_user_id, rating, comment, citizen_idempotency_key, citizen_request_hash)
  values (p_tenant_id, p_complaint_id, p_line_user_id, p_rating, nullif(btrim(p_comment), ''), p_idempotency_key, p_request_hash)
  returning id, submitted_at into survey_id, submitted_at;
  survey := jsonb_build_object('id', survey_id, 'complaintId', p_complaint_id, 'rating', p_rating, 'comment', nullif(btrim(p_comment), ''), 'submittedAt', submitted_at);
  idempotent_replay := false;
  return next;
end;
$$;

revoke all on table public.complaints, public.complaint_comments, public.complaint_surveys from citychatbot_app;
revoke all on function private.citizen_runtime_context(uuid, text) from public, anon, authenticated;
revoke all on function private.citizen_public_view(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.create_citizen_complaint(text, uuid, text, text, text, uuid, boolean, text, text, text, text, text, numeric, numeric, uuid) from public, anon, authenticated;
revoke all on function private.list_citizen_complaints(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function private.get_citizen_complaint(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.add_citizen_comment(uuid, text, uuid, bigint, text, text, text) from public, anon, authenticated;
revoke all on function private.submit_citizen_survey(uuid, text, uuid, smallint, text, text, text) from public, anon, authenticated;
grant execute on function private.create_citizen_complaint(text, uuid, text, text, text, uuid, boolean, text, text, text, text, text, numeric, numeric, uuid) to citychatbot_app;
grant execute on function private.list_citizen_complaints(uuid, text, text, integer, integer) to citychatbot_app;
grant execute on function private.get_citizen_complaint(uuid, text, uuid) to citychatbot_app;
grant execute on function private.add_citizen_comment(uuid, text, uuid, bigint, text, text, text) to citychatbot_app;
grant execute on function private.submit_citizen_survey(uuid, text, uuid, smallint, text, text, text) to citychatbot_app;

comment on function private.create_citizen_complaint(text, uuid, text, text, text, uuid, boolean, text, text, text, text, text, numeric, numeric, uuid)
  is 'Citizen complaint write boundary: verified LIFF identity and tenant are supplied by the server session; browser table access is denied.';
