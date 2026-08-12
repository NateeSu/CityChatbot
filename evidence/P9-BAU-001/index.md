# P9-BAU-001 — Continuous correctness, freshness and regression cadence

Status: **DONE (AUTO_CLOSED_UNIT_GREEN)**  
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

TypeScript compilation passed; Vitest passed `6` files / `28` tests`; Python contract tests passed `4/4`; the unit-gate report passed all required test IDs `4/4` and updated `plan.md` to queue `P9-CLOSE-001`.

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

The next executable task is queued `P9-CLOSE-001` release evidence/trace/archive controls.

## Automated unit gate checkpoint — 2026-08-12T23:49:58Z

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `d68b521252d594342f08d36f4ac4b5f03b268289`  
Report hash: `01dacf0e8bc5b9de2bd0151fbadc562c8a9960769398bd096bef49a2fc5ce985`

### Unit-gate result

- Manifest: `task-unit-gates.v1` (`2dbda75ed7d52627e57d3e3c245588726d31f1e79d2fea64ac95f8effd9ee4ba`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `49facfaec940a2aa1658e0e8d08627eb9d708ac66042dcf5bf682194e7c2fa56`
- Pass/total: `4/4` required test IDs
- Command pass/total: `1/1`

### Commands

- `pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/continuous-correctness.test.ts packages/job-ops/src/operations-handoff.test.ts packages/job-ops/src/hypercare-monitor.test.ts packages/job-ops/src/rollout-checkpoints.test.ts packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_continuous_correctness -v` → exit `0`

### Acceptance

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
