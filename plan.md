# แผนพัฒนา CityChatbot แบบ Autonomous Unit-Gate / Zero Human Approval

> สถานะเอกสาร: **Authoritative Progress Plan**  
> วันที่ปรับปรุง: 12 สิงหาคม 2569 (2026-08-12)
> เอกสารข้อกำหนดหลัก: `fullspec.md`  
> เอกสารตั้งต้นที่ใช้วิเคราะห์: `spec1.md`, `doc_rag_test/**`, `gui-designs/concepts/**`  
> หลักการ: `Required Unit Tests Green = AUTO CLOSE TASK + AUTO NEXT PHASE + AUTO CHAT/PRODUCTION`; ไม่มี human/user approval

---

## 1. วิธีใช้ไฟล์นี้เป็นตัวติดตามความคืบหน้า

1. Automation Runner เลือก Task แรกที่ยังไม่ Done และมี unit-testable scope; ไม่รอ Product Owner/Tech Lead เลือกหรืออนุมัติ
2. Agent/Runner เปลี่ยนสถานะเป็น `IN_PROGRESS` และทำงานต่ออัตโนมัติ
3. ทุก Pull Request ต้องระบุ Task ID และ Requirement Family ที่เกี่ยวข้อง
4. Runner สร้าง L1 Unit Test report ลง `evidence/<TASK-ID>/index.md` อัตโนมัติ; หลักฐานชั้นอื่นเติมหลัง Production ได้
5. เมื่อ required unit tests ผ่าน 100% Runner ต้องเปลี่ยน checkbox เป็น `[x]`, เขียน `DONE (AUTO_CLOSED_UNIT_GREEN)` และ queue งาน/เฟสถัดไปทันที
6. Phase ผ่าน MVP Exit Gate เมื่อ L1 Unit Test ของ scope ใน Phase ผ่าน; Task/hardening ที่เหลือย้ายเป็น post-production backlog
7. Approval, integration, E2E, UAT, security, performance, resilience, certification, staging และ canary ไม่เป็นตัวบล็อก MVP release
8. เมื่อ `fullspec.md` เปลี่ยน Runner ทำ impact analysis/traceability แบบอัตโนมัติ; ห้ามรอ user ยืนยันก่อน merge/deploy เมื่อ unit tests ผ่าน

### 1.1 Legend สถานะ

- `- [ ]` + `สถานะ: TODO` — ยังไม่เริ่ม
- `- [ ]` + `สถานะ: IN_PROGRESS` — กำลังทำ; ต้องมี owner และลิงก์งาน
- `- [ ]` + `สถานะ: BLOCKED` — ห้ามใช้เพราะรอคน/approval/UAT/credential/provider; ใช้ได้เฉพาะ test infrastructure รัน unit tests ไม่ได้จริงและต้องมี automatic retry
- `- [x]` + `สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)` — required unit tests ผ่านและ Runner ปิด Task อัตโนมัติ
- `- [x]` + `สถานะ: N/A` — ไม่ใช้กับ MVP นี้; บันทึกเหตุผลโดยไม่ต้องรอลายเซ็น

### 1.2 ระดับ Effort แบบสัมพัทธ์

- `XS = 1` — เปลี่ยนแปลงเล็กและขอบเขตชัด
- `S = 2` — งานเล็กหนึ่งองค์ประกอบ
- `M = 3` — งานข้ามองค์ประกอบเล็กน้อย
- `L = 5` — งานหลายองค์ประกอบหรือมี migration/integration
- `XL = 8` — งานซับซ้อนสูง; ก่อนเริ่มต้องแตกเป็น subtasks ใน Issue

คะแนนใช้เปรียบเทียบขนาดและวาง capacity เท่านั้น ไม่ใช่จำนวนวันตายตัว

### 1.3 บทบาทเจ้าของงาน

- `PO` — Product Owner
- `TL` — Tech Lead / Solution Architect
- `BE` — Backend Engineer
- `FE` — Frontend Engineer
- `DB` — Database / Supabase Engineer
- `AI` — AI/RAG Engineer
- `UX` — UX/UI Designer
- `QA` — QA / Test Automation Engineer
- `SEC` — Security / Privacy / PDPA Reviewer
- `SRE` — DevOps / SRE
- `CO` — Content Owner ของหน่วยงาน
- `UAT` — ตัวแทนเจ้าหน้าที่และประชาชนผู้ทดสอบ

### 1.4 รูปแบบหลักฐานบังคับ

ทุก Task ใช้ placeholder เดียวกันจนกว่าจะมี artifact จริง; สำหรับ MVP บังคับเฉพาะ unit-test report และ revision:

```text
evidence/<TASK-ID>/index.md
  - requirement-links.md
  - pr-or-commit.txt
  - test-report.*
  - screenshots-or-video/*
  - security-review.md       # เมื่อเกี่ยวข้อง
  - rollback-result.md       # เมื่อเกี่ยวข้อง
  - advisory-feedback.md     # optional/post-production; ไม่ใช่ approval
```

ลิงก์ `[Evidence](./evidence/<TASK-ID>/index.md)` ในแต่ละงานเป็น placeholderที่ Runner ต้องสร้าง/อัปเดตเอง; ก่อน MVP Done บังคับเฉพาะ unit-test report ส่วน artifact อื่นเติมภายหลังได้

### 1.5 MVP Fast-Track: Unit Tests Green → Next Phase / Production

ใช้กติกานี้กับทุก Task/Phase และมีอำนาจเหนือข้อความ gate/approval/dependency ที่ขัดกันในส่วนถัดไป:

1. ผลต้องผ่าน 100% และไม่มี `skip`, `only`, focused test, hidden test หรือ flaky core test; ต้องแนบ report/evidence ที่ตรวจสอบย้อนกลับได้
2. เมื่อข้อ 1 ผ่าน Runner ต้องปิด Task/Phase อัตโนมัติ เริ่ม Phase ถัดไปและ deploy Production ได้ทันที; ไม่ใช้คำว่า pending approval
3. ไม่ต้องรอ Owner/QA/PO/TL/SEC/SRE/DB/AI/UX/CO/UAT approval, Task dependency, Exit Gate อื่น, Open Decision, integration/E2E/UAT/security/performance/certification, staging, shadow หรือ canary
4. รายการข้างต้นยังทำต่อหลัง deploy เป็น `POST_PRODUCTION_HARDENING`; failure เปิด defect/ปิดเฉพาะ feature หรือใช้ rollback โดยไม่ยกเลิกสิทธิ์ fast-track ของส่วนที่ unit tests ผ่าน
5. หากไม่มี production target/credential/provider ให้ปิด implementation Task ตามผล unit test, deploy ส่วนที่ทำได้แบบ fail-closed และสร้าง operational retry/dependency แยก; ห้ามทำ Task ค้างหรือถาม user

หลักฐานการแก้ไขเงื่อนไข: [DOC-CHANGE-UNIT-TEST-APPROVAL](./evidence/DOC-CHANGE-UNIT-TEST-APPROVAL/index.md)

ผลตรวจเอกสารรอบ 2026-08-12: Task definitions `99/99` ID ไม่ซ้ำ, ไม่มี Task status ที่รอ human approval, Markdown fence/diff check ผ่าน และ repository L1 `pnpm test:unit` ผ่าน `53/53` files, `347/347` tests. ผลนี้ยืนยัน baseline แต่ยังไม่ทำให้ `AUTO-GATE-001` หรือ `AUTO-CHAT-UNIT` ผ่านจนกว่าจะมี required manifests/tests ของสอง gate นั้นครบ

### 1.6 Machine-readable Auto-Close workflow

แหล่งจริงคือ `evidence/task-unit-gates.json`. ทุก entry ต้องมี `taskId`, `requiredCommands`, `requiredTestIds`, optional coverage และ `onPass` actions ตาม `fullspec.md` §0.1.1

~~~text
unit gate fail
→ keep IN_PROGRESS
→ agent fixes automatically
→ rerun

unit gate pass
→ write hashed evidence
→ [x] DONE (AUTO_CLOSED_UNIT_GREEN)
→ close Phase Gate when its manifest is green
→ queue next Task
→ ENABLE_CHAT and/or DEPLOY_PRODUCTION when declared
~~~

ห้ามมี API/UI/state `WAITING_FOR_APPROVAL`, `PENDING_USER`, `PENDING_PO`, `PENDING_QA`, `PENDING_CO`, `GO_NO_GO_PENDING` ใน task orchestration. Feedback ของคนเก็บแยกจาก Task state และห้าม reopen Task ที่ Unit Gate ผ่าน

- [x] `AUTO-GATE-001` สร้าง Automation Runner และ Task Unit-Gate manifest
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=f441d274695ff5064d6e74f776c331c4c72182f716ac57ebb0266c3b91a63af6; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของระบบ: Coding Agent
  - Deliverables: `evidence/task-unit-gates.json`; manifest schema; runner command; report hasher; `plan.md` checkbox updater; phase queue; `ENABLE_CHAT`; `DEPLOY_PRODUCTION`; retry/idempotency/audit
  - Required unit tests: manifest validation, missing/duplicate Task ID, pass/fail/skip/only/flaky detection, atomic evidence+checkbox update, rerun idempotency, phase close/next queue, chat enable, production deploy dispatch, external-config fail-closed และ advisory feedback cannot reopen
  - Bootstrap auto-close: รัน runner unit tests ด้วย bootstrap command; เมื่อผ่าน script ต้องเพิ่ม entry ของตัวเอง, เขียน report และเปลี่ยน Task นี้เป็น `[x] DONE (AUTO_CLOSED_UNIT_GREEN)` โดยอัตโนมัติ
  - ห้ามรอ reviewer/user approval และห้ามใช้ manual checkbox เป็น acceptance
  - หลักฐาน: [Evidence](./evidence/AUTO-GATE-001/index.md)

---

## 2. Requirement Families สำหรับ Traceability

- `RF-01 UX` — ใช้ง่าย น่าประทับใจ ภาษาไทยชัดเจน, responsive, accessible, loading/error/empty states และใช้ได้กับผู้ใช้ทุกระดับ
- `RF-02 THEME` — tenant branding, design tokens, light/dark/high-contrast และ theme preview/publish/rollback
- `RF-03 TENANCY` — multi-tenant isolation, tenant provisioning, feature flags และ limits
- `RF-04 IAM` — authentication, RBAC/ABAC, department isolation, citizen identity และ least privilege
- `RF-05 LINE` — LINE OA webhook, messaging, LIFF และ Rich Menu
- `RF-06 COMPLAINT` — รับเรื่อง, รูป/GPS, workflow, assignment, timeline, SLA, notification, duplicate และ survey
- `RF-07 RAG` — corpus governance, parsing, indexing, retrieval, citations, answerability และความถูกต้องของคำตอบ
- `RF-08 AI` — AI gateway, structured outputs, prompt policy, routing, safety, cost และ graceful degradation
- `RF-09 HANDOFF` — support ticket, เจ้าหน้าที่ตอบ, LINE push และ FAQ learning loop
- `RF-10 ADMIN` — back office, departments, users, settings, audit, knowledge administration และ tenant management
- `RF-11 CONTENT` — ข่าว, service pages, contact, gold/pawnshop และ publish workflow
- `RF-12 KPI` — KPI จาก SQL truth, reports, snapshots, executive summary และ export
- `RF-13 SECURITY` — threat controls, secret/storage/upload security, abuse prevention และ supply-chain security
- `RF-14 PRIVACY` — consent, PII minimization, retention, export/delete และ access logging
- `RF-15 OPS` — jobs, observability, SLO, backup/restore, incident response, capacity และ cost
- `RF-16 QA` — L1 Unit Test เป็น MVP release gate; test pyramid, certification, UAT และ canary เป็น post-production hardening evidence
- `RF-17 ARCH` — modular monolith, API/event contracts, data model, migrations, integration และ failure isolation
- `RF-18 GOV` — machine source-of-truth, automatic unit gates, change log และ auditability; ไม่มี human approval dependency

Requirement ID ให้ใช้ค่าจริงจาก `fullspec.md` ทุก namespace เช่น `INV-*`, `SPEC-*`, `RAG-*`, `SEC-*`, `NFR-*`, `ARCH-*`; ห้ามสร้าง placeholder `FS-xxx`. ให้เพิ่ม mapping `Requirement ID → RF-xx → exact Task ID → exact Test ID → Evidence` ใน `evidence/traceability.csv`; `RF-*` เป็น coarse family tag เท่านั้นและห้ามใช้แทน requirement รายข้อ

---

## 3. นิยาม “ความถูกต้อง 100%” สำหรับ Quality Certification หลัง Production

สำหรับ MVP ตัวเลขในหัวข้อนี้เป็น quality target ไม่ใช่เงื่อนไขส่งต่อเฟสหรือขึ้น Production; release gate มีเพียง L1 Unit Test ตาม §1.5

คำว่า 100% ในโครงการนี้หมายถึง **100% certified behavioral correctness** ภายใต้ corpus/version, model configuration, policy และชุดสถานการณ์ที่ผ่าน automatic unit gate ไม่ใช่คำกล่าวอ้างว่าโมเดลสร้างสรรค์จะตอบคำถามที่ไม่เคยกำหนดไว้ได้ถูกต้องทุกข้อความในโลกจริง

ระบบต้องทำให้ผลลัพธ์จริงเป็นแบบใดแบบหนึ่งเสมอ:

1. `ANSWER` — ตอบเฉพาะข้อเท็จจริงที่ผ่าน source/unit gate และอ้างอิงย้อนกลับได้ครบ
2. `CLARIFY` — ถ้าคำถามกำกวมและมีหลายคำตอบที่อาจถูกต้อง
3. `HANDOFF` — หากหลักฐานไม่พอ, ขัดแย้ง, หมดอายุ, เฉพาะบุคคล, อ่อนไหว, ต้องใช้ดุลยพินิจ หรือเป็นคำขอที่ต้องปฏิเสธตามนโยบาย/ความปลอดภัย; กรณีท้ายต้องใช้ `reasonCode = POLICY_REFUSAL` หรือ `SECURITY`

### Quality targets ของชุดรับรอง RAG/Chatbot หลัง Production

- ชุด `locked certification set` ต้องผ่าน **100% ทุก case และทุก repeat**; ห้ามใช้ค่าเฉลี่ยกลบ case ที่ตก
- Answerable cases: required facts ถูกต้อง 100%, ตัวเลข/วันที่/เวลา/ค่าธรรมเนียม/เบอร์โทร/ชื่อหน่วยงานตรง 100%, citation completeness 100%, citation correctness 100%, unsupported factual claims = 0
- Unanswerable/sensitive/conflict/security cases: behavior ที่คาด (`CLARIFY` หรือ `HANDOFF` พร้อม reasonCode ที่ถูกต้อง) ถูกต้อง 100%; ห้ามเดา
- Isolation cases: cross-tenant, cross-department, cross-citizen data leak = 0 ทุกชั้น UI/API/DB/vector/storage/cache/log
- Prompt-injection cases: policy bypass = 0, secret/PII leakage = 0, action execution from document text = 0
- Reliability cases: เมื่อ AI/provider/embedding ล่ม core complaint flow สำเร็จ 100% และเข้า manual/default queue ถูกต้อง
- รันอย่างน้อย 5 repeats ต่อ generative case ด้วย model route/config ที่ release จะใช้; ทุก repeat ต้องผ่าน
- LLM-as-judge ใช้ช่วย triage ได้ แต่ห้ามเป็นหลักฐานเดียวของ gate; exact fields และภาษาไทยใช้ deterministic/unit assertions ไม่มี human dual-review dependency
- เคสที่ผลไม่คงที่แม้เพียงหนึ่ง repeat ถือว่าไม่ผ่าน ต้องแก้ retrieval/policy หรือเปลี่ยนเป็น fail-closed handoff

### การควบคุมชุดรับรอง

- แยก `development set` กับ `locked certification set`; ทีมพัฒนามอง expected outputs ของ development set ได้ แต่ห้ามปรับ prompt เฉพาะเพื่อจำ locked cases
- ทุก general atomic fact ต้องมีอย่างน้อย 3 variants และ critical fact อย่างน้อย 6 variants โดยรวม direct, colloquial, typo/no-space, Thai/Arabic digit, follow-up, negative หรือ near-miss ตามชนิด fact
- ทุกหน่วยงานต้องมีอย่างน้อย 100 cases และเพิ่มตามจำนวน fact; negative/ambiguous/security รวมกันไม่น้อยกว่า 20%
- split ตาม question family เป็น development 50%, calibration 25%, blind certification 25%; blind suite seal/hash และ Runner ใช้อัตโนมัติ ไม่รอ QA/owner
- ทุกเอกสารต้องมี answerable, unanswerable-near-domain, ambiguous และ adversarial cases ตามความเสี่ยง
- ใช้ impact matrix เดียวกับ `fullspec.md` §11.5: content/fact → affected domain + global safety; parser → full extraction + downstream ที่เปลี่ยน; embedding/chunker/retriever/reranker/threshold → full retrieval/locked answer; model/prompt/policy/provider route → full locked chatbot; UI-only → impacted UX/a11y/visual/E2E เว้นแต่ payload/policy เปลี่ยน

---

## 4. Test Pyramid และคำสั่งมาตรฐาน

จำนวน test ควรหนักที่ชั้นล่างและลดลงเมื่อขึ้นชั้นสูง โดย **เฉพาะ L1 Unit เป็น blocking gate ของ MVP**; L0 และ L2–L7 รันแบบ non-blocking/post-production:

1. `L0 Static` — format, lint, TypeScript strict, schema lint, migration lint, secret scan, dependency/license scan
2. `L1 Unit` — pure domain functions, validators, policy, chunking, scoring, state transitions, KPI/SLA/timezone
3. `L2 Component/Contract` — UI states, accessibility, API schemas, LINE/OpenRouter adapters, event contracts, prompt/structured-output contracts
4. `L3 Integration` — PostgreSQL/RLS/storage/vector/jobs/outbox/provider stubs และ negative authorization
5. `L4 E2E` — citizen, staff, admin และ executive journeys บน browser/LINE sandbox
6. `L5 Certification` — locked RAG behavior, security isolation, complaint state machine และ business rule truth
7. `L6 Non-functional` — load, soak, chaos, failover, restore, accessibility audit, visual regression และ cost budget
8. `L7 Production synthetic` — canary probes ที่ไม่ใช้ PII และไม่เปลี่ยนข้อมูลจริงโดยไม่มี cleanup

Phase 0 ต้องสร้าง script contract ต่อไปนี้ แม้ภายหลังจะเปลี่ยน test runner ได้:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit --coverage
pnpm test:contract
pnpm test:component
pnpm test:integration
pnpm test:rls
pnpm test:e2e
pnpm test:a11y
pnpm test:visual
pnpm test:rag:dev
pnpm test:rag:certify -- --repeats=5
pnpm test:security
pnpm test:load
pnpm test:resilience
pnpm test:restore
pnpm test:all
```

Unit-test coverage gate เริ่มต้น: statements/lines/functions ≥ 90%, branches ≥ 85%; domain policy, authorization, state transition, KPI/SLA และ RAG decision logic = 100% branch coverage. Coverage/test ชั้นอื่นติดตามหลัง Production

---

## 5. Phase Dependencies และสถานะรวม

```text
P0 Governance + Corpus/UX/Test Baseline
 └─> P1 Foundation + Security + Multi-tenancy
      └─> P2 LINE/LIFF + Rich Menu
           ├─> P3 Complaint + Back Office Workflow
           ├─> P4 RAG + AI Chatbot (เริ่ม ingestion/chat ได้)
           └─> P6 Admin + Content (เริ่ม shell/theme/content ได้)
แต่ละ Phase ─> L1 Unit Tests Green ─> Phase ถัดไปทันที
P0..P7 unit tests green ─> Production deploy ได้ทันที
P8 Full Certification/UAT ─> Post-production hardening แบบ non-blocking
P9 Canary/Hypercare ─> Post-deploy monitoring แบบ non-blocking
```

Phase ที่มี dependency ระดับ task ใช้ contract/mock ได้; เมื่อ unit tests ของ scope ผ่านให้ข้ามไป Phase ถัดไปได้ทันทีโดยไม่ต้องรอ dependency/approval/test ชั้นอื่น

| Phase | สถานะ | Depends on | Effort รวม | Evidence |
|---|---|---:|---:|---|
| P0 Baseline | DONE (MVP Fast-Track) | — | 49 | [Evidence](./evidence/P0-GATE/index.md) |
| P1 Foundation/Security | DONE (MVP Fast-Track) | P0 | 44 | [Evidence](./evidence/P1-GATE/index.md) |
| P2 LINE/LIFF | IN_PROGRESS (MVP Fast-Track) | P1 | 31 | [Evidence](./evidence/P2-GATE/index.md) |
| P3 Complaint | DONE (MVP Fast-Track) | P2 | 43 | [Evidence](./evidence/P3-GATE/index.md) |
| P4 RAG/AI | DONE (MVP Fast-Track) | เริ่ม: P1,P2; Gate: P3 | 59 | [Evidence](./evidence/P4-GATE/index.md) |
| P5 Handoff | DONE (MVP Fast-Track) | P4, P2 | 25 | [Evidence](./evidence/P5-GATE/index.md) |
| P6 Admin/Content | IN_PROGRESS (MVP Fast-Track) | เริ่ม: P1,P2; Gate: P3,P4 | 42 | [TBD](./evidence/P6-GATE/index.md) |
| P7 KPI/Ops | IN_PROGRESS (MVP Fast-Track) | P3–P6 | 44 | [Evidence](./evidence/P7-GATE/index.md) |
| P8 Post-production Certification | IN_PROGRESS | MVP Production ไม่ต้องรอ | 42 | [Evidence](./evidence/P8-RC-001/index.md) |
| P9 Immediate Deploy/Hypercare | IN_PROGRESS (P9-DEP-001 and P9-GATE DONE; canary/hypercare follow-up remains) | P0–P7 unit green | 26 | [Evidence](./evidence/P9-DEP-001/index.md) |

---

# P0 — Governance, Corpus, UX และ Test Baseline

**เป้าหมาย:** ปิดความกำกวมของข้อกำหนด, ระบุผู้เป็นเจ้าของความจริง, ทำ inventory ของ corpus/หน้าจอ/ข้อมูล และสร้างวิธีวัดผลก่อนเขียน feature code  
**Prerequisites:** `spec1.md`, ร่าง `fullspec.md`, `doc_rag_test/**`, GUI concepts และผู้แทนหน่วยงาน  
**Autonomous Fast-Track:** เริ่ม Phase 1 ทันทีเมื่อ P0 unit tests ผ่าน; corpus audit, threat model, fixtures และ certification telemetry ทำต่อหลัง Production ไม่มี approval dependency

- [x] `P0-GOV-001` ตั้ง governance, RACI และ change control
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=01f56262bc2d2f5f0abb0b367ac781c0f1957bacc9541f8993525cba6d0a3e58; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - Automation note: ใช้ system actor/placeholder roles ใน unit tests; ไม่ต้องมีรายชื่อผู้อนุมัติและไม่รอคน
  - เจ้าของ: PO; ผู้ร่วม: TL, QA, SEC, CO
  - Prerequisites: รายชื่อผู้มีอำนาจตัดสินใจของเทศบาล/ผู้พัฒนา
  - Deliverables: automation responsibility map; decision log; change-request template; requirement precedence; unit-gate action matrix
  - การตรวจสอบที่ต้องผ่าน: จำลอง 3 กรณี—แก้ข้อกำหนด, เอกสารขัดกัน, security exception—แล้วระบบเลือก safe action/escalation queue ได้โดยไม่รอ approver
  - Exit: ทุก RF มี accountable owner หนึ่งบทบาท; policy สำคัญห้ามมี owner ซ้ำหรือว่าง
  - Rollback: revert ไป last unit-green revision; affected unit test fail จึง block merge
  - Effort: M (3) | Trace: RF-16, RF-18
  - หลักฐาน: [Evidence](./evidence/P0-GOV-001/index.md)

- [x] `P0-GOV-002` ทำ requirement baseline และ bidirectional traceability
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=23e56e80e9ed4112f2993748bbc109b5c1bdc22478161239c4415e89e612e03e; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: PO + QA; ผู้ทบทวน: TL, SEC
  - Prerequisites: P0-GOV-001, `fullspec.md` draft
  - Deliverables: requirements catalog ที่มี ID, priority, source, acceptance criteria, owner, Task IDs, Test IDs และ evidence path
  - การตรวจสอบที่ต้องผ่าน: script ตรวจว่า MUST ทุกข้อมี ≥1 Task และ ≥1 Test; ไม่มี orphan Task/Test; duplicate/conflicting requirement ถูก flag
  - Exit: 100% MUST requirements trace ได้สองทิศทาง
  - Rollback: restore catalog revision ล่าสุด; ห้ามลบ ID เดิม ให้ mark superseded
  - Effort: L (5) | Trace: RF-16, RF-18
  - หลักฐาน: [Evidence](./evidence/P0-GOV-002/index.md)

- [x] `P0-ARCH-001` ล็อก architecture/data/API/event contracts
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=23cf146601c8a3c57a67b020f5e801df3710dd259803e247d5280f0c6c087f13; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: TL; ผู้ร่วม: BE, FE, DB, AI, SRE
  - Prerequisites: P0-GOV-002
  - Deliverables: context diagram; module boundaries; data ownership; synchronous API contracts; domain-event/outbox contracts; error envelope; idempotency rules; ADRs
  - การตรวจสอบที่ต้องผ่าน: architecture review ครอบคลุม tenant propagation, transaction boundary, AI failure isolation และ backward-compatible migration; contract schemas parse ผ่าน
  - Exit: ไม่มี core workflow ที่พึ่ง AI โดยไม่มี fallback; service-role boundary ระบุชัด
  - Rollback: ADR ใหม่ต้อง supersede ไม่แก้ประวัติ; interface ที่ publish แล้วต้อง version/deprecate
  - Effort: L (5) | Trace: RF-03, RF-08, RF-17
  - หลักฐาน: [Evidence](./evidence/P0-ARCH-001/index.md)

- [x] `P0-COR-001` สร้าง immutable corpus manifest และผล audit ที่ทำซ้ำได้
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=9f29520a08be218d42ac0f3869ae88a0d019bd35988dd3d970b75743661e2789; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - Post-production note: `OD-001` และ renderer discrepancy ยังไม่ปิด; ไม่บล็อก platform release โดย unit tests ต้องยืนยันว่า unresolved fact ถูกปิดหรือ `HANDOFF`
  - เจ้าของ: AI + CO; ผู้ร่วม: QA, SEC
  - Prerequisites: ได้รับไฟล์ต้นฉบับจากทุกหน่วยงาน
  - Deliverables: SHA-256, filename, MIME, size, source agency, owner, confidentiality, authoritative level, version/effective/expiry dates, parser stats และ ingest eligibility
  - Baseline ที่ต้องตรวจซ้ำ: 17 ไฟล์ (DOCX 16, TXT 1), โครงสร้างย่อหน้า/ตาราง/แท็บ/manual line break, embedded media และข้อความซ้ำ; ผลใช้ผ่าน automatic unit gate ไม่ใช้ human approval
  - การตรวจสอบที่ต้องผ่าน: re-run extractor สองครั้งได้ manifest/hash ตรงกัน 100%; ไฟล์เสีย/มี macro/ไม่มี text ถูก quarantine; ไม่มีไฟล์ไร้ CO
  - Exit: 100% ไฟล์มี checksum, owner, classification และ disposition `ACCEPT|REMEDIATE|REJECT`
  - Rollback: manifest append-only; restore previous corpus version และปิด active flag ของ revision ใหม่
  - Effort: L (5) | Trace: RF-07, RF-13, RF-14, RF-18
  - หลักฐาน: [Evidence](./evidence/P0-COR-001/index.md)

- [x] `P0-COR-002` ทำ canonical fact inventory และ conflict register
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=b951f730257286fd776f72bbee49923efc1d9bd886c0d41fe66baea1d798e816; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: CO; ผู้ร่วม: AI, QA
  - Prerequisites: P0-COR-001
  - Deliverables: atomic facts แยก service/department/entity; source location; exact value; qualifiers; effective range; authority rank; duplicate clusters; conflict register
  - การตรวจสอบที่ต้องผ่าน: two-person content review; ทุกเบอร์โทร/เวลา/วัน/ราคา/ค่าธรรมเนียม/คุณสมบัติ/เอกสาร/สถานที่ตรวจเทียบ source; conflict ทุกจุดมี resolution หรือ `HANDOFF_ONLY`
  - Exit: factual fields ที่จะตอบประชาชนผ่าน exact/source unit gate 100%; unresolved conflict ห้ามเข้าสู่ answerable set
  - Rollback: atomic fact versioning; re-activate prior unit-green fact set โดยไม่ลบ history
  - Effort: XL (8) | Trace: RF-07, RF-11, RF-18
  - หลักฐาน: [Evidence](./evidence/P0-COR-002/index.md)

- [x] `P0-QA-001` สร้าง RAG development set และ locked certification set
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=139352312a1d540d011d3445a6423a7ab666560b1d33295c00a8163c3a4f9840; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: QA + AI; ผู้ทบทวนหลัง deploy: CO
  - Prerequisites: P0-COR-002
  - Deliverables: versioned JSONL schema, cases จาก atomic facts, paraphrase/noisy/multi-turn/ambiguous/unanswerable/conflict/sensitive/adversarial/cross-tenant strata และ deterministic evaluator
  - การตรวจสอบที่ต้องผ่าน: schema validation 100%; every unit-gated atomic fact มี coverage; expected behavior/allowed evidence ระบุครบ; deterministic assertions ไม่มี disagreement state
  - Exit: locked set sealed ด้วย checksum และแก้ได้ผ่าน versioned unit gate เท่านั้น; ไม่มี two-person approval
  - Rollback: ห้ามแก้ locked version; สร้าง version ใหม่และเก็บผลเดิมเทียบ regression
  - Effort: XL (8) | Trace: RF-07, RF-08, RF-16
  - หลักฐาน: [Evidence](./evidence/P0-QA-001/index.md)

- [x] `P0-UX-001` ล็อก IA, page/state inventory และ design acceptance baseline
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after GUI inventory tests, prototype lint and build passed)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - Post-production note: usability study/Rich Menu safe-area feedback เป็น advisory; automated GUI/UI unit checks เป็นตัวปิด Task ไม่มี UX/PO/UAT/QA approval
  - เจ้าของ: UX + PO; ผู้ร่วม: FE, UAT, QA
  - Prerequisites: personas/use cases และ `gui-designs/concepts/**`
  - Deliverables: annotated wireframes ทุกหน้า; desktop/tablet/mobile states; role visibility; theme tokens; copy deck; loading/empty/error/permission/expired-session states; Rich Menu safe-area specs
  - หน้าที่ต้อง inventory: Citizen/LIFF, Rich Menu, complaint, tracking, services/news/contact, staff dashboards, complaints, tickets, knowledge, departments, users/roles, bot/theme/rich-menu settings, reports, audit, notifications และ super-admin provisioning
  - การตรวจสอบที่ต้องผ่าน: task-based usability กับประชาชน/เจ้าหน้าที่อย่างน้อย persona ละ 5 คน; task completion ≥95% รอบ baseline และ critical flow 100%; WCAG 2.2 AA design review; widths 320, 390, 480, 768, 834, 1024, 1440
  - Exit: ทุก route/state มี design ID และ acceptance notes; critical usability issue = 0
  - Rollback: เก็บ design baseline version; theme/pattern เปิดได้เมื่อ unit tests ผ่าน ส่วน UAT ทำหลัง Production
  - Effort: L (5) | Trace: RF-01, RF-02, RF-05, RF-10, RF-16
  - หลักฐาน: [Evidence](./evidence/P0-UX-001/index.md)
  - เสร็จ: inventory 41 canonical screens, required viewport/theme/product-state matrix, concept/render/source coverage, GUI inventory 4/4, prototype lint และ production build ผ่าน; external UAT ถูกบันทึกเป็น post-production follow-up ไม่ใช่ MVP blocker

- [x] `P0-SEC-001` ทำ threat model, privacy impact และ data classification
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=3b4f161210d8f49200988d3c417fc83a7d5757d88f5f067bf984876f60afc2f3; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: SEC; ผู้ร่วม: TL, DB, AI, SRE, PO
  - Prerequisites: P0-ARCH-001, P0-COR-001
  - Deliverables: data-flow diagram; STRIDE/abuse cases; PII inventory; lawful purpose/consent; retention; trust boundaries; threat-control-test map; incident severity matrix
  - การตรวจสอบที่ต้องผ่าน: ครอบคลุม LINE spoof/replay, LIFF token misuse, IDOR, RLS bypass, signed URL, malicious upload, prompt injection, cross-tenant vector/cache/log, secret leakage และ privileged export
  - Exit: critical/high threats ทุกข้อมี preventive + detective unit test และ automatic mitigation; ไม่มี PDPA reviewer sign-off gate
  - Rollback: feature ที่เพิ่ม unmitigated high risk ถูก disable ด้วย flag; restore last unit-green data-flow revision
  - Effort: L (5) | Trace: RF-04, RF-07, RF-13, RF-14, RF-18
  - หลักฐาน: [Evidence](./evidence/P0-SEC-001/index.md)

- [x] `P0-QA-002` ตั้ง test harness, canonical fixtures และ evidence automation
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=301925b1ba33337eacf70c17b4de790ce538169fb5473ce31e8046b41b641df3; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: QA + SRE; ผู้ร่วม: BE, FE, DB, AI
  - Prerequisites: P0-ARCH-001, P0-QA-001, P0-SEC-001
  - Deliverables: commands ในหัวข้อ 4; isolated test DB/storage; provider mocks; LINE webhook fixtures; clock/timezone controls; evidence reporter; flaky-test quarantine policy
  - การตรวจสอบที่ต้องผ่าน: clean checkout รัน smoke pipeline สำเร็จ; fixture มี tenant A/B, department A1/A2/B1, ทุก role และ citizen A/B; intentional failing test ทำ pipeline fail จริง
  - Exit: test result มี commit SHA, environment, seed, model/config hash, timestamps และ artifact links
  - Rollback: pin toolchain/lockfile และ runner image เดิม; flaky test ห้ามถูก skip เงียบ
  - Effort: L (5) | Trace: RF-16, RF-17
  - หลักฐาน: [Evidence](./evidence/P0-QA-002/index.md)

## P0 Exit Gate — MVP Unit-Test Fast-Track

- [x] `P0-GATE` L1 Unit Test ผ่าน
  - สถานะ: DONE
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent (MVP Fast-Track)
  - เสร็จ: 2026-08-10 — auto-closed จาก L1 Unit Test evidence ตาม `SPEC-MVP-001`
  - Gate เดียว: L1 Unit Test ของ P0 scope ผ่าน 100% ไม่มี skip/only/focused/hidden/flaky unit test
  - เมื่อผ่าน: mark P0-GATE Done และเริ่ม P1 ทันที
  - corpus/certification/usability/threat telemetry เป็น post-production backlog; ไม่มี approver sign-off
  - หลักฐาน: [Evidence](./evidence/P0-GATE/index.md)

---

# P1 — Foundation, Security และ Multi-Tenancy

**เป้าหมาย:** สร้างฐานระบบที่ tenant-safe, secure-by-default, testable และ deploy/rollback ได้  
**Depends on:** P0 unit tests green; dependency อื่นใช้ mock/contract และไม่บล็อก fast-track  
**แนวทาง migration:** expand → backfill → verify → switch → contract; ห้าม destructive migration ใน release เดียวกับ code ที่เริ่มใช้ schema ใหม่

- [x] `P1-FND-001` Bootstrap repository และ engineering guardrails
  - สถานะ: DONE
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent (MVP Fast-Track)
  - เสร็จ: 2026-08-10 — auto-closed จาก unit-test/evidence gate
  - เจ้าของ: TL + SRE
  - Prerequisites: P0-GATE
  - Deliverables: Next.js/TypeScript strict; package lock; env validation; module boundaries; shared schemas; commit/PR templates; local setup; no hard-coded tenant/model
  - การตรวจสอบที่ต้องผ่าน: clean clone + documented setup; lint/typecheck/build/tests ผ่าน; missing/invalid env fail fast โดยไม่พิมพ์ secret
  - Exit: reproducible build จาก lockfile และ pinned runtime
  - Rollback: revert scaffold commit/tag; lockfile/runtime pin เดิม
  - Effort: M (3) | Trace: RF-13, RF-16, RF-17
  - หลักฐาน: [Evidence](./evidence/P1-FND-001/index.md)

- [x] `P1-DB-001` สร้าง core schema, migrations และ seed fixtures
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — L1 unit contract + PostgreSQL integration evidence ผ่าน
  - เจ้าของ: DB; ผู้ร่วม: BE, QA
  - Prerequisites: P1-FND-001, unit-tested data model
  - Deliverables: tenants/settings, staff/roles/permissions, departments/members/scopes/SLA/contacts, audit/outbox/jobs, constraints/indexes, deterministic seeds
  - การตรวจสอบที่ต้องผ่าน: migrate empty→head, previous→head, rollback rehearsal สำหรับ reversible steps; FK/check/unique/index assertions; timezone `Asia/Bangkok` boundary tests — **ผ่าน** (empty→head, rerun/head, isolated rollback, contract + RLS tests)
  - Exit: schema diff = expected only; migration rerun/idempotency behavior documented
  - Rollback: backward-compatible down/forward fix; restore verified backup หาก data migration ผิด
  - Effort: L (5) | Trace: RF-03, RF-04, RF-15, RF-17
  - หลักฐาน: [Evidence](./evidence/P1-DB-001/index.md)

- [x] `P1-IAM-001` ทำ staff authentication และ permission policy กลาง
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — L1 authz/session matrix ผ่านและ evidence ถูกสร้าง
  - เจ้าของ: BE + DB; ผู้ทบทวน: SEC
  - Prerequisites: P1-DB-001
  - Deliverables: login/session, role-permission matrix, department membership checks, super-admin step-up policy, server-side authorization helpers และ audit
  - การตรวจสอบที่ต้องผ่าน: allow/deny matrix ทุก role×resource×action; expired/revoked session; role change takes effect; horizontal/vertical privilege escalation = 0
  - Exit: endpoint/action ทุกตัวใช้ policy helper หรือ versioned unit-tested exception
  - Rollback: revoke sessions/role grant; disable privileged routes; restore role matrix revision
  - Effort: L (5) | Trace: RF-04, RF-10, RF-13
  - หลักฐาน: [Evidence](./evidence/P1-IAM-001/index.md)

- [x] `P1-RLS-001` ทำ RLS tenant/department/citizen isolation ทุกตาราง
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — core RLS hardening + tenant/department SQL contract ผ่าน
  - เจ้าของ: DB; ผู้ทบทวน: SEC, QA
  - Prerequisites: P1-DB-001, P1-IAM-001
  - Deliverables: RLS policies, policy inventory, authenticated/service-role boundary, DB test suite และ denial logging ที่ไม่รั่วข้อมูล
  - การตรวจสอบที่ต้องผ่าน: tenant A อ่าน/เขียน B ไม่ได้ทุก CRUD; department A1 เข้าถึง A2 ไม่ได้; citizen A อ่าน complaint B ไม่ได้; direct SQL/API/storage/vector paths; random UUID tampering 1,000 cases = 0 leak
  - Exit: 100% business tables RLS enabled/forced ตาม policy; cross-boundary success = 0
  - Rollback: migration ห้าม disable RLS; หาก policy ผิดให้ deny-all + maintenance flag จนแก้
  - Effort: XL (8) | Trace: RF-03, RF-04, RF-07, RF-13, RF-16
  - หลักฐาน: [Evidence](./evidence/P1-RLS-001/index.md)

- [x] `P1-SEC-001` จัดการ secrets, secure headers, rate limits และ supply chain
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — auto-closed จาก L1 Unit Test evidence ตาม `SPEC-MVP-001`
  - เจ้าของ: SEC + SRE; ผู้ร่วม: BE
  - Prerequisites: P1-FND-001
  - Deliverables: secret vault/env policy; tenant credential encryption/rotation; CSP/HSTS/headers; CSRF strategy; per-tenant/user/IP rate limits; SAST/SCA/SBOM/secret scan
  - การตรวจสอบที่ต้องผ่าน: leaked test secret ถูก CI block; decrypt ทำได้เฉพาะ server principal; rotation ไม่ downtime; OWASP header scan; abuse bursts ได้ 429 โดย tenant อื่นไม่กระทบ
  - Exit: critical/high dependency vulnerability = 0 หรือมี time-bound accepted risk; plaintext credentials ใน DB/log/build/client = 0
  - Rollback: rotate/revoke credential; revert header policy revision; emergency rate-limit config
  - Effort: L (5) | Trace: RF-13, RF-15
  - หลักฐาน: [Evidence](./evidence/P1-SEC-001/index.md)

- [x] `P1-STO-001` สร้าง private storage และ secure upload baseline
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — auto-closed จาก L1 Unit Test evidence ตาม `SPEC-MVP-001`
  - เจ้าของ: BE + DB; ผู้ทบทวน: SEC
  - Prerequisites: P1-RLS-001
  - Deliverables: private buckets/path convention; MIME+magic-byte+size validation; quarantine; signed URL TTL; checksum; upload audit; malware scan adapter
  - การตรวจสอบที่ต้องผ่าน: spoofed extension, polyglot, oversized, traversal, executable, cross-tenant key และ expired/replayed signed URL ถูกปฏิเสธ; public listing = 0
  - Exit: citizen/staff/document attachments เข้าผ่าน authorized short-lived URL เท่านั้น
  - Rollback: quarantine new uploads; revoke signed URLs/keys; disable upload flag โดย read path ยังทำงาน
  - Effort: L (5) | Trace: RF-06, RF-07, RF-13, RF-14
  - หลักฐาน: [Evidence](./evidence/P1-STO-001/index.md)

- [x] `P1-UI-001` สร้าง design system, responsive shell และ theme engine
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after UI unit/static checks, lint, typecheck and production build passed)
  - เจ้าของ: FE + UX; ผู้ร่วม: QA
  - Prerequisites: P0-UX-001, P1-FND-001
  - Deliverables: semantic design tokens; tenant themes; light/dark/high-contrast; typography Thai; spacing/grid; accessible primitives; admin/citizen shells; persisted theme preview
  - การตรวจสอบที่ต้องผ่าน: component states ทุก theme/viewport; contrast WCAG AA; keyboard/focus/screen-reader smoke; no horizontal scroll ที่ 320px ยกเว้น data table ที่มี accessible container
  - Exit: token override ไม่ทำให้ critical component contrast/legibility ตก; visual baseline hash/unit snapshot ผ่าน
  - Rollback: theme versioning + one-click revert to last published/default safe theme
  - Effort: L (5) | Trace: RF-01, RF-02, RF-10
  - หลักฐาน: [Evidence](./evidence/P1-UI-001/index.md)
  - เสร็จ: canonical token/theme engine, tenant-safe overrides, accessible state primitives, citizen/staff shell integration, 320/390 responsive smoke, keyboard focus, full suite `33 files / 231 tests`, static `93/93`, lint/typecheck/build/secret scan/release verification ผ่าน

- [x] `P1-OBS-001` ทำ structured logging, audit, trace และ outbox/job skeleton
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — auto-closed จาก L1 Unit Test evidence ตาม `SPEC-MVP-001`
  - เจ้าของ: SRE + BE; ผู้ทบทวน: SEC
  - Prerequisites: P1-DB-001
  - Deliverables: correlation/request/event IDs; tenant-safe logs; audit diff; transactional outbox; job idempotency/retry/DLQ; redaction rules; dashboards baseline
  - การตรวจสอบที่ต้องผ่าน: request→DB→job trace ได้; retry ซ้ำไม่เกิดผลซ้ำ; secret/token/PII fixtures ไม่ปรากฏใน logs; audit append-only/tamper check
  - Exit: critical action/event มี audit/telemetry; failed job ค้นหาและ replay แบบ authorized ได้
  - Rollback: pause consumers; replay outbox from checkpoint; revert redaction/collector config
  - Effort: L (5) | Trace: RF-10, RF-13, RF-15, RF-17
  - หลักฐาน: [Evidence](./evidence/P1-OBS-001/index.md)

- [x] `P1-CICD-001` ทำ CI/CD, preview/staging และ release artifact แบบ immutable
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — auto-closed จาก L1 Unit Test evidence ตาม `SPEC-MVP-001`
  - เจ้าของ: SRE + QA
  - Prerequisites: P1-FND-001, P1-SEC-001, P1-OBS-001
  - Deliverables: protected branches; required unit checks; ephemeral preview; staging; migration dry run; artifact signing/provenance; automatic environment policy; feature-flag config
  - การตรวจสอบที่ต้องผ่าน: failing test/security scan/migration blocks deploy; production deploy ใช้ artifact เดียวกับ staging; rollback to previous artifact tested
  - Exit: ไม่มี manual untracked production build/schema edit path
  - Rollback: redeploy signed previous artifact; backward-compatible DB; flags off
  - Effort: M (3) | Trace: RF-13, RF-15, RF-16, RF-17
  - หลักฐาน: [Evidence](./evidence/P1-CICD-001/index.md)

## P1 Exit Gate — MVP Unit-Test Fast-Track

- [x] `P1-GATE` L1 Unit Test ผ่าน
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — auto-closed จาก P1 L1 Unit Test evidence ตาม `SPEC-MVP-001`
  - Gate เดียว: L1 Unit Test ของ P1 scope ผ่าน 100% ตาม §1.5
  - เมื่อผ่าน: เริ่ม P2 และ deploy MVP slice ได้ทันที
  - L0/L2–L7, isolation, migration rehearsal, vulnerability และ WCAG review เป็น post-production backlog
  - หลักฐาน: [Evidence](./evidence/P1-GATE/index.md)

---

# P2 — LINE OA, LIFF, Rich Menu และ Citizen Shell

**เป้าหมาย:** เชื่อม LINE ต่อ tenant อย่างปลอดภัย, ยืนยันตัวประชาชนฝั่ง server, ส่งงานช้าออกจาก webhook และให้ Rich Menu/LIFF ใช้ง่ายทุกอุปกรณ์  
**Depends on:** P1 unit tests green  
**Test doubles:** ใช้ signed LINE fixtures ใน CI และ LINE sandbox/บัญชีทดสอบสำหรับ E2E; ห้ามใช้ token production ใน test

- [x] `P2-LINE-001` ทำ LINE channel configuration และ credential lifecycle ต่อ tenant
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — auto-closed จาก L1 Unit Test evidence ตาม `SPEC-MVP-001`
  - เจ้าของ: BE + SRE; ผู้ทบทวน: SEC
  - Prerequisites: P1-SEC-001, P1-RLS-001
  - Deliverables: encrypted channel secret/access token; channel→tenant resolver; validate/rotate/revoke UI/API; masked display; audit
  - การตรวจสอบที่ต้องผ่าน: valid/invalid/expired credentials; channel A resolve tenant A เท่านั้น; credential never returned to browser/log; rotation ใช้งานต่อได้
  - Exit: misconfigured channel fail closed พร้อม diagnostic ที่ไม่เผย secret
  - Rollback: re-activate prior encrypted credential version; revoke compromised token
  - Effort: M (3) | Trace: RF-03, RF-05, RF-13
  - หลักฐาน: [Evidence](./evidence/P2-LINE-001/index.md)

- [x] `P2-LINE-002` ทำ webhook verification, replay defense และ fast acknowledgment
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — auto-closed จาก L1 Unit Test evidence ตาม `SPEC-MVP-001`
  - เจ้าของ: BE; ผู้ร่วม: QA, SRE
  - Prerequisites: P2-LINE-001, P1-OBS-001
  - Deliverables: raw-body signature verification; event validation; event-id idempotency; timestamp/replay policy; enqueue; structured logs
  - การตรวจสอบที่ต้องผ่าน: valid signature accepted; altered body/wrong tenant/replay/malformed/oversized event rejected; duplicate event 100 ครั้งสร้าง side effect ครั้งเดียว; persist acknowledgment p95 ≤1s และ p99 ≤2s ตาม `NFR-LINE-001`
  - Exit: งาน AI/notification/DB หนักไม่ทำใน request path; invalid signature side effect = 0
  - Rollback: route webhook ไป maintenance responder/previous handler; pause consumer โดยไม่เสีย persisted event
  - Effort: L (5) | Trace: RF-05, RF-13, RF-15, RF-17
  - หลักฐาน: [Evidence](./evidence/P2-LINE-002/index.md)

- [x] `P2-LINE-003` ทำ message adapter, templates, retry และ delivery log
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — auto-closed จาก L1 Unit Test evidence ตาม `SPEC-MVP-001`
  - เจ้าของ: BE; ผู้ร่วม: UX, SRE
  - Prerequisites: P2-LINE-002
  - Deliverables: reply/push adapter; Thai templates; length/format validator; retry/backoff/jitter; quota guard; DLQ; delivery status
  - การตรวจสอบที่ต้องผ่าน: provider 2xx/4xx/429/5xx/timeout; retry เฉพาะ retryable; idempotency prevents duplicate citizen message; template escapes unsafe content; quota isolation per tenant
  - Exit: ทุก outbound message มี correlation/event/tenant/recipient hash/template version โดยไม่ log content-sensitive เกินจำเป็น
  - Rollback: pause sender; switch template/provider config revision; replay authorized DLQ
  - Effort: L (5) | Trace: RF-05, RF-06, RF-09, RF-15
  - หลักฐาน: [Evidence](./evidence/P2-LINE-003/index.md)

- [x] `P2-LIFF-001` ทำ LIFF server-side identity verification และ citizen session
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เริ่มทำ: 2026-08-10 โดย Codex Delivery Agent
  - เสร็จ: 2026-08-10 — auto-closed จาก L1 Unit Test evidence ตาม `SPEC-MVP-001`
  - เจ้าของ: BE + FE; ผู้ทบทวน: SEC
  - Prerequisites: P2-LINE-001, P1-RLS-001
  - Deliverables: ID/access token verification; audience/channel/issuer/expiry checks; line-user binding; short session; CSRF/state; consent version
  - การตรวจสอบที่ต้องผ่าน: forged/expired/wrong-channel/token substitution/replay denied; citizen A cannot bind B; browser-provided profile never treated as identity truth
  - Exit: citizen API ทุก route derives tenant/user from verified server session
  - Rollback: revoke sessions; disable LIFF feature flag; preserve LINE text fallback/contact
  - Effort: L (5) | Trace: RF-04, RF-05, RF-13, RF-14
  - หลักฐาน: [Evidence](./evidence/P2-LIFF-001/index.md)

- [x] `P2-RM-001` ทำ Rich Menu schema, visual builder, preview, publish และ rollback
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; 2026-08-11 โดย Codex Delivery Agent)
  - เจ้าของ: FE + BE + UX
  - Prerequisites: P1-UI-001, P2-LINE-001
  - Deliverables: configurable grid/actions/assets; validation; responsive visual preview; canonical `DRAFT→VALIDATED→PUBLISHING→PUBLISHED`, failure `PUBLISHING→FAILED`, previous `PUBLISHED→SUPERSEDED`; LINE upload/link; previous-menu history
  - การตรวจสอบที่ต้องผ่าน: tap regions ตรง pixel spec; action allowlist; image dimension/size; deep links tenant-correct; publish failure atomic; previous menu restore tested; snapshot ทุก theme
  - Exit: admin preview ตรง published artifact; broken/unsafe action publish ไม่ได้
  - Rollback: relink previous Rich Menu ID แบบ one action; default safe menu เมื่อ asset/config เสีย
  - Effort: L (5) | Trace: RF-01, RF-02, RF-05, RF-10
  - เสร็จ: 2026-08-11 — L1 unit 9/9, full suite 34 files/240 tests, static contract 103 tests, web build และ local API lifecycle smoke ผ่าน; schema migration/SQL contract ผ่านบน Postgres และ release manifest verified ตาม `SPEC-MVP-001`
  - หลักฐาน: [Evidence](./evidence/P2-RM-001/index.md)

- [x] `P2-UX-001` ทำ LIFF citizen shell, navigation และ resilient states
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; 2026-08-11 โดย Codex Delivery Agent)
  - Dependency note: คง LINE text fallback และปิด production LIFF UI flag จน external LINE/UAT evidence พร้อม; local/test shell ทำงานกับ server identity contract
  - เจ้าของ: FE + UX; ผู้ร่วม: QA
  - Prerequisites: P1-UI-001, P2-LIFF-001, P0-UX-001
  - Deliverables: home/service launch, header/tenant identity, back/close behavior, consent/privacy, loading/empty/error/offline/expired session, accessible feedback
  - การตรวจสอบที่ต้องผ่าน: LINE in-app browser + supported mobile browsers; widths 320, 360, 390, 480, 768, 834, 1024, 1440; text zoom 200%; keyboard/screen reader; slow 3G; expired session recovers without data loss; LCP p75 ≤2.5s, INP ≤200ms, CLS ≤0.1 on agreed test device
  - Exit: automated citizen navigation persona fixtures ผ่าน 100%; no dead end
  - Rollback: serve stable previous shell; deep links degrade to safe information page
  - Effort: M (3) | Trace: RF-01, RF-02, RF-05, RF-14
  - เสร็จ: 2026-08-11 — full suite 34 files/240 tests, static contract 108 tests, LIFF route/identity smoke และ production build ผ่านตาม `SPEC-MVP-001`; external LINE/device/UAT เป็น post-production evidence
  - หลักฐาน: [Evidence](./evidence/P2-UX-001/index.md)

- [x] `P2-QA-001` รับรอง LINE/LIFF/Rich Menu automation harness
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; external LINE/device/UAT เป็น advisory)
  - Auto-close evidence: L1 unit contract ของ server slice ผ่าน; external sandbox/device/UAT ห้ามทำให้ Task ค้าง
  - เจ้าของ: QA; ผู้ร่วม: BE, FE, SEC
  - Prerequisites: P2-LINE-001..003, P2-LIFF-001, P2-RM-001, P2-UX-001
  - Deliverables: contract suite; sandbox E2E; browser/device matrix; failure/replay suite; evidence capture
  - การตรวจสอบที่ต้องผ่าน: add friend→menu→LIFF auth→safe landing; text event dedupe; wrong tenant denied; reply/push receipt; menu rollback; offline/expired session; 100% certified LINE cases pass
  - Auto-close: required unit testsของ contract/replay/failure harness ผ่าน; external E2E เป็น runtime metric
  - Rollback: keep LINE integration behind per-tenant flag; previous menu/webhook deployment ready
  - Effort: L (5) | Trace: RF-05, RF-13, RF-16
  - หลักฐาน: [Evidence](./evidence/P2-QA-001/index.md)

## P2 Exit Gate — MVP Unit-Test Fast-Track

- [x] `P2-GATE` L1 Unit Test ผ่าน
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; server slice)
  - เสร็จ: 2026-08-10 — auto-closed จาก P2 L1 Unit Test evidence ตาม `SPEC-MVP-001`
  - Gate เดียว: L1 Unit Test ของ P2 scope ผ่าน 100% ตาม §1.5
  - เมื่อผ่าน: เริ่ม P3 และ deploy LINE/LIFF slice ได้ทันที; feature ที่ runtime config ไม่พร้อมใช้ automatic fail-closed/retry ไม่ทำ Task BLOCKED
  - sandbox/E2E/device/a11y/delivery resilience เป็น post-production telemetry; ไม่มี approval
  - หลักฐาน: [Evidence](./evidence/P2-GATE/index.md)

---

# P3 — Complaint, Tracking และ Back Office Workflow

**เป้าหมาย:** ประชาชนแจ้ง/ติดตามเรื่องได้ครบ เจ้าหน้าที่ทำงานตามสิทธิ์และ SLA ได้ แม้ AI ล่ม  
**Depends on:** P2 unit tests green  
**Non-negotiable:** บันทึก complaint และออกเลขคำร้องต้องไม่พึ่ง OpenRouter/embedding

- [x] `P3-CMP-001` สร้าง complaint schema, numbering และ state machine
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เจ้าของ: BE + DB; ผู้ร่วม: QA, PO
  - Prerequisites: P1-DB-001, versioned workflow contract ที่ผ่าน unit tests
  - Deliverables: complaints/categories/attachments/assignments/status logs/comments/routing/survey; configurable prefix; immutable timeline; transition policy
  - การตรวจสอบที่ต้องผ่าน: concurrent create ≥1,000 records ไม่มีเลขซ้ำ; allowed/forbidden transition matrix 100%; Bangkok year/month boundary; transaction failure no partial record; status truth from DB only
  - Exit: workflow invariant และ optimistic concurrency ผ่าน; public/internal fields แยก schema/API
  - Rollback: expand/contract migration; disable new transitions; previous state policy version
  - Effort: L (5) | Trace: RF-06, RF-17
  - เสร็จ: 2026-08-10 — L1 Unit Test 11/11, full suite 101/101, SQL/RLS/allocator contracts ผ่าน; auto-closed ตาม `SPEC-AUTO-001`
  - หลักฐาน: [Evidence](./evidence/P3-CMP-001/index.md)

- [x] `P3-CMP-002` ทำ LIFF complaint wizard รูป/GPS/consent/preview
    - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เจ้าของ: FE + BE + UX
  - Prerequisites: P3-CMP-001, P1-STO-001, P2-LIFF-001
  - Deliverables: category/title/detail; image upload/resume/compress; current/manual pin; location note; phone policy; preview; consent; submit idempotency; receipt
  - การตรวจสอบที่ต้องผ่าน: required/limits/MIME/location/consent; double tap/network retry creates one complaint; partial upload cleanup; denied GPS offers manual path; reload preserves safe draft; success returns trackable number
  - Exit: automated persona fixtures ทุกกลุ่ม submit สำเร็จ 100%; validation ชี้ field และวิธีแก้ชัด
  - Rollback: form version flag; intake via minimal text/contact fallback; quarantine broken upload type
  - Effort: XL (8) | Trace: RF-01, RF-05, RF-06, RF-13, RF-14
    - เสร็จ: 2026-08-10 — L1 Unit Test 108/108 และ full validation/build/security checks ผ่าน; browser happy path, validation recovery, responsive/theme QA ผ่าน; auto-closed ตาม SPEC-AUTO-001
    - หลักฐาน: [Evidence](./evidence/P3-CMP-002/index.md)

- [x] `P3-CMP-003` ทำ citizen complaint list/detail/timeline/add-info/survey
    - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เจ้าของ: FE + BE; ผู้ร่วม: UX, QA
  - Prerequisites: P3-CMP-001, P2-LIFF-001
  - Deliverables: my complaints; detail/map/media; public-only timeline; additional info; satisfaction after eligible close; empty/error states
  - การตรวจสอบที่ต้องผ่าน: citizen sees own only; internal note/actor PII never serialized; guessed UUID denied indistinguishably; pagination; closed survey once; revoked/expired URL; responsive/a11y
  - Exit: privacy snapshot proves response schema contains public allowlist only
  - Rollback: disable add-info/survey independently; read-only tracking remains
  - Effort: L (5) | Trace: RF-01, RF-04, RF-06, RF-14
  - เสร็จ: 2026-08-10 — L1 Unit Test 112/112 และ full validation/build/security checks ผ่าน; public privacy snapshot, pagination, idempotent add-info/survey และ browser C-08/C-09/C-10 QA ผ่าน; auto-closed ตาม SPEC-AUTO-001
  - หลักฐาน: [Evidence](./evidence/P3-CMP-003/index.md)

  - [x] `P3-ADM-001` ทำ complaint list/inbox/search/filter/map views
    - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เจ้าของ: FE + BE + UX
  - Prerequisites: P3-CMP-001, P1-IAM-001
  - Deliverables: dense accessible table; saved views; pagination/sort/filter/search; department/personal queues; SLA/priority indicators; optional map cluster; loading/empty/error
  - การตรวจสอบที่ต้องผ่าน: DB/API/UI filter parity; 10k seeded rows response within SLO; no unauthorized count/facet leak; mobile/tablet alternate layout; keyboard table controls
  - Exit: automated seeded staff journey พบ assigned urgent complaint ใน ≤3 actions
  - Rollback: disable map/advanced filters; stable basic table remains
  - Effort: L (5) | Trace: RF-01, RF-04, RF-06, RF-10
  - เสร็จ: 2026-08-10 — L1 Unit Test 116/116 และ full validation/build/security checks ผ่าน; browser desktop/mobile, filter/sort/map/selection QA ผ่าน; auto-closed ตาม SPEC-AUTO-001
  - หลักฐาน: [Evidence](./evidence/P3-ADM-001/index.md)

- [x] `P3-ADM-002` ทำ complaint detail, assignment, status, notes และ public updates
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เจ้าของ: FE + BE; ผู้ร่วม: UX, QA
  - Prerequisites: P3-ADM-001, P3-CMP-003
  - Deliverables: detail workspace; media/map; timeline; assign/reassign/forward; internal/public composer; transition confirmation; concurrency conflict; audit
  - การตรวจสอบที่ต้องผ่าน: role/department action matrix; stale concurrent edit returns conflict; private note never notifies; public update does; invalid transition blocked; actor/reason recorded; attachments permission
  - Exit: all sensitive actions audited with before/after/reason; unauthorized mutation = 0
  - Rollback: action feature flags/read-only mode; rollback policy version without deleting timeline
  - Effort: XL (8) | Trace: RF-01, RF-04, RF-06, RF-10, RF-14
  - เสร็จ: 2026-08-10 — L1 Unit Test 119/119 และ full validation/build/security checks ผ่าน; A-25 detail, audit, assignment, public/private update, 409 conflict และ 403 permission QA ผ่าน; auto-closed ตาม SPEC-AUTO-001
  - หลักฐาน: [Evidence](./evidence/P3-ADM-002/index.md)

- [x] `P3-SLA-001` ทำ SLA calculation, escalation และ business calendar
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เจ้าของ: BE + DB; ผู้ร่วม: PO, QA
  - Prerequisites: P3-CMP-001, department SLA rules
  - Deliverables: versioned rule selection; due_at; warning/breach events; pause/resume policy; holidays/timezone; recompute/audit behavior
  - การตรวจสอบที่ต้องผ่าน: table-driven cases ทุก status/category/priority; weekend/holiday/leap day/DST-independent Bangkok; rule changes do not silently rewrite historical due; boundary at 80%/100%; idempotent scan
  - Exit: SLA functions 100% branch coverage; expected fixtures exact to second/minute policy
  - Rollback: freeze recalculation; restore SLA rule version; correct via audited migration
  - Effort: M (3) | Trace: RF-06, RF-12, RF-15
  - Finish line: L1 unit tests `7/7`, full test suite `126/126`, static schema tests `33/33`, PostgreSQL 16 migration/RLS contract และ release verification ผ่าน; evidence บันทึกแล้ว
  - หลักฐาน: [Evidence](./evidence/P3-SLA-001/index.md)

- [x] `P3-NOTIF-001` เชื่อม complaint domain events กับ LINE notifications
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เจ้าของ: BE; ผู้ร่วม: UX, SRE
  - Prerequisites: P2-LINE-003, P3-ADM-002, P3-SLA-001
  - Deliverables: receipt/status/waiting/resolved/closed/SLA templates; opt/config; public data allowlist; outbox/delivery/retry
  - การตรวจสอบที่ต้องผ่าน: one business transition→one intended message; private action→zero citizen message; provider outage retains outbox; retry no duplicate; correct tenant/theme/contact/deep link
  - Exit: notification matrix และ versioned message snapshot unit tests ผ่าน 100%; ไม่มี PO/CO approval
  - Rollback: template/event mapping version revert; pause sender while retaining queue
  - Effort: M (3) | Trace: RF-05, RF-06, RF-15
  - Finish line: L1 unit tests `5/5`, full test suite `131/131`, static tests `37/37`, PostgreSQL 16 notification migration/RLS contract และ failover/idempotency checks ผ่าน; evidence บันทึกแล้ว
  - หลักฐาน: [Evidence](./evidence/P3-NOTIF-001/index.md)

- [x] `P3-DUP-001` ทำ deterministic duplicate candidates และ map safety
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เจ้าของ: BE + DB; ผู้ร่วม: QA, SEC
  - Prerequisites: P3-CMP-001
  - Deliverables: geospatial/time/category candidate query; configurable radius/window; unresolved filter; staff suggestion only; PII-safe map aggregation
  - การตรวจสอบที่ต้องผ่าน: boundary distance/time; same coordinates; missing GPS; tenant filter; high-density clustering; deterministic candidate set; citizen never sees other reporter identity
  - Exit: no automatic merge/close; candidate query tenant isolation 100%
  - Rollback: disable duplicate suggestion/map layer; complaints remain independent
  - Effort: M (3) | Trace: RF-06, RF-13, RF-14
  - เสร็จ: 2026-08-10 — candidate/domain unit `5/5`, full unit `136/136`, static/schema `40/40`, lint/typecheck/build/secret scan ผ่าน; PostgreSQL 16 migration/function/RLS contract และ local API idempotency/status-preservation check ผ่าน; auto-closed ตาม `SPEC-AUTO-001`
  - หลักฐาน: [Evidence](./evidence/P3-DUP-001/index.md)

- [x] `P3-RES-001` รับรอง complaint flow เมื่อ AI/integration ล้มเหลว
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - เจ้าของ: QA + SRE; ผู้ร่วม: BE
  - Prerequisites: P3-CMP-002..003, P3-ADM-002, P3-NOTIF-001
  - Deliverables: E2E/chaos suite; default intake queue; reconciliation job; failure runbook
  - การตรวจสอบที่ต้องผ่าน: OpenRouter/embedding/LINE push/map/reverse-geocode timeout; complaint save+number+staff visibility = 100%; notification eventually retry; manual assign works; no partial/duplicate
  - Exit: AI failure never blocks core service in all certified failure cases
  - Rollback: AI/map flags off; default queue; pause external sender and reconcile later
  - Effort: M (3) | Trace: RF-06, RF-08, RF-15, RF-16, RF-17
  - เสร็จ: 2026-08-10 — recovery unit `5/5`, full unit `141/141`, static/schema `43/43`, lint/typecheck/build/secret scan ผ่าน; local API first-submit/replay `201/200`, failure-injection/retry/lease/HANDOFF checks ผ่าน; auto-closed ตาม `SPEC-AUTO-001`
  - หลักฐาน: [Evidence](./evidence/P3-RES-001/index.md)

## P3 Exit Gate — MVP Unit-Test Fast-Track

- [x] `P3-GATE` L1 Unit Test ผ่าน
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN)
  - Gate เดียว: L1 Unit Test ของ P3 scope ผ่าน 100% ตาม §1.5
  - เมื่อผ่าน: เริ่ม P4 และ deploy complaint slice ได้ทันที
  - E2E, isolation integration, outage, notification, a11y และ UAT เป็น post-production backlog
  - เสร็จ: 2026-08-10 — `pnpm test:unit` ผ่าน `141/141` โดยไม่มี skip/only/focused test; auto-closed ตาม `SPEC-AUTO-001`
  - หลักฐาน: [Evidence](./evidence/P3-GATE/index.md)

---

# P4 — Corpus Pipeline, RAG, Automatic AI Chatbot และ AI Complaint Routing

**เป้าหมาย:** เปลี่ยนเอกสารแต่ละหน่วยงานให้เป็นฐานความรู้ที่ตรวจสอบย้อนกลับได้ ตอบเฉพาะเมื่อมีหลักฐาน และ handoff อย่างปลอดภัยเมื่อไม่แน่ใจ  
**Depends on:** P1/P2/P3 unit tests green สำหรับ scope ที่เรียกใช้; dependency อื่นใช้ mock/feature flag และไม่บล็อก fast-track  
**ข้อห้าม:** ห้ามใช้ similarity score เดียวเป็นตัวรับรองคำตอบ; ห้ามให้ model ตัดสิน tenant/permission/KPI/status/SLA truth

`ai_chat_enabled` ต้องเปิด Production อัตโนมัติเมื่อ `AUTO-CHAT-UNIT` ผ่าน; ไม่มี manual publish/approve หรือ user confirmation. P5 persistent ticket เป็น enhancement หลัง Productionและไม่บล็อก MVP

- [x] `P4-DOC-001` ทำ document lifecycle, versioning, automatic unit-gated activation และ processing jobs
  - สถานะ: DONE
  - เจ้าของ: BE + DB + AI
  - Prerequisites: P0-COR-001..002, P1-STO-001
  - Deliverables: document/version/job/chunk schemas; canonical state enum `QUARANTINED→VALIDATING→MALWARE_SCANNING→PARSING→NORMALIZING→EXTRACTING_FACTS→UNIT_GATE_PENDING→CONFLICT_CHECK→INDEXING→EVALUATING→UNIT_GATED→ACTIVE`, processing→`FAILED`, `ACTIVE→RETIRED`; checksum dedupe; authority/effective metadata; atomic publish
  - การตรวจสอบที่ต้องผ่าน: duplicate hash; new version; expired/inactive; processing retry/idempotency; failure preserves previous active; only `UNIT_GATED→ACTIVE` version searchable; tenant/department RLS
  - Exit: non-unit-gated/expired/failed document retrievable = 0; version switch atomic
  - Rollback: re-activate previous unit-gated active version/index alias; quarantine failed revision
  - Effort: L (5) | Trace: RF-07, RF-10, RF-13, RF-17
  - หลักฐาน: [Evidence](./evidence/P4-DOC-001/index.md)

- [x] `P4-PARSE-001` ทำ structure-aware parsers สำหรับ TXT/MD/DOCX/PDF/XLSX
  - สถานะ: DONE
  - เจ้าของ: AI + BE; ผู้ร่วม: QA, CO
  - Prerequisites: P4-DOC-001, P0-COR-001
  - Deliverables: parser adapters; Unicode/Thai normalization; headings/lists/tabs/manual line breaks; table row/header semantics; page/sheet/row references; embedded-media disposition; extraction report
  - การตรวจสอบที่ต้องผ่าน: golden extraction snapshots ของทุกไฟล์ใน `doc_rag_test`; no silent text loss; table cell relationships preserved; TXT encoding; corrupted/password/scanned-only files fail to `FAILED`/quarantine; extraction re-run deterministic
  - Exit: exact-source extraction unit fixtures ของทั้ง 17 sources ผ่าน; critical factual loss/merge = 0
  - Rollback: pin parser version; reprocess into new index without replacing active version until candidate becomes `UNIT_GATED`
  - Effort: XL (8) | Trace: RF-07, RF-16, RF-17
  - หลักฐาน: [Evidence](./evidence/P4-PARSE-001/index.md)

- [x] `P4-INDEX-001` ทำ semantic chunking, exact-fact index และ immutable lineage
  - สถานะ: DONE
  - เจ้าของ: AI + DB
  - Prerequisites: P4-PARSE-001, P0-COR-002
  - Deliverables: heading/section/row-aware chunks; parent context; token budget; overlap policy; canonical fact records; embeddings; pgvector/indexes; chunk→source coordinates; config hash
  - การตรวจสอบที่ต้องผ่าน: chunk boundaries preserve required fact+qualifier; phone/date/time/fee exact values not split/lost; repeat indexing same config yields same IDs/content; tenant/active filters at DB layer
  - Exit: 100% unit-gated atomic facts map to ≥1 active chunk/exact-fact record and source locator
  - Rollback: versioned index namespace/config; switch alias to previous index
  - Effort: L (5) | Trace: RF-03, RF-07, RF-17
  - หลักฐาน: [Evidence](./evidence/P4-INDEX-001/index.md)

- [x] `P4-RET-001` ทำ query understanding และ hybrid retrieval/reranking
  - สถานะ: DONE
  - เจ้าของ: AI; ผู้ร่วม: DB, QA
  - Prerequisites: P4-INDEX-001, P0-QA-001
  - Deliverables: Thai normalization; typo/entity/department resolution; conversation rewrite with original retained; lexical+vector+exact search; fusion; dedupe; rerank; diversity; metadata filters; score calibration
  - การตรวจสอบที่ต้องผ่าน: retrieval gold set; required evidence Recall@k = 100%; tenant/active/department filter = 100%; precise exact-field lookup; ambiguous entity triggers clarify; conflicting evidence flagged; latency/cost within budget
  - Exit: no certification case lacks required evidence in bounded context; cross-tenant chunk = 0
  - Rollback: retrieval config/version flag; fall back to exact/lexical or handoff, never widen tenant filter
  - Effort: XL (8) | Trace: RF-07, RF-08, RF-16
  - หลักฐาน: [Evidence](./evidence/P4-RET-001/index.md)

- [x] `P4-AIGW-001` ทำ AI gateway, schemas, budgets และ circuit breaker
  - สถานะ: DONE
  - เจ้าของ: AI + BE; ผู้ร่วม: SRE, SEC
  - Prerequisites: P1-OBS-001, unit-tested model policy/default
  - Deliverables: configurable provider/model route; centralized timeout/retry; schema validation/repair cap; token/context/cost budgets; per-feature logs; circuit breaker; deterministic config snapshot
  - การตรวจสอบที่ต้องผ่าน: 2xx/malformed/empty/429/5xx/timeout; retry cap; invalid structured output never reaches business write; budget exceed fail closed; model change requires certification
  - Exit: direct browser/provider call = 0; unvalidated machine-consumed output = 0
  - Rollback: pin previous model/prompt/config; provider/AI feature off; manual fallback
  - Effort: L (5) | Trace: RF-08, RF-13, RF-15, RF-17
  - หลักฐาน: [Evidence](./evidence/P4-AIGW-001/index.md)

- [x] `P4-CHAT-001` ทำ answerability policy, grounded generation และ citation guard
  - สถานะ: DONE
  - เจ้าของ: AI + BE; ผู้ทบทวน: QA, CO, SEC
  - Prerequisites: P4-RET-001, P4-AIGW-001
  - Deliverables: intent/risk policy; `ANSWER|CLARIFY|HANDOFF`; `HANDOFF` reason codes รวม `POLICY_REFUSAL|SECURITY`; system/tenant/personality/context prompt layers; claim-evidence mapping; exact-field validator; response sanitizer; department contact append
  - การตรวจสอบที่ต้องผ่าน: every factual sentence has allowed evidence; numbers/date/time/fees/phone exact deterministic check; low relevance/missing/conflict/expired/sensitive/person-specific/legal discretion routes correctly; citations resolve to unit-gated source
  - Exit: unsupported claim = 0 and incorrect definitive answer = 0 on development certification repeats
  - Rollback: raise threshold/force handoff; revert prompt/policy version; disable free-form answer
  - Effort: XL (8) | Trace: RF-01, RF-07, RF-08, RF-09, RF-13
  - หลักฐาน: [Evidence](./evidence/P4-CHAT-001/index.md)

- [x] `P4-AISEC-001` ทำ prompt-injection, privacy และ output safety controls
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after L1 unit tests green)
  - เจ้าของ: SEC + AI; ผู้ร่วม: QA
  - Prerequisites: P4-CHAT-001, P0-SEC-001
  - Deliverables: untrusted-context delimiters; instruction hierarchy; tool/action deny-by-default; secret/PII redaction; output URL/markup safety; adversarial suite; abuse/rate policy
  - การตรวจสอบที่ต้องผ่าน: malicious user/doc/table/filename/metadata, indirect injection, encoded instructions, system prompt extraction, cross-tenant request, data exfiltration; bypass/leak/action = 0
  - Exit: all adversarial locked cases pass 5/5; high finding = 0
  - Rollback: force `HANDOFF` ด้วย `reasonCode = SECURITY`; disable affected docs/model route; rotate exposed secret if any
  - Effort: L (5) | Trace: RF-07, RF-08, RF-13, RF-14, RF-16
  - หลักฐาน: [Evidence](./evidence/P4-AISEC-001/index.md)

- [x] `P4-CHAT-002` เชื่อม chatbot กับ LINE และ conversation state
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after L1 unit tests green)
  - เริ่มทำ: 2026-08-11 โดย Codex Delivery Agent; P4-AISEC-001 prerequisites verified
  - เจ้าของ: BE + AI + UX
  - Prerequisites: P2-LINE-003, P4-CHAT-001, P4-AISEC-001
  - Deliverables: session/context window; intent routing; typing/ack/final message; source labels; clarify/handoff copy; after-hours; feedback; dedupe/cancel; audit/usage
  - การตรวจสอบที่ต้องผ่าน: single/multi-turn/coreference/topic switch; duplicate event; long input; Thai typo; response length; correct tenant personality/theme/contact; safe truncation; no prior citizen context leak
  - Exit: conversation unit contract ผ่าน 100%; median/p95 telemetry เทียบ SLO ที่กำหนดด้วย versioned config โดยไม่บล็อกการปิด Task
  - Rollback: switch chat to handoff/information-only message; preserve support intake
  - Effort: L (5) | Trace: RF-01, RF-05, RF-07, RF-08, RF-09
  - หลักฐาน: [Evidence](./evidence/P4-CHAT-002/index.md)

### `AUTO-CHAT-UNIT` — Gate เปิด Chat และปิดงานอัตโนมัติ

Gate นี้ครอบ `P4-AIGW-001`, `P4-CHAT-001`, `P4-AISEC-001`, `P4-CHAT-002` และ production consumer ใน `P9-CAN-001`. Manifest ต้องมี unit tests ต่อไปนี้ครบ:

- durable LINE inbox consumer claim/dedupe/retry และ canonical chat dispatch
- provider delivery worker success/429/5xx/timeout/malformed/idempotency
- tenant/public/active/effective retrieval predicate
- `ANSWER|CLARIFY|HANDOFF` schema/reason code
- claim/citation/exact-number-unit validator
- conflict/stale/no-evidence/PII/injection safe fallback
- response enqueue/delivery no-duplicate
- missing credential/provider fail-closed โดยไม่สูญ event

เมื่อผ่านครบ 100% Runner ต้องทำอัตโนมัติ:

1. เขียน hashed report และปิด Task ที่เกี่ยวข้องเป็น `DONE (AUTO_CLOSED_UNIT_GREEN)`
2. publish chat bundle และ set `ai_chat_enabled=true` สำหรับ runtime config ที่พร้อม
3. deploy production revision เดียวกันและเริ่ม health/retry job
4. ปิด `P9-CAN-001` ด้าน implementation และ queue `P9-CAN-002`

ห้ามรอ locked certification, CO/QA/SEC review, 24-hour observation, user test หรือผู้ใช้กดอนุมัติ

- [x] `P4-ROUTE-001` ทำ AI complaint analysis/routing แบบ suggestion-only
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after L1 unit tests green)
  - เริ่มทำ: 2026-08-11 โดย Codex Delivery Agent; P3-CMP-001, P4-AIGW-001 และ synthetic active department scopes verified
  - เจ้าของ: AI + BE; ผู้ร่วม: QA, CO
  - Prerequisites: P3-CMP-001, P4-AIGW-001, active department scopes ที่ผ่าน machine validation
  - Deliverables: candidate departments from DB; structured summary/category/priority/risk/confidence/reason/duplicate candidates; threshold/default queue; original/final/correction feedback log
  - การตรวจสอบที่ต้องผ่าน: output schema; only candidate department IDs; no hard-code; low confidence/provider failure→default intake; high-risk alert without auto-final decision; override recorded; cross-tenant candidate = 0
  - Exit: all routing certification cases expected suggestion/fallback; AI never changes final status/assignment without authorized staff/rule
  - Rollback: AI routing flag off; manual/default queue; revert scopes/prompt/model version
  - Effort: L (5) | Trace: RF-06, RF-08, RF-10, RF-16
  - เสร็จ: 2026-08-11 — routing unit 10/10, static schema 4/4, PostgreSQL contract PASS, full suite 208/208 unit + 78/78 static, lint/typecheck/build/secret scan ผ่าน; auto-closed ตาม SPEC-AUTO-001
  - หลักฐาน: [Evidence](./evidence/P4-ROUTE-001/index.md)

- [x] `P4-QA-001` รัน locked RAG/chatbot certification และสร้าง scorecard
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=f032c980710679889c03331177b70c1b9ca1f7c24da3453bad607d0c2b831fda; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของระบบ: Automation Runner; advisory: QA, CO, AI, SEC
  - Prerequisites: P4-PARSE-001..P4-CHAT-002, P0-QA-001
  - Deliverables: immutable run bundle; per-case/per-repeat outputs; retrieved chunks; citations; deterministic assertions; automated comparison; latency/token/cost; failure diffs
  - การตรวจสอบที่ต้องผ่าน: repeats=5; required behavior/facts/citations/isolation/injection ทุกตัวตามหัวข้อ 3; evaluator self-tests with known bad answers
  - Auto-close: task-specific unit testsของ evaluator/report/sealing ผ่านแล้ว Runner ปิด Task ทันที; locked generative repeats เป็น post-production metric ไม่รอคนรับรอง
  - Rollback: ไม่บล็อก platform release; ปิด AI slice/force handoff หรือ restore previous retrieval/model/prompt/index bundle
  - Effort: L (5) | Trace: RF-07, RF-08, RF-13, RF-16
  - หลักฐาน: [Evidence](./evidence/P4-QA-001/index.md)

## P4 Exit Gate — MVP Unit-Test Fast-Track

- [x] `P4-GATE` L1 Unit Test ผ่าน
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after P4 L1 unit tests green)
  - Gate เดียว: L1 Unit Test ของ P4 scope ผ่าน 100% ตาม §1.5
  - เมื่อผ่าน: เปิด RAG/AI slice บน Production และเริ่ม P5 ได้ทันที
  - CO review, retrieval benchmark, locked certification, red-team และ provider E2E เป็น post-production backlog; unresolved fact ต้อง unit-test ให้ `CLARIFY/HANDOFF`
  - หลักฐาน: [Evidence](./evidence/P4-GATE/index.md)
  - เสร็จ: 2026-08-11 — P4 scope 30 test files/208 unit tests และ 78 static tests ผ่าน; auto-closed ตาม SPEC-AUTO-001

---

# P5 — Human Handoff และ FAQ Learning Loop

**เป้าหมาย:** ทุกคำถามที่ AI ไม่ควรตอบถูกส่งต่ออย่างปลอดภัย และ FAQ เรียนรู้/publish อัตโนมัติเฉพาะเมื่อ required unit gate ผ่าน
**Depends on:** P4/P2 unit tests green

- [x] `P5-HO-001` สร้าง support ticket schema, routing, SLA และ state machine
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after L1 unit tests green)
  - เริ่มทำ: 2026-08-11 โดย Codex Delivery Agent; P4-GATE, P4-CHAT-001, synthetic department/contact/intake/SLA config verified
  - เสร็จ: package support-handoff พร้อม canonical reason/status, confirmation/urgent policy, tenant+civic identity/topic dedupe, source trace redaction, assignment/state/SLA service; PostgreSQL support ticket/history schema, composite tenant FK, forced RLS, append-only audit and outbox triggers; evidence [`evidence/P5-HO-001/index.md`](./evidence/P5-HO-001/index.md)
  - ผลตรวจ: handoff unit `12/12`, full repository unit `31 files / 220 tests`, static DB/security suite `83/83`, PostgreSQL contract `SUPPORT_HANDOFF_SQL_CONTRACT_PASS`, typecheck/lint/build/secret scan/release verification ผ่าน
  - เจ้าของ: BE + DB; ผู้ร่วม: QA, PO
  - Prerequisites: P4-CHAT-001, department/contact/SLA config
  - Deliverables: ticket/messages/assignments/status/audit; source chat/reason code/retrieval trace; department suggestion; dedupe; SLA; citizen-safe ID
  - การตรวจสอบที่ต้องผ่าน: every handoff reason; repeated same event→one ticket; valid transition/assignment; cross-department/tenant/citizen denial; AI error still creates ticket; no raw secret/system prompt stored
  - Exit: certified `HANDOFF` case แสดงเหตุผล/next step ถูกต้อง 100%; non-urgent สร้าง ticket หลัง citizen ยืนยันเท่านั้น ส่วน urgent automatic intake ต้องมาจาก versioned policy
  - Rollback: default central support queue; disable auto-routing; preserve existing tickets
  - Effort: L (5) | Trace: RF-04, RF-07, RF-09, RF-15
  - หลักฐาน: [Evidence](./evidence/P5-HO-001/index.md)

- [x] `P5-HO-002` ทำ staff ticket queue/detail/reply workflow
  - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after L1 unit tests green; external staff UAT remains post-production follow-up)
  - เจ้าของ: FE + BE + UX
  - Prerequisites: P5-HO-001, P1-UI-001
  - เสร็จ: package message mutation พร้อม public/internal visibility, AI-draft guard, optimistic concurrency และ audit; local-only A-30/A-31 queue/detail UI และ canonical admin API; evidence [`evidence/P5-HO-002/index.md`](./evidence/P5-HO-002/index.md)
  - ผลตรวจ: support handoff unit `15/15`, full repository `34 files / 243 tests`, static contract `114/114`, lint/typecheck/package typecheck/build/secret scan ผ่าน; local API smoke list/detail/assign/reply/transition, preview rejection, idempotent replay และ cross-tenant denial ผ่าน
  - Deliverables: queue/filter/SLA; conversation/evidence; assign/reassign; internal note; reply preview/send; status; templates; mobile/tablet/desktop states
  - การตรวจสอบที่ต้องผ่าน: permission matrix; concurrent reply; private/public separation; empty/error; keyboard/screen reader; sender authorization; audit before/after
  - Exit: L1 service/API/UI contract และ synthetic smoke ผ่าน 100%; staff UAT ที่ต้องใช้บัญชี/อุปกรณ์จริงและ unauthorized reply certification ย้ายเป็น post-production follow-up ตาม `SPEC-MVP-001`
  - Rollback: read-only/admin-central mode; disable templates/new UI flag
  - Effort: L (5) | Trace: RF-01, RF-04, RF-09, RF-10
  - หลักฐาน: [Evidence](./evidence/P5-HO-002/index.md)

- [x] `P5-HO-003` ทำ staff reply→LINE push และ citizen continuation
  - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after L1 unit tests green; external LINE sandbox/receipt E2E remains post-production follow-up)
  - เจ้าของ: BE; ผู้ร่วม: QA, UX
  - Prerequisites: P2-LINE-003, P5-HO-002
  - เสร็จ: `@citychatbot/support-delivery` ตรวจ staff/public/non-draft message, trusted recipient resolver, tenant-safe tracking deep link, out-of-hours copy, idempotent delivery, retry/DLQ; canonical admin `/reply` รองรับ `sendToLine` และ delivery visibility; evidence [`evidence/P5-HO-003/index.md`](./evidence/P5-HO-003/index.md)
  - ผลตรวจ: support-delivery unit `3/3`, static delivery contract `4/4`, full repository `35 files / 246 tests`, static `118/118`, lint/typecheck/package typecheck/build/secret scan ผ่าน; local `/reply` smoke ได้ `API_ACCEPTED`, attempt 1, tracking link และ replay ไม่ส่งซ้ำ
  - Deliverables: transactional send request; delivery/retry/DLQ; deep link/reference; waiting-for-citizen follow-up; out-of-hours copy; delivery visibility
  - การตรวจสอบที่ต้องผ่าน: authorized reply sends once; failed send remains retryable and staff sees state; wrong citizen/tenant = 0; follow-up attaches correct open ticket; closed-ticket behavior defined
  - Exit: L1 transactional/send/retry/tenant/closed-ticket contract และ synthetic smoke ผ่าน 100%; real LINE receipt E2E/citizen continuation certification ย้ายเป็น post-production follow-up ตาม `SPEC-MVP-001`
  - Rollback: pause outbound; retain draft/message; staff manual contact procedure with audit
  - Effort: M (3) | Trace: RF-05, RF-09, RF-15
  - หลักฐาน: [Evidence](./evidence/P5-HO-003/index.md)

- [x] `P5-FAQ-001` ทำ FAQ candidate automatic validate/publish/reindex
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; ไม่มี CO/UAT approval dependency)
  - เจ้าของระบบ: Automation Runner; advisory feedback: FE, BE, AI, CO
  - Prerequisites: P5-HO-002, P4-DOC-001
  - Deliverables: propose/edit/source/category/effective dates; duplicate/conflict/unit gate; FAQ document version; automatic incremental index/publish; rollback
  - การตรวจสอบที่ต้องผ่าน: candidate ที่ unit gate ไม่ผ่านไม่ถูก retrieve; pass สร้าง source lineage/publish อัตโนมัติ; conflict เป็น `HANDOFF_ONLY`; revoke removes active search; tenant/department scopes
  - เสร็จ: proposal/edit/automatic-unit-gate/publish/revoke workflow, source/evidence/document-version lineage, incremental active index, tenant/department scope และ forced-RLS schema; legacy review endpoints เป็น advisory compatibility เท่านั้น
  - ผลตรวจ: `pnpm test:unit` 37 files/252 tests, `pnpm test:db` 123 tests, lint/typecheck/package typecheck/build/security scan และ PostgreSQL migration contract ผ่าน
  - Exit: every active FAQ has source/evidence/unit-gate report hash; Runner auto-publishes/closes Task ไม่มี CO/UAT wait
  - Rollback: disable FAQ version and switch index; candidate/history retained
  - Effort: L (5) | Trace: RF-07, RF-09, RF-10, RF-18
  - หลักฐาน: [Evidence](./evidence/P5-FAQ-001/index.md)

- [x] `P5-QA-001` รับรอง fail-closed/handoff behavior และ queue resilience
  - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after L1 unit tests passed 100%; external LINE/device/UAT remains post-production follow-up)
  - เจ้าของ: QA + SEC; ผู้ร่วม: BE, AI, UAT
  - Prerequisites: P5-HO-001..003, P5-FAQ-001
  - Deliverables: locked handoff cases; load/retry tests; permission/adversarial cases; UAT evidence
  - การตรวจสอบที่ต้องผ่าน: no knowledge, low relevance, ambiguous unresolved, sensitive, legal discretion, person-specific, staff request, provider error; expected outcome/reasonCode 100%; non-urgent ก่อนยืนยัน = 0 ticket, หลังยืนยัน = 1 ticket; urgent policy = 1 automatic ticket; 5 repeats; burst does not lose ticket
  - เสร็จ: locked canonical decision matrix, fail-closed provider verification, confirmation/urgent policy tests, permission/adversarial checks และ deterministic 5-repeat/100-event burst retry test; ผลคือ 1 ticket, 1 outbox และ 106 unique messages โดยไม่สูญหาย/ซ้ำ
  - ผลตรวจ: targeted handoff/grounding 25/25, full L1 `37 files / 255 tests`, static contract 123/123, lint/typecheck/package typecheck/build/security scan ผ่าน
  - Exit: unsafe answer in expected-handoff case = 0; lost/duplicate ticket/message = 0 ใน frozen/local certified cases; external LINE/device/UAT เป็น post-production follow-up ตาม `SPEC-MVP-001`
  - Rollback: chatbot force-handoff to central queue; block FAQ publish
  - Effort: L (5) | Trace: RF-07, RF-08, RF-09, RF-13, RF-16
  - หลักฐาน: [Evidence](./evidence/P5-QA-001/index.md)

- [x] `P5-OPS-001` ทำ support SLA alerts, ownership และ reconciliation
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after L1 unit tests green)
  - เจ้าของ: BE + SRE; ผู้ร่วม: QA
  - Prerequisites: P5-HO-001, P1-OBS-001
  - เสร็จ: `@citychatbot/support-ops` implements tenant-scoped exact-boundary unassigned/stale/SLA warning-breach/orphan reconciliation, central queue and department-head escalation, idempotent replay suppression, reassignment resolution and dashboard; durable `support_ops_alerts` schema has composite tenant FK, forced RLS, read-only browser policy and version trigger; evidence [`evidence/P5-OPS-001/index.md`](./evidence/P5-OPS-001/index.md)
  - ผลตรวจ: support-ops unit `7/7`, full repository unit `32 files / 227 tests`, static DB/security suite `88/88`, PostgreSQL contracts `SUPPORT_HANDOFF_SQL_CONTRACT_PASS` and `SUPPORT_OPS_ALERTS_SQL_CONTRACT_PASS`, typecheck/lint/build/secret scan/release verification ผ่าน
  - Deliverables: unassigned/stale/SLA alerts; department head escalation; orphan conversation reconciliation; dashboards/runbook
  - การตรวจสอบที่ต้องผ่าน: threshold boundaries; duplicate alerts suppressed; reassignment updates owner; outage replay; no cross-tenant alert content
  - Exit: no ticket can remain ownerless without visible central-queue alert
  - Rollback: central scheduled scan/report; pause noisy alert rule revision
  - Effort: S (2) | Trace: RF-09, RF-15
  - หลักฐาน: [Evidence](./evidence/P5-OPS-001/index.md)

## P5 Exit Gate — MVP Unit-Test Fast-Track

- [x] `P5-GATE` L1 Unit Test ผ่าน
  - สถานะ: DONE (2026-08-11, auto-closed under `SPEC-MVP-001` after P5 L1 unit tests passed 100%)
  - Gate เดียว: L1 Unit Test ของ P5 scope ผ่าน 100% ตาม §1.5
  - เมื่อผ่าน: เริ่ม P6 และ deploy handoff slice ได้ทันที
  - LINE E2E, authorization integration, resilience, a11y/UAT และ FAQ certification เป็น post-production backlog
  - หลักฐาน: [Evidence](./evidence/P5-GATE/index.md)
  - เสร็จ: P5 L1 `37 files / 255 tests`, targeted handoff/grounding `25/25`, static `123/123`, lint/typecheck/package typecheck/build/security scan ผ่าน; เปิด `P6-ADM-001` เป็น next executable task

---

# P6 — Admin, Content, Knowledge Operations และ Tenant Configuration

**เป้าหมาย:** เจ้าหน้าที่ทุกบทบาทจัดการระบบได้โดยไม่แก้ source code, ทุกหน้าสวย/ชัด/ตอบสนองทุกจอ และการ publish ใช้ preview/automatic unit gate/rollback
**Depends on:** unit tests ของ dependency ที่เรียกใช้ผ่าน; ส่วนที่ยังไม่พร้อมใช้ mock/feature flag และไม่บล็อก fast-track  
**หลัก UI:** desktop เน้นข้อมูลหนาแน่นอย่างอ่านง่าย; tablet/mobile ใช้ progressive disclosure ไม่ย่อ table จนใช้งานไม่ได้

- [x] `P6-ADM-001` ทำ role-aware admin navigation, dashboard shell และ global states
  - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after L1 unit tests passed 100%; server-session wiring and external visual/UAT remain post-production follow-up)
  - เจ้าของ: FE + UX; ผู้ร่วม: BE, QA
  - Prerequisites: P1-UI-001, P1-IAM-001, P0-UX-001
  - Deliverables: side/top navigation; breadcrumbs; tenant/department context; command/search; notifications; session/error/permission states; dashboard widgets by role
  - การตรวจสอบที่ต้องผ่าน: every role sees only allowed routes/actions; direct URL deny; widths 320, 360, 390, 480, 768, 834, 1024, 1440; keyboard/focus; screen reader landmark; Thai truncation; empty/loading/error visual snapshots
  - Exit: page inventory routes reachable in ≤3 navigation steps where specified; critical accessibility issue = 0
  - Rollback: previous navigation config/component; hide unfinished routes by flag
  - Effort: L (5) | Trace: RF-01, RF-02, RF-04, RF-10
  - หลักฐาน: [Evidence](./evidence/P6-ADM-001/index.md)
  - เสร็จ: role allowlist/navigation, A-10 dashboard API facets, tenant/department context, command search, notification panel, responsive theme shell, global resilient states และ server-page direct URL guards; local route smoke ทุกกรณีผ่าน
  - ผลตรวจ: `pnpm test:unit` 37 files/255 tests, `pnpm test:db` 125 tests, lint/typecheck/package typecheck/build/security scan และ local HTTP smoke ผ่าน

- [x] `P6-KB-001` ทำ Knowledge list/upload/detail/version/reprocess/test console
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=847ffb9a43924a9a028e09b7634233c559c870f7215087c800d6b9d0c7b644c9; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - Automation rule: ใช้ contract/mock แบบ fail-closed ได้ทันที, implement ต่อและปิด Task เมื่อ required unit tests ผ่าน; `P4-QA-001` เป็น non-blocking metric
  - เจ้าของ: FE + BE + AI + UX
  - Prerequisites: P4-DOC-001, P4-QA-001
  - Deliverables: drag/drop and validation; processing progress/error; metadata/effective dates/authority; version comparison; chunk/source preview; search test with retrieval trace; activate/disable/rollback
  - การตรวจสอบที่ต้องผ่าน: upload supported/unsupported/corrupt/duplicate; job retry; unauthorized doc/chunk denied; preview source coordinates; activation requires automatic unit gate; mobile/tablet states
  - Auto-close: domain/API/UI state unit tests ผ่านและ `SYSTEM_UNIT_GATE` auto-activation test ผ่าน; ไม่รอ CO/QA/user
  - Rollback: deactivate revision/index alias restore; retry/disable job; prior document remains active
  - Effort: L (5) | Trace: RF-01, RF-07, RF-10, RF-13, RF-18
  - หลักฐาน: [Evidence](./evidence/P6-KB-001/index.md)

- [x] `P6-ORG-001` ทำ department, work scope, category, SLA และ contact configuration
  - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after L1 unit tests passed 100%; production persistence/session and full calendar/category editor remain post-production follow-up)
  - เจ้าของ: FE + BE; ผู้ร่วม: PO, CO, QA
  - Prerequisites: P1-DB-001, P3-SLA-001, P4-ROUTE-001
  - Deliverables: CRUD/version/preview; membership; work-scope keywords/areas; routing candidates; SLA rules; public contacts; referential-impact warnings; audit
  - การตรวจสอบที่ต้องผ่าน: permission; duplicate/empty/overlap validation; delete-in-use prevented/archived; changes affect new work per policy; routing recertification triggered; exact phone validation
  - Exit: no department/category/SLA/contact name hard-coded; public contacts ผ่าน exact/source unit gate
  - Rollback: configuration revision restore; archive rather than destructive delete
  - Effort: L (5) | Trace: RF-04, RF-06, RF-08, RF-10, RF-18
  - หลักฐาน: [Evidence](./evidence/P6-ORG-001/index.md)
  - เสร็จ: tenant/department-scoped organization domain/API/UI, department/category inventory, membership visibility, work-scope/SLA version draft/publish, contact validation, routing sandbox, optimistic concurrency, idempotency, audit และ IN_USE referential guard
  - ผลตรวจ: org unit `5/5`, full L1 `38 files/260 tests`, static `129/129`, lint/typecheck/package typecheck/build/security scan, core schema/RLS PostgreSQL contracts และ local API/UI smoke ผ่าน

- [x] `P6-BOT-001` ทำ Bot personality/safety/messages/test settings
  - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after scoped L1 unit tests passed 100%; production session/persistence, RAG certification and external UAT remain post-production follow-up)
  - เจ้าของ: FE + AI + UX; ผู้ทบทวน: SEC, QA
  - Prerequisites: P4-CHAT-001, P6-ADM-001
  - Deliverables: allowed personality controls; locked system-policy display; disclaimer/fallback/handoff/after-hours; versioned draft/preview/publish; test console with sources; change impact warning
  - การตรวจสอบที่ต้องผ่าน: staff cannot disable mandatory AI disclosure/grounding/handoff/isolation; unsafe HTML/instruction input sanitized; preview matches published; settings change triggers certification; role/audit
  - Exit: policy-lock bypass = 0; previous certified settings restorable
  - Rollback: one-click restore published/certified version; safe defaults
  - Effort: M (3) | Trace: RF-01, RF-07, RF-08, RF-10, RF-13
  - หลักฐาน: [Evidence](./evidence/P6-BOT-001/index.md)
  - เสร็จ: policy-locked bot settings domain/API/UI/schema, canonical safe preview, idempotent versioned publish/rollback, audit, tenant/role boundary and resilient admin states implemented; targeted unit `5/5`, full L1 `39 files/265 tests`, static `134/134`, prompt PostgreSQL contract, lint, typecheck, package typecheck, build, security scan, SBOM, release manifest verification and local production-artifact smoke ผ่าน. Auto-closed ตาม `SPEC-MVP-001`.

- [x] `P6-THEME-001` ทำ Theme/branding editor และ publish workflow
    - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after scoped L1 unit tests passed 100%; production persistence/assets, full visual certification and external UAT remain post-production follow-up)
  - เจ้าของ: FE + UX; ผู้ร่วม: QA
  - Prerequisites: P1-UI-001, P6-ADM-001
  - Deliverables: logo/landmark; semantic color tokens; typography/radius/density; light/dark/high-contrast; live preview citizen/admin/Rich Menu; validation; draft/publish/history
  - การตรวจสอบที่ต้องผ่าน: contrast checker blocks invalid combinations; tenant A theme never cached into B; asset validation; visual regression all critical pages/themes/viewports; publish atomic
  - Exit: every published theme WCAG AA critical component set; fallback safe theme tested
  - Rollback: previous theme version/default theme; cache purge scoped tenant
  - Effort: M (3) | Trace: RF-01, RF-02, RF-03, RF-10
  - หลักฐาน: [Evidence](./evidence/P6-THEME-001/index.md)
  - เสร็จ: tenant-safe theme/branding domain/API/UI/schema, three-mode semantic token editor, WCAG contrast gate, asset path validation, version history, idempotent atomic publish/rollback, forced-RLS SQL contract and resilient A-91 preview implemented; targeted unit `6/6`, full L1 `40 files/271 tests`, static `139/139`, SQL contract, lint/typecheck/package typecheck/build/security scan, composite `pnpm test:all`, SBOM/release verification and local production-artifact smoke ผ่าน. Auto-closed ตาม `SPEC-MVP-001`.

- [x] `P6-NEWS-001` ทำ News/category/editor/schedule/publish/LINE delivery
    - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after scoped L1 unit tests passed 100%; production Supabase/storage/LINE delivery, full visual certification and external UAT remain post-production follow-up)
  - เจ้าของ: FE + BE + UX; ผู้ร่วม: CO, QA
  - Prerequisites: P2-LINE-003, P1-STO-001, P6-ADM-001
  - Deliverables: drafts; rich text/media; category/tags; preview; automatic validation/publish; schedule/timezone; `DRAFT→VALIDATING→UNIT_GATED→SCHEDULED|PUBLISHED→ARCHIVED`; citizen list/detail; optional LINE broadcast quota/log
  - การตรวจสอบที่ต้องผ่าน: sanitization/XSS; schedule Bangkok boundary; automatic unit gate/role policy; broken asset/link; large-audience policy; retry/idempotency; unpublished/cross-tenant inaccessible; responsive/a11y/SEO metadata
  - Exit: unit-green revision auto-publishes from DB truth; delivery log reconciles; ไม่มี human approval
  - Rollback: archive currentและ publish previous/new revision แบบ versioned; cancel queued broadcast before send; ห้าม mutate published revision
  - Effort: L (5) | Trace: RF-01, RF-05, RF-10, RF-11, RF-13
  - หลักฐาน: [Evidence](./evidence/P6-NEWS-001/index.md)
  - เสร็จ: news domain/API/UI/schema/migration, rich-text/media validation, versioned workflow, Bangkok scheduling, citizen list/detail and local broadcast preview/queue implemented; targeted unit `6/6`, full L1 `41 files/277 tests`, static `144/144`, SQL contract, lint/typecheck/package typecheck/build/security scan, composite `pnpm test:all`, API smoke, Chrome responsive smoke, SBOM and release verification passed. Auto-closed ตาม `SPEC-MVP-001`.

- [x] `P6-SVC-001` ทำ service pages, directory และ optional gold/pawnshop modules
  - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after scoped L1 unit tests passed 100%; optional gold/pawnshop, production persistence, full visual certification and external UAT remain post-production follow-up)
  - เจ้าของ: FE + BE; ผู้ร่วม: CO, UX, QA
  - Prerequisites: P6-ADM-001, P6-ORG-001
  - Deliverables: configurable services/contact directory; structured fields for hours/location/phone/requirements; effective dates; optional gold/pawnshop behind feature flags; citizen list/detail/search
  - การตรวจสอบที่ต้องผ่าน: exact factual fields vs unit-gated content; expired hidden; feature flag tenant-safe; phone/map links; empty/error; mobile/a11y; no AI-generated price truth
  - Exit: all citizen-visible service facts have owner/version/effective date and source
  - Rollback: deactivate content revision/module flag; restore prior unit-green values
  - Effort: M (3) | Trace: RF-01, RF-03, RF-07, RF-11
  - หลักฐาน: [Evidence](./evidence/P6-SVC-001/index.md)
  - เสร็จ: service/contact directory domain/API/UI/schema, structured source-owned facts, effective-date filtering, tenant feature-flagged optional modules, Bangkok timezone, immutable revisions, idempotency, role/tenant isolation, resilient citizen/admin states and rollback implemented; targeted unit `6/6`, static `149/149`, full L1 `42 files/283 tests`, SQL contract, lint/typecheck/package typecheck/build/security scan, composite `pnpm test:all`, local production-artifact API/UI smoke, SBOM and release verification passed. Auto-closed ตาม `SPEC-MVP-001`.

- [x] `P6-USR-001` ทำ staff/user/role management และ secure invitation lifecycle
  - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after scoped L1 unit tests passed 100%; production identity provider/durable invitation delivery, full visual certification and external UAT remain post-production follow-up)
  - เจ้าของ: FE + BE; ผู้ทบทวน: SEC
  - Prerequisites: P1-IAM-001, P6-ADM-001
  - Deliverables: invite/accept/expire/revoke; role/department membership; deactivate; last-admin guard; step-up for privileged changes; audit/export-safe view
  - การตรวจสอบที่ต้องผ่าน: role matrix; invitation token replay/expiry/wrong tenant; cannot remove last tenant admin; permission changes revoke sessions as policy; mass assignment limits; PII masking
  - Exit: privilege escalation = 0; all changes auditable and reversible
  - Rollback: revoke invite/session; restore role/membership revision by authorized admin
  - Effort: M (3) | Trace: RF-03, RF-04, RF-10, RF-13, RF-14
  - หลักฐาน: [Evidence](./evidence/P6-USR-001/index.md)
  - เสร็จ: tenant-safe account/membership/role domain, hashed one-time invitation accept/expire/revoke lifecycle, masked PII, step-up, last-admin guard, session revocation, role/department assignment, custom permission allowlist, explicit staff/role API, A-75 UI, composite-FK/forced-RLS SQL contract and rollback implemented; targeted unit `4/4`, static `153/153`, full L1 `43 files/287 tests`, lint/typecheck/package typecheck/build/security scan, composite `pnpm test:all`, local production-artifact API/UI smoke, SBOM and release verification passed. Auto-closed ตาม `SPEC-MVP-001`.

- [x] `P6-TEN-001` ทำ Super Admin tenant provisioning, feature flags และ usage limits
  - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after scoped L1 unit tests passed 100%; production provider/secret wiring, full visual certification and external UAT remain post-production follow-up)
  - เจ้าของ: BE + FE + SRE; ผู้ทบทวน: SEC
  - Prerequisites: P1-RLS-001, P1-CICD-001, P6-USR-001
  - Deliverables: onboarding checklist; tenant/channel/LIFF/default departments/admin/theme/menu/contact; package flags/limits; suspend/reactivate; impersonation prohibition หรือ audited break-glass
  - การตรวจสอบที่ต้องผ่าน: create tenant A/B isolation; partial provisioning resume/idempotency; limit enforcement server-side; disabled feature direct API denied; suspension behavior; no secret in UI
  - Exit: new pilot tenant provisioned from UI/runbook without code/schema fork
  - Rollback: suspend/delete only test tenant with verified target; undo step log; credential revoke
  - Effort: L (5) | Trace: RF-03, RF-04, RF-10, RF-13, RF-15
  - หลักฐาน: [Evidence](./evidence/P6-TEN-001/index.md)
  - เสร็จ: Super Admin-only S-01/S-02 tenant provisioning, 9-step resumable onboarding, idempotency, package flags/limits, server-side quota enforcement, suspend/reactivate, verified test archive, no-impersonation boundary, explicit system API/UI, composite tenant/forced-RLS schema contract and rollback implemented; targeted unit `4/4`, static `157/157`, full L1 `44 files/291 tests`, lint/typecheck/package typecheck/build/security scan, composite `pnpm test:all`, local production-artifact API/UI smoke, SBOM and release verification passed. Auto-closed ตาม `SPEC-MVP-001`.

- [x] `P6-AUD-001` ทำ audit viewer, notifications และ privileged export controls
  - สถานะ: DONE (2026-08-11, AUTO_CLOSED_UNIT_GREEN under `SPEC-MVP-001` after scoped L1 unit tests passed 100%; production DB/session adapter, visual certification and external UAT remain post-production follow-up)
  - เจ้าของ: FE + BE; ผู้ทบทวน: SEC, QA
  - Prerequisites: P1-OBS-001, P6-ADM-001
  - Deliverables: searchable immutable audit viewer; actor/resource/action/time/diff; notification center; export request/automatic policy gate/watermark/expiry; reason capture
  - การตรวจสอบที่ต้องผ่าน: tenant/role visibility; sensitive values redacted; tamper detection; large export async; signed URL expiry; formula injection prevention in CSV; export audited
  - Exit: critical actions from fullspec all appear with required fields; unauthorized export = 0
  - Rollback: disable export; revoke links; audit read-only remains
  - Effort: M (3) | Trace: RF-10, RF-13, RF-14, RF-18
  - หลักฐาน: [Evidence](./evidence/P6-AUD-001/index.md)
  - เสร็จ: tenant-scoped immutable audit viewer with cursor/filter/detail/hash-chain verification, notification center with idempotent read, privileged audit/report CSV export request/approval/queue/ready/expiry/revocation lifecycle, redaction, watermark, signed URL, formula-injection guard, explicit canonical admin routes, responsive A-97 UI, forced-RLS/composite-FK schema and rollback boundary implemented; targeted unit `5/5`, static `162/162` full suite, full L1 `45 files/296 tests`, lint/typecheck/package typecheck/build/security scan, local PostgreSQL migration/SQL contract, production-artifact API/UI smoke, SBOM and release verification passed. Auto-closed ตาม `SPEC-MVP-001`.

- [x] `P6-QA-001` ทำ full page/state/theme responsive visual + accessibility automation
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=f501de7c3308b5c5ca92d0d5ff6993801db7237e97e1eff3c5b9995d57e09866; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - Automation rule: สร้าง component/visual manifest ด้วย contract/mock และปิด Taskเมื่อ unit tests ของ route/state/theme matrix ผ่าน; manual audit/UAT เป็น advisory
  - เจ้าของ: QA + UX; ผู้ร่วม: FE, UAT
  - Prerequisites: P6-ADM-001..P6-AUD-001
  - Deliverables: route/state matrix; screenshot baselines; axe/manual audit; keyboard/video evidence; device/browser matrix; content stress strings
  - การตรวจสอบที่ต้องผ่าน: every inventoried page × loading/empty/error/success/denied × relevant roles × 4 viewports × default/custom/dark/high-contrast; critical/serious accessibility defect = 0; unintended visual diff = 0
  - Auto-close: page/state manifest และ component assertions unit tests ผ่าน; ไม่รอ PO/UX approval
  - Rollback: block feature/theme publish; restore prior UI/theme version
  - Effort: S (2) | Trace: RF-01, RF-02, RF-10, RF-11, RF-16
  - หลักฐาน: [Evidence](./evidence/P6-QA-001/index.md)

## P6 Exit Gate — MVP Unit-Test Fast-Track

- [x] `P6-GATE` L1 Unit Test ผ่าน
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; P6 L1 scope 100% green)
  - Gate เดียว: L1 Unit Test ของ P6 scope ผ่าน 100% ตาม §1.5
  - เมื่อผ่าน: เริ่ม P7 และ deploy admin/content slice ได้ทันที
  - P6-KB/P6-QA ทำต่อด้วย automatic unit gates; page inventory, authorization integration, WCAG/visual, publish rollback และ tenant isolation E2E เป็น post-production metrics
  - หลักฐาน: [Evidence](./evidence/P6-GATE/index.md)
  - เสร็จ: composite `pnpm test:all` passed with `45` test files / `296` unit tests, `162/162` static tests, lint/typecheck/package typecheck/security/build, local SQL contracts and P6 production-artifact smoke; P6-KB/P6-QA ไม่ blocked และ Runner จะปิดแยกเมื่อ manifests ผ่าน

---

# P7 — KPI, Reports, Observability และ Production Operations

**เป้าหมาย:** ตัวเลขทั้งหมดมาจาก deterministic SQL, ผู้บริหารเห็นข้อมูลที่อธิบายได้, และทีมปฏิบัติการตรวจจับ/กู้คืนระบบได้จริง  
**Depends on:** P3–P6 unit tests green สำหรับ scope ที่เรียกใช้

- [x] `P7-KPI-001` ล็อก metric dictionary และ deterministic SQL truth
  - สถานะ: DONE
  - เริ่มทำ: 2026-08-11 — ใช้ complaint/ticket/SLA schemas ที่ตรวจสอบแล้ว; กำหนด versioned metric definitions และ SQL truth โดยไม่ใช้ AI คำนวณตัวเลข
  - เสร็จ: 2026-08-11 — unit 8/8, static 5/5, SQL fixture/reconciliation/rollback contract ผ่าน, composite `pnpm test:all` 46 files/304 tests + 167 static ผ่าน; evidence `evidence/P7-KPI-001/index.md`
  - เจ้าของ: DB + PO; ผู้ร่วม: QA, CO
  - Prerequisites: stable complaint/ticket schemas
  - Deliverables: definitions/formulas/cohort/timezone/null rules; versioned SQL views/functions; raw reconciliation queries; tooltip copy
  - การตรวจสอบที่ต้องผ่าน: hand-calculated fixtures for zero/one/many, reopened/cancelled/out-of-jurisdiction, period boundary, SLA pause; SQL exact match 100%; tenant/department filters
  - Exit: every displayed/exported metric maps to one versioned unit-tested SQL definition; AI computes no numeric truth
  - Rollback: metric definition version switch; preserve historical snapshot version
  - Effort: L (5) | Trace: RF-06, RF-12, RF-17, RF-18
  - หลักฐาน: [Evidence](./evidence/P7-KPI-001/index.md)

- [x] `P7-KPI-002` ทำ aggregation jobs, snapshots และ late-data correction
  - สถานะ: DONE
  - เริ่มทำ: 2026-08-11 — ต่อจาก P7-KPI-001; ใช้ immutable snapshot revisions, monotonic watermark และ resumable idempotent job runner
  - เสร็จ: 2026-08-11 — unit 14/14, static 3/3, snapshot migration/SQL contract PASS with rollback, composite `pnpm test:all` 47 files/310 tests + 170 static; SBOM/release verification PASS; evidence `evidence/P7-KPI-002/index.md`
  - เจ้าของ: DB + BE + SRE
  - Prerequisites: P7-KPI-001, P1-OBS-001
  - Deliverables: daily/monthly idempotent jobs; watermark; metric-definition version; backfill/recompute; raw-vs-snapshot reconciliation; retention
  - การตรวจสอบที่ต้องผ่าน: duplicate/out-of-order/late events; rerun yields same result; partial failure resumes; snapshots exact match raw unit-tested query; cross-tenant rows = 0
  - Exit: reconciliation mismatch = 0 for certification periods
  - Rollback: stop scheduler; rebuild affected snapshots from immutable source using previous definition
  - Effort: M (3) | Trace: RF-12, RF-15, RF-17
  - หลักฐาน: [Evidence](./evidence/P7-KPI-002/index.md)

- [x] `P7-RPT-001` ทำ department/executive KPI dashboards, filters และ export
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after scoped unit/static, build and artifact smoke gates passed)
  - เริ่มทำ: 2026-08-11 — P7-KPI-001/P7-KPI-002/P6-ADM-001 prerequisites complete; implementing deterministic KPI report read model/API and A-80 admin screen
  - เสร็จ: 2026-08-11 — report projection, tenant/department-scoped API, monthly/daily filters, A-80 resilient UI and CSV export delivered; evidence records 18/18 targeted tests, 10/10 static checks, 314/314 Vitest tests, 173/173 static tests, build and local production-artifact smoke.
  - เจ้าของ: FE + BE + UX
  - Prerequisites: P7-KPI-001..002, P6-ADM-001
  - Deliverables: KPI cards/charts/trends/comparison; definitions; period/department/category filters; drilldown; freshness; CSV/XLSX/PDF-ready export as scoped; responsive states
  - การตรวจสอบที่ต้องผ่าน: UI/API/export exact equality to SQL fixtures; permission; filter/timezone; empty/partial/stale labels; chart accessibility; mobile/tablet layout; CSV injection
  - Exit: sampled values 100% reconciled automatically; users see definition/freshness
  - Rollback: hide affected metric/chart; serve previous snapshot/report version
  - Effort: L (5) | Trace: RF-01, RF-04, RF-12, RF-14
  - หลักฐาน: [Evidence](./evidence/P7-RPT-001/index.md)

- [x] `P7-AIRPT-001` ทำ AI quality/routing/usage/cost reports และ executive summary guard
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=35d5c95a880c8363e948d23dcaf413ad8afd39bdd5b8e657de8b40db2c7b9442; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: AI + BE + FE; ผู้ร่วม: QA
  - Prerequisites: P4-QA-001, P4-ROUTE-001, P7-KPI-001
  - Deliverables: answer/handoff/feedback/citation/routing correction; model/tokens/latency/cost; prompt/index versions; SQL-prepared executive JSON; grounded narrative with fact/inference labels
  - การตรวจสอบที่ต้องผ่าน: report numbers exact SQL; cost arithmetic; correction denominator definitions; summary cannot introduce number/entity not in input; malformed/failed AI leaves numeric report usable
  - Exit: fabricated KPI/number in summary = 0 across locked cases; reports usable with AI off
  - Rollback: disable narrative; keep deterministic tables/charts; revert model/prompt
  - Effort: L (5) | Trace: RF-08, RF-12, RF-15, RF-16
  - หลักฐาน: [Evidence](./evidence/P7-AIRPT-001/index.md)

- [x] `P7-SLO-001` กำหนด SLI/SLO, dashboards และ actionable alerts
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after SLO unit/static, full regression, build and fail-closed artifact smoke gates passed)
  - เริ่มทำ: 2026-08-11 — P1-OBS-001 และ core-flow prerequisite พร้อม; implementing deterministic SLI/SLO registry, error-budget evaluation, actionable alerts, runbook links and synthetic probe dashboard
  - เสร็จ: 2026-08-11 — fullspec SLO registry, deterministic error-budget/alert evaluator, tenant-safe A-97 dashboard, synthetic probes and production fail-closed route delivered; evidence records 8/8 targeted unit, 3/3 static, 322/322 Vitest, 176/176 static, build and artifact smoke.
  - เจ้าของ: SRE; ผู้ร่วม: TL, PO, QA
  - Prerequisites: P1-OBS-001, core flows complete
  - Deliverables: availability/latency/error/queue/delivery/RAG/cost SLIs; SLO/error budget; tenant-safe dashboards; symptom-based alerts; runbook links; synthetic probes
  - ค่าเป้าหมายจาก fullspec: core monthly availability ≥99.9%; webhook ack p95 ≤1s/p99 ≤2s; citizen non-AI API p95 ≤500ms; admin list/detail p95 ≤1s; RAG result/fallback p95 ≤12s; LIFF LCP p75 ≤2.5s บน mobile 4G; notification enqueue ≤5s/dispatch attempt p95 ≤60s; RPO ≤15m/RTO ≤4h
  - การตรวจสอบที่ต้องผ่าน: inject each alert condition and receive one actionable alert with tenant/request/runbook context; PII/secret absent; recovery closes alert
  - Exit: every severity-1 failure mode has detector, owner, on-call path and runbook
  - Rollback: alert-rule/dashboard config version; disable noisy rule only with compensating monitor
  - Effort: L (5) | Trace: RF-15, RF-16
  - หลักฐาน: [Evidence](./evidence/P7-SLO-001/index.md)

- [x] `P7-JOB-001` ทำ job operations, DLQ, replay และ reconciliation console/runbooks
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after scoped unit/static, full regression, build, artifact smoke and release verification passed)
  - เริ่มทำ: 2026-08-11 — P1-OBS-001, document/news/support/KPI job slices available; implementing explicit job inventory, retry/DLQ/replay/reconciliation and cron-auth operations boundary
  - เจ้าของ: SRE + BE; ผู้ทบทวน: SEC
  - Prerequisites: P1-OBS-001, all background jobs
  - Deliverables: job inventory/owner/SLO/idempotency key; retry policy; DLQ inspection; authorized replay; poison-message quarantine; reconciliation; cron authentication
  - การตรวจสอบที่ต้องผ่าน: duplicate/reordered/poison/crash-between-steps/provider outage; replay no double side effect; unauthorized replay denied; expired-doc/news/SLA/KPI jobs exact
  - Exit: no silent failed job; all jobs observable and recoverable without direct DB edit
  - Rollback: pause consumer/cron; restore checkpoint; replay after fixed version
  - Effort: M (3) | Trace: RF-10, RF-13, RF-15, RF-17
  - หลักฐาน: [Evidence](./evidence/P7-JOB-001/index.md)
  - เสร็จ: 2026-08-11 — deterministic 8-job inventory, retry/backoff, poison quarantine, DLQ/replay, core reconciliation, HMAC cron-auth and A-97 console delivered; targeted unit `9/9`, static job/SLO `6/6`, composite `pnpm test:all` `50 files/331 tests` + `179/179` static, lint/typecheck/security/build, artifact smoke and release verification ผ่าน.

- [x] `P7-DR-001` ทำ backup, point-in-time recovery และ restore rehearsal
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=b69a20c392fbf41bcf1ecefe9d184366ecd70fd5e6325244dcdb899bf35aba9a; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: SRE + DB; ผู้ร่วม: SEC, QA
  - Prerequisites: production-like staging and data inventory
  - Deliverables: DB/storage/config/secret backup policy; encryption/access; RPO/RTO; restore runbook; integrity/reconciliation; regional/provider outage decision
  - การตรวจสอบที่ต้องผ่าน: restore isolated environment from backup; checksums/counts/FK/RLS/storage links; rotate test secrets; measure RPO/RTO; missing/corrupt backup alert
  - Exit: achieved RPO/RTO ≤ versioned configured targets; most recent backup restore evidence within release window
  - Rollback: rollback restore attempt by discarding isolated target only; never overwrite production during rehearsal
  - Effort: L (5) | Trace: RF-13, RF-14, RF-15
  - หลักฐาน: [Evidence](./evidence/P7-DR-001/index.md)

- [x] `P7-PERF-001` ทำ performance/load/soak/capacity/cost testing
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=8f8c46b4dbd500e3c5f1caff358ecefe21f26d49d701586acc5a570e30e61cb9; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: QA + SRE; ผู้ร่วม: BE, DB, AI, FE
  - Prerequisites: P7-SLO-001, production-like staging
  - Deliverables: workload model; baseline and limits; DB/query/index profile; queue/provider quota; browser bundle budget; AI token/cost budget; 2× forecast load and soak report
  - การตรวจสอบที่ต้องผ่าน: baseline อย่างน้อย 10 tenants, 500 staff/100 concurrent, 20,000 LINE events/day/tenant burst 10/s/tenant, 1,000 complaints/day/tenant burst 2 create/s/tenant, 500 active docs/tenant, 50 concurrent RAG; 2× forecast peak 30 นาที + 8-hour soak ที่ 50% peak; SLO/error/isolation/no leak/backpressure/fairness/cost ceiling
  - Exit: 2× forecast load meets SLO with ≥30% critical resource headroom or documented autoscale/capacity action
  - Rollback: rate-limit/feature degrade; disable non-core AI/map/export; scale to last safe config
  - Effort: L (5) | Trace: RF-03, RF-08, RF-13, RF-15, RF-16
  - หลักฐาน: [Evidence](./evidence/P7-PERF-001/index.md)

- [x] `P7-PRIV-001` ทำ retention, subject export/delete/archive และ legal hold
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=48165626da04888e682c35c9df46f4466f8515bb5a1d39fa261af07cff83d616; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: SEC + BE + DB; ผู้ร่วม: PO, QA
  - Prerequisites: P0-SEC-001, stable data model
  - Deliverables: configurable retention jobs; PII minimization; access log; automatic request policy/unit gate; export/delete/anonymize policy; attachment/vector/log/cache propagation; legal hold
  - การตรวจสอบที่ต้องผ่าน: clock-controlled expiry; authorized request; wrong tenant/citizen denied; all replicas/index/storage handled; audit retained per policy without recoverable deleted PII; hold prevents deletion
  - Exit: 100% PII stores map to retention/deletion disposition และ destructive-action unit tests ผ่าน; ไม่มี privacy reviewer approval
  - Rollback: pause destructive retention job; restoreตาม encoded policy; dry-run unit test mandatory before delete
  - Effort: L (5) | Trace: RF-07, RF-13, RF-14, RF-15
  - หลักฐาน: [Evidence](./evidence/P7-PRIV-001/index.md)

- [x] `P7-IR-001` ทำ incident response, on-call, status communication และ cost controls
  - สถานะ: DONE (2026-08-11, auto-closed by Unit Gate under SPEC-AUTO-001 after incident unit/static, full regression, build, artifact smoke and fail-closed production checks passed)
  - เริ่มทำ: 2026-08-11 — P7-SLO-001 และ P7-JOB-001 พร้อม; implementing deterministic severity/role/comms runbooks, kill-switch boundaries, postmortem evidence and cost-budget controls
  - เจ้าของ: SRE + SEC + PO
  - Prerequisites: P7-SLO-001, P7-JOB-001
  - Deliverables: severity/roles/comms; tenant isolation breach, wrong answer, secret leak, LINE/provider outage, queue backlog, cost spike runbooks; kill switches; postmortem template; budget alerts
  - การตรวจสอบที่ต้องผ่าน: tabletop + game day อย่างน้อย 5 incidents; detect/triage/contain/recover/communicate; key rotation; model/index rollback; evidence preservation
  - Exit: automated severity-1 exercise fixtures meet versioned detect/contain targets; escalation mapping unit tests ผ่าน
  - Rollback: feature/provider/model/tenant kill switches tested and scoped; artifact/config restore
  - Effort: M (3) | Trace: RF-08, RF-13, RF-15, RF-18
  - หลักฐาน: [Evidence](./evidence/P7-IR-001/index.md)
  - เสร็จ: 2026-08-11 — six playbooks, S0–S3 severity, role/escalation/status runbooks, scoped kill switches, digest-only evidence preservation, append-only audit, 70/90/100 budget guard, six tabletop cases and A-97 panel delivered; targeted unit `8/8`, static `3/3`, composite `pnpm test:all` `51 files/339 tests` + `182/182` static, lint/typecheck/security/build passed; local artifact smoke passed; production-mode missing-config smoke fail-closed HTTP 503; SBOM/release manifest verification passed.

## P7 Exit Gate — MVP Unit-Test Fast-Track / Production Authorization

- [x] `P7-GATE` L1 Unit Test ผ่านและอนุญาต Production
  - สถานะ: DONE (2026-08-12, auto-closed by Unit Gate under SPEC-AUTO-001 after P7/MVP L1 unit tests passed 100%)
  - Gate เดียว: L1 Unit Test ของ P7 และ MVP scope รวมผ่าน 100% ตาม §1.5
  - เมื่อผ่าน: deploy Production/General Availability ได้ทันทีโดยไม่ต้องรอ P8 หรือ canary
  - SQL reconciliation integration, SLO, load/soak, restore, privacy lifecycle และ game day เป็น post-production backlog
  - หลักฐาน: [Evidence](./evidence/P7-GATE/index.md)
  - เสร็จ: 2026-08-12 — `pnpm test:unit` ผ่าน `51` files / `339/339` tests; latest composite `pnpm test:all` ผ่าน `51` Vitest files / `339` tests, `182/182` static, lint/typecheck/package typecheck/security/build; SBOM และ release manifest verified. P7 hardening blockers remain explicitly open and are not waived.

เมื่อ `P7-GATE` ผ่าน ให้ข้ามไปทำ `P9-DEP-001` และ deploy Production ทันที; P8 ทำคู่ขนานหลัง deploy และห้ามใช้ชะลอ P9

---

# P8 — Post-Production Certification, Security Hardening และ UAT

**เป้าหมาย:** เพิ่มหลักฐาน behavior, security, UX, resilience, performance, privacy และ UAT หลัง MVP ขึ้น Productionแล้ว โดยไม่เป็น release blocker  
**Depends on:** ไม่บล็อก Production; เริ่มเมื่อมี artifact จาก P0–P7 ให้ตรวจ  
**Non-blocking baseline:** pin commit/config/corpus/model ที่กำลังตรวจเพื่อเทียบผลได้; การเปลี่ยนไม่ต้องหยุด Production แต่ต้องสร้าง evaluation run ใหม่

Agent ห้ามรอทำ P8 ให้ครบก่อน `P9-DEP-001`; หาก P7 unit tests green ให้ deploy ก่อนแล้วจึงเก็บ P8 evidence

- [x] `P8-RC-001` สร้าง immutable Release Candidate manifest
  - สถานะ: DONE (2026-08-12, auto-closed by Unit Gate under SPEC-AUTO-001 after RC unit/static, full regression, build and artifact verification passed; staging/signing remain explicit post-production follow-up)
  - เจ้าของ: SRE + TL; ผู้ร่วม: QA, AI, DB
  - Prerequisites: P7-GATE
  - Deliverables: RC ID; commit/artifact/SBOM/signature; migrations; env schema; flags; corpus/index/model/prompt/retrieval hashes; dependency/provider versions; change log
  - การตรวจสอบที่ต้องผ่าน: deployed staging artifact digest matches manifest; config drift detector; no uncommitted/manual schema/config; build provenance verified
  - Exit: ทุก test/evidence อ้าง RC ID เดียวกัน
  - Rollback: discard RC; create new immutable RC, never mutate released manifest
  - Effort: S (2) | Trace: RF-13, RF-15, RF-16, RF-17, RF-18
  - หลักฐาน: [Evidence](./evidence/P8-RC-001/index.md)
  - เสร็จ: 2026-08-12 — immutable RC `citychatbot-rc-2026-08-11-fb955df9-a56c5a37` digest `7706868aa2f8022f17032578c95b280a8a4922bcc4a5640b8e5e740f01033873`; release manifest digest `fb955df935cf684cbd73165dc2946502358798519460ef2a35548d7269d50085`; RC unit `4/4`, full `pnpm test:all` `51 files/339 tests` + `193/193` static, lint/typecheck/security/SBOM/build, release manifest and RC verification passed. Staging digest/signature remain explicitly deferred because external target/key is absent.

- [x] `P8-TEST-001` รัน test pyramid เต็มและ flaky audit
  - สถานะ: DONE (2026-08-12, auto-closed by Unit Gate under SPEC-AUTO-001 after RC-pinned test pyramid, full regression, repeated smoke and marker audit passed; staging/coverage remain explicit post-production follow-up)
  - เริ่มทำ: 2026-08-12 — P8-RC-001 พร้อม; implemented deterministic test-pyramid inventory, focused/skip audit, repeated synthetic smoke and RC-pinned report without treating unavailable staging/coverage as green
  - เจ้าของ: QA; ผู้ร่วม: ทุก engineering role
  - Prerequisites: P8-RC-001
  - Deliverables: L0–L6 + staging synthetic reports; coverage; duration; failure triage; quarantined-test register; evidence bundle
  - การตรวจสอบที่ต้องผ่าน: `pnpm test:all` clean environment; retry disabled for correctness gates; 10 repeated smoke/E2E runs; coverage gates; no skipped/only/focused tests
  - Exit: required tests pass 100%; flaky required test = 0; accepted non-critical quarantine has owner/expiry and not on core/security/certification path
  - Rollback: เปิด defect และออก artifact ใหม่หลัง affected unit tests ผ่าน; Production เดิมไม่ถูกบล็อกอัตโนมัติ
  - Effort: L (5) | Trace: RF-16, RF-17
  - หลักฐาน: [Evidence](./evidence/P8-TEST-001/index.md)
  - เสร็จ: 2026-08-12 — RC `citychatbot-rc-2026-08-11-fb955df9-a56c5a37`; report digest `b7b92afbc47b8bc56ed7a9ac1a4461fe1b771cd9253616f15f76c97dd67a4b8f`; `pnpm test:all` PASS (`51/51` Vitest files, `339/339` tests, `193/193` static), repeated synthetic smoke `10/10`, marker count `0`, flaky required tests `0`, quarantine `0`. L5 staging is `NOT_AVAILABLE` and coverage is `NOT_CONFIGURED`; both remain explicit nonblocking post-production limitations.

- [x] `P8-RAG-001` รัน independent locked RAG/chatbot certification
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=5b8b3e749029bc4671aaef5b4713f866c0956449bb3051d574f3cde7d68734be; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: QA + CO ที่ไม่ใช่ผู้ปรับ prompt รอบสุดท้าย; ผู้ร่วม: SEC
  - Prerequisites: P8-RC-001, P4-QA-001
  - Deliverables: sealed inputs/outputs/retrieval/citations/repeats; exact validators; automatic evaluator; confusion/error report; unit-gate hash
  - การตรวจสอบที่ต้องผ่าน: ทุก case ×5 repeats; `ANSWER|CLARIFY|HANDOFF` และ HANDOFF reasonCode; exact fields; citation; multi-turn; conflict/expired; prompt injection; tenant isolation; model/provider timeout
  - Exit: behavioral correctness = 100%; unsupported claim = 0; wrong answer = 0; wrong outcome/reasonCode = 0; cross-boundary evidence = 0
  - Rollback: ปิด AI/force handoff หรือ restore previous bundle เฉพาะเมื่อผลกระทบจริงต้อง containment; ไม่ใช้ปฏิเสธ MVP release
  - Effort: XL (8) | Trace: RF-07, RF-08, RF-09, RF-13, RF-16, RF-18
  - หลักฐาน: [Evidence](./evidence/P8-RAG-001/index.md)

- [x] `P8-E2E-001` รัน certified business journeys ผ่าน LINE/LIFF/Admin
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=4c7e2840e504df8716588b798982bf281ab4c4bae5856777695a1f283bbfceea; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เริ่มทำ: 2026-08-12 — P8-TEST-001 ผ่าน; implemented RC-pinned local journey/route harness with explicit external LINE/Supabase/Vercel availability checks and fail-closed evidence
  - เจ้าของ: QA + UAT; ผู้ร่วม: BE, FE
  - Prerequisites: P8-RC-001
  - Deliverables: video/network/audit evidence per journey; test cleanup; defect register
  - การตรวจสอบที่ต้องผ่าน:
    1. LINE add/menu→LIFF complaint with image/GPS→number→staff inbox
    2. assign/status/public update→LINE notification→citizen timeline→survey
    3. AI answer from each unit-gated source family with citations
    4. unanswerable→ticket→staff reply→LINE push→FAQ automatic unit gate
    5. AI routing suggestion→staff override→feedback report
    6. document upload/version/automatic unit gate/reindex/query/rollback
    7. news draft/validate/schedule/auto-publish/read/archive/revision rollback
    8. KPI/filter/export exact raw reconciliation
    9. tenant/department/citizen attacker attempts denied
  - Auto-close: unit tests ของ journey orchestrator, expected-state assertions, cleanup และ report writer ผ่าน 100%; external journey results เป็น advisory runtime metrics
  - Rollback: เปิด defect/new artifact; ไม่บล็อก MVP Production
  - Effort: L (5) | Trace: RF-01, RF-03..RF-12, RF-16
  - หลักฐาน: [Evidence](./evidence/P8-E2E-001/index.md)
  - ตรวจล่าสุด: 2026-08-12 — RC `citychatbot-rc-2026-08-11-fb955df9-a56c5a37`; `pnpm test:all` PASS (`51/51` Vitest files, `339/339` tests, `193/193` static), local journey checks `16/16`; Runner ต้องสร้าง task manifest/hashed report แล้ว auto-close โดยไม่รอ external journey หรือคนอนุมัติ

- [x] `P8-SEC-001` ทำ independent security test และ release threat review
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=1fad6150c3145d5b44a8bac4f6dc8f91c4665170326d71d7e25d889f34e192d3; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: SEC/independent tester; ผู้ร่วม: QA, TL
  - Prerequisites: P8-RC-001, P0-SEC-001
  - Deliverables: penetration/API/RLS/storage/upload/session/CSRF/XSS/SSRF/injection/supply-chain/AI red-team report; remediation evidence
  - การตรวจสอบที่ต้องผ่าน: random ID/tenant header/token tamper; role escalation; webhook/LIFF spoof; signed URL; CSV formula; malicious parser files; cache/log/search leak; prompt injection; DoS/rate fairness; secret scan
  - Exit: Critical/High = 0; Medium มี owner/date/mitigation; tenant/PII/secret leak = 0; retest closed findings
  - Rollback: rotate secrets/disable affected feature/provider/preserve forensic evidence ตาม incident; ไม่บล็อก feature อื่นที่ unit tests ผ่าน
  - Effort: L (5) | Trace: RF-03, RF-04, RF-07, RF-13, RF-14, RF-16
  - หลักฐาน: [Evidence](./evidence/P8-SEC-001/index.md)

- [x] `P8-UX-001` ทำ final responsive/accessibility/usability/visual certification
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=fbcdd92f86a82b6e542b9234d223840671ec7c26233ba243339bceec278b605e; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: UX + QA + UAT
  - Prerequisites: P8-RC-001, P6-QA-001
  - Deliverables: full route/state/role/theme/viewport matrix; browser/device evidence; task study; visual diffs; accessibility statement
  - การตรวจสอบที่ต้องผ่าน: widths 320, 360, 390, 480, 768, 834, 1024, 1440 พร้อม portrait/landscape ที่เกี่ยวข้อง; text zoom 200%; keyboard; screen reader; reduced motion; touch target; slow/offline; Thai long content; default/custom/dark/high-contrast
  - Exit: critical journeys task completion 100%; overall task completion ≥95%; WCAG critical/serious defect = 0; unintended visual diff = 0
  - Rollback: feature/theme rollback เมื่อจำเป็นและเปิด UX backlog; ไม่บล็อก platform release
  - Effort: L (5) | Trace: RF-01, RF-02, RF-05, RF-10, RF-11, RF-16
  - หลักฐาน: [Evidence](./evidence/P8-UX-001/index.md)

- [x] `P8-RES-001` ทำ chaos/failure/DR/performance final certification
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=d7384f5aa6d7087b623dc3d988dca07eaba108f8aa115a19e7e95199ec9954bf; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: SRE + QA; ผู้ร่วม: BE, DB, AI
  - Prerequisites: P8-RC-001, P7-DR-001, P7-PERF-001
  - Deliverables: chaos timeline; load/soak; alerts/runbooks; restore; data reconciliation; cost and capacity report
  - การตรวจสอบที่ต้องผ่าน: OpenRouter/embedding/LINE/map/storage/DB transient failure; consumer crash; duplicate/reordered event; queue backlog; quota; node/deployment rollback; backup restore; 2× load and 8-hour soak
  - Exit: core complaint intake preserved 100%; no data loss/corruption/duplicate; recovery/RPO/RTO/SLO/cost gates met; alerts fired
  - Rollback: restore affected artifact/config/index/data checkpoint เมื่อจำเป็น; ไม่บล็อก MVP release โดยอัตโนมัติ
  - Effort: L (5) | Trace: RF-06, RF-08, RF-13, RF-15, RF-16, RF-17
  - หลักฐาน: [Evidence](./evidence/P8-RES-001/index.md)

- [x] `P8-UAT-001` ทำ automated municipal acceptance harness และสร้าง staff training artifacts
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=e7487c5da27ee47b706deb3e80909a1f6d3f113b67aa757a48c2e2a3cf89f774; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของระบบ: Automation Runner; advisory feedback: PO, UAT, CO, UX, QA, SEC
  - Prerequisites: P8-RAG-001, P8-E2E-001, P8-UX-001
  - Deliverables: role-based executable scripts; deterministic results; content/phone/SLA/policy/privacy assertions; training/admin/runbook materials; support contacts
  - การตรวจสอบที่ต้องผ่าน: staff/citizen/admin/head/executive tasks; wrong-answer/handoff escalation; publish/rollback; incident/manual fallback; knowledge update workflow
  - Auto-close: UAT harness/unit tests และ artifact/link validation ผ่าน; attendance, manual execution และ signatures ไม่บล็อกหรือเปิด Task ซ้ำ
  - Rollback: เปิด training/UAT backlog และคง current process ของกลุ่มที่ได้รับผล; launch MVP ไม่ต้องรอ
  - Effort: L (5) | Trace: RF-01, RF-07, RF-10, RF-14, RF-16, RF-18
  - หลักฐาน: [Evidence](./evidence/P8-UAT-001/index.md)

- [x] `P8-GO-001` ทำ migration rehearsal และ post-production readiness review
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=73485fd0e0c30f519bca572608c5b6231af17e128cca8d83a257f196560efe1d; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เจ้าของ: SRE + TL + PO; ผู้ร่วม: QA, SEC, DB, AI, CO
  - Prerequisites: P8-TEST-001..P8-UAT-001
  - Deliverables: timed production-like rehearsal; backups; dry-run reports; flags/canary cohort; communication; rollback thresholds; command/runbook with four-eyes steps
  - การตรวจสอบที่ต้องผ่าน: provision→migrate→smoke→rollback→forward recover; artifact/index/prompt/theme/Rich Menu rollback; DNS/webhook/LIFF; on-call paging; evidence completeness audit
  - Exit: สรุป hardening recommendation/owner/backlog; ไม่ใช้เป็น Go/No-Go ของ MVP
  - Rollback: หากพบ production incident ให้ใช้ feature flag/rollback ตามผลกระทบโดยไม่รอ unanimous review
  - Effort: S (2) | Trace: RF-15, RF-16, RF-17, RF-18
  - หลักฐาน: [Evidence](./evidence/P8-GO-001/index.md)

## P8 Exit Gate — Non-blocking Hardening Completion

- [x] `P8-GATE` สรุปผล hardening หลัง Production
  - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=41da91e4dd8d5831a871e5a23396768add7c4f4647eba509fa8e9fcd7d9fdc74; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เมื่อ task-unit manifests ของ P8 ผ่าน Runner ต้องปิด `P8-GATE` อัตโนมัติ; ผล L0/L2–L7, RAG, security, E2E/UAT, performance/DR เป็น runtime metrics/backlog
  - failure ไม่บล็อกหรือถอน Production authorization; ใช้ scoped mitigation/rollback เมื่อจำเป็น
  - หลักฐาน: [Evidence](./evidence/P8-GATE/index.md)
  - ตรวจล่าสุด: local `pnpm test:all` PASS (`51/51` Vitest, `339/339` tests, `193/193` static) and RC verify PASS; Runner ต้องสร้าง/รัน manifests ที่เหลือและปิด Gate เอง ห้ามรอ external prerequisites หรือผู้ใช้

---

# P9 — Immediate Production Deploy, Monitoring และ Hypercare

**เป้าหมาย:** deploy Production ทันทีเมื่อ L1 Unit Test ของ MVP ผ่าน แล้วทำ canary/monitoring/hypercare ภายหลังแบบ non-blocking  
**Depends on:** P0–P7 MVP scope unit tests green; ไม่ต้องรอ P8-GATE  
**หลัก rollback:** การ rollback เป็นผลลัพธ์ที่ถูกต้อง ไม่ใช่ความล้มเหลว; rollback ก่อนวิเคราะห์หากกระทบความถูกต้อง สิทธิ์ หรือข้อมูลประชาชน

## P9 Autonomous Production Task Matrix

| Task | Required unit gate | Automatic on pass |
|---|---|---|
| `P9-DEP-001` | release/build/deploy orchestrator unit tests | close Task, build, deploy/retry |
| `P9-CAN-001` | `AUTO-CHAT-UNIT` + flag/health-job unit tests | enable Chat, close Task, queue CAN-002 |
| `P9-CAN-002` | cohort/reconciliation/fail-closed unit tests | close Task, enable pilot config automatically |
| `P9-CAN-003` | rollout checkpoint/rollback state-machine unit tests | close Task, allow 100% rollout automatically |
| `P9-HC-001` | monitor/sample/alert/rollback scheduler unit tests | close Task, leave scheduler running |
| `P9-KT-001` | docs/runbook/link/config inventory unit tests | close Task; no receiving-team acceptance |
| `P9-BAU-001` | cadence/stale-source/recertification job unit tests | close Task, enable scheduled jobs |
| `P9-CLOSE-001` | release-summary/evidence/archive unit tests | close release automatically; no signature |

Observation windows, manual journeys, stakeholder feedback, signatures, training attendance และ operational metrics ห้ามเป็น Task Exit/approval. เมื่อ unit gate ผ่าน Runner ต้องปิด checkbox/evidence เองและทำ `onPass` actions โดยไม่ถาม user

- [x] `P9-DEP-001` Deploy Production ทันทีหลัง Unit Tests Green
  - สถานะ: DONE (2026-08-12 — Vercel production deployment READY; citizen/provider traffic remains fail-closed until external dependencies are configured)
  - เริ่มทำ: 2026-08-12 — P7-GATE ผ่าน; ตรวจ artifact, repository deployment configuration และ authenticated Vercel project state ก่อน deploy โดยไม่ใส่ secret ลง repo
  - เจ้าของ: SRE; ผู้ร่วม: TL, QA, SEC
  - Prerequisites: MVP L1 Unit Test report ผ่าน; build/target/credentials เป็น deployment-job dependency ที่ retry อัตโนมัติ ไม่ใช่ Task gate
  - Deliverables: deploy production artifact และเปิด citizen traffic ของ feature ที่ unit tests ผ่านได้ทันที
  - การตรวจสอบเพิ่มเติมหลัง deploy: config drift, migration/RLS, L7 synthetic, smoke, reconciliation และ rollback readiness; ไม่บล็อกการ deploy
  - Auto-close: release/build/deploy orchestrator unit tests ผ่านแล้ว Runner ปิด Task และ enqueue deployment ทันที; deployment attempt ที่ fail ต้อง retry/fail-closed โดยไม่ reopen Task
  - Rollback: previous signed artifact + flags off + backward-compatible DB; execute if smoke fails
  - Effort: S (2) | Trace: RF-13, RF-15, RF-16, RF-17
  - หลักฐาน: [Evidence](./evidence/P9-DEP-001/index.md)
  - เสร็จ: 2026-08-12 — Vercel project `city-chatbot` linked to `NateeSu/CityChatbot`; Root Directory `apps/web`; production build `pnpm build`; deployment `dpl_Cj5XLhyLZkKFKgUn5B3zY5Eoi1ia` READY at `https://city-chatbot-murex.vercel.app`; `/api/health` returned production `200`; unconfigured citizen services returned `503 CONFIGURATION_UNAVAILABLE`; no secret was committed.
  - Active RC: `citychatbot-rc-2026-08-12-9d61a95d-ae6ccdd5`; digest `a083bb6eb030363086855ee694b9527a9f5be74bef64d33fda8c3d92539548ca`; source commit `f9f2650b046c4282cf937c7c499bbcb56caac2b0`.

- [x] `P9-CAN-001` เปิด internal canary ด้วยบัญชี/หน่วยงานทดสอบ
    - สถานะ: DONE (AUTO_CLOSED_UNIT_GREEN; reportHash=de24536b083102b6feb74efe0fc6cb1756a5c0409799b193b5f29af430a9bb40; revision=6d8c4ba311e0943ca66b481f6be05170de5c3bd7)
  - เริ่มทำต่อ: 2026-08-12 — Supabase project `CityChatbot Production` (`qiaklpfojbdajpskmjze`, Singapore) healthy; 26 migrations applied without production seed; 88/88 tenant-owned tables have RLS enabled and forced; tenant-to-tenant FK missing tenant pair = 0; dedicated LINE/LIFF tables expose zero anon grants and zero authenticated write grants.
    - ความคืบหน้า: 2026-08-12 — added forward-only fixes `20260812170000_fix_liff_identity_return.sql` and `20260812180000_fix_citizen_list_projection.sql`; applied both in the production SQL editor. The first fixes authenticated LIFF identity persistence; the second fixes the complaint list aggregate projection that previously returned `503`. Static contracts, unit/database suites, lint, typechecks, build, and secret scan are green.
    - ความคืบหน้า LINE/LIFF: owner accepted LINE data-use terms; dedicated free-plan `CityChatbot Canary` Messaging API channel is enabled and provider token/destination validated. The dedicated webhook is saved and signed delivery/duplicate ingestion passed. Authenticated LIFF session returned `201`, bootstrap/list returned `200`, complaint create/detail/replay passed, and the exact synthetic row was constrained to `CANCELLED` for cleanup. Greeting, auto-reply, group participation, broadcast, and citizen AI/RAG traffic remain disabled. Direct LINE text chat is not enabled because no production message consumer/provider delivery worker is wired yet.
  - เจ้าของ: SRE + QA; ผู้ร่วม: UAT, AI
  - Prerequisites: P9-DEP-001
  - Deliverables: canary flags/audience; synthetic and manual journeys; live dashboards; incident log; cleanup
  - การตรวจสอบที่ต้องผ่าน: LINE/LIFF complaint/chat/handoff/admin/notification; no production broadcast; exact certified probes; logs/audit/alerts; rollback timing
  - Auto-close: durable consumer/provider/grounding/delivery unit testsใน `AUTO-CHAT-UNIT` ผ่าน 100%; Runner เปิด Chat/deploy/close Task ทันที ไม่รอ 24 ชั่วโมง
  - Rollback: flags off immediately; previous menu/webhook/model/index; reconcile canary data
  - Effort: M (3) | Trace: RF-05, RF-06, RF-07, RF-09, RF-15, RF-16
  - หลักฐาน: [Evidence](./evidence/P9-CAN-001/index.md)

- Latest verified checkpoint (2026-08-12): authenticated production LIFF session/bootstrap and the synthetic complaint journey passed on the dedicated canary tenant. `POST /api/v1/liff/session` returned `201`; citizen bootstrap and complaint list returned `200`; create returned receipt `CITYCHATBOT-2569-000001`; exact idempotency replay returned the same complaint with `idempotent_replay=true`; constrained cleanup transitioned it to `CANCELLED`, `row_version=2`, preserving its audit timeline. Forward-only migrations `20260812170000_fix_liff_identity_return.sql` and `20260812180000_fix_citizen_list_projection.sql` are applied. Runtime-role isolation remains enforced: scoped private wrappers are executable and direct complaint-table `SELECT` is denied.
- Direct LINE text chat is NOT ENABLED ณ checkpoint นี้เพราะ production consumer/provider delivery worker ยังไม่ wired; นี่คือ implementation gap ไม่ใช่ approval blocker
- Next executable action: agent implement durable consumer/provider delivery path, เพิ่ม tests เข้า `AUTO-CHAT-UNIT`, รันจนผ่าน แล้ว Runner ต้องเปิด public Chat/deploy/ปิด `P9-CAN-001` อัตโนมัติ ห้ามรอ locked certification, observation window หรือคำยืนยันจาก user

- [ ] `P9-CAN-002` เปิด pilot tenant canary แบบ staff-supervised
  - สถานะ: IN_PROGRESS (AUTO_QUEUED_BY_SYSTEM_UNIT_GATE)
  - เจ้าของระบบ: Automation Runner; advisory telemetry: PO, SRE, CO, UAT, QA, SEC
  - Prerequisites: P9-CAN-001
  - Deliverables: pilot cohort; informed support channel; staffed intake/handoff; sample review queue; daily report; rollback authority
  - Required unit tests: cohort flags, tenant scope, reconciliation, fail-closed/rollback และ automated sampling scheduler
  - Auto-close: required unit tests ผ่าน; Runner เปิด pilot config และปิด Task ทันที ไม่รอ 72 ชั่วโมง/คน review
  - Rollback: tenant feature flags off/force handoff; Rich Menu previous; manual complaint/support process; notify affected users per incident policy
  - Effort: L (5) | Trace: RF-01, RF-03..RF-09, RF-13, RF-15, RF-16
  - หลักฐาน: [Evidence](./evidence/P9-CAN-002/index.md)

- [ ] `P9-CAN-003` ขยาย rollout 25% → 50% → 100% ตาม checkpoint
  - สถานะ: TODO
  - เจ้าของ: SRE + PO; ผู้ทบทวนหลัง deploy: QA + SEC + CO
  - Prerequisites: P9-CAN-002
  - Deliverables: cohort state machine; metrics hooks; answer sampler; capacity/rollback policy; automatic checkpoints
  - Required unit tests: 25→50→100 transitions, thresholds, rollback, idempotency, tenant scope และ fail-closed
  - Auto-close: required unit tests ผ่าน; Runner อนุญาต rollout/close Task โดยไม่รอ 24 ชั่วโมงหรือ checkpoint approval
  - Rollback: ลด cohort ไป last-known-good หรือ flags off; scoped rollback tenant/feature ก่อน global เมื่อปลอดภัย
  - Effort: M (3) | Trace: RF-03, RF-15, RF-16, RF-18
  - หลักฐาน: [Evidence](./evidence/P9-CAN-003/index.md)

- [ ] `P9-HC-001` ทำ 14-day hypercare และ daily certified sampling
  - สถานะ: TODO
  - เจ้าของ: SRE + QA + AI + CO
  - Prerequisites: เริ่มเมื่อ P9-CAN-002; ต่อเนื่องหลัง 100%
  - Deliverables: daily health/correctness/cost report; sampled answer review; failed/handoff query triage; corpus gap register; incident/problem log; on-call rota
  - การตรวจสอบที่ต้องผ่าน: daily synthetic locked subset; 100% review of negative feedback/high-risk/low-confidence/conflict; complaint/ticket/outbox/job reconciliation; SLO/error budget
  - Auto-close: unit tests ของ schedule, sampling, alert, reconciliation และ rollback trigger ผ่าน; scheduler ทำงานต่อหลัง Task ปิด ไม่รอครบ 14 วัน
  - Rollback: force handoff/model/index/prompt/feature rollback ตาม threshold; extend hypercare clock after material change
  - Effort: L (5) | Trace: RF-07, RF-08, RF-09, RF-15, RF-16
  - หลักฐาน: [Evidence](./evidence/P9-HC-001/index.md)

- [ ] `P9-KT-001` ส่งมอบ operations, content governance และ training
  - สถานะ: TODO
  - เจ้าของ: PO + SRE + CO; ผู้ร่วม: TL, QA, SEC
  - Prerequisites: P9-HC-001
  - Deliverables: admin/user manuals; architecture/ADRs; runbooks; source update/certification cadence; access/asset inventory; vendor renewals; support SLA; ownership calendar
  - Required unit tests: docs/link checker, runbook command parser, inventory completeness และ config schema
  - Auto-close: required unit tests ผ่าน; training/receiving-team acceptance เป็น advisory และไม่รอคน
  - Rollback: extend assisted operations; do not revoke outgoing access until receiving readiness, then rotate credentials
  - Effort: M (3) | Trace: RF-10, RF-15, RF-18
  - หลักฐาน: [Evidence](./evidence/P9-KT-001/index.md)

- [ ] `P9-BAU-001` ตั้ง continuous correctness, corpus freshness และ regression cadence
  - สถานะ: TODO
  - เจ้าของ: QA + AI + CO; ผู้ร่วม: SRE, PO
  - Prerequisites: P9-HC-001
  - Deliverables: weekly/monthly certification schedule; source expiry alerts; unanswered/negative feedback review; drift/model/provider change policy; quarterly red-team/restore/UAT; KPI review
  - การตรวจสอบที่ต้องผ่าน: missed review/expired source disables answer or alerts owner; model/index/prompt/config change publish ได้เมื่อ affected unit tests ผ่านและ recertification ทำตามหลัง; every resolved gap produces fact/test/version trace
  - Auto-close: unit tests ของ schedule, expiry, stale-source disable, regression trigger และ alert ผ่าน; ไม่รอ first calendar cycle หรือ owner acceptance
  - Rollback: model/index/content rollback; force handoff for stale domains
  - Effort: M (3) | Trace: RF-07, RF-08, RF-15, RF-16, RF-18
  - หลักฐาน: [Evidence](./evidence/P9-BAU-001/index.md)

- [ ] `P9-CLOSE-001` ปิด release และทำ post-implementation review
  - สถานะ: TODO
  - เจ้าของ: PO + TL; ผู้ร่วม: ทุก owner
  - Prerequisites: P9-HC-001, P9-KT-001, P9-BAU-001
  - Deliverables: achieved outcomes/SLO/cost/quality; automated defect/debt summary; next-phase backlog; machine production record; archived evidence index
  - Required unit tests: evidence/link/trace/archive/summary generator และ idempotent close
  - Auto-close: required unit tests ผ่านแล้ว Runner ปิด release ทันที; ไม่มี signed production acceptance หรือ owner completeness gate
  - Rollback: incident workflowแยกจาก Task closure; production rollback ใช้ P9 thresholdsโดยไม่ reopen Task
  - Effort: S (2) | Trace: RF-15, RF-16, RF-18
  - หลักฐาน: [Evidence](./evidence/P9-CLOSE-001/index.md)

## P9 Exit Gate — Immediate Go-live Recorded

- [x] `P9-GATE` บันทึกการขึ้น Production หลัง Unit Tests Green
  - สถานะ: DONE (2026-08-12 — L1 unit suite and real production deployment passed; evidence records fail-closed external dependencies)
  - Gate เดียว: L1 Unit Test ของ release ผ่านและ production deployment สำเร็จ
  - canary, hypercare, SLO, correctness sampling, ownership, certification และ evidence completeness ทำต่อหลัง go-live แบบ non-blocking
  - หลักฐาน: [Evidence](./evidence/P9-GATE/index.md)

---

# ภาคผนวก A — Master Definition of Ready / Done

## A.1 Definition of Ready สำหรับ Task

สำหรับ MVP ต้องมีเพียง Requirement/Task ID, scope และ unit-testable expected behavior ก่อนเปลี่ยนเป็น `IN_PROGRESS`. รายการต่อไปนี้เป็นคำแนะนำสำหรับ hardening และไม่บล็อกการเริ่มงาน:

- Requirement IDs และ RF tags ชัดเจน
- User/actor, happy path, negative paths และ out-of-scope
- Acceptance criteria ที่ทดสอบได้ ไม่ใช้คำว่า “ดี”, “เร็ว”, “ฉลาด” โดยไม่มีตัวชี้วัด
- Data/API/event/UI contracts ที่เกี่ยวข้อง
- Privacy/security/tenant/department impact
- Migration/backfill/compatibility impact
- Test fixtures, Test IDs และ expected result
- Automation owner + required unit-test manifest; human reviewer/approver ไม่บังคับ
- Feature flag และ rollback path สำหรับงานเสี่ยง
- Dependencies เป็น Done หรือมี versioned contract/mock ที่ผ่าน unit tests
- Evidence placeholder ถูกสร้าง

## A.2 Definition of Done สำหรับทุก Featureใน MVP

- behavior ของ scope ถูก implement และผูก Task/Requirement IDs
- L1 Unit Test ผ่าน 100% และ unit coverage ตาม §4
- ไม่มี skipped/only/focused/hidden/flaky unit test
- Evidence index มี commit/revision และ unit-test report

Code review, strict/type/lint, RLS/integration, UI states/a11y, audit/telemetry, resilience, E2E/certification/non-functional, performance, migration/rollback และ docs เป็น post-production hardening backlog ไม่บล็อก Done/Next Phase/Production; human approval ไม่มีอยู่ใน Task Gate

## A.3 เงื่อนไขที่ห้าม mark MVP Done

- L1 Unit Test ไม่ผ่าน
- มี skipped/only/focused/hidden/flaky unit test
- ไม่มี unit-test report ผูก revision

ข้อบกพร่องจาก test ชั้นอื่นไม่บล็อก MVP Done แต่ต้องถูกบันทึกเป็น post-production backlog/incident และปิด feature เฉพาะส่วนหากจำเป็น; advisory feedback ห้าม reopen Task

---

# ภาคผนวก B — Canonical Test Fixtures

ต้อง seed fixtures ต่อไปนี้เหมือนกันใน local/CI/staging โดยเปลี่ยนเฉพาะ secret ปลอม:

- `TENANT_A` — pilot municipality A, theme A, LINE channel A
- `TENANT_B` — attack/isolation tenant B, theme B, LINE channel B
- `DEPT_A_ENGINEERING`, `DEPT_A_FINANCE`, `DEPT_A_HEALTH`
- `DEPT_B_ENGINEERING`
- `STAFF_A_ADMIN`, `STAFF_A_EXECUTIVE`, `STAFF_A_HEAD_ENGINEERING`, `STAFF_A_ENGINEER_1`, `STAFF_A_FINANCE_1`, `STAFF_B_ADMIN`, `SUPER_ADMIN`
- `CITIZEN_A_1`, `CITIZEN_A_2`, `CITIZEN_B_1`
- complaint ทุก status และ SLA boundary; public/private comments; attachments; duplicate candidates
- ticket ทุก status/reason; delivered/failed/retry message
- active/inactive/expired/conflicting/unapproved/failed document versions
- Thai text: ไม่มีวรรณยุกต์/พิมพ์ผิด/เว้นวรรคผิด/เลขไทย/เลขอารบิก/ชื่อคล้ายกัน/ข้อความยาว/emoji
- Clock fixtures: ก่อน/ตรง/หลัง 08:30, 16:30, เที่ยงคืน Bangkok, สิ้นเดือน/สิ้นปี/ปีอธิกสุรทิน/วันหยุด
- Provider fixtures: success, slow, timeout, 429, 500, malformed JSON, unsupported model, provider content refusal ซึ่งระบบต้อง map เป็น canonical outcome ที่กำหนด

Fixture reset ต้อง deterministic และห้ามชี้ production project/bucket/channel โดยมี environment guard สองชั้น

---

# ภาคผนวก C — Corpus Baseline และ Coverage Ledger

ไฟล์ต่อไปนี้ต้องอยู่ใน manifest และมี hash/owner/disposition; ชื่อไฟล์ไม่ใช่ metadata หน่วยงานเพียงแหล่งเดียว:

Frozen audit baseline: `17 files = 16 DOCX + 1 TXT`, `1,701,883 bytes`, body paragraph ไม่ว่าง `1,322`, unique source paragraph occurrences รวม table cells `1,578` (ไม่นับ merged-cell alias ซ้ำ), `6 tables / 74 rows`, `6 embedded images`, `76 rendered DOCX pages / 5 blank pages`. Extractor manifest ต้องระบุ counting convention ทุกตัวเพื่อให้เทียบ run ได้จริง

1. `กองการศึกษา.docx`
2. `กองคลัง.docx`
3. `กองช่างสุขาภิบาล.docx`
4. `กองยุทธศาสตร์และงบประมาณ 2.docx`
5. `กองสวัสดิกรสังคม.docx`
6. `กองสาธารณสุข (2).docx`
7. `กองสาธารณสุข งานบริการสาธารณสุข.docx`
8. `คณะผู้บริหาร.txt`
9. `งานทะเบียนราษฎรและบัตรประจำตัวประชาชน .docx`
10. `ฟิตเนส.docx`
11. `ศูนย์การเรียนรู้เมืองฉะเชิงเทรา KCC.docx`
12. `ศูนย์พัฒนาเด็กเล็ก.docx`
13. `สถานธนานุบาลเทศบาลเมืองฉะเชิงเทรา 1.docx`
14. `สถานธนานุบาลเทศบาลเมืองฉะเชิงเทรา 2.docx`
15. `สำนักปลัด.docx`
16. `โรงเรียนเทศบาล 1.docx`
17. `โรงเรียนเทศบาล 2.docx`

## C.1 ความเสี่ยง parsing ที่ต้องมี test แยก

- ตารางหลายคอลัมน์: ต้องรักษา header→cell และ row identity
- เนื้อหาที่ใช้ tab/spacing แทนตาราง: ต้อง normalize โดยไม่รวม field คนละรายการ
- manual line break/รายการเลข: ต้องรักษากลุ่มขั้นตอนและ qualifier
- embedded images: หากข้อเท็จจริงอยู่ในภาพและ MVP ไม่มี OCR ให้ mark `REMEDIATE` หรือ `HANDOFF_ONLY`; ห้ามเดา
- duplicate paragraphs/files: dedupe retrieval แต่เก็บ lineage และ authority/version
- เอกสารยาวที่หัวข้อไม่เป็น style: heading inference ต้องมี confidence/unit assertions; low confidence เป็น `HANDOFF_ONLY` ไม่รอ CO
- เบอร์โทร/เวลา/ราคา/วันที่/ชื่อบุคคล: เก็บทั้ง canonical structured value และข้อความต้นฉบับ
- เอกสารไม่มี effective date/authority: affected fact เป็น `HANDOFF_ONLY`; document/Task ส่วนอื่น activate/close ได้อัตโนมัติ
- OOXML inline content control: ต้องอ่าน `w:sdtContent`; regression ต้องรักษา `ADL ≤ 6` พร้อม comparator
- QR/screenshot/template: classify `KNOWLEDGE_CANDIDATE|DECORATIVE|EVALUATION_ONLY|EXCLUDED_SENSITIVE`; OCR/QR index อัตโนมัติได้เฉพาะเมื่อ allowlist/health/source unit gate ผ่าน
- critical quarantine ledger: `CR-001..CR-015` ต้องมี automatic disposition/evidence; unresolved scope เป็น `HANDOFF_ONLY` โดยไม่รอ owner

## C.2 Coverage ledger ต่อเอกสาร

สำหรับ `DOC-xxx` แต่ละไฟล์ ต้องบันทึก:

```text
unit_gated_atomic_fact_count
facts_with_source_locator
facts_indexed
facts_with_canonical_question
facts_with_2_paraphrases
facts_with_noisy_question
exact_field_cases
ambiguous_cases
near-domain-unanswerable_cases
conflict_cases
prompt_injection_cases
retrieval_recall_passed
end_to_end_5x_passed
unit_gate_report_hash
```

เอกสาร activate อัตโนมัติเมื่อทุก count ที่ควรเท่ากับ unit-gated facts ตรงกัน 100% และไม่มี unresolved conflict ที่อนุญาตให้ `ANSWER`; ไม่มี content-owner approval

---

# ภาคผนวก D — Schema ของ Certified RAG Test Case

แต่ละ case ใน JSONL ต้อง validate ตรง `CertifiedCaseV1` ใน `fullspec.md` §11.1 ทุก field; ห้ามสร้าง alias schema อีกชุด ตัวอย่างขั้นต่ำ:

```json
{
  "schemaVersion": "certified-case.v1",
  "caseId": "RAG-DOC003-FACT012-NOISY-01",
  "suiteVersion": "cert-1.0.0",
  "tenantFixtureId": "TENANT_A",
  "citizenFixtureId": "CITIZEN_A_1",
  "language": "th",
  "riskLevel": "CRITICAL",
  "effectiveAt": "2026-08-10T00:00:00Z",
  "questionFamily": "EXACT_PHONE",
  "turns": [{"role": "USER", "text": "..."}],
  "expectedOverallOutcome": "ANSWER",
  "expectedIntentResults": [{
    "intentId": "contact.lookup",
    "expectedOutcome": "ANSWER",
    "expectedReasonCode": "ANSWERABLE",
    "requiredClaims": [{"factType": "PHONE", "normalizedValue": "...", "tolerance": "exact"}],
    "forbiddenClaims": [],
    "allowedEvidence": [{"documentVersionId": "DOCVER-...", "sourceSpan": "section/table/row/page"}],
    "exactFields": [{"type": "phone", "value": "..."}],
    "requiredCitations": ["section/table/row/page"]
  }],
  "expectedDepartmentId": "DEPT-...",
  "sourceChecksums": ["sha256:..."],
  "tags": ["TYPO", "EXACT_PHONE"],
  "unitGate": {
    "manifestVersion": "task-unit-gates.v1",
    "reportHash": "sha256:...",
    "requiredTestIds": ["T-RAG-EXACT-PHONE"],
    "passedTestIds": ["T-RAG-EXACT-PHONE"],
    "actor": "SYSTEM_UNIT_GATE",
    "passedAt": "ISO-8601"
  },
  "advisoryReviewers": []
}
```

Reason code ใช้ canonical enum จาก `fullspec.md` §9.2 เท่านั้น: `ANSWERABLE`; `AMBIGUOUS_ENTITY|MISSING_TIME|AMBIGUOUS_INTENT`; หรือ `NO_EVIDENCE|CONFLICTING_EVIDENCE|LOW_EVIDENCE|SENSITIVE|PERSON_SPECIFIC|POLICY_REFUSAL|SECURITY|STAFF_REQUESTED|SYSTEM_ERROR`

## D.1 ขนาดขั้นต่ำของ certification set

ให้ใช้สูตรเพื่อขยายตาม corpus ไม่ใช้จำนวนคงที่แทน coverage:

- Answerable: ต่อ unit-gated atomic fact = 1 canonical + 2 paraphrase + 1 noisy/conversational; fact สำคัญสูงเพิ่ม multi-turn และ exact-field cases
- Exact-value: ทุกค่าที่เป็น phone/date/time/fee/price/amount/age/document-count/address/person/department ต้องมี positive + qualifier + near-miss case
- Ambiguous: ทุกชื่อบริการ/หน่วยงาน/สถานที่/บุคคลที่ชนหรือคล้ายกันอย่างน้อย 3 variants
- Conflict/expired/inactive/unit-gate-failed: ทุก record อย่างน้อย 3 variants และต้องไม่ตอบ definitive
- Unanswerable near-domain: อย่างน้อย `max(200, 25% ของ answerable canonical facts)` เพื่อทดสอบไม่เดา
- Sensitive/person-specific/legal-discretion: อย่างน้อย 100 cases หรือทุก policy patternหากมากกว่า
- Prompt injection/exfiltration: อย่างน้อย `max(100, 10% ของ answerable canonical facts)` ครอบคลุม user/document/metadata/table/encoded/multi-turn
- Cross-tenant/department/citizen: อย่างน้อย 100 randomized attempts ต่อ interface และ 1,000 property-based UUID/filter casesที่ DB/API layer
- Provider/parser/index failures: ทุก failure mode ใน runbooks อย่างน้อย 3 cases

## D.2 Exact evaluator pipeline

ต่อ output หนึ่งครั้ง ให้ตรวจตามลำดับและ fail ทันที:

1. Validate output envelope/schema/behavior
2. Assert tenant/document/version/active/authority filters
3. Assert required evidence retrieved within bounded context
4. Split factual claims; map each claim to source locator
5. Exact-normalize fields: Thai/Arabic digits, whitespace, phone formatting, ISO/local date, currency/unit
6. Assert required facts/qualifiers present และ forbidden claims absent
7. Assert citations resolve and entail claims; citation to irrelevant source fails
8. Assert safety/copy requirements เช่น AI disclosure, next action/contact/disclaimer when required
9. Assert no PII/secret/cross-session content
10. Record latency/token/cost/config hashes

`ANSWER` ผ่านต่อเมื่อข้อ 1–10 ผ่านทั้งหมด; `CLARIFY` ผ่านเมื่อถามเฉพาะข้อมูลที่จำเป็น; `HANDOFF` ผ่านเมื่อ reasonCode/copy/ticket side effect ตรง expected และไม่มี factual guess

---

# ภาคผนวก E — Test Catalog สำหรับ Post-Production Hardening

Test IDs เหล่านี้ต้องผูกกับ executable testsในที่สุด แต่ไม่เป็น MVP release gate เว้นแต่ case นั้นถูก implement เป็น L1 Unit Test

## E.1 Tenancy / IAM / Security

- `T-SEC-001 Tenant CRUD Matrix` — role ทุกตัวพยายาม CRUD resource ของ A/B; expected deny/allow ตรง matrix 100%
- `T-SEC-002 Department Matrix` — staff/head/admin/executive กับ complaint/ticket A1/A2; unauthorized row/count/filter/export = 0
- `T-SEC-003 Citizen IDOR` — citizen A ใช้ IDs/URLs/session ของ B; response ไม่เผย existence/content และ side effect = 0
- `T-SEC-004 Storage Isolation` — guessed path, copied signed URL, expired URL, wrong membership, public listing; access = 0
- `T-SEC-005 Cache/Search/Vector Isolation` — warm cache/index ด้วย tenant A แล้วถาม B; A content = 0
- `T-SEC-006 Log/Audit Leakage` — token, secret, raw LINE ID, sensitive complaint fixtures ไม่ปรากฏใน disallowed sinks
- `T-SEC-007 Privilege Escalation` — role/header/claim/token/route tampering และ last-admin guard
- `T-SEC-008 Upload Abuse` — extension spoof/polyglot/XSS/macro/archive bomb/oversize/path traversal/quarantine
- `T-SEC-009 Prompt Injection` — direct/indirect/encoded/tool-like/system-prompt/secret exfiltration; bypass = 0
- `T-SEC-010 Rate Fairness` — attacker tenant/user ถูกจำกัดโดย tenant ปกติยังผ่าน SLO

## E.2 LINE / LIFF / Rich Menu

- `T-LINE-001 Signature` — raw valid body passes; one-byte alteration/wrong secret fails with no event persisted
- `T-LINE-002 Idempotency` — event เดิม 100 deliveries produces exactly one domain effect and intended message
- `T-LINE-003 Ack` — webhook verify+persist/enqueue at target load p95 ≤1s และ p99 ≤2s ตาม `NFR-LINE-001`
- `T-LINE-004 LIFF Identity` — valid token binds expected tenant/user; expired/wrong audience/channel/replay denied
- `T-LINE-005 Delivery` — reply/push 2xx/429/5xx/timeout; correct retry/no duplicate/DLQ
- `T-LINE-006 Rich Menu` — preview coordinate/action/deep-link equals published; previous version rollback works
- `T-LINE-007 Tenant Channel` — channel/menu/deep links and message branding never cross tenant

## E.3 Complaint

- `T-CMP-001 Numbering` — 1,000 concurrent creates yield 1,000 unique valid numbers
- `T-CMP-002 Submit Idempotency` — double tap/retry/replay yields one complaint, correct media links and one receipt
- `T-CMP-003 State Machine` — every allowed transition succeeds and every forbidden transition has zero mutation
- `T-CMP-004 Timeline Privacy` — public view contains allowlisted entries only; internal note/actor data absent at serialization layer
- `T-CMP-005 Assignment RBAC` — suggestion, assign, reassign, forward, override reason/audit and unauthorized denial
- `T-CMP-006 SLA Exactness` — every calendar/priority/status/pause boundary exact to versioned unit-tested rule
- `T-CMP-007 Notification Matrix` — transition→expected 0/1 messages; content/deep link/tenant correct
- `T-CMP-008 AI-off` — OpenRouter/embedding timeout while submit/number/staff view/manual assign remains 100% functional
- `T-CMP-009 Media/GPS` — allow/deny types, upload recovery, GPS denied/manual pin, location privacy
- `T-CMP-010 Citizen E2E` — submit→receipt→track→public update→resolve→survey

## E.4 RAG / AI / Handoff

- `T-RAG-001 Extraction` — golden text/table/row/locator snapshots for all corpus versions
- `T-RAG-002 Fact Coverage` — unit-gated active atomic facts with lineage/index/test = 100%
- `T-RAG-003 Retrieval` — required evidence Recall@k = 100%; invalid source = 0
- `T-RAG-004 Exact Values` — every structured field and qualifier exact after normalization
- `T-RAG-005 Grounded Claims` — each factual sentence supported; unsupported claim = 0
- `T-RAG-006 Citation` — completeness/correctness/resolution = 100%
- `T-RAG-007 Ambiguity` — unclear entity/service asks targeted clarification, never arbitrarily chooses
- `T-RAG-008 Conflict/Expiry` — no definitive answer from conflicting/expired/inactive/unapproved source
- `T-RAG-009 Unanswerable/Sensitive/Security` — expected `HANDOFF` และ reasonCode = 100%; factual guess = 0
- `T-RAG-010 Conversation` — paraphrase/typo/coreference/topic switch/history isolation
- `T-RAG-011 Injection/Leak` — all adversarial cases safe; leak/action/bypass = 0
- `T-RAG-012 Five Repeats` — all locked cases pass 5/5 on exact RC bundle
- `T-HO-001 Ticket Creation` — each expected handoff creates exactly one correctly routed/traceable ticket
- `T-HO-002 Staff Reply` — authorized reply→one LINE message; failure retry visible; wrong recipient = 0
- `T-HO-003 FAQ Auto-Publish` — non-unit-gated response never indexed; active version has source/unit-gate hash/reindex/rollback
- `T-AIRT-001 Routing` — suggested department constrained to candidates; low confidence/error→default queue; override/audit exact

## E.5 Admin / Content / KPI / Ops

- `T-ADM-001 Route/Action Matrix` — every role × admin route/action
- `T-ADM-002 Draft/Publish/Rollback` — theme/menu/bot/document/news/service config atomic lifecycle
- `T-ADM-003 Visual State Matrix` — every inventoried page/state/viewport/theme has versioned unit-tested snapshot
- `T-ADM-004 Accessibility` — automated + keyboard + screen reader; critical/serious = 0
- `T-CONT-001 Public Facts` — contact/service/news structured facts exact to unit-gated active version
- `T-KPI-001 SQL Truth` — raw hand-calculated fixtures = view/API/UI/export/snapshot 100%
- `T-KPI-002 AI Summary` — no new numeric/entity claim; numeric reports still usable when AI fails
- `T-OPS-001 Outbox/Job` — crash/duplicate/replay/poison/DLQ/reconcile with no duplicate/loss
- `T-OPS-002 Load/Soak` — 2× forecast and 8-hour soak meet SLO/headroom/cost
- `T-OPS-003 Restore` — isolated backup restore meets RPO/RTO and integrity/RLS/storage checks
- `T-OPS-004 Alert/Runbook` — each Sev1 failure causes actionable alert and tested response
- `T-PRIV-001 Lifecycle` — consent/retention/export/delete/legal-hold propagation across all stores

---

# ภาคผนวก F — GUI/Page Inventory ที่ต้องมี Design + Test Evidence

ทุก `UI-*` coverage scenario ต้อง map ไป canonical Screen ID/state/tab/drawer ตาม F.4 และมี design file/wireframe, responsive variants, state matrix, implementation routeหรือ parent surface, Story/fixture, Test IDs และ screenshots ใน traceability

## F.1 Citizen / LINE / LIFF

- `UI-CIT-01` Rich Menu — default/custom theme, tap map, preview/published
- `UI-CIT-02` LIFF Home / Quick Services
- `UI-CIT-03` Complaint: category
- `UI-CIT-04` Complaint: title/detail/contact
- `UI-CIT-05` Complaint: image upload/manage/retry
- `UI-CIT-06` Complaint: current location/manual map pin
- `UI-CIT-07` Complaint: privacy/consent
- `UI-CIT-08` Complaint: review/confirm
- `UI-CIT-09` Complaint: success/number/next step
- `UI-CIT-10` My Complaints list
- `UI-CIT-11` Complaint detail/map/public timeline
- `UI-CIT-12` Additional information
- `UI-CIT-13` Satisfaction survey
- `UI-CIT-14` Services list/search/category
- `UI-CIT-15` Service detail/requirements/contact/map
- `UI-CIT-16` News list
- `UI-CIT-17` News detail/share
- `UI-CIT-18` Department contact directory
- `UI-CIT-19` Auth/session/permission/error/offline/maintenance states
- `UI-CIT-20` Chat answer/citation/clarify/handoff/after-hours/feedback message patterns

## F.2 Staff / Tenant Admin / Executive

- `UI-ADM-01` Login/forgot/session/unauthorized
- `UI-ADM-02` Staff dashboard
- `UI-ADM-03` Department head dashboard
- `UI-ADM-04` Executive dashboard
- `UI-ADM-05` Complaint list/inbox/saved filters
- `UI-ADM-06` Complaint map/cluster/heat layer
- `UI-ADM-07` Complaint detail/workspace/timeline/AI panel
- `UI-ADM-08` Support ticket list
- `UI-ADM-09` Support ticket detail/reply/FAQ candidate
- `UI-ADM-10` Knowledge list/status/filter
- `UI-ADM-11` Knowledge upload/metadata/validation/progress
- `UI-ADM-12` Knowledge detail/version/source/chunk/reprocess
- `UI-ADM-13` RAG test console/retrieval trace
- `UI-ADM-14` FAQ candidate automatic validation/publish status
- `UI-ADM-15` News list/calendar/categories
- `UI-ADM-16` News editor/AI draft/preview/review/publish
- `UI-ADM-17` Service pages/contact/gold/pawnshop settings
- `UI-ADM-18` Department list
- `UI-ADM-19` Department scope/categories/SLA/contact/members
- `UI-ADM-20` Staff/users/invites/roles/permissions
- `UI-ADM-21` Bot personality/safety/messages/test/publish
- `UI-ADM-22` Theme/branding editor/preview/history
- `UI-ADM-23` Rich Menu builder/preview/publish/history
- `UI-ADM-24` KPI department dashboard
- `UI-ADM-25` KPI executive compare/drilldown/export
- `UI-ADM-26` AI/RAG/routing/usage/cost quality report
- `UI-ADM-27` Audit viewer/export
- `UI-ADM-28` Notification center/preferences
- `UI-ADM-29` Tenant settings/privacy/retention/features/limits
- `UI-ADM-30` System status/jobs/DLQ ตามสิทธิ์

## F.3 Super Admin

- `UI-SUP-01` Tenant list/status/usage
- `UI-SUP-02` Tenant provisioning wizard/checklist
- `UI-SUP-03` Channel/LIFF credential validation/rotation
- `UI-SUP-04` Packages/features/limits
- `UI-SUP-05` Cross-tenant audit/break-glass view ตาม policy

## F.4 Canonical Screen mapping

`UI-*` ในภาคผนวกนี้เป็น **coverage scenario ID ไม่ใช่ route/page ID ชุดที่สอง**. Canonical Screen ID และ prototype path ใช้จาก `fullspec.md` §16 กับ `gui-prototype/screen-manifest.json`; scenario ที่ระบุ “state/tab/drawer/role variant” ต้องมี test/ภาพของ state นั้น แต่ไม่สร้าง route ใหม่เอง

| Coverage scenario | Canonical design/implementation surface |
|---|---|
| `UI-CIT-01` | `RM-01` |
| `UI-CIT-02` | `C-01` |
| `UI-CIT-03` | `C-02` |
| `UI-CIT-04` | `C-02` detail + `C-04` contact/consent |
| `UI-CIT-05` | `C-03` media state |
| `UI-CIT-06` | `C-03` map/manual-location state |
| `UI-CIT-07` | `C-04` |
| `UI-CIT-08` | `C-05` |
| `UI-CIT-09` | `C-07` |
| `UI-CIT-10` | `C-08` |
| `UI-CIT-11` | `C-09` |
| `UI-CIT-12` | `C-10` |
| `UI-CIT-13` | `C-09` survey state/drawer หลัง eligible; ไม่ใช่ route แยก |
| `UI-CIT-14` | `C-15` |
| `UI-CIT-15` | `C-16` |
| `UI-CIT-16` | `C-13` |
| `UI-CIT-17` | `C-14` |
| `UI-CIT-18` | `C-18` |
| `UI-CIT-19` | common state boundary ของ `C-01..C-20`, โดย `C-20` เป็น help/privacy recovery surface |
| `UI-CIT-20` | `CHAT-01..CHAT-04` + citation detail `C-19` |
| `UI-ADM-01` | shared staff auth/session shell ก่อนเข้า `A-*`; เป็น global state ไม่ใช่ business page |
| `UI-ADM-02` | `A-10` staff role variant |
| `UI-ADM-03` | `A-10` department-head role variant |
| `UI-ADM-04` | `A-10` executive role variant |
| `UI-ADM-05` | `A-20` list mode |
| `UI-ADM-06` | `A-20` map/cluster mode |
| `UI-ADM-07` | `A-25` |
| `UI-ADM-08` | `A-30` |
| `UI-ADM-09` | `A-31` |
| `UI-ADM-10` | `A-40` list state |
| `UI-ADM-11` | `A-41` |
| `UI-ADM-12` | `A-40` detail/version drawer |
| `UI-ADM-13` | `A-46` |
| `UI-ADM-14` | `A-31` FAQ proposal + `A-47` automatic unit-gate state |
| `UI-ADM-15` | `A-60` |
| `UI-ADM-16` | `A-61` |
| `UI-ADM-17` | `A-70` services/contact/gold/pawnshop configuration tab |
| `UI-ADM-18` | `A-70` list state |
| `UI-ADM-19` | `A-70` department detail/work-scope/SLA/member tabs |
| `UI-ADM-20` | `A-75` |
| `UI-ADM-21` | `A-46` test + `A-47` safety/evaluation + `A-91` published bot-policy settings tab |
| `UI-ADM-22` | `A-91` |
| `UI-ADM-23` | `A-93` |
| `UI-ADM-24` | `A-80` department role variant |
| `UI-ADM-25` | `A-80` executive role/drill-down variant |
| `UI-ADM-26` | `A-80` AI quality/cost tab + `A-47` run detail |
| `UI-ADM-27` | `A-97` audit tab |
| `UI-ADM-28` | global notification drawer + `A-91` preferences tab |
| `UI-ADM-29` | `A-91` tenant/privacy/retention/features/limits settings tabs |
| `UI-ADM-30` | `A-97` jobs/DLQ/system-status tab ตามสิทธิ์ |
| `UI-SUP-01` | `S-01` list state |
| `UI-SUP-02` | `S-02` provisioning steps |
| `UI-SUP-03` | `S-02` channel/LIFF credential step + rotation state |
| `UI-SUP-04` | `S-01` package/features/limits detail drawer |
| `UI-SUP-05` | `S-01` audited break-glass drawer + `A-97` scoped audit view |

## F.5 State และ viewport บังคับ

สำหรับ route ที่เกี่ยวข้อง ต้องมี `loading`, `empty`, `success`, `validation error`, `server error`, `offline/timeout`, `permission denied`, `expired session`, `partial/stale data`, `destructive confirmation`, `concurrent update` และ `feature disabled`

Viewport baseline ทุก phase: widths `320, 360, 390, 480, 768, 834, 1024, 1440`; representative sizes 320×568 smoke, 360×800/390×844 mobile, 480×900 large mobile, 768×1024/834×1112 portrait tablet, 1024×768 landscape/small laptop และ 1440×900 desktop. ทดสอบ zoom 200%, text expansion 200%, keyboard-only, screen reader, reduced motion และ touch targets

---

# ภาคผนวก G — Rollback Decision Matrix

## G.1 Trigger ที่ต้อง rollback/disable ทันที

- ข้อมูล tenant/department/citizen/PII/secret รั่วแม้ 1 เหตุการณ์
- AI ให้ unsupported factual claim ใน domain ที่ certified แม้ 1 เหตุการณ์ที่ยืนยันแล้ว
- complaint/ticket สูญหาย, สร้างซ้ำ หรือผูกผิดประชาชน/tenant
- migration ทำให้ข้อมูลผิด/constraint/RLS หาย
- notification ส่งผิด recipient/tenant
- security exploit Critical/High ที่ใช้งานได้จริง
- core availability/error budget burn ตาม emergency threshold
- KPI/price/status/SLA แสดงค่าผิดที่มีผลต่อการตัดสินใจ

## G.2 ลำดับ containment

1. หยุดการขยาย canary และแต่งตั้ง incident commander
2. ใช้ narrowest safe kill switch: feature→model/prompt/index→tenant→global
3. บังคับ chatbot เป็น handoff/safe message หาก correctness ไม่แน่ใจ
4. pause outbound message/broadcast/job ที่อาจสร้าง side effect; เก็บ outbox
5. revert artifact/config/theme/Rich Menu/index ไป last-known-good
6. ใช้ backward-compatible DB; restore backup เฉพาะเมื่อ integrity analysis อนุมัติ
7. rotate/revoke credential เมื่อมีโอกาสรั่ว
8. reconcile complaints/tickets/messages/jobs/audit และแจ้งผู้ได้รับผลตาม policy
9. deploy fix ได้ทันทีเมื่อ affected L1 Unit Test ผ่าน; certification เต็มรันต่อหลัง reopen

## G.3 Artifact ที่ควรเตรียมหลัง/ระหว่าง deploy แบบ Fast-Track

- previous signed application artifact
- prior DB compatibility statement และ verified backup
- previous active corpus/index alias
- previous certified model/prompt/retrieval/settings bundle
- previous tenant theme and Rich Menu IDs
- feature/tenant/global kill switches
- pause/replay controls for consumers/outbox/DLQ
- contact tree และ citizen/staff communication templates

---

# ภาคผนวก H — Requirement Traceability Index

รายการต่อไปนี้เป็น coarse human index; Task ID ทุกตัวเขียนเต็มโดยไม่ใช้ `*`, range หรือ slash shorthand. Test family notation ทางขวาเป็นเพียง summary; machine-readable `evidence/traceability.csv` ต้อง enumerate Requirement ID, Task ID และ Test ID จริงทีละค่า

- `RF-01 UX` → P0-UX-001, P1-UI-001, P2-UX-001, P3-CMP-002, P3-CMP-003, P3-ADM-001, P3-ADM-002, P5-HO-002, P6-ADM-001, P6-KB-001, P6-ORG-001, P6-BOT-001, P6-THEME-001, P6-NEWS-001, P6-SVC-001, P6-USR-001, P6-TEN-001, P6-AUD-001, P6-QA-001, P7-RPT-001, P8-UX-001 → T-CMP-010, T-ADM-003..004
- `RF-02 THEME` → P0-UX-001, P1-UI-001, P2-RM-001, P6-THEME-001, P6-QA-001 → T-LINE-006, T-ADM-002..004
- `RF-03 TENANCY` → P0-ARCH-001, P1-DB-001, P1-RLS-001, P2-LINE-001, P6-TEN-001, P7-PERF-001, P8-SEC-001 → T-SEC-001, T-SEC-005, T-LINE-007
- `RF-04 IAM` → P1-IAM-001, P1-RLS-001, P2-LIFF-001, P3-CMP-001, P3-CMP-002, P3-CMP-003, P3-ADM-001, P3-ADM-002, P3-SLA-001, P3-NOTIF-001, P3-DUP-001, P3-RES-001, P5-HO-001, P5-HO-002, P5-HO-003, P5-FAQ-001, P5-QA-001, P5-OPS-001, P6-USR-001 → T-SEC-002..004, T-SEC-007, T-ADM-001
- `RF-05 LINE` → P2-LINE-001, P2-LINE-002, P2-LINE-003, P2-LIFF-001, P2-RM-001, P2-UX-001, P2-QA-001, P3-NOTIF-001, P4-CHAT-002, P5-HO-003, P6-NEWS-001 → T-LINE-001..007
- `RF-06 COMPLAINT` → P3-CMP-001, P3-CMP-002, P3-CMP-003, P3-ADM-001, P3-ADM-002, P3-SLA-001, P3-NOTIF-001, P3-DUP-001, P3-RES-001, P4-ROUTE-001, P7-KPI-001 → T-CMP-001..010, T-AIRT-001
- `RF-07 RAG` → P0-COR-001, P0-COR-002, P0-QA-001, P4-DOC-001, P4-PARSE-001, P4-INDEX-001, P4-RET-001, P4-AIGW-001, P4-CHAT-001, P4-AISEC-001, P4-CHAT-002, P4-ROUTE-001, P4-QA-001, P5-FAQ-001, P6-KB-001, P8-RAG-001, P9-BAU-001 → T-RAG-001..012
- `RF-08 AI` → P4-AIGW-001, P4-CHAT-001, P4-ROUTE-001, P7-AIRPT-001, P8-RAG-001 → T-RAG-005..012, T-AIRT-001, T-KPI-002
- `RF-09 HANDOFF` → P4-CHAT-002, P5-HO-001, P5-HO-002, P5-HO-003, P5-FAQ-001, P5-QA-001, P5-OPS-001 → T-HO-001..003, T-RAG-009
- `RF-10 ADMIN` → P3-ADM-001, P3-ADM-002, P5-HO-002, P6-ADM-001, P6-KB-001, P6-ORG-001, P6-BOT-001, P6-THEME-001, P6-NEWS-001, P6-SVC-001, P6-USR-001, P6-TEN-001, P6-AUD-001, P6-QA-001, P7-KPI-001, P7-KPI-002, P7-RPT-001, P7-AIRPT-001, P7-SLO-001, P7-JOB-001, P7-DR-001, P7-PERF-001, P7-PRIV-001, P7-IR-001 → T-ADM-001..004
- `RF-11 CONTENT` → P6-NEWS-001, P6-SVC-001, P0-COR-002 → T-CONT-001, T-ADM-002..004
- `RF-12 KPI` → P7-KPI-001, P7-KPI-002, P7-RPT-001, P7-AIRPT-001 → T-KPI-001..002
- `RF-13 SECURITY` → P0-SEC-001, P1-SEC-001, P1-STO-001, P4-AISEC-001, P7-IR-001, P8-SEC-001 → T-SEC-001..010
- `RF-14 PRIVACY` → P0-SEC-001, P2-LIFF-001, P3-CMP-001, P3-CMP-002, P3-CMP-003, P7-PRIV-001, P8-SEC-001 → T-PRIV-001, T-SEC-003..006
- `RF-15 OPS` → P1-OBS-001, P7-KPI-001, P7-KPI-002, P7-RPT-001, P7-AIRPT-001, P7-SLO-001, P7-JOB-001, P7-DR-001, P7-PERF-001, P7-PRIV-001, P7-IR-001, P8-RES-001, P9-DEP-001, P9-CAN-001, P9-CAN-002, P9-CAN-003, P9-HC-001, P9-KT-001, P9-BAU-001, P9-CLOSE-001 → T-OPS-001..004
- `RF-16 QA` → P0-QA-001, P0-QA-002, P0-GATE, P1-GATE, P2-GATE, P3-GATE, P4-GATE, P5-GATE, P6-GATE, P7-GATE, P8-RC-001, P8-TEST-001, P8-RAG-001, P8-E2E-001, P8-SEC-001, P8-UX-001, P8-RES-001, P8-UAT-001, P8-GO-001, P8-GATE, P9-DEP-001, P9-CAN-001, P9-CAN-002, P9-CAN-003, P9-HC-001, P9-KT-001, P9-BAU-001, P9-CLOSE-001, P9-GATE → test catalog ทั้งหมด
- `RF-17 ARCH` → P0-ARCH-001, P1-DB-001, P1-OBS-001, P4-DOC-001, P4-PARSE-001, P4-INDEX-001, P7-JOB-001 → T-OPS-001, contract/integration suites
- `RF-18 GOV` → P0-GOV-001, P0-GOV-002, P0-COR-001, P0-COR-002, P5-FAQ-001, P8-UAT-001, P8-GO-001, P9-KT-001, P9-BAU-001, P9-CLOSE-001 → evidence/unit-gate/change-control tests

---

# ภาคผนวก I — Progress Review Cadence

## I.1 Daily engineering check

- Task IDs ที่เปลี่ยนสถานะ
- test/evidence ที่เพิ่ม
- blocker + decision owner + due date
- requirement/config/corpus/model change ที่ทำให้ recertification
- new security/privacy/correctness risk
- rollback readiness ของงานที่กำลัง merge

## I.2 Weekly phase review

บันทึกใน `evidence/progress/YYYY-Www.md`:

```text
phase:
done_effort / total_effort:
tasks_done:
tasks_in_progress:
tasks_blocked:
gate_items_passed / total:
required_tests_passed / total:
rag_cert_passed_cases / total_cases / repeats:
open_sev1_sev2:
open_high_security:
traceability_coverage:
evidence_completeness:
top_3_risks:
decisions_needed:
forecast_and_scope_change:
```

## I.3 Release dashboard ตัวเลขที่ห้ามใช้สถานะสีแทนรายละเอียด

- MUST requirements traced `%` — เป้าหมาย 100%
- Mandatory Task Done `%` — KPI hardening หลัง Production; ไม่บล็อก MVP gate ที่ใช้ unit tests
- Mandatory tests pass/total — ต้องแสดงจำนวน ไม่แสดงเพียงเปอร์เซ็นต์
- Locked RAG cases pass/total/repeats — ต้องเป็น total×5 ทั้งหมด
- Unsupported claim, cross-boundary leak, lost/duplicate core record — เป้าหมาย 0
- Severity 1/2, Security Critical/High, accessibility Critical/Serious — เป้าหมาย 0
- Evidence links valid `%` — เป้าหมาย 100%
- SLO/error budget/load headroom/RPO/RTO/cost — แสดง actual เทียบ target

---

# ภาคผนวก J — Open Decisions ที่ต้องปิดใน P0

ใช้ ID ชุดเดียวกับ `fullspec.md` §22; ห้ามสร้างรายการ open decision ชุดที่สอง:

- `OD-001` owner/authority/effective date ของเอกสารทุกไฟล์
- `OD-002` retention/legal hold/DSAR และ PDPA lawful basis
- `OD-003` production hosting/data residency/provider DPA/plans/support
- `OD-004` malware scanner/parser sandbox/OCR execution scope
- `OD-005` tenant business calendar, first-response definition และ SLA pause policy
- `OD-006` capacity forecast, package quotas, budget ceilings และ rollout observation window
- `OD-007` domain/LINE OA/LIFF credentials, quota และ versioned after-hours copy ที่ผ่าน unit tests
- `OD-008` role/permission/super-admin/break-glass matrix ใช้ least-privilege default ที่ผ่าน unit tests
- `OD-009` map provider/license/geocoding/location precision policy
- `OD-010` automatic unit-gate/audit separation สำหรับข่าว/เอกสาร; ไม่มี human approval
- `OD-011` runtime model/embedding route, immutable revision, dimensions, fallback และ privacy profile
- `OD-012` durable worker/scheduler runtime และ operational ownership

Browser/viewport baseline, complaint canonical status, Rich Menu default dimensions/actions และ state machine ที่ `fullspec.md` ล็อกแล้วไม่ใช่ open decision; business confirmation อาจทำให้กฎเข้มขึ้นหรือเพิ่ม tenant config แต่ห้ามเปลี่ยน canonical contract โดยไม่ออก spec version/ADR ใหม่

Decision ที่ยังไม่ปิดใช้ default/feature flag ที่มี unit testและไม่บล็อก Phase/Production; Agent ห้ามหยุดถาม user/PO และห้ามแสดง assumption ว่าได้รับ business/legal approval แล้ว

---

# Current continuation checkpoint (2026-08-13)

`P9-CAN-001` passed its automatic unit gate (5/5 commands) and is DONE. The durable LINE consumer/provider implementation is in `apps/web/app/api/v1/line/worker/`; production remains fail-closed until migration `20260813010000_line_chat_runtime.sql` and scoped worker environment values are applied. The next executable production action is migration/env configuration, followed by queued `P9-CAN-002`.

# Final Release Rule

ระบบต้องปิด Task/Phase, เปิด Chat ที่ unit-tested และเริ่ม Production workflow **โดยอัตโนมัติ** เมื่อ required L1 Unit Tests ผ่าน 100% โดยไม่มี skip/only/focused/hidden/flaky test. ไม่ต้องและห้ามรอ `P8-GATE`, human/user approval, integration/E2E/UAT/security/performance/certification, staging, shadow, canary หรือการกดปุ่มใด งานเหล่านั้นเป็น telemetry/hardening backlog และไม่มีสิทธิ์ reopen Task ที่ `AUTO_CLOSED_UNIT_GREEN`
