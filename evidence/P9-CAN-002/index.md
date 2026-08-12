# P9-CAN-002 — Pilot tenant canary controls

Status: **IN_PROGRESS — unit gate ready**  
Requirement IDs: `SPEC-MVP-001`, `SPEC-AUTO-001`, `RF-03`, `RF-05`, `RF-07`, `RF-09`, `RF-15`, `RF-16`  
Task: `P9-CAN-002`  
Owner: `SYSTEM_UNIT_GATE`

## Scope

The implementation provides a tenant-scoped, deterministic pilot cohort adapter for the feature-flag configuration already defined by the canonical schema. It supports:

- HMAC-based opaque subject bucketing with tenant and feature namespace isolation.
- `STAFF_SUPERVISED` pilot audience metadata and idempotent flag/rollback changes.
- Dependency checks that keep the flag `OFF` and route traffic to `HANDOFF` when any required runtime dependency is unavailable.
- Reconciliation for cross-tenant events, duplicate event IDs, stale flag versions, out-of-cohort AI routes and non-canonical outcomes.
- A tenant/day-keyed sampling scheduler with idempotent scheduling and fail-closed sampling results.

## Files changed

- `packages/job-ops/src/canary-rollout.ts`
- `packages/job-ops/src/canary-rollout.test.ts`
- `packages/job-ops/src/job-ops.ts`
- `scripts/test_canary_rollout.py`
- `evidence/task-unit-gates.json`

## Required test IDs

`P9-CAN-COHORT`, `P9-CAN-RECONCILIATION`, `P9-CAN-FAIL-CLOSED`, `P9-CAN-SAMPLING`

## Commands and result

The task is prepared for the automatic unit gate. The authoritative runner command is:

```text
pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_canary_rollout -v
```

The focused local verification passed before entering the gate: TypeScript compilation passed and Vitest passed `2` files / `13` tests. The runner must create the immutable report and update this status to `DONE (AUTO_CLOSED_UNIT_GREEN)` only after every required command passes.

## Acceptance criteria

- Deterministic cohort selection is tenant and feature scoped: implemented and covered.
- Cross-tenant or duplicate observation is a reconciliation mismatch: implemented and covered.
- Missing chat/knowledge/handoff/rollback/channel dependency fails closed: implemented and covered.
- Rollback and flag configuration are idempotent: implemented and covered.
- Sampling schedule is tenant/day keyed and mismatch results in `FAIL_CLOSED`: implemented and covered.
- No human approval state is used: conforms to the autonomous unit-gate contract.

## Rollback procedure

Call the idempotent rollback operation for the tenant and feature key, which writes an `OFF` version with cohort `0`; the resolver immediately returns `HANDOFF`. If the adapter is deployed behind a persistent flag store, restore the previous last-known-good flag version and keep the previous bundle active.

## Known limitations

- This task implements the deterministic control/validation adapter and its unit contract. Persistent writes must use the existing tenant-scoped `feature_flag_versions` store and audited server boundary; no browser or direct client write is introduced here.
- Sampling is scheduler-ready but does not claim a completed production observation window. External migration/environment configuration remains separately fail-closed.

## Next executable task

After the automatic unit gate passes, continue with queued `P9-CAN-003` rollout checkpoint controls.

