# Evidence — P0-GOV-001

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `01f56262bc2d2f5f0abb0b367ac781c0f1957bacc9541f8993525cba6d0a3e58`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`c94e9a7aa0cf4de71f090f90a288499f42b05b93ba468ec4dc451fd465b35a48`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `69b136e4e5c81821d3e0cab58e1ce50ffa7ee48da91b59257ebb4aca56b53d92`
- Pass/total: `5/5` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `python -m unittest scripts.test_governance -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
