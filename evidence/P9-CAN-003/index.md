# P9-CAN-003 — Rollout checkpoint state machine

Status: **IN_PROGRESS — unit gate ready**  
Requirement IDs: `SPEC-MVP-001`, `SPEC-AUTO-001`, `RF-03`, `RF-07`, `RF-09`, `RF-15`, `RF-16`, `RF-18`  
Task: `P9-CAN-003`  
Owner: `SYSTEM_UNIT_GATE`

## Scope

This task adds a deterministic, tenant-scoped rollout checkpoint adapter. A feature can advance only through `ROLLOUT_25 → ROLLOUT_50 → ROLLOUT_100`; dependencies and observed metrics are checked before every promotion. Rollback writes an immutable next version with `percent=0` and resolves traffic to `HANDOFF`.

## Files changed

- `packages/job-ops/src/rollout-checkpoints.ts`
- `packages/job-ops/src/rollout-checkpoints.test.ts`
- `packages/job-ops/src/job-ops.ts`
- `scripts/test_rollout_checkpoints.py`
- `evidence/task-unit-gates.json`

## Required test IDs

`P9-CAN-ROLLOUT-25`, `P9-CAN-ROLLOUT-50`, `P9-CAN-ROLLOUT-100`, `P9-CAN-ROLLBACK`

## Commands and result

The authoritative automatic unit-gate command is:

```text
pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/rollout-checkpoints.test.ts packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_rollout_checkpoints -v
```

Focused verification passed before entering the gate: TypeScript compilation passed and Vitest passed `3` files / `17` tests. The runner must append the immutable report and change this status to `DONE (AUTO_CLOSED_UNIT_GREEN)` only after every required command passes.

## Acceptance criteria

- 25%, 50% and 100% checkpoints are explicit and cannot be skipped: implemented and covered.
- Error, reconciliation and critical-error thresholds are enforced: implemented and covered.
- Tenant mismatch is rejected and no tenant state crosses the boundary: implemented and covered.
- Dependency failure and missing observations fail closed: implemented and covered.
- Rollback is idempotent and immediately routes to handoff: implemented and covered.

## Rollback procedure

Call the idempotent rollback operation for the tenant. Keep the previous bundle/configuration as last-known-good, disable the feature flag, and reconcile any in-flight observations before a later 25% restart.

## Known limitations

- This is the unit-gated rollout control and validation layer. Production persistence and actual traffic promotion still require the existing audited feature-flag server boundary and the separate migration/environment probe.
- Metrics are typed counters supplied by the trusted telemetry/reconciliation layer; the adapter does not infer business truth from model output.

## Next executable task

After the automatic unit gate passes, continue with `P9-HC-001` health/sampling/reconciliation controls.

