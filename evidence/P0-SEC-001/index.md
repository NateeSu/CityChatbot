# Evidence — P0-SEC-001

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `3b4f161210d8f49200988d3c417fc83a7d5757d88f5f067bf984876f60afc2f3`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`b93ae0a3c9bf2ac4579ff30ca4783bbfb1f9b5c2495d36705a21d03c1d95334c`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `5382756320908524dc9108329968c31fc7a66dc44cb40a72f689fd8aaf9243e2`
- Pass/total: `9/9` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `python scripts/security_baseline.py --verify && python -m unittest scripts.test_security_baseline -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
