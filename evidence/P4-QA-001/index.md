# Evidence — P4-QA-001

Status: **TRACE-ONLY / NOT DONE**

This file exists to make the requirement trace link resolvable. Locked RAG/chat
certification is not claimed here; the task remains post-production work until
its declared evaluator tests and evidence pass.

## Automated unit gate checkpoint — 2026-08-12T15:43:46Z

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `f032c980710679889c03331177b70c1b9ca1f7c24da3453bad607d0c2b831fda`

### Unit-gate result

- Manifest: `task-unit-gates.v1` (`5c1d47058347ded331ac9a330bbe757d1d2dd1696c5479d7134ff6eeebe3ed22`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `6a08e49461bc6b78b8d45c25864661a1b5b766088919b917fba1fe94ffa1cde1`
- Pass/total: `4/4` required test IDs
- Command pass/total: `1/1`

### Commands

- `python scripts/rag_evaluator.py --verify --repeats=5 && python -m unittest scripts.test_rag_evaluator -v` → exit `0`

### Acceptance

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
