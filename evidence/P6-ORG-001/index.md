# P6-ORG-001 Evidence

สถานะ: **DONE (2026-08-11, MVP Fast-Track auto-approved หลัง L1 unit suite ผ่าน 100%)**

Task นี้ครอบคลุม `RF-04`, `RF-06`, `RF-08`, `RF-10` และ `RF-18` ตาม `fullspec.md`/`plan.md`. Production Supabase session/RLS request wiring ยังไม่ถูกเดา: local API เปิดเฉพาะ synthetic/test environment และ production ตอบ `CONFIGURATION_UNAVAILABLE` จนกว่าจะมี server identity/configuration จริง.

## สิ่งที่ส่งมอบ

- `packages/org-config/src/organization.ts` เพิ่ม tenant/department-scoped organization configuration domain: department CRUD, membership visibility, work-scope versioning, SLA versioning, public contact validation, deterministic routing preview data, audit entries, optimistic concurrency, idempotency replay และ referential-impact `IN_USE` guard
- work-scope และ SLA publish บังคับ effective date, validate overlap/precedence และเก็บ prior active revision เป็น `RETIRED` history เมื่อเริ่ม revision ใหม่; ไม่มี destructive delete
- contact validation บังคับประเภท/format และ public contact ต้องมี review timestamp; exact phone/email/HTTPS URL guards อยู่ที่ domain boundary
- `apps/web/app/api/v1/admin/organization/*` และ canonical routes `/api/v1/admin/departments`, department detail/work-scope publish, `/api/v1/admin/sla-rule-versions` และ SLA publish รองรับ local synthetic CRUD/version/publish พร้อม tenant/role scope และ stable errors
- `apps/web/app/admin/departments/` เพิ่ม A-70/A-74 console: department/category inventory, membership/contact/SLA summary, draft work-scope/SLA/contact actions, preview routing sandbox ที่ไม่สร้าง complaint, loading/empty/error/offline/permission/disabled states และ responsive Thai UI
- `admin-navigation.ts` เพิ่ม explicit `/admin/departments` route เฉพาะ `DEPARTMENT_HEAD`/`TENANT_ADMIN`; no wildcard route
- schema เดิมใน `supabase/migrations/20260810000000_core_schema.sql` มี departments/work-scope/department-memberships/contacts และ composite tenant FK; task นี้ใช้ schema canonical เดิม ไม่สร้าง schema ซ้ำหรือลด RLS
- `scripts/test_org_config_api.py` เพิ่ม static contract coverage สำหรับ routes, tenant/RLS boundary, version/idempotency/audit/contact validation และ A-70 UI

## ผลการทดสอบจริง

- `pnpm exec vitest run packages/org-config/src/organization.test.ts` — **PASS**, 5/5
- `pnpm test:unit` — **PASS**, 38 test files / 260 tests
- `pnpm test:db` — **PASS**, 129 static contract tests
- `pnpm lint` — **PASS**
- `pnpm typecheck` — **PASS**
- `pnpm typecheck:packages` — **PASS**, includes `packages/org-config/tsconfig.json`
- `pnpm build` — **PASS**, Next.js production route table includes `/admin/departments` and all canonical organization API routes
- `pnpm security:scan` — **PASS**, `SECRET_SCAN_CLEAN`
- `pnpm security:sbom` — **PASS**, 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`
- `pnpm release:manifest` then sequential `pnpm release:verify` — **PASS**, manifest digest `50b6ea866776afae021fad5e5a47e275237de58c00062dc05f853a973b00dfd6`
- `Get-Content -Raw supabase/tests/core_schema_contract.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` — **PASS**, tenant A/B department visibility contract
- `Get-Content -Raw supabase/tests/core_rls_contract.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` — **PASS**, RLS isolation contract

## API / route smoke evidence (local synthetic only)

Using the local tenant-admin fixture against `http://127.0.0.1:3100`:

```text
GET departments (TENANT_ADMIN)                  -> 200
POST department SMK1                             -> 201
same idempotency key replay                      -> 201, same resource
POST work-scope draft                            -> 201
POST work-scope publish                          -> 200, ACTIVE
POST SLA draft                                   -> 201
PATCH department contact draft                   -> 201, PHONE
GET departments as STAFF/DEPARTMENT_HEAD         -> 200, one scoped department each
GET tenant-B using tenant-A department ID        -> 404
GET /admin/departments?role=TENANT_ADMIN         -> 200, A-70 rendered
GET /admin/departments?role=DEPARTMENT_HEAD      -> 200, A-70 rendered
GET /admin/departments?role=STAFF/PR_STAFF       -> 200, permission-denied state
```

No production Supabase, LINE, Vercel, OpenRouter or user credential was used.

## Acceptance criteria

- department/category/SLA/contact data shown by tenant/department scope; cross-tenant detail returns indistinguishable `404`
- department/work-scope/SLA revisions use row version, effective windows, audit trail and idempotency; replay does not duplicate department
- active work scope/SLA are not overwritten destructively; new effective revision retires prior history and rollback can restore a prior version at the service boundary
- routing sandbox is a preview only and does not create complaint or mutate routing truth
- public contact requires validation/review metadata; active configuration prevents unsafe department deactivation
- role permissions are enforced in domain and API; unsupported direct URLs are denied; production without trusted session fails closed
- all data reads in the implemented boundary come from configuration/domain/API, not AI-generated status/KPI/SLA truth

## Visual/UAT boundary

Static UI contracts, production build and local HTTP role smoke passed. Full screenshot comparison against every `gui-designs/screens/` viewport/theme and real device/screen-reader UAT remain post-production certification; no external visual approval is claimed.

## Rollback procedure

1. Disable the A-70 route and organization mutation feature flag; keep existing active department/work-scope/SLA/contact revisions read-only.
2. Restore the last approved configuration revision or retire the new revision using its canonical versioned operation; preserve audit/idempotency history.
3. If an incident affects routing, fall back to the central intake queue and disable AI routing changes until the previous approved work-scope/SLA bundle is verified.
4. Rerun unit/static/DB isolation/build/security checks and local API smoke before re-enabling.

## Known limitations / next executable work

- the local adapter is in-memory and production persistence/session wiring remains downstream; canonical SQL schema/RLS exists and was rechecked, but no production migration was applied
- membership mutation, category lifecycle editor and full calendar builder remain follow-up surfaces shared with `P6-USR-001`/future content settings; current A-70 exposes their scoped state and uses canonical references
- `P6-KB-001` remains BLOCKED by `P4-QA-001`; next dependency-complete task is `P6-BOT-001` (P4-CHAT-001 and P6-ADM-001 are complete)
- `P6-GATE` and P7–P9 remain open; project completion is not claimed
