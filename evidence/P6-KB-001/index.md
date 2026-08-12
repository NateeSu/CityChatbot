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
