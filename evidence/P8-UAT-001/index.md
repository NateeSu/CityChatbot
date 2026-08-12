# Evidence — P8-UAT-001

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `e7487c5da27ee47b706deb3e80909a1f6d3f113b67aa757a48c2e2a3cf89f774`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`1a4edcc988458fce8f25fe29a2fc44e7022d3a978f7745529b89b0bb4f73b5ac`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `e24f105631faf9ca310a8a6d061cfbad38f3d33519a353eae9f3765895c9c01a`
- Pass/total: `4/4` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `python -m unittest scripts.test_e2e_certification -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
