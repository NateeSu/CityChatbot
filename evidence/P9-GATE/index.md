# Evidence - P9-GATE

Status: **DONE** (2026-08-12)

This gate records the MVP production deployment gate only. It does not close P8 hardening, canary, hypercare, UAT or the project as a whole.

## Current continuation checkpoint (2026-08-13)

The repository-side P9 implementation sequence through `P9-CLOSE-001` is unit
green and recorded by the automatic gate runner. The latest release-close
revision is `619dff11f65412be42285edc05ff961999cae932`; its required tests passed
`3/3` with report hash
`42a4dbf28d4ae844e0f6a176348d46ddd68d2d290ab98040d57124beb43b8428`.

The close-phase action was intentionally recorded as
`DEFERRED_FAIL_CLOSED` because no external dispatcher is configured in the
repository runner. This does not create a human approval dependency.

The production LINE runtime is **CONFIGURED AND PROVIDER-VERIFIED** for the new
durable worker. Migration `supabase/migrations/20260813010000_line_chat_runtime.sql`
is applied, scoped Vercel environment values are configured, the tenant flag is
enabled in audited `SAFE_ABSTENTION` mode, and LINE Developers `Verify` passes.
The current production knowledge index is empty, so factual answers remain
fail-closed and must use canonical CLARIFY/HANDOFF behavior.

The verified application deployment in this checkpoint is
`dpl_2bNYaEftcKMh6LxEvuUiv9iDV6Q5` from source commit `40d2b9c`, state `READY`,
region `sin1`, with the production alias
`https://city-chatbot-murex.vercel.app`. LINE verification returned HTTP `200`
in `75 ms`; Vercel reported no runtime errors in the selected window.

### Latest repository verification

On the current workspace after `P9-CLOSE-001`, the release pipeline passed:

- `pnpm lint` — PASS
- `pnpm typecheck` and `pnpm typecheck:packages` — PASS
- `pnpm test:unit` — PASS, `63` files / `387` tests
- `pnpm security:scan` — PASS
- `python scripts/unit_gate.py --validate-only` — PASS
- `pnpm build` — PASS
- `pnpm release:manifest` and `pnpm release:verify` — PASS
- `pnpm release:rc` and `pnpm release:rc:verify` — PASS; current RC digest
  `222cce8ae51acb22db984a506f8b9f703595121f8f0cd6728a7a808b95344bad`
- `pnpm test:all` — PASS; Python contract suite `329/329`

These results validate the repository release artifact. External Supabase,
Vercel and LINE provider verification is now separately recorded in
`evidence/P9-CAN-001`; one real inbound/outbound LINE journey and certified
ACTIVE production knowledge remain distinct operational evidence.

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

The P9 immediate production gate is **PASS** because the active RC passed the L1 unit gate and a real production deployment completed. Dedicated LINE traffic is enabled in `SAFE_ABSTENTION` mode after migration, environment, RLS/grant, regional deployment and provider verification. Factual RAG answers remain fail-closed while the production knowledge index is empty.

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

Run `supabase/ops/deactivate_line_chat_production.sql`, set
`LINE_CHAT_RUNTIME_ENABLED=false`, and promote the prior READY deployment if a
production smoke or runtime gate fails. Preserve durable rows and evidence.
The additive runtime schema remains in place; rollback does not delete or
rewrite production data.

## Open work after the gate

- No repository implementation task remains in the unit-gate manifest after
  `P9-CLOSE-001`; the next executable proof is one benign real LINE message and
  its encrypted inbound/outbound/API-accepted reconciliation.
- `P8-GATE` remains blocked by external certification/hardening prerequisites.
- Supabase project provisioning, LINE developer authentication and tenant data
  wiring are complete. Certified ACTIVE production knowledge is not present.
- Project completion is **not claimed**.
