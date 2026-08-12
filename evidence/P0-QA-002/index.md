# Evidence — P0-QA-002

<!-- unit-gate-runner -->
Status: **FAILED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `2d91ad9cdc79d556cc4d1b2ee09ef6a2b0f4463b3d3e26ca573ea82b082bd440`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`4a1deadec51c254466921f835de91938d1d8bc02f13fceb1c74c5b82a9733a15`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `98c179b2e4e515b1cc18dadd81f8f130ace10842c2a7cb083612422523db523a`
- Pass/total: `0/6` required test IDs
- Command pass/total: `0/1`

## Commands and results

- `python scripts/qa_harness.py --verify && python scripts/qa_harness.py --assert-intentional-failure && python -m unittest scripts.test_qa_harness -v` → exit `1`

## Acceptance criteria

- Required commands exited with code `0`: **FAIL**
- No skipped/only/focused/flaky unit signal: **FAIL**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **FAIL**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.

## Automated unit gate checkpoint — 2026-08-12T15:40:26Z

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `301925b1ba33337eacf70c17b4de790ce538169fb5473ce31e8046b41b641df3`

### Unit-gate result

- Manifest: `task-unit-gates.v1` (`4a1deadec51c254466921f835de91938d1d8bc02f13fceb1c74c5b82a9733a15`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `98c179b2e4e515b1cc18dadd81f8f130ace10842c2a7cb083612422523db523a`
- Pass/total: `6/6` required test IDs
- Command pass/total: `1/1`

### Commands

- `python scripts/qa_harness.py --verify && python scripts/qa_harness.py --assert-intentional-failure && python -m unittest scripts.test_qa_harness -v` → exit `0`

### Acceptance

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
