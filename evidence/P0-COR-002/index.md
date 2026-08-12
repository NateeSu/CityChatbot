# Evidence — P0-COR-002

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `b951f730257286fd776f72bbee49923efc1d9bd886c0d41fe66baea1d798e816`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`cd7a0af41ccf59180cd229cb37aa140563d080fbf8a17efb7e03777a95ae1fbe`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `7fe56d1e3ba563f8a7036192eaea67b4e9cfa98a70a81e296ddea46654b9ba39`
- Pass/total: `5/5` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `python scripts/build_conflict_ledger.py --verify docs/corpus/conflict-ledger.json && python -m unittest scripts.test_conflict_ledger -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
