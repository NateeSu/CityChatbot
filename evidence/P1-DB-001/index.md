# Evidence — P1-DB-001

สถานะ: `DONE — AUTO_APPROVED_FOR_MVP`

วันที่: 2026-08-10

Task: สร้าง core schema, migrations และ deterministic seed fixtures

## Requirement IDs

- `RF-03` TENANCY — tenant isolation, tenant-owned records และ composite tenant FK
- `RF-04` IAM/RBAC — account/membership/department/role/permission primitives
- `RF-15` AUDIT/OPS — audit, outbox, idempotency และ jobs primitives
- `RF-17` ARCH — migration-first schema, UTC timestamps, indexes และ rollback path
- `INV-TENANT-001`, `INV-AUDIT-001`, `INV-VERSION-001`
- `SPEC-MVP-001`, `TEST-MVP-001` — L1 Unit Test Green เป็นเงื่อนไข auto-approval ของ MVP

## Files changed

- `supabase/migrations/20260810000000_core_schema.sql`
- `supabase/seed.sql`
- `supabase/tests/core_schema_contract.sql`
- `supabase/tests/core_rls_contract.sql`
- `supabase/README.md`
- `scripts/test_db_schema.py`
- `package.json`
- `plan.md`

## Delivered schema

Migration สร้าง 19 core tables: `tenants`, `tenant_settings`,
`feature_flag_versions`, `user_accounts`, `tenant_memberships`, `departments`,
`department_memberships`, `department_work_scope_versions`, `roles`,
`permissions`, `role_permissions`, `membership_roles`,
`support_access_grants`, `sla_rule_versions`, `department_contacts`,
`idempotency_records`, `domain_outbox`, `jobs`, และ `audit_logs`.

ทุก tenant-owned table มี `tenant_id NOT NULL`, `UNIQUE (tenant_id, id)` และ
composite FK เมื่ออ้าง parent tenant-owned table. มี check/unique/index สำหรับ
state, version, idempotency, queue claim, lease, audit และ SLA target.

RLS ถูก `ENABLE` และ `FORCE` บนทุก exposed core table. Authenticated read
policy ใช้ trusted JWT tenant/account context และไม่มี authenticated write
policy ใน bootstrap migration จึง deny-by-default จนกว่า `P1-IAM-001` และ
`P1-RLS-001` จะเพิ่ม role/action matrix. `audit_logs` มี append-only trigger.

Seed ใช้ tenant A/B และ department A1/A2/B1 แบบ synthetic deterministic IDs,
AI flags ปิดไว้ (`false`) และไม่มี citizen PII/provider secret.

## Commands and actual results

| Command / check | Result |
|---|---|
| `python -m unittest scripts.test_db_schema -v` | **PASS** — 6 tests |
| `pnpm test:all` | **PASS** — web lint, typecheck, Vitest 4, DB contract 6, Next build |
| `python -m unittest scripts.test_corpus_audit scripts.test_gui_inventory -v` | **PASS** — 11 baseline tests |
| PostgreSQL 16 Docker: migration on empty database | **PASS** |
| PostgreSQL 16 Docker: `seed.sql` | **PASS** |
| PostgreSQL 16 Docker: migration rerun on existing schema | **PASS** — notices only for existing idempotent objects |
| PostgreSQL 16 Docker: `core_schema_contract.sql` | **PASS** |
| PostgreSQL 16 Docker: `core_rls_contract.sql` | **PASS** — current A1-scoped visibility `1`, tenant B `0`, authenticated write denied; permission-aware hardening details are in [P1-RLS-001](../P1-RLS-001/index.md) |
| `pnpm install --frozen-lockfile` | **PASS** — verified in P1 foundation run |
| targeted secret scan for provider/service credentials | **PASS** — `SECRET_SCAN_CLEAN` |

The PostgreSQL integration run used only the explicit temporary container
`citychatbot-db-contract` with `postgres:16-alpine`; the container was removed
after validation and no Supabase production project was touched.

## Acceptance criteria

- [x] Empty database applies migration successfully.
- [x] Deterministic synthetic fixtures apply successfully.
- [x] Re-running the migration is successful and does not duplicate schema objects.
- [x] Required composite tenant FK and `(tenant_id, id)` uniqueness assertions pass.
- [x] RLS is enabled and forced; cross-tenant read is denied in the authenticated contract.
- [x] Authenticated writes remain deny-by-default until the IAM/RLS task installs the action matrix.
- [x] UTC database timestamps and Asia/Bangkok boundary assertion pass.
- [x] Outbox, jobs, idempotency, audit, lease and queue-claim indexes are present.
- [x] Rollback/recovery procedure is documented and the isolated validation database was discarded.

## Rollback procedure

This bootstrap migration is additive and intentionally has no destructive down
migration. For an isolated test database, recreate that explicitly named
database/container. For a shared or production database, stop the affected
feature, verify a backup, and ship a reviewed forward-only compatibility
migration; restore the verified backup only if a data migration has corrupted
state. Do not drop core tables containing audit, outbox, jobs or tenant data.

## Known limitations / follow-up

- The migration has not been applied to the real Supabase project; credentials
  and project target are intentionally not guessed or stored in the repository.
- Full write authorization, department scope enforcement, MFA and privileged
  access policies remain in `P1-IAM-001`/`P1-RLS-001`. The current safe state is
  read-only for `authenticated` and service-role access is not part of a browser
  request path.
- `supabase` CLI/`psql` are not installed on the host; the PostgreSQL 16 Docker
  validation is the reproducible integration evidence for this task.
- Worker claim/retry behavior beyond the queue schema/index contract remains in
  the later job/observability tasks.

หมายเหตุ: evidence ชุดแรกนี้บันทึก core bootstrap ก่อน `P1-RLS-001` เพิ่ม
permission-aware department policy; หลัง hardening contract ใช้ staff A1/A2
fixtures และผลปัจจุบันอยู่ใน [P1-RLS-001](../P1-RLS-001/index.md)

ตาม `SPEC-MVP-001` และ `plan.md` ฉบับปัจจุบัน L1 unit contract ผ่านครบและ
evidence นี้ถูกสร้างแล้ว จึง auto-approve `P1-DB-001` สำหรับ MVP โดยไม่อ้างว่า
งาน hardening หลัง Production เสร็จแล้ว
