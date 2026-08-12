# Evidence — P8-GO-001

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `73485fd0e0c30f519bca572608c5b6231af17e128cca8d83a257f196560efe1d`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`44cf5bf5a93aa8d9d2854cd26c4e09894398c5eec40af88280aa7c93a9697395`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `4dd2132b6496f050a44a15db28fc3b68a715c724b032496224654a6aefe595ff`
- Pass/total: `3/3` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `python -m unittest scripts.test_recovery_contract -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
