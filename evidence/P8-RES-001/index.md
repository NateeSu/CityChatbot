# Evidence — P8-RES-001

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `d7384f5aa6d7087b623dc3d988dca07eaba108f8aa115a19e7e95199ec9954bf`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`5a6a69c117e494165d414b240015534d135f0fce159d59b5e3ec7b6edf39c67e`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `f7448759cdffd6387cae1369b5790951b1836c43e3ea3a7c5c0bb6fa810dff5a`
- Pass/total: `4/4` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `python -m unittest scripts.test_recovery_contract scripts.test_pyramid_audit -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
