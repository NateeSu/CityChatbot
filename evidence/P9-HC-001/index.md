# P9-HC-001 — Hypercare health and certified sampling monitor

Status: **IN_PROGRESS — unit gate ready**  
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

Focused verification passed before entering the gate: TypeScript compilation passed and Vitest passed `4` files / `21` tests. The runner must append the immutable report and change this status to `DONE (AUTO_CLOSED_UNIT_GREEN)` only after every required command passes.

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

After the automatic unit gate passes, continue with `P9-KT-001` operations/content governance delivery.

