# P9-CLOSE-001 — Release evidence, traceability and archive close

Status: **IN_PROGRESS — unit gate ready**  
Requirement IDs: `SPEC-MVP-001`, `SPEC-AUTO-001`, `RF-15`, `RF-16`, `RF-18`  
Task: `P9-CLOSE-001`  
Owner: `SYSTEM_UNIT_GATE`

## Scope

The release close generator validates evidence links and report hashes,
traceability rows and task ownership, artifact hashes, known limitations and
idempotent archive generation. It writes a machine-close summary only from
provided records; it does not infer production readiness or invent missing
evidence.

## Files changed

- `packages/job-ops/src/release-close.ts`
- `packages/job-ops/src/release-close.test.ts`
- `packages/job-ops/src/job-ops.ts`
- `scripts/test_release_close.py`
- `evidence/task-unit-gates.json`

## Required test IDs

`P9-CLOSE-EVIDENCE`, `P9-CLOSE-TRACE`, `P9-CLOSE-IDEMPOTENCY`

## Commands and result

The authoritative automatic unit-gate command is:

```text
pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/release-close.test.ts packages/job-ops/src/continuous-correctness.test.ts packages/job-ops/src/operations-handoff.test.ts packages/job-ops/src/hypercare-monitor.test.ts packages/job-ops/src/rollout-checkpoints.test.ts packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_release_close -v
```

Focused verification passed before entering the gate: TypeScript compilation passed and Vitest passed `7` files / `31` tests. The runner must append the immutable report and change this status to `DONE (AUTO_CLOSED_UNIT_GREEN)` only after every required command passes.

## Acceptance criteria

- Missing evidence/artifact links and invalid hashes fail closed: implemented and covered.
- Orphan/duplicate trace rows are rejected: implemented and covered.
- Release summary and archive hashes are deterministic: implemented and covered.
- Same idempotency key returns the same close record and rejects changed input: implemented and covered.
- No signed acceptance or human approval is required: conforms to autonomous unit-gate policy.

## Rollback procedure

Do not delete prior evidence. Restore the prior release-close record and
redeploy the last-known-good revision; rerun the generator with a new
idempotency key after correcting links or trace rows.

## Known limitations

- The generator closes only the records supplied to it. It cannot prove live
  Supabase migration, Vercel environment, LINE delivery or calendar observation
  without external control-plane evidence.
- Existing production remains fail-closed for the new LINE chat runtime until
  those external dependencies are applied and verified.

## Next executable task

After the automatic unit gate passes, run the aggregate P9 release/production gate and reconcile external configuration evidence.

