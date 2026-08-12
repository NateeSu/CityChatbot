# P6-AUD-001 Evidence

สถานะ: **DONE (2026-08-11, MVP Fast-Track auto-approved หลัง scoped L1 unit tests ผ่าน 100%)**

Task นี้ครอบคลุม `RF-10`, `RF-13`, `RF-14`, `RF-18` และ `INV-AUDIT-001`, `INV-TENANT-001`, `INV-DELETE-001` ตาม `fullspec.md` §4, §5, §12.4, §13.3–§13.5 และ Screen `A-97`.

การอนุมัติอัตโนมัติใช้เฉพาะเงื่อนไข `SPEC-MVP-001`: L1 unit suite ของ scope นี้ผ่าน 100%. ไม่ได้อ้างว่า production provider/session, external UAT, visual certification หรือ `P6-GATE` ผ่านแล้ว.

## สิ่งที่ส่งมอบ

- `@citychatbot/audit-observability` เป็น application contract สำหรับ audit, staff notifications, export และ jobs: per-tenant append-only hash chain, canonical actor/resource/action/time/reason/diff fields, recursive sensitive-value redaction, role visibility, cursor pagination, idempotency, background large-export queue, watermark, signed URL TTL 5 นาที, revoke/expiry, CSV formula-injection protection และ audit ของทุก export lifecycle.
- Canonical admin routes ถูกสร้างแบบ explicit และ production fail-closed:
  - `GET /api/v1/admin/audit-logs`
  - `GET /api/v1/admin/audit-logs/{id}`
  - `POST /api/v1/admin/audit-log-exports`
  - `POST /api/v1/admin/exports`
  - `GET /api/v1/admin/exports/{id}` (detail หรือ signed download เมื่อมี token)
  - `GET /api/v1/admin/jobs`, `GET /api/v1/admin/jobs/{id}`
  - notification center supporting routes: `GET /api/v1/admin/notifications`, `POST /api/v1/admin/notifications/{id}/read`
- `A-97 /admin/audit` รองรับ audit filter/detail, hash status, notification read, privileged export status/download, jobs/DLQ summary และ states loading/empty/error/offline/permission/expired/stale พร้อม responsive breakpoints 1023/767/480/320 และ keyboard focus.
- `supabase/migrations/20260811210000_audit_operations_schema.sql` เพิ่ม audit hash hardening, tenant-owned `exports`, additive notification restore guard, composite tenant membership/job FKs, forced RLS, browser grant denial, mutable-row version trigger และ private notification/export mutation functions.
- `supabase/tests/audit_operations_schema_contract.sql` ตรวจ table existence, forced RLS, composite FKs, hash columns, private functions และ browser export mutation privileges.

## ไฟล์ที่เปลี่ยน

- `packages/audit-observability/package.json`
- `packages/audit-observability/tsconfig.json`
- `packages/audit-observability/README.md`
- `packages/audit-observability/src/audit-operations.ts`
- `packages/audit-observability/src/audit-operations.test.ts`
- `apps/web/package.json`, `package.json`, `pnpm-lock.yaml`
- `apps/web/app/api/v1/admin/audit-operations/context.ts`
- `apps/web/app/api/v1/admin/audit-operations/errors.ts`
- `apps/web/app/api/v1/admin/audit-operations/repository.ts`
- `apps/web/app/api/v1/admin/audit-logs/route.ts`
- `apps/web/app/api/v1/admin/audit-logs/[id]/route.ts`
- `apps/web/app/api/v1/admin/audit-log-exports/route.ts`
- `apps/web/app/api/v1/admin/exports/route.ts`
- `apps/web/app/api/v1/admin/exports/[id]/route.ts`
- `apps/web/app/api/v1/admin/notifications/route.ts`
- `apps/web/app/api/v1/admin/notifications/[id]/read/route.ts`
- `apps/web/app/api/v1/admin/jobs/route.ts`
- `apps/web/app/api/v1/admin/jobs/[id]/route.ts`
- `apps/web/app/admin/audit/page.tsx`
- `apps/web/app/admin/audit/AuditConsole.tsx`
- `apps/web/app/admin/audit/audit.css`
- `apps/web/app/admin/admin-navigation.ts`, `apps/web/app/admin/admin-access.ts`, `apps/web/app/admin/AdminShell.tsx`
- `supabase/migrations/20260811210000_audit_operations_schema.sql`
- `supabase/tests/audit_operations_schema_contract.sql`
- `scripts/test_audit_operations_api.py`
- `scripts/audit_operations_smoke.mjs`
- `plan.md`, `evidence/progress/2026-08-11.md`, generated `artifacts/sbom.cdx.json` and `artifacts/release-manifest.json`

## คำสั่งและผลทดสอบจริง

- `pnpm exec vitest run packages/audit-observability/src/audit-operations.test.ts --pool=threads --maxWorkers=1` — **PASS**, 1 file / 5 tests.
- `python -m unittest scripts.test_audit_operations_api -v` — **PASS**, 5/5 static contract tests.
- `Get-Content supabase/migrations/20260811210000_audit_operations_schema.sql -Raw | docker exec -i citychatbot-p3-db psql -U postgres -d postgres -v ON_ERROR_STOP=1` — **PASS**, migration applied idempotently; local partial-restore dependency was repaired with additive `if not exists` notification guard.
- `Get-Content supabase/tests/audit_operations_schema_contract.sql -Raw | docker exec -i citychatbot-p3-db psql -U postgres -d postgres -v ON_ERROR_STOP=1` — **PASS**, all SQL `DO` assertions completed.
- `pnpm test:all` — **PASS**, exit code 0: `45` test files / `296` unit tests; `162` static database/API/UI tests; lint, web typecheck, all package typechecks, security scan and production build passed; `SECRET_SCAN_CLEAN`.
- `node scripts/audit_operations_smoke.mjs` against rebuilt `http://127.0.0.1:3223` — **PASS**:

  ```text
  health=200 audit=200:integrity=true detail=200 no_step=403:FORBIDDEN staff_export=403:FORBIDDEN notifications=200 read=200 export=201:READY replay=201:same_id download=200:CSV jobs=200 wrong_tenant=404:NOT_FOUND pages=200/200
  ```

- `pnpm security:sbom` — **PASS**, 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`.
- `pnpm release:manifest` then `pnpm release:verify` — **PASS**, verified manifest digest `c8aa9484502ac23d9e6f81f2a8e7595a6b3fad00739e0d73eeede6af5fd27454`.

## Acceptance criteria ที่ผ่าน

- Audit records are tenant-scoped, append-only, redacted before storage/export and hash-chain verification detects tampering.
- Admin audit viewer supports allowlisted actor/action/resource/time filters, cursor pagination, detail before/after diff and request/correlation/integrity fields; unauthorized tenant lookup returns non-disclosing `NOT_FOUND`.
- Staff notifications are tenant/recipient scoped; read mutation is idempotent, version-aware and audited.
- Privileged export is `TENANT_ADMIN` + step-up only; staff export attempts are rejected (`403`), request reason and idempotency are required, and request/replay/approval/queue/ready/download/expiry/revoke lifecycle is auditable.
- Large exports over `LARGE_EXPORT_THRESHOLD` are `QUEUED` and completed only by `runPendingExportJobs`, not by an unawaited HTTP promise.
- CSV output prefixes formula cells (`=`, `+`, `-`, `@`) with an apostrophe, contains watermark metadata and does not include raw sensitive fields.
- Signed URL digest is stored instead of the raw token in durable metadata; local adapter verifies token, TTL, expiry and revocation before download.
- `exports` and related tenant-owned rows have composite tenant FKs, forced RLS, versioning and no browser export mutation grants.

## API example

```http
POST /api/v1/admin/audit-log-exports?tenantId=<tenant>&role=TENANT_ADMIN&accountId=<admin>&stepUp=1
Idempotency-Key: audit-example-001
Content-Type: application/json

{"format":"CSV","filters":{"action":"EXPORT_READY"},"reason":"ตรวจสอบย้อนหลังจาก A-97","expectedVersion":1}
```

Response shape is canonical `{ data, meta }`; the smoke test verified `201 READY`, same-id replay, `403` unauthorized export, `200` CSV download, `403` no-step-up, `404` wrong-tenant and `200` A-97 pages. The opaque signed token is intentionally omitted from evidence.

## Rollback procedure

1. Disable the export action at the server policy/feature boundary; keep audit GET/detail and notification read-only viewer available.
2. Revoke active export links through the trusted `revokeExport`/`private.revoke_export` boundary and retain the export/audit rows for investigation.
3. Stop the export worker and leave queued jobs in `QUEUED`/`DEAD` for safe replay after the previous artifact policy is restored; do not delete audit rows.
4. Roll back the additive application release and forward-repair the migration only through a reviewed database change; re-run the audit unit/static/SQL/security/build/smoke gates before re-enabling export.

## Known limitations / next executable work

- Local web routes use a synthetic in-memory repository and intentionally return `CONFIGURATION_UNAVAILABLE` outside `local`/`test`; real Supabase service-role/session adapter, durable artifact storage, signed-link provider and worker deployment remain unconfigured and no production credential was used.
- Notification supporting routes are explicit and scoped to the existing `staff_notifications` read model; durable production delivery/read persistence must be connected to the existing Supabase migration before production traffic.
- Jobs tab is read-only in this task. Canonical retry/cancel/replay worker operations remain in the later P7 operations task.
- Full screenshot comparison, axe/manual screen-reader certification, all viewport/theme matrix and external UAT remain `P6-QA-001`; this task has API/UI smoke evidence but does not claim the P6 visual gate.
- `P6-KB-001` remains **BLOCKED** by `P4-QA-001`; `P6-QA-001`, `P6-GATE` and P7–P9 remain open. The project is not complete.
