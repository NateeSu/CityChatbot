# Evidence — DOC-CHANGE-UNIT-TEST-APPROVAL

สถานะ: `SUPERSEDED — MVP UNIT-TEST FAST-TRACK APPLIED`

## Change request ล่าสุด

ยกเลิก workflow เดิมที่กำหนดให้ต้องรอ approval/Exit Gate หลัง `L1 Unit`. สำหรับ MVP เมื่อ L1 Unit Test ของ scope ผ่าน 100% ให้ถือว่าได้รับ MVP approval อัตโนมัติ ไป Phase ถัดไปและขึ้น Production ได้ทันที

Approval, integration, E2E, UAT, security, performance, resilience, certification, staging, shadow และ canary เปลี่ยนเป็น post-production hardening backlog และไม่เป็น release blocker

## Files changed

- `fullspec.md` — เปลี่ยนเป็น v2.1.0 และเพิ่ม `SPEC-MVP-001`, §11.4.1 `Unit Tests Green → Next Phase / Production`
- `plan.md` — เปลี่ยน §1.5, P0–P9 Exit Gates, Definition of Done และ Final Release Rule เป็น Unit-Test Fast-Track

## Acceptance

- L1 Unit Test pass 100% เป็น gate เดียวของ MVP: PASS
- ไป Phase ถัดไปได้โดยไม่รอ approval/dependency/test ชั้นอื่น: PASS
- Production/citizen traffic เปิดได้ทันทีเมื่อ unit tests ผ่านและมี artifact/target/credential ที่จำเป็นจริง: PASS
- P0 blockers ถูกลดเป็น post-production notes และ P0 กลับเป็น TODO: PASS
- P8 certification/UAT และ canary เป็น non-blocking หลัง Production: PASS

## Validation commands and actual results

```text
python -m unittest discover -s scripts -p 'test_*.py' -q
Ran 11 tests ... OK

python scripts/audit_corpus.py --input doc_rag_test --verify docs/corpus/corpus-manifest.json
CORPUS_MANIFEST_VERIFIED sha256:53d5313b3cdbcc00f79596c4804f3a630afbb6fadbf50b147336cd1f7108ace1

python scripts/audit_gui_inventory.py --root . --output docs/ux/page-state-inventory.json
SCREEN_COUNT 41
AUTOMATED_CHECKS_PASS True
EXTERNAL_ACCEPTANCE BLOCKED_PENDING_EXTERNAL_UAT
```

## Approval and limitation

ไม่ต้องรอ stakeholder/approver identity สำหรับ MVP gate. ข้อจำกัดที่บล็อกได้มีเฉพาะทางเทคนิคจริง เช่นสร้าง artifact ไม่ได้ ไม่มี production target หรือไม่มี credential ของ integration ที่จะเปิด; ให้ปิดเฉพาะ feature นั้นและ deploy ส่วนอื่น

## Rollback

หากยกเลิก fast-track ต้องออก spec/plan revision ใหม่อย่างชัดเจน; ห้ามตีความข้อความ policy เดิมใน history ว่ายังมีผลเหนือ v2.1.0
