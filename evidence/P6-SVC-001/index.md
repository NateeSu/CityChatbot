# P6-SVC-001 Evidence

สถานะ: **DONE (2026-08-11, MVP Fast-Track auto-approved หลัง L1 unit suite ผ่าน 100%)**

Task นี้ครอบคลุม `RF-01`, `RF-03`, `RF-07`, `RF-11` และ trace ไปยัง `INV-TENANT-001`, `INV-AUDIT-001`, `INV-VERSION-001` ตาม `fullspec.md` §7.4, §13.5 และข้อกำหนด structured service facts. การอนุมัติอัตโนมัติใช้เฉพาะเงื่อนไข `SPEC-MVP-001` ใน `fullspec.md`/`plan.md`: L1 unit suite ของ scope ผ่าน 100%; ไม่ได้อ้างว่า production persistence, provider configuration, external UAT หรือ `P6-GATE` ผ่านแล้ว.

## สิ่งที่ส่งมอบ

- `packages/services/` เพิ่ม tenant-safe service directory domain: `DRAFT → IN_REVIEW → APPROVED → SCHEDULED|PUBLISHED → ARCHIVED`, immutable published revision lineage, optimistic concurrency, idempotency และ audit
- Structured facts ที่ตรวจสอบได้ ได้แก่ steps, documents, fee, hours, location, requirements, phone, map/website URL, verified contact, source owner/reference, effective/expiry และ timezone `Asia/Bangkok`
- Optional `GOLD_PRICE`/`PAWNSHOP` modules ถูกป้องกันด้วย tenant feature flags; gold price ต้องมาจาก owner/source ที่อนุมัติและมี stale boundary/disclaimer; ไม่มี AI เป็นแหล่งจริงของราคา
- Admin API แบบ explicit สำหรับ list/create/update/detail/submit-review/approve/publish/archive และ citizen API สำหรับ list/detail/search; production ที่ไม่มี trusted adapter ตอบ `CONFIGURATION_UNAVAILABLE`
- A-80 admin service console ภาษาไทย มี structured editor, source/effective date/fee/contact/module flags, workflow actions และ loading/empty/error/offline/permission/expired/stale/conflict/recovery states
- Citizen `/liff/services`, `/liff/services/[slug]` และ `/liff/contact` อ่านเฉพาะ published + effective + non-expired facts พร้อม search, verified contact, `tel:`/map links, stale warning และ SEO metadata โดยไม่ใช้ mock content
- Navigation/access guard เพิ่ม `/admin/services` ตาม role; STAFF อ่านได้แต่ mutation ถูกปฏิเสธ
- `supabase/migrations/20260811180000_services_schema.sql` เพิ่ม feature flags, service posts/revisions, composite tenant FKs, forced RLS, deny-by-default browser writes, immutable revision trigger และ trusted publish/archive functions; `supabase/tests/services_schema_contract.sql` เป็น SQL gate
- `scripts/services_api_smoke.mjs` เป็น repeatable local production-artifact lifecycle smoke ที่ตรวจ validation, feature flag, role, tenant isolation, scheduling, archive และ UI routes โดยไม่ใช้ credential

## ไฟล์ที่เปลี่ยน

- `packages/services/package.json`, `packages/services/tsconfig.json`, `packages/services/src/index.ts`, `packages/services/src/services.ts`, `packages/services/src/services.test.ts`
- `apps/web/app/api/v1/admin/services/**`, `apps/web/app/api/v1/citizen/services/**`
- `apps/web/app/admin/services/**`, `apps/web/app/admin/admin-navigation.ts`, `apps/web/app/admin/AdminShell.tsx`
- `apps/web/app/liff/services/**`, `apps/web/app/liff/contact/page.tsx`, `apps/web/app/liff/LiffInfoPage.tsx`
- `supabase/migrations/20260811180000_services_schema.sql`, `supabase/tests/services_schema_contract.sql`
- `scripts/test_services_api.py`, `scripts/test_ui_system.py`, `scripts/services_api_smoke.mjs`
- `apps/web/package.json`, `package.json`, `pnpm-lock.yaml`, `plan.md` และ `evidence/progress/2026-08-11.md`

## ผลการทดสอบจริง

- `pnpm exec vitest run packages/services/src/services.test.ts` — **PASS**, 6/6
- `python -m unittest scripts.test_services_api scripts.test_ui_system -v` — **PASS**, 12/12
- `pnpm test:unit` — **PASS**, 42 test files / 283 tests
- `pnpm test:db` — **PASS**, 149 static contract tests
- `pnpm exec tsc -p packages/services/tsconfig.json --noEmit` — **PASS**
- `pnpm lint` — **PASS**
- `pnpm typecheck` — **PASS**
- `pnpm typecheck:packages` — **PASS**, รวม `packages/services/tsconfig.json`
- `pnpm security:scan` — **PASS**, `SECRET_SCAN_CLEAN`
- `pnpm build` — **PASS**, production route table มี `/admin/services`, admin action routes, citizen API และ LIFF services list/detail
- `pnpm test:all` — **PASS**, exit code 0; 42/283 L1 unit, 149/149 static, lint/typecheck/package typecheck/security/build ผ่านใน composite command
- `Get-Content -Raw -Encoding UTF8 supabase/tests/services_schema_contract.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres -At` — **PASS**, `SERVICES_SCHEMA_SQL_CONTRACT_PASS`
- `node scripts/services_api_smoke.mjs` against `http://127.0.0.1:3223` — **PASS**:

  ```text
  health=200 initial=200 bad_phone=400:VALIDATION_ERROR gold_disabled=409:FEATURE_DISABLED draft=201 review=200 approve_pr=403 approve=200 publish=200:PUBLISHED citizen=200:1 detail=200 future=200:SCHEDULED future_hidden=true archive=200 after_archive=0 staff_mutation=403 other_tenant=404 admin_page=200 editor_page=200 citizen_page=200 detail_page=200 contact_page=200
  ```

- `pnpm security:sbom` — **PASS**, 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`
- `pnpm release:manifest` then `pnpm release:verify` — **PASS**, manifest digest `905e8ceb61f055bc337dfbfa6f92b2c464f0821e80c7870511e4d111ce5bf2b8`

## Acceptance criteria

- Service facts are structured, validated, source-owned, versioned, effective-dated and timezone-bound; citizen reads only approved/published, effective and non-expired data.
- Future/expired/archived content is hidden from the citizen surface; current published content is searchable and detail-addressable.
- Phone, map and website links are validated; verified contact is rendered through safe links; contact directory uses repository data rather than hardcoded mock facts.
- Gold/pawnshop modules are tenant-flagged and gold price is never generated by AI; disabled gold access returns `FEATURE_DISABLED`; stale gold data produces a warning at the domain boundary.
- Role boundary is enforced in domain/API: PR staff cannot approve, tenant admin can approve, STAFF cannot mutate, and cross-tenant access returns `404`.
- Idempotency and expected row version prevent duplicate/stale mutations; published revisions are immutable and archive/publish operations are audited and reversible.
- Admin and citizen routes are explicit and fail closed outside the synthetic local/test adapter; resilient UI states and responsive styles cover the implemented service screens.

## Rollback procedure

1. Disable the service route or tenant module flag and leave the last approved revision read-only.
2. Archive the current service through the canonical action; restore the prior approved revision or create a new revision, review and publish it. Never mutate an immutable published revision.
3. Restore the prior feature-flag revision if a module was disabled accidentally; retain source/audit history for reconciliation.
4. Re-run service unit/static/SQL/build/security/smoke gates before re-enabling citizen visibility.

## Known limitations / next executable work

- The local adapter is intentionally in-memory and route/page module instances do not provide durable cross-process persistence. Production must wire the canonical Supabase repository/RPC, trusted server session and storage/provider adapters before citizen production traffic.
- Gold/pawnshop flags default to disabled; production flag management remains part of the tenant provisioning/configuration work. No real Supabase, LINE, Vercel or OpenRouter credential/provider call was made and no production configuration was changed.
- Full screenshot comparison, screen-reader/device certification, production canary and external stakeholder UAT remain `P6-QA-001`/post-production work.
- `P6-KB-001` remains **BLOCKED** by `P4-QA-001`; `P6-GATE` and P7–P9 remain open. The project is not complete.
