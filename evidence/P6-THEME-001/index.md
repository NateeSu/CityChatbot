# P6-THEME-001 Evidence

Status: **DONE (2026-08-11, MVP Fast-Track auto-approved under `SPEC-MVP-001` after the scoped L1 unit suite passed 100%)**

This evidence covers tenant-safe branding/theme draft, contrast validation, live preview, atomic publish/history and rollback. Non-unit visual certification and external production integration remain explicitly tracked follow-up work.

## Requirement and invariant traceability

- Requirement families: `RF-01`, `RF-02`, `RF-03`, `RF-10`.
- Invariants: `INV-VERSION-001` (published theme is versioned and reversible), tenant isolation and no cross-tenant cache/data reuse under `RF-03`, and the WCAG/accessibility requirements in `fullspec.md` §15.3–§15.7.
- Specification anchors: `fullspec.md` §12.2 `theme_versions` inventory, §13 explicit theme API inventory, §15.3 default tokens, §15.4 typography/geometry, §15.5 theme behavior and contrast publish gate, §15.6 breakpoints, §15.7 resilient page states, §16 WCAG target.
- Visual/coverage anchor: A-91 Theme/Settings Builder and UI-ADM-22; preview covers citizen, admin and Rich Menu surfaces.

## Delivered files

- Theme domain package: `packages/theme-settings/package.json`, `packages/theme-settings/tsconfig.json`, `packages/theme-settings/src/index.ts`, `packages/theme-settings/src/theme-settings.ts`, `packages/theme-settings/src/theme-settings.test.ts`.
- Explicit API boundary: `apps/web/app/api/v1/admin/theme-versions/context.ts`, `errors.ts`, `repository.ts`, `route.ts`, `[id]/route.ts`, `[id]/validate/route.ts`, `[id]/publish/route.ts`, `[id]/rollback/route.ts`.
- A-91 admin editor: `apps/web/app/admin/settings/theme/page.tsx`, `ThemeSettingsConsole.tsx`, `theme-settings.css`; navigation and icon entries in `apps/web/app/admin/admin-navigation.ts` and `AdminShell.tsx`.
- Database contract: `supabase/migrations/20260811160000_theme_versions_schema.sql` and `supabase/tests/theme_versions_schema_contract.sql`.
- Static contracts: `scripts/test_theme_settings_api.py` and the updated `scripts/test_ui_system.py`.
- Workspace wiring: root `package.json`, `apps/web/package.json`, and `pnpm-lock.yaml`.

## Implementation evidence

- Canonical modes are `light`, `dark` and `high-contrast`; the editor exposes semantic tokens, typography scale, density, radius, brand name, landmark and a tenant-scoped logo asset path.
- Every mode is checked for text contrast `>=4.5:1`, primary/accent control contrast `>=4.5:1` and focus-ring contrast `>=3:1`. On-brand foreground is selected deterministically when the foreground is omitted.
- Unsafe/external/data logo paths are rejected. The database repeats asset shape, token key, token color, state, hash and tenant-integrity checks.
- Draft editing uses optimistic `rowVersion`, idempotency keys and audit entries. Published versions are immutable, and publish supersedes the prior version atomically in the repository/database function boundary.
- Forced RLS, tenant-scoped read policy, authenticated browser write denial, composite tenant identity uniqueness and private publish/rollback functions are present in the migration.
- The admin editor includes version history, contrast results, change-impact warning, citizen/admin/Rich Menu live preview, responsive layouts for `1023/767/480/320px`, keyboard focus styles and loading/empty/error/offline/permission/expired-session/conflict/stale states.
- The API uses explicit canonical routes and returns `CONFIGURATION_UNAVAILABLE` outside local/test rather than inventing a production session or credential.

## Commands and actual results

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/theme-settings/src/theme-settings.test.ts` | PASS, 6/6 |
| `pnpm test:unit` | PASS, 40 test files / 271 tests |
| `pnpm test:db` | PASS, 139 static contract tests |
| `python -m unittest scripts.test_theme_settings_api scripts.test_ui_system -v` | PASS, 12/12 targeted contracts |
| `Get-Content -Raw supabase/tests/theme_versions_schema_contract.sql \| docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` | PASS, `THEME_VERSIONS_SCHEMA_SQL_CONTRACT_PASS` |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm typecheck:packages` | PASS, includes `packages/theme-settings/tsconfig.json` |
| `pnpm security:scan` | PASS, `SECRET_SCAN_CLEAN` |
| `pnpm build` | PASS; route table includes `/admin/settings/theme` and all explicit `/api/v1/admin/theme-versions/*` routes |
| `pnpm test:all` | PASS, exit code 0; lint → typecheck → package typecheck → unit → static → security → build |
| `pnpm security:sbom` | PASS, 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest` then `pnpm release:verify` | PASS; manifest digest `47bf292550419b6cfa12b1ec5c8a508b859cd3a5c7410684f4c717fa09fa8f2f` |

## Local API/UI smoke evidence

Smoke ran against the current local Next production artifact at `http://127.0.0.1:3222` with synthetic tenant/admin/staff fixtures. It is not a Vercel, Supabase, LINE or provider production test.

```text
GET seed version                                  -> PUBLISHED
POST draft                                        -> DRAFT
same idempotency key replay                       -> same version id
POST validate default modes                       -> passed=true
POST publish                                      -> PUBLISHED
invalid light text contrast validation            -> passed=false
STAFF POST draft                                  -> 403
tenant-B GET using tenant-A context               -> 404
POST rollback to seed version                     -> PUBLISHED
GET /admin/settings/theme?role=TENANT_ADMIN       -> 200
```

## Acceptance criteria

- Contrast publish gate blocks an invalid text pair and accepts the safe default across all three canonical modes.
- Tenant A/B boundary is fail-closed in the route and repository; no wildcard route or tenant-unscoped browser storage was introduced.
- Asset validation rejects external/data paths and accepts only tenant-scoped relative paths.
- Publish is versioned, auditable, idempotent and atomic at the application/database function boundary; prior published history is restorable with one action.
- The A-91 editor renders the required previews and resilient states without importing prototype mock data.
- Safe default theme is deterministic and remains available for rollback.

## Rollback procedure

1. Disable the theme mutation/publish feature flag and keep the last published theme read-only.
2. Call the canonical rollback operation for the retained prior version (`POST /api/v1/admin/theme-versions/:id/rollback`) or the trusted database rollback function; preserve audit/history.
3. Restore the previous verified application artifact if the editor is implicated. Do not delete `theme_versions` history; use a forward migration for any schema correction.
4. Re-run theme unit/static/SQL contracts, `pnpm test:all`, build/security checks and tenant/admin smoke before re-enabling.

## Known limitations and next work

- The repository/API adapter is synthetic and local/test-only. Production requires a trusted authenticated server session, Supabase persistence and tenant asset storage; production currently fails closed with `CONFIGURATION_UNAVAILABLE`.
- Logo asset upload/virus scanning and cache invalidation are not claimed complete here; this task validates the stored tenant-scoped path boundary only.
- Full screenshot comparison against every `gui-designs/screens/` theme × viewport, Chrome screen-reader/mobile UAT and Vercel production canary were not run in this local slice.
- `P6-QA-001` remains the later full visual/accessibility certification task. `P6-KB-001` remains BLOCKED by `P4-QA-001`.
- Next dependency-complete task is `P6-NEWS-001` (`P2-LINE-003`, `P1-STO-001` and `P6-ADM-001` are DONE). `P6-GATE` and P7–P9 remain open; project completion is not claimed.
