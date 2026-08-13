# P9-CLOSE-001 — Release evidence, traceability and archive close

Status: **DONE (AUTO_CLOSED_UNIT_GREEN)**  
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

Focused verification passed before entering the gate: TypeScript compilation passed and Vitest passed `7` files / `31` tests. The automatic unit gate then recorded the immutable report and closed this task after every required command passed.

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

- The generator closes only the records supplied to it. Live Supabase migration,
  Vercel environment and LINE provider verification are now recorded separately
  in `evidence/P9-CAN-001`; real inbound/outbound delivery still requires an
  external LINE user message.
- The LINE runtime is enabled in `SAFE_ABSTENTION` mode. Factual answers remain
  fail-closed because production has no certified ACTIVE public knowledge.

## Phase close action

The automatic unit gate passed and closed this task. Its requested `CLOSE_PHASE`
action is recorded as `DEFERRED_FAIL_CLOSED` because the repository runner has no
external phase dispatcher. This is an infrastructure handoff state, not a human
approval request. The external production configuration has since been applied
and evidenced; the record remains immutable historical runner output.

## Next executable task

No repository implementation task remains after this unit-gated task. The next
executable work is one real LINE inbound/outbound delivery proof and subsequent
certified production knowledge activation. Project completion is not claimed.

## Automated unit gate checkpoint — 2026-08-12T23:52:28Z

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `619dff11f65412be42285edc05ff961999cae932`  
Report hash: `42a4dbf28d4ae844e0f6a176348d46ddd68d2d290ab98040d57124beb43b8428`

### Unit-gate result

- Manifest: `task-unit-gates.v1` (`81e416d55cda7fa85d1cbcf9e2b2ecac2fb12add6c2a828fc0102a4af1dcbd84`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `e1ef7e51940c1b7af4e8769ef1381ae45bcd969cd021612fc8898cf239522a3b`
- Pass/total: `3/3` required test IDs
- Command pass/total: `1/1`

### Commands

- `pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit && pnpm exec vitest run packages/job-ops/src/release-close.test.ts packages/job-ops/src/continuous-correctness.test.ts packages/job-ops/src/operations-handoff.test.ts packages/job-ops/src/hypercare-monitor.test.ts packages/job-ops/src/rollout-checkpoints.test.ts packages/job-ops/src/canary-rollout.test.ts packages/job-ops/src/job-ops.test.ts --reporter=dot && python -m unittest scripts.test_release_close -v` → exit `0`

### Acceptance

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
