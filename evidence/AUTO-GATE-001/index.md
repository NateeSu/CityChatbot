# Evidence — AUTO-GATE-001

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `f441d274695ff5064d6e74f776c331c4c72182f716ac57ebb0266c3b91a63af6`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`bf8c0bf6b5795ebca71346a789deb1a6b56572c1c5c2ac29b0e8ae5f3b254d68`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `9c1730d7269bcf78d65e4a235a4d225423ce6ad13ae12c053a039b469e35f60a`
- Pass/total: `5/5` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `python -m unittest scripts.test_unit_gate -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
