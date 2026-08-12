# P6-USR-001 Evidence

สถานะ: **DONE (2026-08-11, MVP Fast-Track auto-approved หลัง L1 unit suite ผ่าน 100%)**

Task นี้ครอบคลุม `RF-01`, `RF-03`, `RF-04`, `RF-10`, `RF-13`, `RF-14` และ trace ไปยัง `INV-TENANT-001`, `INV-AUDIT-001`, `INV-VERSION-001` ตาม `fullspec.md` §4.1–§4.3, §12.2, §13.5 และ Screen `A-75`. การอนุมัติอัตโนมัติใช้เฉพาะเงื่อนไข `SPEC-MVP-001` ใน `fullspec.md`/`plan.md`: L1 unit suite ของ scope ผ่าน 100%; ไม่ได้อ้างว่า production identity provider, durable production persistence, external UAT หรือ `P6-GATE` ผ่านแล้ว.

## สิ่งที่ส่งมอบ

- `packages/user-management/` เพิ่ม tenant-scoped account/membership/role/invitation domain แยก account ออกจาก membership รองรับ `INVITED → ACTIVE`, `SUSPENDED`, `DEACTIVATED`, role assignments, department memberships, custom role allowlist, row version, idempotency และ audit
- Secure invitation lifecycle: email เก็บเป็น SHA-256 digest + masked display, raw token สุ่มและคืนให้ผู้ดูแลเฉพาะครั้งสร้างแต่ไม่เก็บใน repository/DB, token digest ตรวจ tenant/expiry/replay และ acceptance จะ link auth subject ที่ trusted boundary เท่านั้น
- Privileged mutation บังคับ `TENANT_ADMIN` + MFA + recent re-authentication; จำกัดจำนวน role/department, ป้องกัน system/support-access assignment และบันทึก `sessionRevokedAt` เมื่อ status/role/scope เปลี่ยน
- Last active tenant admin guard อยู่ทั้ง domain และ trusted PostgreSQL trigger/function; ห้าม deactivate/remove role ของ admin คนสุดท้าย
- Explicit API routes ตาม contract สำหรับ staff, invitation create/accept/revoke, membership update, role assignment add/remove และ role list/create/update; production ที่ไม่มี trusted adapter ตอบ `CONFIGURATION_UNAVAILABLE`
- A-75 admin UI ภาษาไทย มี staff directory, masked PII, role/permission view, invite form, one-time token notice, status/session controls, pending invitations และ loading/empty/error/offline/permission/expired/stale/recovery states
- `supabase/migrations/20260811190000_staff_management_schema.sql` เพิ่ม invitation lifecycle tables ที่มี composite tenant FKs, forced RLS, browser write/read denial, immutable invitation identity, last-admin guards และ server-only accept/deactivate functions; `supabase/tests/staff_management_schema_contract.sql` เป็น SQL gate
- `scripts/staff_api_smoke.mjs` เป็น repeatable local production-artifact smoke สำหรับ invitation, role, membership, tenant isolation และ resilient routes โดยไม่ใช้ credential

## ไฟล์ที่เปลี่ยน

- `packages/user-management/package.json`, `packages/user-management/tsconfig.json`, `packages/user-management/src/index.ts`, `packages/user-management/src/user-management.ts`, `packages/user-management/src/user-management.test.ts`
- `apps/web/app/api/v1/admin/staff/**`, `apps/web/app/api/v1/admin/roles/**`
- `apps/web/app/admin/staff/**`, `apps/web/app/admin/admin-navigation.ts`, `apps/web/app/admin/AdminShell.tsx`
- `supabase/migrations/20260811190000_staff_management_schema.sql`, `supabase/tests/staff_management_schema_contract.sql`
- `scripts/test_staff_api.py`, `scripts/test_ui_system.py`, `scripts/staff_api_smoke.mjs`
- `apps/web/package.json`, `package.json`, `pnpm-lock.yaml`, `plan.md` และ `evidence/progress/2026-08-11.md`

## ผลการทดสอบจริง

- `pnpm exec tsc -p packages/user-management/tsconfig.json --noEmit` — **PASS**
- `pnpm exec vitest run packages/user-management/src/user-management.test.ts` — **PASS**, 4/4
- `python -m unittest scripts.test_staff_api scripts.test_ui_system -v` — **PASS**, 11/11
- `pnpm test:unit` ผ่านใน `pnpm test:all` — **PASS**, 43 test files / 287 tests
- `pnpm test:db` ผ่านใน `pnpm test:all` — **PASS**, 153 static contract tests
- `pnpm lint` — **PASS**
- `pnpm typecheck` — **PASS**
- `pnpm typecheck:packages` — **PASS**, รวม `packages/user-management/tsconfig.json`
- `pnpm security:scan` ผ่านใน `pnpm test:all` — **PASS**, `SECRET_SCAN_CLEAN`
- `pnpm build` ผ่านใน `pnpm test:all` — **PASS**, route table มี `/admin/staff`, `/api/v1/admin/staff/**`, `/api/v1/admin/roles/**` และ invitation accept/revoke/role-assignment routes
- `pnpm test:all` — **PASS**, exit code 0; 43/287 L1 unit, 153/153 static, lint/typecheck/package typecheck/security/build ผ่านใน composite command
- `Get-Content -Raw -Encoding UTF8 supabase/tests/staff_management_schema_contract.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -At` — **PASS**, `STAFF_MANAGEMENT_SCHEMA_SQL_CONTRACT_PASS`
- `node scripts/staff_api_smoke.mjs` against `http://127.0.0.1:3223` — **PASS**:

  ```text
  health=200 initial=200 bad_email=400:VALIDATION_ERROR invite=201 replay=201:same_token no_step_up=403:FORBIDDEN staff_mutation=403:FORBIDDEN other_tenant=404:NOT_FOUND accept=200:ACTIVE replay_accept=409:INVITATION_REPLAYED assign=200:session_revoked remove=200:one_role last_admin=403:LAST_ADMIN_GUARD custom_role=201:CUSTOM built_in=403:FORBIDDEN admin_page=200 staff_page=200
  ```

- `pnpm security:sbom` — **PASS**, 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`
- `pnpm release:manifest` then `pnpm release:verify` — **PASS**, manifest digest `0d1bf09ab89e093f6defcd4755b29bb14489eb4db133913ef6a8cb4b14bb2a73`

## Acceptance criteria

- Account/membership separation, tenant scope and department scope are explicit; cross-tenant detail returns `404` and no client-supplied role/tenant is trusted in the domain boundary.
- Invitation token is one-time, expiry-bound, tenant-bound and replay-safe; the database stores only token/email digests, and acceptance activates the membership exactly once.
- All role/status/department changes require privileged step-up, expected row version and idempotency; role changes record session revocation and audit without raw email/token/PII.
- A tenant always retains one active `TENANT_ADMIN`; deactivation and role removal of the last admin are rejected in domain and trusted DB guard.
- Custom permissions are constrained to explicit resource/action/scope allowlists; built-in policy roles are immutable and system/support-access permissions cannot be granted from tenant UI/API.
- API route matrix is explicit, fail-closed outside local/test adapter, and role boundaries reject STAFF mutation while allowing the trusted tenant admin flow.
- A-75 renders masked staff directory, role permissions, invitation states and resilient recovery/permission/session states with responsive CSS and keyboard focus styling.

## Rollback procedure

1. Disable the staff-management route/feature flag and keep the current trusted membership snapshot read-only.
2. Revoke pending invitations and sessions through the canonical server action; restore the previous membership/role revision with an authorized tenant admin. Never restore or log a raw invitation token.
3. If a role or department scope change is unsafe, deactivate the custom role or restore the prior membership revision; retain audit and digest records for reconciliation.
4. Re-run user-management unit/static/SQL/security/build/smoke gates before re-enabling privileged mutations.

## Known limitations / next executable work

- The local adapter is intentionally in-memory and route/page modules are not yet wired to the production Supabase/Auth provider session transaction. Production must connect trusted session claims, durable invitation delivery, database RPCs and session revocation before real staff accounts are enabled.
- No real Supabase, LINE, Vercel or OpenRouter credential/provider call was made and no production configuration was changed. Invite delivery/email channel remains an integration follow-up.
- Full A-75 screenshot comparison, screen-reader/device certification, external stakeholder UAT and production canary remain `P6-QA-001`/post-production work.
- `P6-KB-001` remains **BLOCKED** by `P4-QA-001`; `P6-GATE` and P7–P9 remain open. The project is not complete.
