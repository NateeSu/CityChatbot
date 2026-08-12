# Evidence — P1-RLS-001

สถานะ: `DONE — AUTO_APPROVED_FOR_MVP`

วันที่: 2026-08-10

Task: tenant/department isolation และ permission-aware RLS สำหรับ core tables

## Requirement IDs

- `RF-03` TENANCY — tenant isolation และ trusted tenant context
- `RF-04` IAM/RBAC — permission-backed database boundary
- `RF-07` COMPLAINT/DEPARTMENT — department scope primitive สำหรับ business records
- `RF-13` SECURITY — deny-by-default, private security-definer helpers, service boundary
- `RF-16` QA — SQL contract และ cross-boundary tests
- `INV-TENANT-001`, `INV-AUDIT-001`
- `SPEC-MVP-001`, `TEST-MVP-001` — L1 Unit Test Green เป็นเงื่อนไข auto-approval ของ MVP

## Files changed

- `supabase/migrations/20260810010000_rls_policy_hardening.sql`
- `supabase/tests/rls_policy_contract.sql`
- `supabase/tests/core_rls_contract.sql`
- `supabase/seed.sql`
- `supabase/README.md`
- `scripts/test_rls_contract.py`
- `scripts/test_db_schema.py`
- `package.json`
- `plan.md`

## Delivered behavior

- ทุก exposed core table จาก P1 schema มี `ENABLE ROW LEVEL SECURITY` และ
  `FORCE ROW LEVEL SECURITY` จาก core migration; hardening migration replaces
  the bootstrap read policy with permission-aware policies.
- `private.has_tenant_permission`, `private.can_read_department` และ
  `private.can_manage_support_access` เป็น `SECURITY DEFINER` ที่ fix
  `search_path`, ใช้ current trusted JWT tenant/account context และตรวจ active
  account/membership/role/permission.
- Tenant/department tables มี explicit read policies และ insert/update policies
  ที่ใช้ permission-backed `WITH CHECK`; ไม่มี broad authenticated `FOR ALL`
  policy และ DELETE ยังคง deny-by-default.
- `domain_outbox`, `jobs`, `audit_logs`, `permissions`, และ `user_accounts`
  ไม่มี authenticated mutation grant; jobs/audit read ได้เฉพาะ permission ที่
  ระบุไว้. Service role ไม่ถูกทำเป็น browser client.
- Synthetic boundary fixture แยก staff A1, staff A2, tenant admin A และ tenant
  B/B1 เพื่อทดสอบทั้ง tenant และ department path.

## Commands and actual results

| Command / check | Result |
|---|---|
| `python -m unittest scripts.test_db_schema scripts.test_rls_contract -v` | **PASS** — 10 static contract tests |
| `pnpm test:all` | **PASS** — web lint/typecheck, package typecheck, Vitest 12, DB/RLS 10, Next build |
| PostgreSQL 16 Docker migration chain | **PASS** — core empty+rereun, RLS install+rereun, seed |
| `core_schema_contract.sql` | **PASS** |
| `core_rls_contract.sql` | **PASS** — current staff A1 sees A1 only and tenant B is hidden |
| `rls_policy_contract.sql` | **PASS** — A1/A2/B1 isolation, staff write denied, tenant-admin write rolled back |
| `python -m unittest scripts.test_corpus_audit scripts.test_gui_inventory -v` | **PASS** — 11 baseline tests |
| targeted provider/service credential scan | **PASS** — `SECRET_SCAN_CLEAN` |

The integration run used only the explicitly named temporary container
`citychatbot-rls-contract` with `postgres:16-alpine`; it was removed after the
test. No production Supabase project or real tenant data was touched.

## Acceptance criteria

- [x] Tenant A cannot read tenant B through core tenant or department tables.
- [x] Staff A1 can read A1, cannot read A2/B1, and cannot insert a department row.
- [x] Staff A2 can read A2, cannot read A1.
- [x] Tenant Admin A can read both A departments and perform an in-tenant write in a transaction that is rolled back.
- [x] Permission-aware mutation policies expose both `USING` and `WITH CHECK` for update boundaries.
- [x] Cross-tenant `tenant_id` changes are checked against trusted context and permission.
- [x] Sensitive outbox/jobs/audit write paths are not granted to `authenticated`.
- [x] RLS policy helpers are private, security-definer, search-path-fixed and indexed by the schema task.
- [x] RLS migration reruns successfully without dropping tables or disabling RLS.

## Rollback procedure

If a policy is wrong, keep RLS enabled and apply a reviewed forward migration
that replaces the affected policy with deny-all plus a maintenance/feature flag.
Revoke the affected role/permission, preserve audit rows, and re-run the SQL
boundary suite before restoring access. For a failed shared migration, restore a
verified backup only after confirming the policy revision and never drop core
tenant/audit/outbox tables.

## Known limitations / follow-up

- The current repository has 19 core tables; complaint, citizen, storage and
  vector tables are not created yet. Each later migration must add its own
  tenant composite FK, forced RLS and tenant/department/citizen contract before
  the table is exposed.
- MFA/re-authentication is enforced in `@citychatbot/authz`; this DB policy
  layer validates permission and tenant/department membership and does not trust
  a browser-provided MFA flag.
- The migration has not been applied to the real Supabase project because its
  project target/credentials are not configured in the repository.
- Randomized 1,000-case tampering, storage/vector paths and citizen complaint
  paths remain follow-up tests when those tables/routes are implemented.

ตาม `SPEC-MVP-001` และ `plan.md` ฉบับปัจจุบัน L1 unit suite ผ่านครบและ evidence
นี้ถูกสร้างแล้ว จึง auto-approve `P1-RLS-001` สำหรับ MVP โดยไม่อ้างว่า business
tables หรือ post-production certification เสร็จแล้ว
