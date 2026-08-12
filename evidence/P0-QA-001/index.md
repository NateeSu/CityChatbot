# Evidence — P0-QA-001

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `139352312a1d540d011d3445a6423a7ab666560b1d33295c00a8163c3a4f9840`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`48b2d183a9f53e69ece68c2f4353350a3d0b9b6307726d7894bb9aa2d00c99a6`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `c48a2c5fe60d1404197fbaceb6cc530010badb7c801441958189c710993301bb`
- Pass/total: `5/5` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `python scripts/build_certified_cases.py --verify && python -m unittest scripts.test_certified_cases -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
