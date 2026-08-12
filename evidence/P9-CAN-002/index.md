# P9-CAN-002 — Pilot tenant canary controls

Status: **DONE (AUTO_CLOSED_UNIT_GREEN)**  
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

The authoritative automatic unit-gate command was executed successfully:

```text
pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_canary_rollout -v
```

TypeScript compilation passed; Vitest passed `2` files / `13` tests`; Python contract tests passed `4/4`; the unit-gate report passed all required test IDs `4/4` and updated `plan.md` to queue `P9-CAN-003`.

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

The next executable task is queued `P9-CAN-003` rollout checkpoint controls.

## Automated unit gate checkpoint — 2026-08-12T23:36:30Z

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6c0a95116477c3c0c2200dcaddff6b0d94d01593`  
Report hash: `06040173024af3519796e5e2eb42de2649e074f1e159b4f652fc6e090b1e60a0`

### Unit-gate result

- Manifest: `task-unit-gates.v1` (`64914efe5cc8ff815f1a9e22cdab5aa01dc021dca14c9411be0894271c24da3f`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `3fe14566f0a8827d202f222c089048f082da7652127330eee7fbed97eac3d658`
- Pass/total: `4/4` required test IDs
- Command pass/total: `1/1`

### Commands

- `pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_canary_rollout -v` → exit `0`

### Acceptance

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
