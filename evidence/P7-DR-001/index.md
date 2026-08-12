# Evidence — P7-DR-001

Status: **TRACE-ONLY / NOT DONE**

This file exists to make the requirement trace link resolvable. Backup/restore
rehearsal is not claimed here; the task remains open until its executable tests
and evidence pass.

## Automated unit gate checkpoint — 2026-08-12T16:18:49Z

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `b69a20c392fbf41bcf1ecefe9d184366ecd70fd5e6325244dcdb899bf35aba9a`

### Unit-gate result

- Manifest: `task-unit-gates.v1` (`3f8ffa03fbadd9622331d648d0d330ddf53d504a85facfe9c68a6b930a2104c8`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `849dda311f8818d71ac5ace2985bdda994d71934eef4afcc11b068a7ce38fcaa`
- Pass/total: `3/3` required test IDs
- Command pass/total: `1/1`

### Commands

- `python -m unittest scripts.test_recovery_contract -v` → exit `0`

### Acceptance

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
