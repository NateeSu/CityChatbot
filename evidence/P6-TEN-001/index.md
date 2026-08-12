# P6-TEN-001 Evidence

สถานะ: **DONE (2026-08-11, MVP Fast-Track auto-approved หลัง L1 unit suite ผ่าน 100%)**

Task นี้ครอบคลุม `RF-03`, `RF-04`, `RF-10`, `RF-13`, `RF-15` และ trace ไปยัง `INV-TENANT-001`, `INV-AUDIT-001`, `INV-VERSION-001` ตาม `fullspec.md` §4.1, §12.2, §13.5 และ Screens `S-01`/`S-02`. การอนุมัติอัตโนมัติใช้เฉพาะเงื่อนไข `SPEC-MVP-001` ใน `fullspec.md`/`plan.md`: L1 unit suite ของ scope ผ่าน 100%; ไม่ได้อ้างว่า production provider, secret vault, external UAT หรือ `P6-GATE` ผ่านแล้ว.

## สิ่งที่ส่งมอบ

- `packages/tenant-provisioning/` เพิ่ม Super Admin-only tenant lifecycle: create, resumable provisioning, suspend, reactivate, verified test-tenant archive, feature flags และ usage limits
- Provisioning run มี dependency order 9 ขั้น (`TENANT`, `SETTINGS`, `CHANNEL`, `DEPARTMENTS`, `ADMIN`, `THEME`, `MENU`, `CONTACT`, `FLAGS`), step attempt/status/error และ safe partial failure resume; replay ใช้ idempotency key เดิมแล้วคืนผลเดิมโดยไม่สร้าง tenant ซ้ำ
- Feature flags เป็น versioned server-side state และ `assertFeatureEnabled` ปฏิเสธ tenant ที่ suspended/incomplete/disabled; usage counters ตรวจ limit ฝั่ง server แบบ atomic domain boundary พร้อม `USAGE_LIMIT_EXCEEDED`
- ทุก mutation ต้อง `SUPER_ADMIN` + MFA + recent re-authentication; ไม่มี impersonation path; archive ใช้ได้เฉพาะ `isTestTenant=true` และ verification text ตรง slug
- Explicit system API routes สำหรับ S-01/S-02 list/create/detail/resume/suspend/reactivate/archive/feature-flags/usage-limits; production ที่ไม่มี trusted adapter ตอบ `CONFIGURATION_UNAVAILABLE`
- S-01/S-02 responsive UI ภาษาไทย มี onboarding checklist, progress/step status, package/flag/limit summary, resume/suspend/reactivate/archive actions และ loading/empty/error/offline/expired/stale states โดยไม่มีช่องกรอก credential secret
- `supabase/migrations/20260811200000_tenant_provisioning_schema.sql` เพิ่ม durable provisioning runs/steps, usage limit versions/counters, composite tenant references, forced RLS, browser read/write denial, immutable step guard และ trusted suspend/reactivate/usage functions; `supabase/tests/tenant_provisioning_schema_contract.sql` เป็น SQL gate

## ไฟล์ที่เปลี่ยน

- `packages/tenant-provisioning/package.json`, `packages/tenant-provisioning/tsconfig.json`, `packages/tenant-provisioning/src/index.ts`, `packages/tenant-provisioning/src/tenant-provisioning.ts`, `packages/tenant-provisioning/src/tenant-provisioning.test.ts`
- `apps/web/app/api/v1/system/tenants/**`
- `apps/web/app/system/tenants/**`
- `supabase/migrations/20260811200000_tenant_provisioning_schema.sql`, `supabase/tests/tenant_provisioning_schema_contract.sql`
- `scripts/test_tenant_provisioning_api.py`, `scripts/tenant_provisioning_smoke.mjs`
- `apps/web/package.json`, `package.json`, `pnpm-lock.yaml`, `plan.md` และ `evidence/progress/2026-08-11.md`

## ผลการทดสอบจริง

- `pnpm exec tsc -p packages/tenant-provisioning/tsconfig.json --noEmit` — **PASS**
- `pnpm exec vitest run packages/tenant-provisioning/src/tenant-provisioning.test.ts` — **PASS**, 4/4
- `python -m unittest scripts.test_tenant_provisioning_api -v` — **PASS**, 4/4
- `pnpm test:unit` ผ่านใน `pnpm test:all` — **PASS**, 44 test files / 291 tests
- `pnpm test:db` ผ่านใน `pnpm test:all` — **PASS**, 157 static contract tests
- `pnpm lint` — **PASS**
- `pnpm typecheck` — **PASS**
- `pnpm typecheck:packages` — **PASS**, รวม `packages/tenant-provisioning/tsconfig.json`
- `pnpm security:scan` ผ่านใน `pnpm test:all` — **PASS**, `SECRET_SCAN_CLEAN`
- `pnpm build` ผ่านใน `pnpm test:all` — **PASS**, route table มี `/system/tenants`, `/system/tenants/new` และ explicit `/api/v1/system/tenants/**`
- `pnpm test:all` — **PASS**, exit code 0; 44/291 L1 unit, 157/157 static, lint/typecheck/package typecheck/security/build ผ่านใน composite command
- `Get-Content -Raw -Encoding UTF8 supabase/tests/tenant_provisioning_schema_contract.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -At` — **PASS**, `TENANT_PROVISIONING_SCHEMA_SQL_CONTRACT_PASS`
- `node scripts/tenant_provisioning_smoke.mjs` against `http://127.0.0.1:3223` — **PASS**:

  ```text
  health=200 initial=200 no_step_up=403:FORBIDDEN bad_slug=400:VALIDATION_ERROR create=201:COMPLETE replay=201:same_tenant detail=200 flag=200:ENABLED flags=200 limit=200:1 suspend=200:SUSPENDED flag_while_suspended=409:INVALID_STATE reactivate=200:ACTIVE archive=200:ARCHIVED other_tenant=404:NOT_FOUND list_page=200 new_page=200
  ```

- `pnpm security:sbom` — **PASS**, 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`
- `pnpm release:manifest` then `pnpm release:verify` — **PASS**, manifest digest `3f2fc876cd015e09f4fbf6e536ec91a9f284abd8cc69472c8a3cc18ee1f97403`

## Acceptance criteria

- New pilot tenant can be provisioned from S-02 with the same code/schema and all 9 steps complete; no external credential value is accepted or rendered in UI.
- Partial step failure is suspended and resumable; replay/idempotency does not create duplicate tenant/configuration.
- Feature flag and usage limit mutations are privileged, versioned/audited and enforced server-side; direct enabling while suspended is rejected.
- Tenant A/B metadata is scoped by trusted system context; unknown tenant returns `404`; tenant state transition is explicit and reversible.
- Suspend/reactivate behavior is tested; archive requires verified test target; no silent deletion or impersonation path exists.
- S-01/S-02 use responsive layouts at the shared 320/480/767/1023 boundaries, keyboard focus styling and resilient loading/empty/error/offline/expired/stale states.

## Rollback procedure

1. Suspend the target tenant and disable its feature flags; keep provisioning run/step history read-only for diagnosis.
2. Resume a failed run only after its external dependency/secret reference is healthy; otherwise archive only a verified synthetic test tenant with slug confirmation.
3. Restore the prior feature-flag and usage-limit versions, revoke any external credential reference through the secret boundary, and retain audit/step evidence.
4. Re-run tenant unit/static/SQL/security/build/smoke gates before reactivation or go-live.

## Known limitations / next executable work

- Provisioning adapters are synthetic/local; real Supabase/Auth, LINE channel/LIFF, storage, secret vault and Vercel production wiring are intentionally not configured in this run. The `CHANNEL` step records a reference requirement rather than a credential.
- Usage/feature state is in-memory in the local web adapter; production must use the canonical Supabase RPC/table transaction and server-side quota source before real tenants are onboarded.
- Full S-01/S-02 screenshot comparison, screen-reader/device certification, external UAT and production canary remain `P6-QA-001`/post-production work.
- `P6-KB-001` remains **BLOCKED** by `P4-QA-001`; `P6-GATE` and P7–P9 remain open. The project is not complete.
