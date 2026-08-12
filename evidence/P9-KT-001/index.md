# P9-KT-001 — Operations, content governance and training handoff

Status: **IN_PROGRESS — unit gate ready**  
Requirement IDs: `SPEC-MVP-001`, `SPEC-AUTO-001`, `RF-10`, `RF-11`, `RF-15`, `RF-18`  
Task: `P9-KT-001`  
Owner: `SYSTEM_UNIT_GATE`

## Scope

The handoff contract validates required operations documents and relative
links, runbook rollback coverage and command safety, production asset inventory
completeness, secret-reference hygiene, and fail-closed production config
defaults. It is designed for machine execution and does not introduce a human
approval state.

## Files changed

- `packages/job-ops/src/operations-handoff.ts`
- `packages/job-ops/src/operations-handoff.test.ts`
- `packages/job-ops/src/job-ops.ts`
- `scripts/test_operations_handoff.py`
- `docs/operations/p9-kt-001.md`
- `docs/operations/p9-line-chat-runbook.md`
- `docs/operations/production-asset-inventory.json`
- `evidence/task-unit-gates.json`

## Required test IDs

`P9-KT-DOCS`, `P9-KT-RUNBOOK`, `P9-KT-INVENTORY`

## Commands and result

The authoritative automatic unit-gate command is:

```text
pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/operations-handoff.test.ts packages/job-ops/src/hypercare-monitor.test.ts packages/job-ops/src/rollout-checkpoints.test.ts packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_operations_handoff -v
```

Focused verification passed before entering the gate: TypeScript compilation passed and Vitest passed `5` files / `24` tests. The runner must append the immutable report and change this status to `DONE (AUTO_CLOSED_UNIT_GREEN)` only after every required command passes.

## Acceptance criteria

- Document paths, metadata and relative links are complete: implemented and covered.
- Runbook steps have bounded commands and explicit rollback without secret literals or destructive shell shortcuts: implemented and covered.
- Production inventory includes database, hosting, LINE, webhook, migration, rollback and observability references: implemented and covered.
- Required configuration keys are referenced without values and `ai_chat_enabled` defaults off: implemented and covered.
- No approval state is introduced: conforms to autonomous unit-gate policy.

## Rollback procedure

Restore the previous handoff documentation/inventory revision and redeploy the
last-known-good code revision. Keep runtime features fail-closed until the
replacement handoff contract passes.

## Known limitations

- The inventory contains references, not live provider state. Live Supabase
  migration execution and Vercel secret configuration remain external
  operations and are intentionally not represented as a false unit pass.
- Training delivery and human feedback are advisory; automated task closure is
  determined only by the required unit gate.

## Next executable task

After the automatic unit gate passes, continue with `P9-BAU-001` continuous correctness/freshness/regression controls.

