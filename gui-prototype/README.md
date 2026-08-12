# CityChatbot GUI Reference Prototype

ต้นแบบ React + Vite + TypeScript สำหรับ Screen Catalog ใน `fullspec.md` ครบทั้ง LINE/Rich Menu, Citizen LIFF, Back Office และ Super Admin โดยใช้ภาพใน `../gui-designs/concepts` เป็น visual authority และใช้ UI แบบ code-native ทั้งหมด (ไม่ใช้ screenshot แทน interface)

## เริ่มใช้งาน

```powershell
cd D:\codex\CityChatbot\gui-prototype
pnpm install
pnpm dev
```

เปิด catalog ที่ `http://127.0.0.1:4173/catalog`

เปิดหน้าจอโดย route:

```text
http://127.0.0.1:4173/screen/A-20
http://127.0.0.1:4173/screen/C-08
```

หรือ query parameter:

```text
http://127.0.0.1:4173/?screen=A-20
http://127.0.0.1:4173/?screen=CHAT-02
```

ทุกหน้ารองรับ query ต่อไปนี้:

- `theme=light|dark|contrast`
- `state=ready|loading|empty|error`
- `viewport=auto|desktop|tablet|mobile` (preview frame; การทดสอบ responsive จริงควรเปลี่ยน browser viewport)
- `chrome=0` ซ่อน prototype toolbar สำหรับบันทึกภาพส่งมอบ

ตัวอย่าง:

```text
http://127.0.0.1:4173/screen/A-31?theme=dark&state=ready&viewport=tablet
http://127.0.0.1:4173/?screen=C-03&state=error&viewport=mobile
http://127.0.0.1:4173/screen/A-93?chrome=0
```

## Screen manifest

[`screen-manifest.json`](./screen-manifest.json) เป็นแหล่งอ้างอิง machine-readable โดยแต่ละ entry มี `id`, `title`, `path`, `roles`, `viewport`, `concept`, และ `stateCoverage` ครบตาม Screen Catalog หลัก

## โครงสร้างสำคัญ

- `src/data/screens.ts` — screen registry, route และ visual reference
- `src/data/sampleData.ts` — seed data ภาษาไทยที่ใช้ร่วมกัน
- `src/components` — primitives, app shells, catalog และ QA toolbar
- `src/features/citizen` — Rich Menu, chat states และ Citizen LIFF families
- `src/features/admin` — operations, knowledge/RAG, evaluation, content, organization, KPI และ settings
- `src/features/system` — tenant list และ provision wizard
- `src/styles` — tokens, light/dark/high-contrast, shells, feature styles และ responsive rules
- `../gui-designs/screens` — ภาพ render ส่งมอบ ตั้งชื่อตาม `{id-lowercase}-{slug}-{viewport}.png`

## Interaction ที่ต้องลอง

- เปลี่ยน theme และ data state จาก toolbar ด้านบน
- ค้นหา/กรอง screen catalog
- เลือกแถว, filter, tab, accordion และ wizard step
- A-20 เลือกเรื่องหลายรายการ; A-25 เปลี่ยน status/assignee
- A-31 ร่างและส่งคำตอบ; A-46 เปลี่ยน confidence threshold
- A-47 รัน evaluation suite
- A-91 เปลี่ยน token สี/contrast; A-93 เปลี่ยน layout และลำดับ Rich Menu
- S-02 เดินหน้าครบ 6 ขั้นตอนและเลือก feature modules

## ตรวจคุณภาพ

```powershell
pnpm lint
pnpm build
```

Viewport หลักสำหรับ visual QA:

- Citizen/RM/CHAT: `390 × 844`
- Back Office/Super Admin desktop: `1440 × 1000`
- Tablet: `834 × 1112`
- Mobile back office: `390 × 844`

ภาพ concept ใช้กำหนด palette, typography hierarchy, density, navigation, status color และ responsive behavior ส่วนข้อความและข้อมูลใน prototype เป็นภาษาไทย code-native เพื่อให้ agent ที่พัฒนาระบบจริงนำไปแยก component และเชื่อม API ได้โดยตรง
