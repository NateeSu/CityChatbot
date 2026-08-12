# Evidence — P1-UI-001

สถานะ: `DONE` (2026-08-11, auto-approved under `SPEC-MVP-001` after UI unit/static checks, lint, typecheck and production build passed)

ขอบเขตการอนุมัติ MVP: shared production UI system, theme engine, responsive shells และ automated accessibility/contrast contracts ผ่านแล้ว ส่วน external UX/UAT study, full screen-reader certification และ production tenant-theme publishing เป็น post-production follow-up และไม่ได้ถูกอ้างว่าเสร็จในหลักฐานนี้

## Requirement IDs

- `RF-01` UX, responsive behavior and accessible states
- `RF-02` light/dark/high-contrast theme contract
- `RF-05` citizen/LIFF surface consistency
- `RF-10` role-aware staff shell consistency
- `RF-16` QA and traceable evidence
- `fullspec.md §7`, `§15`, `§16`
- `plan.md P1-UI-001`

## Files changed

- `apps/web/app/ui/theme.ts` — canonical theme names, scoped persistence, safe tenant color token allowlist and provider.
- `apps/web/app/ui/theme-toggle.tsx` — keyboard-accessible Thai theme control.
- `apps/web/app/ui/states.tsx` — loading, empty, error, offline, permission, expired-session, stale, conflict and feature-disabled primitives.
- `apps/web/app/ui/design-system.css` — semantic tokens, theme overrides, focus treatment, control sizing, reduced motion and 320/480 responsive safeguards.
- `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/app/page.tsx` — provider, shared tokens and home theme control.
- `apps/web/app/liff/complaints/ComplaintTracking.tsx` and `apps/web/app/liff/complaints/new/ComplaintWizard.tsx` — citizen shells now consume the shared theme engine.
- `apps/web/app/admin/complaints/AdminComplaintInbox.tsx` and `apps/web/app/admin/complaints/[id]/AdminComplaintDetail.tsx` — staff shells now consume the shared theme engine.
- `apps/web/app/ui/theme.test.ts` — four unit tests for canonical theme/persistence/token behavior.
- `scripts/test_ui_system.py` — five static UI/accessibility/contrast/shell contract tests.
- `vitest.config.ts` — includes production web UI unit tests.
- `plan.md`, `evidence/progress/2026-08-11.md` — task and resume state.

## Verification commands and actual results

| Command/check | Result |
|---|---|
| `pnpm exec vitest run apps/web/app/ui/theme.test.ts` | PASS, 4/4 |
| `python -m unittest scripts.test_ui_system -v` | PASS, 5/5 |
| `pnpm --filter @citychatbot/web lint` | PASS |
| `pnpm --filter @citychatbot/web typecheck` | PASS |
| `pnpm --filter @citychatbot/web build` | PASS; Next 16.3.0 compiled and generated all routes |
| `pnpm test:all` | PASS; 33 test files, 231/231 unit tests, 93/93 static tests, lint, typecheck, package typecheck, secret scan and production build |
| `pnpm security:sbom` | PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest` / `pnpm release:verify` | PASS; digest `869d42852d04b95a8a39dbec5dd1d657fe6574eed3aca4cd26810e169cde48f2` |

### Local production-browser smoke

Environment: local Next production server `http://127.0.0.1:3200`, synthetic fixtures only; no Supabase, LINE, Vercel, OpenRouter or citizen data was used.

| Flow | Actual result |
|---|---|
| Home at default desktop viewport | DOM rendered; `scrollWidth=1536`, `client viewport=1536`; no console error/warning |
| Citizen `/liff/complaints/new` at 320×844 | `innerWidth=320`, `root/body scrollWidth=320`, `horizontalOverflow=false`; light→dark toggle changed `html[data-theme]` to `dark`; no console error/warning |
| Staff `/admin/complaints` at 390×844 | `innerWidth=390`, `root/body scrollWidth=375`, `horizontalOverflow=false`; persisted dark theme restored; no console error/warning |
| Keyboard smoke | Tab focus reached the theme button and computed focus outline was `solid` |

The dev server showed extension-injected hydration attributes in Chrome (`bis_*`/`__processed_*`); the same production routes above produced no console warnings, so those dev observations are not treated as application defects.

## Acceptance criteria

- Semantic tokens are centralized and every canonical theme is explicit: `light`, `dark`, `high-contrast`.
- Tenant color overrides are restricted to safe hex colors and never accept CSS/function injection.
- Theme previews persist under a scoped versioned local-storage key and fall back safely when storage is unavailable.
- Citizen and staff complaint shells use one provider/cycle contract rather than independent theme persistence.
- Accessible state primitives cover loading, empty, error, offline, permission denied, expired session, stale data, optimistic conflict and disabled feature.
- Required 44px control sizing, visible keyboard focus, reduced-motion handling and 320/480 responsive safeguards are present.
- Static contrast checks pass WCAG AA threshold for the critical light/dark/high-contrast token pairs.
- Production-browser smoke has no unintended horizontal overflow at 320px or 390px and demonstrates theme interaction/persistence.

## API/example

```tsx
<ThemeProvider storageScope={`tenant:${tenantId}`} tenantTokens={{ primary: "#075da6", accent: "#0d8068" }}>
  <CitizenShell />
</ThemeProvider>
```

Invalid tenant token values are ignored by `sanitizeTenantTheme`; canonical UI remains on the safe default tokens.

## Rollback procedure

1. Revert the UI provider/token revision and redeploy the last verified web artifact.
2. If a tenant theme is unsafe or unreadable, remove its preview override and force the default light token set; persisted theme state is namespaced and can be ignored without deleting citizen data.
3. Keep complaint routes available with their local safe styles while the shared shell is disabled behind the existing deployment flag.
4. Re-run UI unit/static tests, `pnpm test:all`, production build and responsive smoke before re-enabling the revision.

## Known limitations

- This task establishes production primitives and integrates current complaint shells; the remaining canonical screens still need their feature tasks and data-backed routes.
- Full WCAG 2.2 AA audit, screen-reader certification, 200% reflow across all eight required widths, external usability study and UX/PO/UAT/QA sign-off remain post-production follow-up.
- Rich Menu visual builder/publish/rollback and tenant theme administration remain downstream P2/P6 tasks.
- The browser smoke used synthetic local data and did not configure or contact production services.
- P1-GATE, P2/P5 gates and P6-P9 tasks remain open; this evidence does not claim project completion.

## Traceability

- Plan item: `P1-UI-001`.
- Source contracts: `fullspec.md` §7/§15/§16 and `plan.md` P0-UX-001/P1-UI-001.
