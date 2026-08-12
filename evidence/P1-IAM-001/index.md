# Evidence — P1-IAM-001

สถานะ: `DONE — AUTO_APPROVED_FOR_MVP`

วันที่: 2026-08-10

Task: staff authentication/session contract และ centralized permission policy

## Requirement IDs

- `RF-04` IAM/RBAC — account/membership/department/role/permission policy
- `RF-10` STAFF/OPS — staff authorization, department scope และ privileged access
- `RF-13` SECURITY — server-side auth boundary, MFA/re-auth และ canonical errors
- `INV-TENANT-001`, `INV-AUDIT-001`
- `SPEC-MVP-001`, `TEST-MVP-001` — L1 Unit Test Green เป็นเงื่อนไข auto-approval ของ MVP

## Files changed

- `packages/authz/package.json`
- `packages/authz/tsconfig.json`
- `packages/authz/src/policy.ts`
- `packages/authz/src/policy.test.ts`
- `packages/authz/README.md`
- `supabase/migrations/20260810000000_core_schema.sql`
- `supabase/seed.sql`
- `scripts/test_db_schema.py`
- `package.json`
- `pnpm-lock.yaml`
- `plan.md`

## Delivered behavior

- `buildTrustedSessionContext` accepts only verified-claim shape plus a current
  server/database membership snapshot. It rejects malformed, expired, revoked,
  deactivated-account, inactive-tenant and cross-tenant contexts.
- `authorize`/`assertAuthorized` implement an explicit matrix for
  `STAFF`, `DEPARTMENT_HEAD`, `PR_STAFF`, `KNOWLEDGE_STAFF`, `TENANT_ADMIN`, and
  `EXECUTIVE` across the canonical resources/actions/scopes from fullspec.
- Staff department/assigned/own scope checks, tenant mismatch denial and
  executive aggregate-only complaint/ticket access are enforced server-side.
- Tenant Admin and Super Admin require MFA; sensitive reads may require recent
  re-authentication; Super Admin tenant data requires an unexpired approved JIT
  support grant. Silent impersonation is not represented by the policy.
- Denials use only canonical API codes `UNAUTHENTICATED` and `FORBIDDEN`, with
  safe metadata for MFA/re-auth/support-grant handling and no resource-existence
  detail. `toAuthorizationAuditRecord` creates a redacted event for persistence
  in the append-only `audit_logs` table.
- The web foundation currently has no protected staff endpoints; `/api/health`
  is an intentional public health exception. Future protected actions must call
  this helper on the server.

## Commands and actual results

| Command / check | Result |
|---|---|
| `pnpm test:unit` | **PASS** — 2 files, 12 tests (authz 8 + config 4) |
| `pnpm exec tsc -p packages/authz/tsconfig.json --noEmit` | **PASS** |
| `pnpm test:all` | **PASS** — web lint/typecheck, package typecheck, Vitest 12, DB contract 6, Next build |
| `pnpm install --frozen-lockfile` | **PASS** |
| `pnpm audit --prod --audit-level=high` | **PASS** — no known vulnerabilities |
| `python -m unittest scripts.test_corpus_audit scripts.test_gui_inventory -v` | **PASS** — 11 baseline tests |
| targeted provider/service credential scan | **PASS** — `SECRET_SCAN_CLEAN` |
| authz unit matrix | **PASS** — allow/deny, expired/revoked, role change, tenant/department boundary, MFA, re-auth, JIT grant, audit record |

## Acceptance criteria

- [x] Login/session boundary has verified-claims parsing and current membership snapshot resolution.
- [x] Explicit allow/deny role × resource × action matrix has no wildcard permissions.
- [x] Expired, revoked and deactivated sessions are rejected as `UNAUTHENTICATED`.
- [x] Tenant/department/assigned/own horizontal and vertical escalation cases are denied.
- [x] Role changes take effect from the next current snapshot; no policy cache is used.
- [x] Tenant Admin/Super Admin MFA and sensitive re-authentication rules are unit-tested.
- [x] Super Admin JIT grant expiry/revocation and no-silent-impersonation behavior are unit-tested.
- [x] Authorization decisions have a redacted audit record adapter and canonical API error codes.
- [x] Existing public health endpoint is the only current unauthenticated route; no privileged route bypass exists.

## Rollback procedure

Disable affected privileged routes with a maintenance/feature flag, revoke active
sessions and support grants, and restore the last approved role-policy revision.
If a DB role/permission change is involved, apply a forward migration that
removes the grant and preserve audit rows; do not disable RLS or use service role
in the browser. Re-run the authz unit matrix before re-enabling the route.

## Known limitations / follow-up

- Provider-specific login UI, Supabase session lookup and MFA enrollment require
  the configured Supabase project and are intentionally not guessed or stored in
  this repository. The package is the provider-neutral server contract for that
  integration.
- Full CRUD/write RLS policies and department-level DB enforcement continue in
  `P1-RLS-001`; the current schema bootstrap is read-only/deny-by-default for
  `authenticated` writes.
- No protected application endpoint exists yet, so endpoint middleware wiring
  will be covered when the first staff feature route is implemented.

ตาม `SPEC-MVP-001` และ `plan.md` ฉบับปัจจุบัน L1 unit suite ผ่านครบและ evidence
นี้ถูกสร้างแล้ว จึง auto-approve `P1-IAM-001` สำหรับ MVP โดยไม่อ้างว่า
provider integration หรือ post-production hardening เสร็จแล้ว
