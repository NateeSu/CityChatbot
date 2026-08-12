# P6-NEWS-001 Evidence

สถานะ: **DONE (2026-08-11, MVP Fast-Track auto-approved หลัง L1 unit suite ผ่าน 100%)**

Task นี้ครอบคลุม `RF-01`, `RF-05`, `RF-10`, `RF-11`, `RF-13` และ trace ไปยัง `INV-TENANT-001`, `INV-AUDIT-001`, `INV-VERSION-001` ตาม `fullspec.md` §7.4, §12.2, §13.5 และ §17.1. การอนุมัติอัตโนมัติใช้เฉพาะเงื่อนไข `SPEC-MVP-001` ใน `fullspec.md`/`plan.md`: L1 unit suite ของ scope ผ่าน 100%; ไม่ได้อ้างว่า production provider, external UAT หรือ P6-GATE ผ่านแล้ว.

## สิ่งที่ส่งมอบ

- `packages/news/` เพิ่ม domain ข่าวแบบ tenant-scoped: `DRAFT → IN_REVIEW → APPROVED → SCHEDULED|PUBLISHED → ARCHIVED`, revision lineage, optimistic concurrency, idempotency, audit และ publish/archive guard
- Rich text sanitizer ปฏิเสธ script/iframe/object/embed/style/form/input/meta/link และ `javascript:`/`data:` URL, จำกัด tag/attribute ที่อนุญาต และบังคับ safe link rel
- Media metadata boundary ตรวจ private tenant storage key, MIME, ขนาดไม่เกิน 10 MB, image dimensions, SHA-256 และ alt text; ไฟล์ยังไม่ถูกนำเข้า ACTIVE index
- Admin API แบบ explicit สำหรับ list/create/update/detail/submit-review/approve/publish/archive/broadcast preview/queue และ citizen API list/detail; production ที่ยังไม่มี trusted adapter ตอบ `CONFIGURATION_UNAVAILABLE`
- A-60/A-61 admin UI ภาษาไทย มี editor/category/tags/preview, Bangkok timezone copy, media metadata, workflow actions, audit/delivery view และ loading/empty/error/offline/permission/expired/conflict/stale/recovery states
- Citizen `/liff/news` และ `/liff/news/[slug]` อ่านเฉพาะ published + effective + non-expired content, มี SEO metadata และไม่ใช้ mock content
- Navigation/access guard เพิ่ม `/admin/news` สำหรับ `PR_STAFF`/`TENANT_ADMIN`; `STAFF` อ่านได้แต่ mutation ถูกปฏิเสธ
- `supabase/migrations/20260811170000_news_schema.sql` เพิ่ม news tables, composite tenant FKs, forced RLS, deny-by-default browser writes, immutable revision trigger, publish/archive trusted functions และ delivery indexes; `supabase/tests/news_schema_contract.sql` เป็น SQL gate
- `scripts/news_api_smoke.mjs` เป็น repeatable local production-artifact lifecycle smoke ที่ไม่ใช้ credential ใด ๆ

## ไฟล์ที่เปลี่ยน

- `packages/news/package.json`, `packages/news/tsconfig.json`, `packages/news/src/index.ts`, `packages/news/src/news.ts`, `packages/news/src/news.test.ts`
- `apps/web/app/api/v1/admin/news/**`, `apps/web/app/api/v1/citizen/news/**`
- `apps/web/app/admin/news/**`, `apps/web/app/liff/news/**`, `apps/web/app/admin/admin-navigation.ts`, `apps/web/app/admin/admin-access.ts`, `apps/web/app/admin/AdminShell.tsx`
- `supabase/migrations/20260811170000_news_schema.sql`, `supabase/tests/news_schema_contract.sql`
- `scripts/test_news_api.py`, `scripts/test_ui_system.py`, `scripts/news_api_smoke.mjs`
- `plan.md` และ `evidence/progress/2026-08-11.md`

## ผลการทดสอบจริง

- `pnpm exec vitest run packages/news/src/news.test.ts` — **PASS**, 6/6
- `pnpm test:unit` — **PASS**, 41 test files / 277 tests
- `pnpm test:db` — **PASS**, 144 static contract tests
- `pnpm lint` — **PASS**
- `pnpm typecheck` — **PASS**
- `pnpm typecheck:packages` — **PASS**, รวม `packages/news/tsconfig.json`
- `pnpm security:scan` — **PASS**, `SECRET_SCAN_CLEAN`
- `pnpm build` — **PASS**, production route table มี `/admin/news`, `/admin/news/[id]/edit`, admin action routes, citizen API และ LIFF news list/detail
- `pnpm test:all` — **PASS**, exit code 0; 41/277 L1 unit, 144/144 static, lint/typecheck/package typecheck/security/build ผ่านใน composite command
- `Get-Content -Raw -Encoding UTF8 supabase/tests/news_schema_contract.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -At` — **PASS**, `NEWS_SCHEMA_SQL_CONTRACT_PASS`
- `node scripts/news_api_smoke.mjs` against `http://127.0.0.1:3223` — **PASS**:

  ```text
  health=200 initial=200 bad_xss=400:VALIDATION_ERROR draft=201 review=200 approve_pr=403 approve=200 publish=200:PUBLISHED citizen=200:1 detail=200 preview=200:true queue=202:QUEUED queue_replay=202:true archive=200 after_archive=0 future=200:SCHEDULED future_visible=0 staff_mutation=403:FORBIDDEN other_tenant=404 admin_page=200 editor_page=200 citizen_page=200
  ```

- Chrome verification on the rebuilt artifact — **PASS**: desktop `1440` (`scrollWidth=1425`, `overflow=false`), mobile `390` (`scrollWidth=375`, `overflow=false`), LIFF news empty state rendered, heading/media metadata present, application console errors `0` after filtering Chrome extension noise. Desktop/mobile screenshots were captured during the verification run.
- `pnpm security:sbom` — **PASS**, 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`
- `pnpm release:manifest` then `pnpm release:verify` — **PASS**, manifest digest `31ad48d47b89002c5ba746d1bbe297cd0de13bd90eb74c73ea80429f0472199a`

## Acceptance criteria

- rich text/XSS and unsafe URL input is rejected before persistence; safe content is rendered only from the sanitized domain value
- role boundary is enforced in domain/API: PR submit/publish works, PR approve returns `403`, tenant admin approve works, STAFF mutation returns `403`
- published content is citizen-visible only after approval and effective time; future content is `SCHEDULED` and hidden; archive removes the item from citizen list/detail
- published revision is immutable; new content must use a new revision/source lineage path rather than mutating a published revision
- tenant and identity boundaries are fail-closed; cross-tenant admin list returns indistinguishable `404`
- broadcast preview returns audience/quota/cost plus `confirmationRequired=true`; queue is `202 QUEUED` and replay with the same idempotency key returns the same run
- attachment metadata is validated against tenant-private storage path, content type, size, dimensions, hash and alt text
- admin/citizen routes are explicit, production-disabled without trusted configuration, responsive at the tested desktop/mobile widths, and include resilient UI states and SEO metadata

## Rollback procedure

1. Disable the news route/broadcast feature flag and leave the last approved revision read-only.
2. Archive the current post through the canonical versioned action; publish the previously approved revision or a newly created revision after review. Never mutate an immutable published revision.
3. Cancel queued delivery runs before provider dispatch; reconcile any accepted recipients from the durable delivery ledger when the production adapter is enabled.
4. Re-run the news unit/static/SQL/build/security/smoke gates before re-enabling the route.

## Known limitations / next executable work

- The local web adapter is intentionally in-memory and route/page modules do not provide durable cross-process persistence. Production must wire the canonical Supabase repository/RPC, storage upload verification and trusted server session before citizen traffic or real LINE broadcast is enabled.
- LINE queue/preview is a local synthetic boundary; no real LINE, Supabase, Vercel or OpenRouter credential/provider call was made and no production configuration was changed.
- The browser connector could not populate the native `datetime-local` control reliably; Bangkok time parsing and future/past visibility were verified at the API/domain boundary instead.
- Full screenshot comparison, screen-reader/device certification, production canary and external stakeholder UAT remain `P6-QA-001`/post-production work.
- `P6-KB-001` remains BLOCKED by `P4-QA-001`; `P6-GATE` and P7–P9 remain open. The project is not complete.
