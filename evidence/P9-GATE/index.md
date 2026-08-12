# Evidence - P9-GATE

Status: **DONE** (2026-08-12)

This gate records the MVP production deployment gate only. It does not close P8 hardening, canary, hypercare, UAT or the project as a whole.

## Gate traceability

- Gate: `P9-GATE`
- Requirements: `RF-13`, `RF-15`, `RF-16`, `RF-17`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`
- Rule: `SPEC-MVP-001` - L1 unit tests are the MVP deployment gate; external hardening remains tracked and explicit.
- Active RC: `citychatbot-rc-2026-08-12-9d61a95d-ae6ccdd5`
- RC digest: `a083bb6eb030363086855ee694b9527a9f5be74bef64d33fda8c3d92539548ca`

## Gate inputs

| Input | Result | Evidence |
|---|---|---|
| MVP L1 unit suite | PASS - 51 files / 339 tests | `pnpm test:unit` |
| Release candidate verification | PASS | `pnpm release:rc:verify` |
| Production build | PASS | Vercel deployment logs and local Next.js build |
| Production deployment | PASS - Vercel `dpl_Cj5XLhyLZkKFKgUn5B3zY5Eoi1ia`, state `READY` | [P9-DEP-001](../P9-DEP-001/index.md) |
| Production health | PASS - HTTP 200, environment `production` | [P9-DEP-001](../P9-DEP-001/index.md) |
| Fail-closed citizen dependency boundary | PASS - HTTP 503 `CONFIGURATION_UNAVAILABLE` | [P9-DEP-001](../P9-DEP-001/index.md) |

## Decision

The P9 immediate production gate is **PASS** because the active RC passed the L1 unit gate and a real production deployment completed and passed read-only smoke checks. Citizen AI/LINE/provider traffic is not enabled because its external dependencies are not configured; the fail-closed boundary remains in force.

## Verification commands

- `pnpm test:unit` - PASS, 339/339.
- `pnpm --filter @citychatbot/web lint` - PASS.
- `pnpm --filter @citychatbot/web typecheck` - PASS.
- `pnpm --filter @citychatbot/web build` - PASS.
- `pnpm security:scan` - PASS.
- `pnpm release:rc:verify` - PASS for the active RC.
- `Invoke-WebRequest https://city-chatbot-murex.vercel.app/api/health` - HTTP 200 with production JSON.
- `Invoke-WebRequest https://city-chatbot-murex.vercel.app/api/v1/citizen/services` - HTTP 503 with `CONFIGURATION_UNAVAILABLE`.
- Vercel runtime errors for the last 30 minutes - none found.

## Rollback

Keep feature flags off and promote the last `READY` Vercel deployment or redeploy the active RC source commit if any production smoke or runtime gate fails. Preserve the failed deployment and evidence. No database migration was executed by this deployment, so no schema rollback is required.

## Open work after the gate

- `P9-CAN-001` is the next executable task.
- `P8-GATE` remains blocked by external certification/hardening prerequisites.
- Supabase project provisioning, LINE developer authentication, tenant data wiring and independent RAG certification are not approved by this gate.
- Project completion is **not claimed**.
