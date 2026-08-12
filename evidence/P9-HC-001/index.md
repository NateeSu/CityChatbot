# P9-HC-001 — Hypercare health and certified sampling monitor

Status: **DONE (AUTO_CLOSED_UNIT_GREEN)**  
Requirement IDs: `SPEC-MVP-001`, `SPEC-AUTO-001`, `RF-07`, `RF-08`, `RF-09`, `RF-15`, `RF-16`  
Task: `P9-HC-001`  
Owner: `SYSTEM_UNIT_GATE`

## Scope

The monitor schedules one tenant/day hypercare job, records typed health and budget signals, requires complete review coverage for negative feedback/high-risk/low-confidence/conflict samples, reconciles complaint/ticket/outbox/job domains, and fails closed to `HANDOFF`. A critical incident threshold records `ROLLED_BACK`; manual rollback is idempotent.

## Files changed

- `packages/job-ops/src/hypercare-monitor.ts`
- `packages/job-ops/src/hypercare-monitor.test.ts`
- `packages/job-ops/src/job-ops.ts`
- `scripts/test_hypercare_monitor.py`
- `evidence/task-unit-gates.json`

## Required test IDs

`P9-HC-HEALTH`, `P9-HC-SAMPLING`, `P9-HC-RECONCILIATION`, `P9-HC-ROLLBACK`

## Commands and result

The authoritative automatic unit-gate command is:

```text
pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/hypercare-monitor.test.ts packages/job-ops/src/rollout-checkpoints.test.ts packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_hypercare_monitor -v
```

TypeScript compilation passed; Vitest passed `4` files / `21` tests`; Python contract tests passed `4/4`; the unit-gate report passed all required test IDs `4/4` and updated `plan.md` to queue `P9-KT-001`.

## Acceptance criteria

- Daily health schedule and tenant/day idempotency: implemented and covered.
- Sampling review completeness for negative/high-risk/low-confidence/conflict cases: implemented and covered.
- Complaint/ticket/outbox/job reconciliation plus SLO/cost budget checks: implemented and covered.
- Health or evidence failure forces `HANDOFF`; critical incident threshold rolls back: implemented and covered.
- Rollback is idempotent and does not expose PII: implemented and covered.

## Rollback procedure

Use the idempotent manual rollback operation for the tenant, keep the last-known-good bundle/configuration, and route all traffic to handoff. Re-run health, sampling and reconciliation before a later enablement.

## Known limitations

- The monitor is the typed scheduler/decision layer. Production scheduling and durable run persistence must use the existing audited job boundary; this unit task does not claim a completed 14-day observation window.
- Inputs are trusted typed summaries from SQL/read-model telemetry; no AI output is used as operational truth.

## Next executable task

The next executable task is queued `P9-KT-001` operations/content governance delivery.

## Automated unit gate checkpoint — 2026-08-12T23:43:25Z

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `97ffbb824dd3de0bb9a89f0c95e4509e7db3db68`  
Report hash: `f963cd37cfc06fed67acfb8d8374b69c2cad509b002b65316e8925109fbe9788`

### Unit-gate result

- Manifest: `task-unit-gates.v1` (`c27fdade9073f282378b7738c05bb71619cf4cd2e1343044af8dce6ced37278f`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `a9c14e497dae71181fb4a23357327074fa15658953f7ce4cf92822d20718420a`
- Pass/total: `4/4` required test IDs
- Command pass/total: `1/1`

### Commands

- `pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/hypercare-monitor.test.ts packages/job-ops/src/rollout-checkpoints.test.ts packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_hypercare_monitor -v` → exit `0`

### Acceptance

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
