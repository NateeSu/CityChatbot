# Evidence — P0-GOV-001

สถานะ: `BLOCKED`

## Requirement IDs

- `RF-16` QA governance and release evidence
- `RF-18` decision ownership, source of truth, approvals and change control
- `SPEC-AGENT-001` ห้ามเดา Open Decision/ผู้มีอำนาจอนุมัติ

## Blocker

`P0-GOV-001` ต้องมีรายชื่อและตัวตนของผู้มีอำนาจตัดสินใจของเทศบาล/ผู้พัฒนาเพื่อกำหนด RACI, decision log และ release approver matrix แต่ repository ไม่มีข้อมูลดังกล่าว และ `fullspec.md` ระบุเพียงบทบาทเชิงนามธรรม (`PO`, `TL`, `QA`, `SEC`, `CO`, `UAT`) ผมจึงไม่สร้างชื่อหรือถือบทบาทเป็นการอนุมัติแทนบุคคลจริง

คำตอบที่ต้องการจากผู้มีอำนาจ: รายชื่อ/บทบาทของ PO, TL, QA, Security/Privacy reviewer, Knowledge Owner/CO, Municipal Sponsor และผู้อนุมัติ release พร้อม effective date ของ governance revision

## ตรวจสอบที่ทำจริง

- ตรวจ `fullspec.md`, `plan.md`, `spec1.md` และโครงสร้าง repository แล้ว ไม่พบ stakeholder roster หรือ approval record
- ไม่ได้สร้าง RACI ที่อ้างว่า approved และไม่ได้เปลี่ยน canonical contract

## ผลกระทบและการกู้คืน

Task ที่พึ่ง governance approval ต้องคงสถานะ blocked หรือใช้เฉพาะ fail-safe implementation ที่ไม่เปิด production traffic

เมื่อได้รับรายชื่อ ให้สร้าง governance revision ใหม่, บันทึก approver/effective date, รันสถานการณ์แก้ requirement/เอกสารขัดกัน/security exception ตาม plan แล้วจึงปลด blocker โดยไม่แก้ประวัติ evidence นี้

## Known limitation

ยังไม่มี approval ที่ตรวจสอบได้ จึงไม่สามารถผ่าน P0-GOV-001 หรือ P0-GATE ได้

## New requested decision — automatic approval after unit tests

วันที่ 2026-08-10 ผู้ใช้เสนอให้ unit test ผ่านทั้งหมดแล้วอนุมัติอัตโนมัติเพื่อเร่ง MVP

สถานะ: `BLOCKED — ต้องมี governance/change-control approval`

เหตุผลที่ยังไม่ adopt ใน `fullspec.md`/`plan.md`: automatic approval สำหรับการส่งต่อ Phase หรือ production จะ bypass ผู้อนุมัติที่ระบุใน Exit Gate และอาจแทนที่ G13 sign-off, security/privacy, corpus/content, UAT, rollback และ production-readiness evidence ด้วย unit test ซึ่งขัดกับ invariant และข้อห้ามเดิม

ทางเลือกที่ไม่ลด gate: อนุญาต `AUTO_APPROVED_FOR_MVP_DEV` เฉพาะงาน dev/test ที่ไม่แตะ production traffic, PII, tenant data, credentials, RLS/IAM, upload/index ACTIVE, LINE production หรือ schema ที่ปล่อยจริง; Phase Exit Gate และ production approval ยังคงต้องอนุมัติแบบ explicit

คำตอบที่ต้องการจาก governance: อนุมัติหรือปฏิเสธเฉพาะทางเลือก fast-track นี้ พร้อมกำหนด scope, owner, expiry และ compensating controls; ห้ามถือข้อความคำขอนี้เป็น approval แทนบุคคลจริง
