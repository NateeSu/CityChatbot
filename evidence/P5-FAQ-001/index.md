# P5-FAQ-001 Evidence

สถานะ: **DONE (2026-08-11, MVP Fast-Track)**

Task นี้ครอบคลุม `RF-07`, `RF-09`, `RF-10` และ `RF-18` ตาม `fullspec.md`/`plan.md` โดยใช้กติกา `SPEC-MVP-001`: L1 unit suite เป็น release-blocking gate และการอนุมัติภายใน MVP เกิดขึ้นอัตโนมัติหลัง unit suite ผ่าน 100%; production stakeholder certification และ external UAT เป็น post-production follow-up ที่ fail-closed.

## สิ่งที่ส่งมอบ

- `packages/knowledge/src/faq.ts` เพิ่ม explicit FAQ candidate workflow: `DRAFT` → owner review → coordinator approval → publish และ `REVOKED`/rollback พร้อม idempotency, optimistic concurrency, source lineage, evidence IDs, effective dates, duplicate/conflict check และ privacy review
- `packages/knowledge/src/faq.test.ts` ครอบคลุม unapproved-not-retrievable, no automatic staff-reply learning, source/document lineage, conflict blocking, revoke/rollback history และ tenant/department scope
- `apps/web/app/api/v1/admin/support-tickets/[id]/faq-candidates/route.ts` เพิ่ม canonical nested API สำหรับ `PROPOSE`, `EDIT`, `REVIEW`, `APPROVE`, `PUBLISH`, `REVOKE`, `ROLLBACK`; production environment fail-closed จนกว่าจะมี durable provider configuration
- `apps/web/app/admin/support-tickets/[id]/SupportTicketDetail.tsx` เพิ่ม explicit proposal form ที่เลือก public non-AI staff message และไม่ผูก approval เข้ากับการส่ง reply
- `apps/web/app/admin/faq-candidates/page.tsx` และ `FaqCandidateQueue.tsx` เพิ่มหน้าคิวอนุมัติแยกต่างหากตาม A-31
- `supabase/migrations/20260811100000_faq_candidate_schema.sql` เพิ่ม tenant-owned `faq_candidates`, composite tenant FKs, forced RLS, explicit policies, state-machine trigger, publish lineage guard และ audit trigger
- `scripts/test_faq_schema.py`, `supabase/tests/faq_candidate_schema_contract.sql`, `scripts/test_support_ticket_api.py` เพิ่ม static/PostgreSQL/API contract coverage
- local synthetic identity fixture เพิ่ม department-head actor แยกจาก proposer/coordinator เพื่อให้ two-step/third-actor approval ทดสอบได้จริง โดยไม่ขยาย production authorization contract

## ผลการตรวจสอบจริง

- `pnpm test:unit` — **PASS**, 37 test files / 252 tests
- `pnpm test:db` — **PASS**, 123 static contract tests
- `pnpm lint` — **PASS**
- `pnpm typecheck` — **PASS**
- `pnpm typecheck:packages` — **PASS**
- `pnpm build` — **PASS**, Next.js production build, TypeScript และ static pages 19/19; route table มี `/admin/faq-candidates` และ canonical FAQ API
- `pnpm security:scan` — **PASS**, `SECRET_SCAN_CLEAN`
- `python -m unittest scripts.test_faq_schema -v` — **PASS**, 4/4
- `python -m unittest scripts.test_support_ticket_api -v` — **PASS**, 7/7
- local PostgreSQL `citychatbot-p3-db`: apply `supabase/migrations/20260811100000_faq_candidate_schema.sql` ด้วย `psql -v ON_ERROR_STOP=1` — **PASS**; apply `supabase/tests/faq_candidate_schema_contract.sql` — **PASS** (`DO`)

## API smoke evidence (synthetic/local only)

บน local Next runtime ใช้ public staff message ที่เลือกโดย explicit และ actors แยกกัน ได้ผลตามลำดับ:

```text
PROPOSE  -> HTTP 201, PENDING_OWNER_REVIEW, rowVersion 1
REVIEW   -> HTTP 200, PENDING_COORDINATOR_APPROVAL, rowVersion 2
APPROVE  -> HTTP 200, APPROVED, rowVersion 3, documentVersionId created
PUBLISH  -> HTTP 200, PUBLISHED, rowVersion 4, indexGenerationId created
ROLLBACK -> HTTP 200, REVOKED, rowVersion 5
```

ไม่มี production credential, raw citizen identity หรือ provider API ถูกใช้ในการ smoke นี้

## Acceptance criteria

- candidate ที่ยังไม่ approved/published ไม่ถูกนำเข้า active search; index เพิ่มเฉพาะ `PUBLISHED`
- staff reply ไม่ถูก auto-learn; ต้องสร้าง proposal พร้อม source message/evidence โดย explicit
- owner review และ coordinator approval แยก actor และแยก surface; approval สร้าง knowledge document version และ source lineage
- duplicate/conflict สกัดการ publish; effective date และ privacy review เป็น fail-closed guard
- revoke/rollback เอา FAQ ออกจาก active search, retire knowledge version และคง candidate/index snapshot history เพื่อ recovery
- API และ repository filter ด้วย tenant/department scope; foreign tenant/department ไม่สามารถอ่านหรือ mutate candidate ได้
- schema มี tenant isolation, composite tenant FK, forced RLS, write policy แบบ scoped และ audit trail ที่ไม่เก็บ raw citizen content

## Rollback procedure

1. เรียก canonical `ROLLBACK` หรือ `REVOKE` พร้อม `candidateId`, `expectedVersion`, `reason` และ idempotency key จาก tenant governance actor
2. service เปลี่ยน candidate เป็น `REVOKED`, retire linked knowledge version และ atomically deactivate FAQ active snapshot
3. คง candidate, document lineage และ index snapshot history ไว้สำหรับ audit/recovery; หาก production migration ต้องแก้ ให้ใช้ additive corrective migration และ pause FAQ publish consumer ก่อน replay

## Known limitations / next work

- web adapter และ API smoke ใน task นี้เป็น local synthetic/in-memory boundary; durable Supabase RPC/worker/provider wiring และ production deployment configuration ยังเป็น downstream work
- production CO approval, LINE/device UAT และ external visual regression ยังไม่มี credential/surface ใน session นี้ จึงไม่ถูกอ้างว่าเสร็จ และถูกจัดเป็น post-production certification ตาม `SPEC-MVP-001`
- `P5-QA-001` เป็น next executable task; `P5-GATE` และ P6–P9 gates ยังไม่ผ่าน จึงยังไม่ประกาศ project completion
