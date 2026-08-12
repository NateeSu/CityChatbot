# Evidence — P8-RAG-001

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `5b8b3e749029bc4671aaef5b4713f866c0956449bb3051d574f3cde7d68734be`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`8935769d2bc94d4c5787eee35ebed1c0a53b3108226f315e784e8e0c7797e2fe`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `19af0cbdde687dfe40a937402d4e77056ffdff38d7f6a098b3ceb75e2039631f`
- Pass/total: `5/5` required test IDs
- Command pass/total: `1/1`

## Commands and results

- `pnpm exec vitest run packages/knowledge/src/retriever.test.ts packages/chat/src/grounding.test.ts --reporter=dot && python -m unittest scripts.test_corpus_audit scripts.test_rag_evaluator -v` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
