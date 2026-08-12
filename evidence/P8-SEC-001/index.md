# Evidence — P8-SEC-001

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `1fad6150c3145d5b44a8bac4f6dc8f91c4665170326d71d7e25d889f34e192d3`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`cdc2136302163ef9feb48c764b9721442613fafc01da1d498ef98075e24e2360`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `76254c00f7aac846aa58380da98d273e2a155ab1400189f849061d8e296311ef`
- Pass/total: `3/3` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `pnpm security:scan && python scripts/security_baseline.py --verify && python -m unittest scripts.test_security_baseline -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
