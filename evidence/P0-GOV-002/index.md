# Evidence — P0-GOV-002

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `23e56e80e9ed4112f2993748bbc109b5c1bdc22478161239c4415e89e612e03e`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`bb7545c9c0ded6b98cd49d6337532b241ac99db3fbb18cd914820977666920c5`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `fc729bdfee678283e915437a226d529be959db8618e0635a8b38ce8d9cd087f3`
- Pass/total: `5/5` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `python scripts/requirements_trace.py --verify evidence/traceability.csv && python -m unittest scripts.test_requirements_trace -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
