# CityChatbot GUI Design Pack

ชุดนี้เป็น visual reference ที่ใช้ร่วมกับ `fullspec.md` §15–16 และ code-native prototype ใน `../gui-prototype/` ข้อความ, สิทธิ์, state, route และ behavior ให้ยึด `fullspec.md`; ภาพกำหนด mood, hierarchy, density, spacing และ responsive container

## สิ่งที่ส่งมอบ

- `concepts/` — ภาพแนวทาง 7 ภาพ: citizen/chat, services/tracking, dashboard, complaint operations, support ticket, knowledge/AI และ settings/theme/Rich Menu
- `rich-menu/` — production-size PNG/SVG, tap-map และคำอธิบาย; `RM-01-main.png`/`RM-02-services.png` ขนาด 2500×1686 และต่ำกว่า 1 MB
- `screens/` — ภาพ render 55 ภาพ ครบ canonical Screen ID 41 รายการ
- `../gui-prototype/screen-manifest.json` — source of truth สำหรับ ID → prototype path → role → viewport → concept → state coverage
- `../gui-prototype/README.md` — วิธีเปิด prototype และ QA query parameters

## Canonical screen coverage

- LINE/Rich Menu/Chat: `RM-01`, `CHAT-01..04`
- Citizen/LIFF: `C-01, C-02, C-03, C-04, C-05, C-07, C-08, C-09, C-10, C-13, C-14, C-15, C-16, C-18, C-19, C-20`
- Back Office: `A-10, A-20, A-25, A-30, A-31, A-40, A-41, A-46, A-47, A-60, A-61, A-70, A-74, A-75, A-80, A-91, A-93, A-97`
- Super Admin: `S-01, S-02`

ทุก ID มีภาพอย่างน้อย 1 ภาพ; `A-20`, `A-25`, `A-31`, `A-91`, `A-93` มี desktop/tablet/mobile triplet และมีภาพ state/interaction เพิ่มในจุดสำคัญ

## Fidelity ledger

- รักษา navy/white พร้อม teal-blue accent, sidebar/table/workbench hierarchy และภาษาไทยจริงจาก concept
- Citizen เป็น single-column, task-first, touch target ใหญ่; Admin เปลี่ยน layout จริงตาม viewport ไม่ใช่เพียงย่อภาพ
- semantic status/SLA colors มี text label ร่วมและใช้ตรงกัน
- A-20 concept มี detail/activity rail ในภาพเดียว แต่ prototype แยกไป A-25 ตาม Screen Catalog
- ไม่จำลอง native LINE/OS chrome; map/chart/news/media เป็น reference data จน production เชื่อม API
- ภาพ generated อาจมี copy/data สมมติ จึงให้ prototype/fullspec เป็น authority ที่สูงกว่า concept

## Verified baseline

- `pnpm lint` ผ่าน
- `pnpm build` ผ่าน (Vite 1,592 modules)
- browser QA: A-20 search/filter, theme switch, desktop 1440px และ C-09 mobile 390px
- console warning/error = 0 ใน flows ที่ตรวจ; C-09 ไม่มี horizontal overflow
- visual comparison ตรวจ concept ↔ implementation สำหรับ A-20, C-01, A-91 และ A-93 แล้ว

