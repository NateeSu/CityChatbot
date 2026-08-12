# P9-CAN-003 — Rollout checkpoint state machine

Status: **DONE (AUTO_CLOSED_UNIT_GREEN)**  
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

TypeScript compilation passed; Vitest passed `3` files / `17` tests`; Python contract tests passed `4/4`; the unit-gate report passed all required test IDs `4/4` and updated `plan.md` to queue `P9-HC-001`.

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

The next executable task is queued `P9-HC-001` health/sampling/reconciliation controls.

## Automated unit gate checkpoint — 2026-08-12T23:39:56Z

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `4605a6b3e8e3157af3e84c412769853fc75764f0`  
Report hash: `63bae804aad3789db0b7baf66cbfd6ea5b34572a4f72dae3fdf8b6a7fe74d398`

### Unit-gate result

- Manifest: `task-unit-gates.v1` (`5c4b9cbb04e60cf26a45f9ebdefb13e3e8db5ba6b12a075cd9f8f57a685a5bf8`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `bd7c640fbf55c7e4b930624425777fafec0e899781fd8168a58dfc65f0f1eca5`
- Pass/total: `4/4` required test IDs
- Command pass/total: `1/1`

### Commands

- `pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/rollout-checkpoints.test.ts packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_rollout_checkpoints -v` → exit `0`

### Acceptance

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
