# P2-RM-001 — Rich Menu schema, Builder, preview, publish and rollback

Status: **DONE (MVP Fast-Track auto-approved)**  
Completed: 2026-08-11  
Approval rule: `SPEC-MVP-001` — L1 unit tests are the MVP blocking gate; static, integration, external LINE, device/UAT and production-provider checks remain explicit post-production work unless they are technical deployment blockers.

## Requirements and authoritative references

- Requirement IDs: `RF-01`, `RF-02`, `RF-05`, `RF-10`; related tenant/ops/QA controls `RF-03`, `RF-13`, `RF-15`, `RF-16`.
- Product contract: `fullspec.md` §6.5 Rich Menu, API catalog §17, screen `A-93`.
- Progress task: `plan.md` `P2-RM-001`; canonical state machine remains `DRAFT → VALIDATED → PUBLISHING → PUBLISHED`, failure `PUBLISHING → FAILED`, and previous `PUBLISHED → SUPERSEDED`.
- Visual authority: `gui-designs/rich-menu/RM-01-main*`, `RM-01-main-tap-map*`, and `gui-prototype/screen-manifest.json` `A-93`.

## Files changed

- `packages/rich-menu/src/rich-menu.ts`, `src/rich-menu.test.ts`, `src/index.ts`, package metadata and README — typed validation/service/provider boundary, tenant actor checks, optimistic row version, scoped idempotency, audit, provider lifecycle, failure preservation and rollback.
- `supabase/migrations/20260810140000_rich_menu_schema.sql` and `supabase/tests/rich_menu_schema_contract.sql` — tenant-owned versions/areas, composite tenant keys, constraints, transition/immutability triggers, outbox idempotency, forced RLS and browser read-only policy.
- `apps/web/app/api/v1/admin/rich-menu-versions/**` — the six canonical operations exposed by the spec (GET/POST collection, PATCH, validate, publish, rollback); local/test only until the trusted LINE/object-storage provider is configured.
- `apps/web/app/admin/settings/rich-menu/page.tsx`, `RichMenuBuilder.tsx`, `rich-menu.css` — `A-93` Builder with version history, coordinate preview, deep-link editor, asset metadata, state actions, audit list, theme toggle and resilient states.
- `scripts/test_rich_menu_api.py`, `supabase/README.md`, `plan.md`.

## Commands and real results

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/rich-menu/src/rich-menu.test.ts apps/web/app/ui/theme.test.ts` | PASS — 2 files, 13 tests |
| `python -m unittest scripts.test_rich_menu_api scripts.test_rich_menu_schema -v` | PASS — 10 tests |
| `pnpm --filter @citychatbot/web typecheck` | PASS |
| `pnpm --filter @citychatbot/web lint` | PASS |
| `pnpm --filter @citychatbot/web build` | PASS — route table includes `A-93` and all Rich Menu API routes |
| `pnpm test:all` | PASS — 34 Vitest files / 240 unit tests, 103 Python contract tests, lint, all package typechecks, secret scan and build |
| `Get-Content supabase/migrations/20260810140000_rich_menu_schema.sql -Raw \| docker exec -i citychatbot-p3-db psql -U postgres -d citychatbot -v ON_ERROR_STOP=1 -f -` | PASS — migration applied/re-applied on local Postgres |
| `Get-Content supabase/tests/rich_menu_schema_contract.sql -Raw \| docker exec -i citychatbot-p3-db psql -U postgres -d citychatbot -v ON_ERROR_STOP=1 -f -` | PASS — `RICH_MENU_SCHEMA_SQL_CONTRACT_PASS` |
| `pnpm security:sbom` | PASS — 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest` and `pnpm release:verify` | PASS — 5 files; digest `c375dee08da0b97bdb43a87053facf196d4f1b744c696c9db37f2e553ccf4a39` |

## API lifecycle smoke

Against the local synthetic web server (`127.0.0.1:3100`) using the tenant-admin fixture and no external credential:

```text
GET /api/v1/admin/rich-menu-versions?...role=TENANT_ADMIN -> 200
POST /api/v1/admin/rich-menu-versions -> 201, state=DRAFT
POST /{id}/validate -> 200, state=VALIDATED
POST /{id}/publish -> 200, state=PUBLISHED, providerMenuId=local-rich-menu-1
GET /api/v1/admin/rich-menu-versions -> 200, versions=2, audit=5
```

The five canonical tap rectangles match the design asset: `(0,0,1667,1000)`, `(1667,0,833,1000)`, `(0,1000,833,686)`, `(833,1000,834,686)`, `(1667,1000,833,686)`. The service unit suite additionally proves overlap/gap/unsafe URL/unsafe storage rejection, tenant/role isolation, idempotency, publish failure preserving last-known-good and superseded-version rollback.

## Acceptance criteria

- [x] Rich Menu schema is additive, tenant-scoped, composite-keyed, versioned, forced-RLS and denies browser writes.
- [x] Builder preview uses the canonical 2500×1686 geometry and five actions; deep links are displayed and editable only in mutable states.
- [x] Image MIME, dimensions, aspect ratio, size, SHA-256 and private tenant storage path are validated before `VALIDATED`/publish.
- [x] Publish creates a new provider object in the service boundary, records audit/idempotency, switches default only after upload, and never replaces last-known-good on provider failure.
- [x] `SUPERSEDED`/`PUBLISHED` rollback is one guarded, auditable action with expected row version.
- [x] Light/dark/high-contrast theme tokens, keyboard focus, responsive fluid canvas, and shared loading/empty/error/offline/permission/expired/conflict/stale states are present.
- [x] Production page and API fail closed with `CONFIGURATION_UNAVAILABLE`; synthetic provider data cannot be exposed as production LINE state.

## Rollback procedure

1. Disable the per-tenant Rich Menu/Builder feature flag or deploy the prior release artifact.
2. Call the canonical rollback operation for the known-good superseded version with its current `expectedVersion` and a new idempotency key; verify the provider default and audit record.
3. If the schema change must be reverted, keep the additive migration in place, disable the feature, restore from the verified database backup, and ship a reviewed forward migration. There is intentionally no destructive `down` migration.

## Known limitations / follow-up

- This task uses an in-memory LINE provider and local synthetic fixture only. A trusted LINE API adapter, private object-storage upload, real tenant membership lookup and production credentials remain downstream deployment work; non-local API requests return `503 CONFIGURATION_UNAVAILABLE`.
- The Builder edits validated metadata/deep links; binary upload and image processing are intentionally not enabled until the storage/provider boundary is configured.
- External LINE sandbox, device matrix, visual regression screenshots and UAT/PO/UX approval remain post-production evidence. `P2-UX-001` and `P2-QA-001` are still open, and `P2-GATE` is not being re-labelled as full external acceptance.

Next executable task: `P2-UX-001` (its `P1-UI-001` and `P0-UX-001` prerequisites are now DONE; keep LINE text fallback and production UI flag behavior explicit).
