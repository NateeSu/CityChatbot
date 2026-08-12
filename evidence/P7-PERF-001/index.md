# Evidence — P7-PERF-001

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `8f8c46b4dbd500e3c5f1caff358ecefe21f26d49d701586acc5a570e30e61cb9`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`28d77676e494be108deb64eba263c0bc81133baf49a59f5c3f01c401f9998907`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `bbfcbfb3ea3513257e67016de5098f1deb64a07f4ad08bc021e9921dce245b0a`
- Pass/total: `3/3` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `python -m unittest scripts.test_pyramid_audit -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
