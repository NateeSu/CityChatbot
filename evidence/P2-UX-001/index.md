# P2-UX-001 — LIFF citizen shell, navigation and resilient states

Status: **DONE (MVP Fast-Track auto-approved)**  
Completed: 2026-08-11  
Approval basis: `SPEC-MVP-001` L1 unit/static contract tests and production artifact passed. External LINE/device/UAT approval is recorded as post-production evidence and is not silently claimed here.

## Requirements and references

- Requirement IDs: `RF-01`, `RF-02`, `RF-05`, `RF-14`; related `RF-04`, `RF-13`, `RF-16` identity/permission/QA behavior.
- Product contract: `fullspec.md` §6.4 LIFF identity, §7.1 citizen UX, §7.2 complaint flow, §7.3 tracking, and the `C-01`–`C-20` screen catalog.
- Progress task: `plan.md` `P2-UX-001`; prerequisites verified: `P1-UI-001`, `P0-UX-001`, `P2-LIFF-001`.
- Visual authority inspected: `gui-designs/screens/c-01-liff-home-mobile.png`, `gui-prototype` citizen shell and `screen-manifest.json`.

## Implementation

- Added `/liff` `C-01` entry page with tenant identity, mobile-first home, primary quick services, recent complaint status from the identity-scoped citizen API, safe AI prompt fallback, help/privacy entry and shared footer navigation.
- Added local/test safe landing pages for `/liff/services`, `/liff/news`, `/liff/contact` and `/liff/help`; each has a production fail-closed branch instead of exposing local fixture content.
- Added shared LIFF frame/header/footer behavior: back/close target, tenant banner, theme toggle, 44px controls, keyboard focus, touch-friendly navigation and synthetic-data disclosure.
- Added loading, empty, error, offline, permission-denied, expired-session, stale-data and feature-disabled paths with explicit retry or next-step actions.
- Corrected complaint tracking/wizard navigation from the generic `/` foundation page to the canonical `/liff` home and service/contact routes.
- Added `scripts/test_liff_shell.py` for route, identity, resilient-state, navigation, production fail-closed and responsive CSS contract checks.

## Files changed

- `apps/web/app/liff/page.tsx`
- `apps/web/app/liff/LiffHome.tsx`
- `apps/web/app/liff/LiffInfoPage.tsx`
- `apps/web/app/liff/liff.css`, `info-page.css`
- `apps/web/app/liff/services/page.tsx`, `news/page.tsx`, `contact/page.tsx`, `help/page.tsx`
- `apps/web/app/liff/complaints/ComplaintTracking.tsx`
- `apps/web/app/liff/complaints/new/ComplaintWizard.tsx`
- `scripts/test_liff_shell.py`
- `plan.md`

## Commands and real results

| Command | Result |
|---|---|
| `pnpm --filter @citychatbot/web typecheck` | PASS |
| `pnpm --filter @citychatbot/web lint` | PASS |
| `pnpm --filter @citychatbot/web build` | PASS — `/liff`, services, news, contact and help routes generated |
| `python -m unittest scripts.test_liff_shell scripts.test_gui_inventory -v` | PASS — 9 tests |
| `pnpm test:all` | PASS — 34 Vitest files / 240 unit tests, 108 Python contract tests, lint, all package typechecks, build and secret scan |
| `GET /liff`, `/liff/services`, `/liff/news`, `/liff/contact`, `/liff/help` on `127.0.0.1:3100` | PASS — all HTTP 200 |
| `GET /api/v1/citizen/complaints` with local verified identity | PASS — HTTP 200, empty result handled by Empty state |
| Same endpoint with a different tenant ID | PASS — HTTP 404; no cross-tenant result |

## Acceptance criteria

- [x] Home/service launch, tenant identity, back/close and footer navigation are implemented at canonical LIFF routes.
- [x] Thai citizen copy, 44px baseline controls, 320px minimum layout, no intentional horizontal overflow, dark/light/high-contrast shared theme and responsive CSS are present.
- [x] Recent status is fetched from the server API using tenant + verified line-user identity; no browser profile object is treated as identity truth.
- [x] Loading/empty/success/error/offline/permission/expired/stale/feature-disabled states have accessible live/alert semantics and recovery actions.
- [x] Production branch is fail-closed; local synthetic service/news/contact content is not rendered in non-local environments.
- [x] Existing complaint wizard/tracking routes no longer dead-end at the generic foundation home.

## API/UX examples

```text
GET /liff                       -> 200
GET /liff/services              -> 200
GET /liff/news                  -> 200
GET /liff/contact               -> 200
GET /liff/help                  -> 200
GET /api/v1/citizen/complaints?tenantId=<local-tenant>&lineUserId=<verified-local-user> -> 200, items=0
GET same endpoint with tenant B -> 404
```

## Rollback procedure

1. Disable the LIFF UI flag and continue serving LINE text/quick-reply fallback and the existing stable complaint routes.
2. Deploy the previous application artifact; no database destructive rollback is needed because this task adds only UI routes/styles/tests.
3. If a route causes an incident, route it to the safe information page or `/` until the corrected artifact is verified.

## Known limitations / follow-up

- Local/test pages use clearly labelled synthetic service/news/contact/help fixtures. Production requires approved content APIs, real LIFF configuration and verified LINE session wiring; provider credentials were not guessed or stored.
- External LINE in-app browser, supported-device matrix, 200% text zoom, screen-reader session, slow-3G performance and UAT screenshots remain post-production hardening evidence. No full external UAT approval is claimed.
- AI question submission intentionally shows a safe next step until the grounded chat route is enabled; it never fabricates an answer or status.

Next executable review: `P2-QA-001` is now dependency-complete at the code level but remains externally blocked until a LINE sandbox/device/UAT surface is available; if that external surface is not configured, continue with the next non-blocked phase task without relabelling the gate.
