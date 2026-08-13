# Evidence — P9-KNOW-001

<!-- unit-gate-runner -->
Status: **PASSED**
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`
Revision: `47c8f2a2338ba1d1e3fea963837016c9bb4da001`
Report hash: `bc2aae199770cd06ce6fb81dca60bdd1b1451ebf484e04d21c437e363cd0f868`

## Automated unit gate

- Manifest: `task-unit-gates.v1` (`740d665d34d59f2ba7b537c4475307c1f781ab1218d1e453ce20898e61457f31`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `9125f73131f9abf9fa3c1335c141baf61150efa62df385590758a4dea0783eb2`
- Pass/total: `9/9` required test IDs
- Command pass/total: `3/3`

## Commands and results

- `python -m unittest scripts.test_authorized_corpus_activation scripts.test_corpus_audit scripts.test_conflict_ledger -v && python scripts/audit_corpus.py --input doc_rag_test --verify docs/corpus/corpus-manifest.json && python scripts/build_conflict_ledger.py --verify docs/corpus/conflict-ledger.json` → exit `0`
- `pnpm exec vitest run packages/knowledge/src/authorized-corpus-activation.test.ts packages/chat/src/grounding.test.ts --reporter=dot` → exit `0`
- `pnpm exec tsc -p packages/knowledge/tsconfig.json --noEmit && pnpm exec tsc -p packages/chat/tsconfig.json --noEmit && python scripts/authorized_corpus_activation.py --verify && python scripts/test_authorized_corpus_activation.py --verify-sql` → exit `0`

## Acceptance criteria

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
