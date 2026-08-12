# P6-KB-001 Blocker Evidence

สถานะ: **BLOCKED (2026-08-11)**

`P6-KB-001` เป็น task แรกตามลำดับหลัง `P6-ADM-001` แต่ยังเริ่ม implementation ที่เปิดใช้งานไม่ได้ เพราะ prerequisite canonical `P4-QA-001` ยังมีสถานะ `TODO` ใน `plan.md`. การเปิด upload/activate/test console โดยไม่มี locked RAG scorecard จะเสี่ยงให้ unapproved หรือ uncertified knowledge กลายเป็น source truth จึงต้อง fail-closed ตาม `fullspec.md`.

## Blocker

- Dependency: `P4-QA-001` — locked RAG/chatbot certification และ scorecard
- ยังขาด: immutable run bundle, 5-repeat behavior/fact/citation/isolation/injection assertions และ evaluator self-tests
- ผลกระทบ: ยังไม่เปิด knowledge activation/publish mutation หรืออ้างผล certification
- งานต่อได้: `P6-ORG-001` prerequisites ครบ จึงเปิดทำต่อได้โดยไม่ข้าม dependency นี้

## Required resolution

ทำ `P4-QA-001` ให้ผ่านก่อน หรือมีผู้มีอำนาจอนุมัติ explicit ให้ P6 knowledge console ใช้ contract/mock แบบ read-only/fail-closed ระหว่าง certification; ห้ามเดา Open Decision และห้ามทำให้ unapproved source เข้า active index.

## Rollback / safety

ไม่มี production mutation ถูกทำใน task นี้. หากมีการเปิด surface ภายหลัง ให้ใช้ feature flag ปิด upload/activation, คง active approved index เดิม, quarantine ทุก revision ใหม่ และเก็บ audit/run bundle ก่อน replay.

## Next executable task

`P6-ORG-001`.

## Automated unit gate checkpoint — 2026-08-12T16:04:08Z

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `847ffb9a43924a9a028e09b7634233c559c870f7215087c800d6b9d0c7b644c9`

### Unit-gate result

- Manifest: `task-unit-gates.v1` (`7b0c570d82052c5c074e5d15ec3f607a514f12826966cbf8c00f9ac5ebeda1a4`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `0efc34b74c9256e970ab60565f671807f1196378af0934b9cc970d08a2010495`
- Pass/total: `4/4` required test IDs
- Command pass/total: `1/1`

### Commands

- `pnpm exec tsc -p packages/knowledge/tsconfig.json --noEmit && pnpm exec vitest run packages/knowledge/src/documents.test.ts packages/knowledge/src/indexer.test.ts --reporter=dot && python -m unittest scripts.test_knowledge_schema scripts.test_knowledge_index_schema -v` → exit `0`

### Acceptance

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
