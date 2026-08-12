# P6-ADM-001 Evidence

สถานะ: **DONE (2026-08-11, MVP Fast-Track auto-approved หลัง L1 unit suite ผ่าน 100%)**

Task นี้ครอบคลุม `RF-01`, `RF-02`, `RF-04` และ `RF-10` ตาม `fullspec.md`/`plan.md`. การเชื่อม server session จริง, visual regression/UAT และ external accessibility certification ยังคง fail-closed เป็น post-production follow-up ตาม `SPEC-MVP-001`.

## สิ่งที่ส่งมอบ

- `apps/web/app/admin/admin-navigation.ts` กำหนด role และเมนูแบบ explicit allowlist สำหรับ dashboard, complaints, support tickets, FAQ approval และ Rich Menu; ไม่มี wildcard route
- `apps/web/app/admin/AdminShell.tsx` และ `admin-shell.css` เพิ่ม responsive side/top navigation, breadcrumbs, tenant/department context, keyboard `/` command search, notification panel, theme control, mobile menu/backdrop, focus-visible และ screen-reader landmarks
- `apps/web/app/admin/AdminDashboard.tsx`, `dashboard.css` และ `page.tsx` เพิ่ม A-10 role dashboard ที่อ่านตัวเลขจาก complaint/support API ตาม tenant scope และมี loading, empty, error, offline, partial/stale, permission, expired-session และ production-disabled states
- `apps/web/app/admin/admin-access.ts` เพิ่ม fail-closed role parsing และ local synthetic identity mapping; หน้า operational ทุกหน้ารับ role จาก query/session context และปฏิเสธ role ที่ไม่อยู่ใน route policy
- complaint/support/FAQ/Rich Menu list/detail pages เพิ่ม direct-URL permission guard; production ที่ยังไม่มี server identity จะแสดง Feature Disabled และไม่ render synthetic data
- `apps/web/app/api/v1/admin/complaints/context.ts` แยก department-head fixture identity ให้ตรงกับ policy และไม่ปะปนกับ staff actor
- `scripts/test_ui_system.py` เพิ่ม static contract tests สำหรับ role route matrix, direct URL guard, accessibility landmark/state และ responsive boundary

## ผลการทดสอบจริง

- `pnpm test:unit` — **PASS**, 37 test files / 255 tests
- `pnpm test:db` — **PASS**, 125 static contract tests
- `pnpm lint` — **PASS**
- `pnpm typecheck` — **PASS**
- `pnpm typecheck:packages` — **PASS**
- `pnpm build` — **PASS**, Next.js production build; admin pages compile as dynamic server routes and route table includes all guarded admin surfaces
- `pnpm security:scan` — **PASS**, `SECRET_SCAN_CLEAN`
- `pnpm security:sbom` — **PASS**, 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`
- `pnpm release:manifest` then sequential `pnpm release:verify` — **PASS**, manifest digest `6fa827118024fde86a499a2b1b6ab7f3f93157ef204249b85200a6f156b270e5`
- local runtime smoke on `http://127.0.0.1:3100` — **PASS**: `/admin` and allowed staff/department-head routes returned HTTP 200; invalid `/admin?role=BOGUS`, `/admin/complaints?role=PR_STAFF`, `/admin/faq-candidates?role=EXECUTIVE` และ `/admin/settings/rich-menu?role=STAFF` rendered permission-denied state

## Acceptance criteria

- role navigation and action surfaces are explicit; unsupported role direct URLs are denied server-side before the feature component renders
- page inventory links are reachable from the dashboard shell within one additional navigation step and breadcrumbs provide return path
- dashboard values are sourced from deterministic API facets; AI is not a source of KPI/status truth
- keyboard focus ring, search landmark, navigation landmark, `aria-current`, responsive mobile menu and tenant/department context are present
- responsive CSS covers the required small/mobile/tablet/desktop boundaries (`320`, `360`, `390`, `480`, `768`, `834`, `1024`, `1440` effective widths) with horizontal overflow suppressed
- production provider/session data is not guessed; synthetic local data is isolated to local/test environment and production is disabled until server identity wiring exists

## Visual/UAT boundary

Static contract/build checks and local HTTP smoke were executed. Full screenshot comparison against `gui-designs/screens/`, real browser keyboard/screen-reader audit and stakeholder UAT require an available browser/device session and remain post-production certification work; no pass is claimed for those external checks.

## Rollback procedure

1. Revert the shared `AdminShell`/navigation feature flag to the previous admin navigation component.
2. Hide dashboard shortcuts and unfinished routes, keeping existing complaint/support pages read-only if needed.
3. Preserve audit/history and server-side authorization; do not delete tenant data. Restore the last approved UI bundle and rerun `pnpm test:unit`, `pnpm test:db`, `pnpm build` and route smoke before re-enabling.

## Known limitations / next executable work

- provider-backed server session lookup and production Supabase/Vercel wiring are not configured in this local run; pages intentionally fail closed instead of accepting URL identity as production truth
- existing feature-specific screens retain their own legacy visual internals while the A-10 dashboard shell and route guards are now shared; P6 visual certification will consolidate any remaining visual differences
- `P6-KB-001` is the next plan task; if its `P4-QA-001` prerequisite remains externally blocked, record that blocker and continue with the next dependency-complete P6 task
- `P6-GATE` and P7–P9 remain open; project completion is not claimed
