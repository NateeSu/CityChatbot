# P3-CMP-001 evidence — complaint schema, numbering and state machine

สถานะ: **DONE — MVP Fast-Track auto-approved จาก L1 Unit Test Green**  
วันที่ตรวจสอบ: 2026-08-10 (Asia/Bangkok)  
Requirement trace: `RF-04`, `RF-06`, `RF-13`, `RF-15`, `RF-17`; fullspec §7.2–§8.4, §12.2–§12.4, §13.4; `SPEC-MVP-001`

## สิ่งที่ส่งมอบ

- เพิ่ม additive migration `supabase/migrations/20260810020000_complaint_schema.sql` สำหรับ categories, intake queues, atomic number allocations, complaints, attachments, assignments, immutable status logs, comments, routing runs, duplicate links และ surveys
- ทุกตารางเป็น tenant-owned, มี tenant FK/composite tenant FK, unique `(tenant_id, id)`, forced RLS และ explicit read/write policies
- เพิ่ม tenant-configurable complaint prefix พร้อม slug fallback, Buddhist year display, identity-backed non-reusing allocator และ FK จาก complaint ไปยัง allocation
- เพิ่ม canonical status constraint, database transition trigger, initial `RECEIVED` timeline และ `complaint.created` outbox ใน transaction เดียว; status transition สร้าง immutable log/outbox
- เพิ่ม `@citychatbot/complaints` domain adapter ที่มี validation, idempotency, optimistic `rowVersion`, transition matrix, rollback-safe allocation behavior และ public/internal projections
- เพิ่ม SQL contract, static schema/RLS checks, seed fixture และ CI migration loop

## ไฟล์ที่เปลี่ยน

- `supabase/migrations/20260810020000_complaint_schema.sql`
- `supabase/tests/complaint_schema_contract.sql`
- `supabase/seed.sql`
- `scripts/test_complaint_schema.py`
- `packages/complaints/package.json`
- `packages/complaints/tsconfig.json`
- `packages/complaints/src/index.ts`
- `packages/complaints/src/complaint.ts`
- `packages/complaints/src/complaint.test.ts`
- `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`

## ผลการทดสอบจริง

รันจาก repository root `D:\codex\CityChatbot`:

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/complaints/src/complaint.test.ts --reporter=verbose` | **11/11 tests passed** |
| `pnpm test:all` | **15 files / 101 tests passed**, lint, web typecheck, package typecheck, DB static tests, secret scan และ production build passed |
| `pnpm test:db` | **15/15 static contract tests passed** |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | **28/28 tests passed** |
| `pnpm install --frozen-lockfile` | 10 workspace projects, lockfile consistent |
| `pnpm audit --prod --audit-level=high` | No known vulnerabilities |
| `pnpm security:scan` | `SECRET_SCAN_CLEAN` |
| `pnpm security:sbom` | 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest` / `pnpm release:verify` | Passed; manifest digest `3e5b142633242016d7c7ee5f6c92a3eb1516c507aff03b902b2b23248fb6a838` |

ฐานข้อมูล PostgreSQL 16 ชั่วคราว `citychatbot-p3-db` ใช้ migrations ทั้งหมด, synthetic seed และ contracts ต่อไปนี้โดย `ON_ERROR_STOP=1`:

- `supabase/tests/core_schema_contract.sql` — exit 0
- `supabase/tests/core_rls_contract.sql` — exit 0
- `supabase/tests/rls_policy_contract.sql` — exit 0
- `supabase/tests/complaint_schema_contract.sql` — exit 0, output `COMPLAINT_SQL_CONTRACT_PASS`
- allocator contract สร้าง 1,000 allocation ใน transaction เดียว ได้ `1000 total / 1000 distinct`; intentional savepoint rollback แล้ว sequence ถัดไปไม่ซ้ำ
- `pgbench` concurrent allocator probe: 16 clients / 4 workers / 1,008 transactions, **1008/1008 succeeded, 0 failed**; database query ได้ `1008 allocations | 1008 distinct_sequences | 1008 sequence_span`

## Acceptance criteria

- [x] Complaint tables และ relationship integrity อยู่ใน schema จริง ไม่ใช้ JSON-only placeholder
- [x] Tenant isolation: composite FK, forced RLS, explicit policies และ citizen public query scoped ด้วย tenant + LINE user
- [x] Number format `{prefix}-{BUDDHIST_YEAR}-{sequence_6}`, prefix configurable, year boundary tested และ allocation atomic/non-reusing
- [x] Category XOR, location pair/range, bounded text, phone, priority/risk/status และ date invariants validated
- [x] Allowed/forbidden canonical transition matrix ครบทุก edge/role; unspecified edge คืน `INVALID_STATE_TRANSITION`
- [x] `rowVersion` mismatch คืน `VERSION_CONFLICT`; ไม่ใช้ last-write-wins
- [x] Successful create มี `RECEIVED` timeline และ `complaint.created` outbox; status change มี immutable log/outbox
- [x] Idempotency replay คืน record เดิม และ changed request คืน `IDEMPOTENCY_CONFLICT`; server-generated timestamp retry ไม่สร้างซ้ำ
- [x] Failed transaction ไม่ทิ้ง complaint/idempotency/outbox และไม่ reuse allocated number
- [x] Citizen projection ไม่คืน description, LINE user ID, phone หรือ internal comments/actor ID

## Rollback procedure

1. ปิด complaint write/transition feature flag หรือให้ API เข้า read-only/intake fallback
2. เก็บ database backup และตรวจ restore ก่อน deploy forward-only compatibility migration
3. หยุด consumer ของ `complaint.created`/`complaint.status_changed` ชั่วคราว; คง outbox ไว้เพื่อ replay ที่ authorized
4. ใช้ policy/state-machine version ก่อนหน้าเพื่อหยุด transition ใหม่ โดยไม่ลบ timeline, audit หรือ outbox
5. หากต้อง reset เฉพาะ local validation ให้ลบ/สร้าง database ชั่วคราวใหม่; ห้าม drop ตาราง complaint ใน production ที่มีข้อมูลอ้างอิง

## Known limitations / follow-up

- `@citychatbot/complaints` เป็น deterministic in-memory adapter สำหรับ L1 domain contract; durable application repository/API จะเชื่อม Supabase ใน P3-CMP-002/P3-CMP-003
- SLA rule snapshot/due calculation, attachment upload workflow, citizen wizard และ staff UI อยู่ใน tasks ถัดไป; complaint write path ไม่พึ่ง OpenRouter/embedding
- SQL contract ใช้ synthetic local PostgreSQL; ยังไม่ได้ apply กับ production Supabase เพราะไม่มี project credential/session ที่ได้รับอนุญาตในรอบนี้
- Rich Menu/LIFF visual UX ที่ถูก block จาก visual authority เดิมยังไม่ใช่ส่วนของ Task นี้
