# Evidence — P7-AIRPT-001

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `35d5c95a880c8363e948d23dcaf413ad8afd39bdd5b8e657de8b40db2c7b9442`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`c771b58adeb8bbbd9e78ea7709ec45c91c90051d00956264ed11f480f321c8b2`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `c207eea625fb5f595ad118d9edd1d5e4e0b457db360db9c66a8f9975e033b1bc`
- Pass/total: `3/3` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `python -m unittest scripts.test_kpi_report scripts.test_ai_chat_schema -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
