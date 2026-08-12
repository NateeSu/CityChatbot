-- Deterministic synthetic fixtures for local/test only.
-- This file contains no citizen PII, production identifiers, or provider secrets.

set timezone = 'UTC';

insert into public.tenants (id, slug, display_name, status, default_timezone)
values
  ('00000000-0000-4000-8000-000000000001', 'synthetic-tenant-a', 'Synthetic Tenant A', 'ACTIVE', 'Asia/Bangkok'),
  ('00000000-0000-4000-8000-000000000002', 'synthetic-tenant-b', 'Synthetic Tenant B', 'ACTIVE', 'Asia/Bangkok')
on conflict do nothing;

insert into public.user_accounts (id, auth_subject, status, display_name)
values
  ('10000000-0000-4000-8000-000000000001', 'synthetic-auth-a', 'ACTIVE', 'Synthetic Staff A'),
  ('10000000-0000-4000-8000-000000000002', 'synthetic-auth-b', 'ACTIVE', 'Synthetic Staff B'),
  ('10000000-0000-4000-8000-000000000003', 'synthetic-auth-a2', 'ACTIVE', 'Synthetic Staff A2'),
  ('10000000-0000-4000-8000-000000000004', 'synthetic-auth-admin-a', 'ACTIVE', 'Synthetic Tenant Admin A')
on conflict do nothing;

insert into public.tenant_settings (
  id, tenant_id, locale, display_timezone, ai_chat_enabled, complaint_ai_routing_enabled, settings_json
)
values
  ('11000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'th-TH', 'Asia/Bangkok', false, false, '{"seed":"synthetic","environment":"test"}'::jsonb),
  ('11000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'th-TH', 'Asia/Bangkok', false, false, '{"seed":"synthetic","environment":"test"}'::jsonb)
on conflict do nothing;

insert into public.feature_flag_versions (
  id, tenant_id, feature_key, version, state, enabled, config_json, effective_from
)
values
  ('12000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'ai_chat_enabled', 1, 'ACTIVE', false, '{}'::jsonb, '2026-08-10 00:00:00+00'),
  ('12000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'ai_chat_enabled', 1, 'ACTIVE', false, '{}'::jsonb, '2026-08-10 00:00:00+00'),
  ('12000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'complaint_ai_routing_enabled', 1, 'ACTIVE', false, '{}'::jsonb, '2026-08-10 00:00:00+00'),
  ('12000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'complaint_ai_routing_enabled', 1, 'ACTIVE', false, '{}'::jsonb, '2026-08-10 00:00:00+00')
on conflict do nothing;

insert into public.tenant_memberships (
  id, tenant_id, account_id, status, display_name, invited_at, activated_at
)
values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ACTIVE', 'Synthetic Staff A', '2026-08-10 00:00:00+00', '2026-08-10 00:01:00+00'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'ACTIVE', 'Synthetic Staff B', '2026-08-10 00:00:00+00', '2026-08-10 00:01:00+00'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'ACTIVE', 'Synthetic Staff A2', '2026-08-10 00:00:00+00', '2026-08-10 00:01:00+00'),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'ACTIVE', 'Synthetic Tenant Admin A', '2026-08-10 00:00:00+00', '2026-08-10 00:01:00+00')
on conflict do nothing;

insert into public.departments (id, tenant_id, code, name, status)
values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'A1', 'Synthetic Department A1', 'ACTIVE'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'A2', 'Synthetic Department A2', 'ACTIVE'),
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'B1', 'Synthetic Department B1', 'ACTIVE')
on conflict do nothing;

insert into public.knowledge_categories (id, tenant_id, code, display_name, status)
values
  ('36000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'GENERAL', 'Synthetic general knowledge', 'ACTIVE'),
  ('36000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'GENERAL', 'Synthetic general knowledge', 'ACTIVE')
on conflict do nothing;

insert into public.complaint_categories (
  id, tenant_id, code, public_name, description, status, default_priority
)
values
  ('33000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'GENERAL', 'Synthetic general service', 'Synthetic category for contract tests', 'ACTIVE', 'NORMAL'),
  ('33000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'GENERAL', 'Synthetic general service', 'Synthetic category for contract tests', 'ACTIVE', 'NORMAL')
on conflict do nothing;

insert into public.intake_queues (
  id, tenant_id, department_id, code, display_name, status
)
values
  ('34000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'A1_GENERAL', 'Synthetic A1 intake', 'ACTIVE'),
  ('34000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'B1_GENERAL', 'Synthetic B1 intake', 'ACTIVE')
on conflict do nothing;

insert into public.department_memberships (
  id, tenant_id, membership_id, department_id, role_in_department, is_primary
)
values
  ('31000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'STAFF', true),
  ('31000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', 'HEAD', true),
  ('31000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'STAFF', true)
on conflict do nothing;

insert into public.department_work_scope_versions (
  id, tenant_id, department_id, version, state, scope_rules, effective_from
)
values
  ('32000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 1, 'ACTIVE', '{"departmentCode":"A1","actions":["VIEW","ASSIGN"]}'::jsonb, '2026-08-10 00:00:00+00'),
  ('32000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 1, 'ACTIVE', '{"departmentCode":"A2","actions":["VIEW","ASSIGN"]}'::jsonb, '2026-08-10 00:00:00+00'),
  ('32000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 1, 'ACTIVE', '{"departmentCode":"B1","actions":["VIEW","ASSIGN"]}'::jsonb, '2026-08-10 00:00:00+00')
on conflict do nothing;

insert into public.roles (id, tenant_id, code, display_name, status)
values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'STAFF', 'Synthetic Staff', 'ACTIVE'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'TENANT_ADMIN', 'Synthetic Tenant Admin', 'ACTIVE'),
  ('40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'STAFF', 'Synthetic Staff', 'ACTIVE'),
  ('40000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'DEPARTMENT_HEAD', 'Synthetic Department Head', 'ACTIVE'),
  ('40000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'PR_STAFF', 'Synthetic PR Staff', 'ACTIVE'),
  ('40000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 'KNOWLEDGE_STAFF', 'Synthetic Knowledge Staff', 'ACTIVE'),
  ('40000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000001', 'EXECUTIVE', 'Synthetic Executive', 'ACTIVE')
on conflict do nothing;

insert into public.permissions (id, code, resource, action, scope)
values
  ('41000000-0000-4000-8000-000000000001', 'complaint.view.department', 'COMPLAINT', 'VIEW', 'DEPARTMENT'),
  ('41000000-0000-4000-8000-000000000002', 'complaint.assign.department', 'COMPLAINT', 'ASSIGN', 'DEPARTMENT'),
  ('41000000-0000-4000-8000-000000000003', 'settings.manage.tenant', 'SETTINGS', 'MANAGE', 'TENANT'),
  ('41000000-0000-4000-8000-000000000004', 'audit.view.tenant', 'AUDIT', 'VIEW', 'TENANT'),
  ('41000000-0000-4000-8000-000000000005', 'job.manage.tenant', 'JOB', 'MANAGE', 'TENANT'),
  ('41000000-0000-4000-8000-000000000006', 'support.access.system', 'AUDIT', 'SUPPORT_ACCESS', 'SYSTEM'),
  ('41000000-0000-4000-8000-000000000007', 'staff.manage.tenant', 'STAFF', 'MANAGE', 'TENANT'),
  ('41000000-0000-4000-8000-000000000008', 'support.access.tenant', 'AUDIT', 'SUPPORT_ACCESS', 'TENANT'),
  ('41000000-0000-4000-8000-000000000009', 'knowledge.manage.tenant', 'KNOWLEDGE', 'MANAGE', 'TENANT')
on conflict do nothing;

insert into public.membership_roles (id, tenant_id, membership_id, role_id)
values
  ('42000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'),
  ('42000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002'),
  ('42000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003'),
  ('42000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.role_permissions (id, tenant_id, role_id, permission_id)
values
  ('43000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002'),
  ('43000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000003'),
  ('43000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000004'),
  ('43000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000005'),
  ('43000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000007'),
  ('43000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000008'),
  ('43000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000009')
on conflict do nothing;

insert into public.business_calendars (
  id, tenant_id, code, display_name, timezone, state, working_weekdays, windows, holiday_dates
)
values
  ('52000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'synthetic_bkk', 'Synthetic Bangkok business hours', 'Asia/Bangkok', 'ACTIVE', array[1, 2, 3, 4, 5]::smallint[], '[{"start":"09:00","end":"17:00"}]'::jsonb, '[]'::jsonb),
  ('52000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'synthetic_bkk', 'Synthetic Bangkok business hours', 'Asia/Bangkok', 'ACTIVE', array[1, 2, 3, 4, 5]::smallint[], '[{"start":"09:00","end":"17:00"}]'::jsonb, '[]'::jsonb)
on conflict do nothing;

insert into public.notification_template_versions (
  id, tenant_id, template_key, version, channel, locale, state, body_text, variables, theme_version, effective_from
)
values
  ('53000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'complaint.received', 1, 'LINE', 'th-TH', 'ACTIVE', 'รับเรื่อง {{complaintNo}} แล้ว ติดตามเรื่องได้ที่ {{trackingUrl}}', '["complaintNo","trackingUrl"]'::jsonb, 1, '2026-08-10 00:00:00+00'),
  ('53000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'complaint.received.en', 1, 'LINE', 'en-US', 'ACTIVE', 'We received complaint {{complaintNo}}. Track it at {{trackingUrl}}', '["complaintNo","trackingUrl"]'::jsonb, 1, '2026-08-10 00:00:00+00'),
  ('53000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'complaint.received', 1, 'LINE', 'th-TH', 'ACTIVE', 'รับเรื่อง {{complaintNo}} แล้ว ติดตามเรื่องได้ที่ {{trackingUrl}}', '["complaintNo","trackingUrl"]'::jsonb, 1, '2026-08-10 00:00:00+00'),
  ('53000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'complaint.received.en', 1, 'LINE', 'en-US', 'ACTIVE', 'We received complaint {{complaintNo}}. Track it at {{trackingUrl}}', '["complaintNo","trackingUrl"]'::jsonb, 1, '2026-08-10 00:00:00+00')
on conflict do nothing;

insert into public.sla_rule_versions (
  id, tenant_id, department_id, category_id, priority, calendar_id, version, state,
  response_target_seconds, resolution_target_seconds, pause_statuses, warning_ratio, effective_from
)
values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', null, 'NORMAL', '52000000-0000-4000-8000-000000000001', 1, 'ACTIVE', 3600, 172800, '["WAITING_FOR_CITIZEN"]'::jsonb, 0.8, '2026-08-10 00:00:00+00'),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', null, 'NORMAL', '52000000-0000-4000-8000-000000000001', 1, 'ACTIVE', 7200, 259200, '["WAITING_FOR_CITIZEN"]'::jsonb, 0.8, '2026-08-10 00:00:00+00'),
  ('50000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', null, 'NORMAL', '52000000-0000-4000-8000-000000000002', 1, 'ACTIVE', 3600, 172800, '["WAITING_FOR_CITIZEN"]'::jsonb, 0.8, '2026-08-10 00:00:00+00'),
  ('50000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', null, null, 'LOW', '52000000-0000-4000-8000-000000000001', 1, 'ACTIVE', 7200, 259200, '["WAITING_FOR_CITIZEN"]'::jsonb, 0.8, '2026-08-10 00:00:00+00'),
  ('50000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', null, null, 'HIGH', '52000000-0000-4000-8000-000000000001', 1, 'ACTIVE', 3600, 172800, '["WAITING_FOR_CITIZEN"]'::jsonb, 0.8, '2026-08-10 00:00:00+00'),
  ('50000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', null, null, 'URGENT', '52000000-0000-4000-8000-000000000001', 1, 'ACTIVE', 1800, 86400, '["WAITING_FOR_CITIZEN"]'::jsonb, 0.8, '2026-08-10 00:00:00+00'),
  ('50000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000001', null, null, null, '52000000-0000-4000-8000-000000000001', 1, 'ACTIVE', 7200, 259200, '["WAITING_FOR_CITIZEN"]'::jsonb, 0.8, '2026-08-10 00:00:00+00'),
  ('50000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000002', null, null, 'LOW', '52000000-0000-4000-8000-000000000002', 1, 'ACTIVE', 7200, 259200, '["WAITING_FOR_CITIZEN"]'::jsonb, 0.8, '2026-08-10 00:00:00+00'),
  ('50000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000002', null, null, 'HIGH', '52000000-0000-4000-8000-000000000002', 1, 'ACTIVE', 3600, 172800, '["WAITING_FOR_CITIZEN"]'::jsonb, 0.8, '2026-08-10 00:00:00+00'),
  ('50000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000002', null, null, 'URGENT', '52000000-0000-4000-8000-000000000002', 1, 'ACTIVE', 1800, 86400, '["WAITING_FOR_CITIZEN"]'::jsonb, 0.8, '2026-08-10 00:00:00+00'),
  ('50000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', null, null, null, '52000000-0000-4000-8000-000000000002', 1, 'ACTIVE', 7200, 259200, '["WAITING_FOR_CITIZEN"]'::jsonb, 0.8, '2026-08-10 00:00:00+00')
on conflict (id) do update set
  category_id = excluded.category_id,
  priority = excluded.priority,
  calendar_id = excluded.calendar_id,
  pause_statuses = excluded.pause_statuses,
  warning_ratio = excluded.warning_ratio
where public.sla_rule_versions.category_id is distinct from excluded.category_id
   or public.sla_rule_versions.priority is distinct from excluded.priority
   or public.sla_rule_versions.calendar_id is distinct from excluded.calendar_id
   or public.sla_rule_versions.pause_statuses is distinct from excluded.pause_statuses
   or public.sla_rule_versions.warning_ratio is distinct from excluded.warning_ratio;

insert into public.department_contacts (
  id, tenant_id, department_id, contact_type, label, value, is_public
)
values
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'PHONE', 'Synthetic phone A1', '+66-000-000-0001', true),
  ('51000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'EMAIL', 'Synthetic email A2', 'a2@example.invalid', true),
  ('51000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'URL', 'Synthetic URL B1', 'https://example.invalid/b1', true)
on conflict do nothing;

-- P7-KPI-001 synthetic approved dictionary. Production tenants must create
-- their own version through the trusted governance path; these rows are local
-- fixtures only and contain no business secrets or live metrics.
with metric_rows(metric_key, display_name, metric_kind, unit, formula_sql, cohort_rule, null_rule, tooltip_text, source_tables, drilldown_query) as (
  values
    ('COMPLAINT_RECEIVED_VOLUME', 'เรื่องร้องเรียนที่รับเข้า', 'COUNT', 'CASES', 'count complaints created in [from,to)', 'created_at in [from,to)', 'zero rows returns 0 cases', 'จำนวนเรื่องร้องเรียนที่สร้างในช่วงเวลาที่เลือก', array['complaints'], 'complaints.created_at in [from,to)'),
    ('COMPLAINT_CLOSED_VOLUME', 'เรื่องร้องเรียนที่ปิด', 'COUNT', 'CASES', 'count complaints closed_at in [from,to)', 'closed_at in [from,to)', 'null closed_at is not counted', 'จำนวนเรื่องร้องเรียนที่มีเวลาปิดเรื่องอยู่ในช่วงเวลา', array['complaints'], 'complaints.closed_at in [from,to)'),
    ('COMPLAINT_OPEN_BACKLOG', 'เรื่องร้องเรียนค้าง ณ สิ้นงวด', 'COUNT', 'CASES', 'count nonterminal complaint status at to', 'created_at before to; status snapshot at to', 'zero eligible rows returns 0 cases', 'จำนวนเรื่องที่ยังไม่ปิด ณ เวลา to', array['complaints','complaint_status_logs'], 'status reconstructed from complaint_status_logs at to'),
    ('COMPLAINT_REOPENED_VOLUME', 'เรื่องร้องเรียนที่เปิดใหม่หลังปิด', 'COUNT', 'CASES', 'count RESOLVED or CLOSED to IN_PROGRESS transitions', 'reopen occurred_at in [from,to)', 'zero matching transitions returns 0 cases', 'จำนวนครั้งที่เรื่องถูกเปิดกลับมาดำเนินการ', array['complaint_status_logs'], 'reopen status transitions in [from,to)'),
    ('FIRST_RESPONSE_SLA_RATE', 'อัตราตอบรับแรกภายใน SLA', 'RATE', 'PERCENT', 'successful applicable first responses / applicable received complaints', 'complaints created in [from,to); snapshot at to', 'pending after due excluded; overdue no-response fails; zero denominator returns null', 'สัดส่วนเรื่องที่ตอบรับแรกภายในกำหนด SLA', array['complaints','complaint_sla_snapshots'], 'complaints joined to complaint_sla_snapshots'),
    ('RESOLUTION_SLA_RATE', 'อัตราแก้ไขภายใน SLA', 'RATE', 'PERCENT', 'successful applicable resolutions / applicable received complaints', 'complaints created in [from,to); snapshot at to', 'pending after due excluded; overdue no-resolution fails; zero denominator returns null', 'สัดส่วนเรื่องที่แก้ไขภายในกำหนดโดยหัก approved pause seconds', array['complaints','complaint_sla_snapshots'], 'complaints joined to complaint_sla_snapshots'),
    ('OUT_OF_JURISDICTION_RATE', 'อัตราเรื่องนอกอำนาจ', 'RATE', 'PERCENT', 'OUT_OF_JURISDICTION status / received excluding CANCELLED', 'complaints created in [from,to); status snapshot at to', 'CANCELLED excluded; zero denominator returns null', 'สัดส่วนเรื่องที่อยู่นอกอำนาจจากเรื่องที่รับเข้า', array['complaints','complaint_status_logs'], 'status reconstructed from complaint_status_logs'),
    ('SUPPORT_TICKET_VOLUME', 'งานส่งต่อที่รับเข้า', 'COUNT', 'CASES', 'count support tickets created in [from,to)', 'created_at in [from,to)', 'zero rows returns 0 cases', 'จำนวนงานส่งต่อที่เข้าสู่คิวสนับสนุน', array['support_tickets'], 'support_tickets.created_at in [from,to)'),
    ('SUPPORT_TICKET_CLOSED_RATE', 'อัตราปิดงานส่งต่อ', 'RATE', 'PERCENT', 'CLOSED support tickets / received support tickets', 'support tickets created in [from,to); status snapshot at to', 'zero received tickets returns null', 'สัดส่วนงานส่งต่อที่มีสถานะปิด ณ เวลา to', array['support_tickets','support_ticket_status_logs'], 'support ticket status reconstructed from logs')
), tenants_with_actor as (
  select tenant.id as tenant_id,
         actor.account_id as account_id
    from public.tenants as tenant
    join lateral (
      select membership.account_id
        from public.tenant_memberships as membership
       where membership.tenant_id = tenant.id
         and membership.status = 'ACTIVE'
       order by membership.created_at, membership.id
       limit 1
    ) as actor on true
)
insert into public.kpi_metric_definitions (
  tenant_id, metric_key, version, state, display_name, metric_kind, unit,
  formula_sql, cohort_rule, timezone, null_rule, tooltip_text, source_tables,
  drilldown_query, definition_json, effective_from,
  created_by_account_id, approved_by_account_id, approved_at
)
select
  tenant.tenant_id,
  metric.metric_key,
  1,
  'APPROVED',
  metric.display_name,
  metric.metric_kind,
  metric.unit,
  metric.formula_sql,
  metric.cohort_rule,
  'Asia/Bangkok',
  metric.null_rule,
  metric.tooltip_text,
  metric.source_tables,
  metric.drilldown_query,
  jsonb_build_object(
    'metricKey', metric.metric_key,
    'version', 1,
    'state', 'APPROVED',
    'source', 'APPROVED_SQL_DEFINITION'
  ),
  '2026-01-01 00:00:00+00',
  tenant.account_id,
  tenant.account_id,
  statement_timestamp()
from tenants_with_actor as tenant
cross join metric_rows as metric
on conflict (tenant_id, metric_key, version) do nothing;
