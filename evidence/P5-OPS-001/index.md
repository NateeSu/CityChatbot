# P5-OPS-001 Evidence

Status: DONE (2026-08-11, auto-approved under SPEC-MVP-001 after L1 unit tests green)

## Requirements and scope

- Requirement IDs: RF-09 HANDOFF and RF-15 OPS.
- The scanner is tenant-scoped and deterministic. It covers ownerless tickets,
  stale tickets, response/resolution SLA warning and breach boundaries, owner
  reassignment, orphan conversations, department-head escalation, dashboard
  counts and outage replay suppression.
- Alert records contain only safe ticket/public IDs, department scope, policy
  version, kind and timestamps. Conversation body, raw LINE ID and citizen
  identity are not accepted by the ops boundary.
- Synthetic/local fixtures only. No production Supabase, LINE, Vercel,
  OpenRouter or citizen identity was used.

## Changed files

- `packages/support-ops/src/operations.ts` — alert kinds, exact inclusive
  threshold calculation, tenant input validation, idempotent alert store,
  central/department-head routing, reconciliation and dashboard.
- `packages/support-ops/src/operations.test.ts` — 7 L1 tests for ownerless and
  replay dedupe, exact SLA threshold/breach, department escalation,
  reassignment, stale boundary, orphan recovery and tenant-safe content.
- `packages/support-ops/src/index.ts`, `packages/support-ops/package.json`,
  `packages/support-ops/tsconfig.json`, `packages/support-ops/README.md` —
  package boundary and operational runbook.
- `packages/support-handoff/src/handoff.ts` — versioned `warningRatio` in the
  SLA snapshot used by operational threshold calculations.
- `supabase/migrations/20260810130000_support_ops_alerts.sql` — durable alert
  table, tenant-composite ticket/department FKs, indexes, forced RLS, version
  trigger and read-only authenticated policy.
- `supabase/tests/support_ops_alerts_contract.sql` — PostgreSQL alert boundary
  assertions.
- `scripts/test_support_ops_schema.py` — 5 static alert schema tests.
- `package.json`, `pnpm-lock.yaml`, `supabase/README.md` — package typecheck,
  lock metadata and database validation instructions.
- `plan.md` — P5-OPS-001 marked DONE with actual verification results.
- `artifacts/sbom.cdx.json`, `artifacts/release-manifest.json` — regenerated
  release artifacts.

## Verification commands and actual results

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/support-ops/src/operations.test.ts` | PASS, 7/7 |
| `pnpm exec tsc -p packages/support-ops/tsconfig.json --noEmit` | PASS |
| `python -m unittest scripts.test_support_ops_schema -v` | PASS, 5/5 |
| local migration apply via `citychatbot-p3-db` | PASS, `20260810130000_support_ops_alerts.sql` |
| local migration re-apply via `citychatbot-p3-db` | PASS, idempotent notices only |
| local PostgreSQL contract | PASS, `SUPPORT_OPS_ALERTS_SQL_CONTRACT_PASS` |
| `pnpm test:all` | PASS, exit code 0; 32 test files, 227/227 L1 unit tests, 88/88 static tests, lint, web/package typecheck, package typecheck, secret scan and production build |
| `pnpm security:sbom` | PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest` and `pnpm release:verify` | PASS; digest `3a620e8ca50f1eb9609cdaecce3a885fe46ca8e513b761d202264c51f0126f53` |

## Acceptance criteria

- An open ticket without an owner produces exactly one visible
  `UNASSIGNED` alert in `CENTRAL_QUEUE`; repeated scans suppress duplicates.
- SLA warning opens exactly at the versioned warning boundary and changes to a
  breach at the due timestamp; warning and breach alerts do not remain as
  duplicate active signals.
- Assigned SLA/stale alerts target `DEPARTMENT_HEAD` and carry only the same-
  tenant department ID; owner reassignment resolves the central ownerless alert.
- Stale alert boundary is inclusive and replay after an outage is idempotent.
- Pending conversations without an open ticket produce one
  `ORPHAN_CONVERSATION` central alert; repeated source events are suppressed.
- Mixed-tenant tickets/conversations are rejected with
  `TENANT_SCOPE_VIOLATION`; alert listing and dashboard counts are tenant
  filtered.
- Durable `support_ops_alerts` has tenant/composite FKs, dedupe/index coverage,
  forced RLS, explicit scoped read policy and no authenticated write grant.
- Screenshots: not applicable; this task adds backend operational behavior and
  a runbook, not a visual surface.

## API example

```ts
const result = operations.run({
  tenantId,
  tickets: tenantScopedTickets,
  conversations: tenantScopedConversationRefs,
  policy: {
    policyVersion: "support-policy-v1",
    warningRatio: 0.8,
    staleAfterSeconds: 900,
  },
  correlationId,
});
// result.dashboard exposes ownerless/SLA/orphan counts without citizen content.
```

## Rollback procedure

1. Pause the alert consumer or disable the noisy policy revision; keep the
   central scheduled scan/report as the fallback owner.
2. Preserve existing `support_ops_alerts` rows and support tickets; do not
   delete or rewrite alert history.
3. Route new handoffs to the central queue while the reviewed policy/worker
   revision is rolled out.
4. For an isolated local database, recreate the synthetic database if the
   additive migration must be removed. For shared/production data, use a
   reviewed forward-only migration after backup verification.
5. Re-run support-ops unit/static/PostgreSQL contracts and the full repository
   gate before resuming consumers.

## Known limitations

- The tested runtime uses `InMemorySupportOpsStore`; durable worker/RPC upsert,
  notification delivery and cross-process lease wiring remain deployment work.
- `support_ops_alerts` is a read boundary in this task; the privileged worker
  that writes it must use the existing jobs/outbox contract and persist a
  correlation ID in its job execution context.
- Staff UI, LINE delivery/retry/DLQ and FAQ learning remain P5-HO-002,
  P5-HO-003 and P5-FAQ-001; P5-GATE and P6-P9 gates remain open.
- No production credential/configuration or canary was used; this evidence does
  not claim project completion.

## Traceability

- Plan item: P5-OPS-001.
- Source contract: `fullspec.md` §14 domain events/jobs, §13.7 optimistic
  mutation, and `plan.md` P5-OPS-001.
