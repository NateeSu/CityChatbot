# P9-BAU-001 — Continuous correctness, freshness and regression cadence

Status: **IN_PROGRESS — unit gate ready**  
Requirement IDs: `SPEC-MVP-001`, `SPEC-AUTO-001`, `RF-07`, `RF-08`, `RF-15`, `RF-16`, `RF-18`  
Task: `P9-BAU-001`  
Owner: `SYSTEM_UNIT_GATE`

## Scope

The continuous correctness monitor schedules weekly/monthly/quarterly jobs,
detects expired or stale approved sources, forces affected domains to
`HANDOFF`, requires both affected unit-gate and recertification evidence before
publishing model/index/prompt/config changes, and provides idempotent domain
rollback with trace IDs.

## Files changed

- `packages/job-ops/src/continuous-correctness.ts`
- `packages/job-ops/src/continuous-correctness.test.ts`
- `packages/job-ops/src/job-ops.ts`
- `scripts/test_continuous_correctness.py`
- `evidence/task-unit-gates.json`

## Required test IDs

`P9-BAU-EXPIRY`, `P9-BAU-STALE-SOURCE`, `P9-BAU-REGRESSION`, `P9-BAU-ALERT`

## Commands and result

The authoritative automatic unit-gate command is:

```text
pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/continuous-correctness.test.ts packages/job-ops/src/operations-handoff.test.ts packages/job-ops/src/hypercare-monitor.test.ts packages/job-ops/src/rollout-checkpoints.test.ts packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_continuous_correctness -v
```

Focused verification passed before entering the gate: TypeScript compilation passed and Vitest passed `6` files / `28` tests. The runner must append the immutable report and change this status to `DONE (AUTO_CLOSED_UNIT_GREEN)` only after every required command passes.

## Acceptance criteria

- Weekly/monthly/quarterly schedules are tenant-scoped and idempotent: implemented and covered.
- Expired/stale source disables answer for the affected domain and emits alerts: implemented and covered.
- Regression publication requires affected unit tests and recertification: implemented and covered.
- Rollback and alert paths produce traceable, safe outcomes and force handoff: implemented and covered.
- No model output is used as source truth for state or operational metrics: implemented by typed inputs.

## Rollback procedure

Use `rollbackDomain` for the affected tenant/domain, retain the last-known-good
source/index/configuration, route to handoff, and rerun the affected unit gate
and recertification before publishing again.

## Known limitations

- The monitor is the scheduler/decision contract; external cron execution and
  durable telemetry storage are still deployment concerns.
- It does not claim that a calendar cycle or certified production benchmark has
  already completed; the unit gate closes the implementation task only.

## Next executable task

After the automatic unit gate passes, continue with `P9-CLOSE-001` release evidence/trace/archive controls.

