# P6-BOT-001 Evidence

Status: **DONE (2026-08-11, MVP Fast-Track auto-approved under `SPEC-MVP-001` after the scoped L1 unit suite passed 100%)**

This evidence covers `P6-BOT-001`: bot personality, safety policy, messages, versioned settings, preview, publish and rollback. The automatic approval rule is the rule recorded in `fullspec.md` and `plan.md`: scoped L1 unit tests are the MVP release/phase blocker; non-unit production hardening and external UAT remain follow-up work and are not silently treated as completed.

## Requirement and invariant traceability

- Requirement families: `RF-01`, `RF-07`, `RF-08`, `RF-10`, `RF-13`.
- Invariants: `INV-AI-001` (AI is not the source of operational truth), `INV-ANSWER-001` (canonical `ANSWER|CLARIFY|HANDOFF` only), `INV-HANDOFF-001` (safe fallback/handoff), and `INV-VERSION-001` (published prompt/settings are versioned and reversible).
- Specification anchors: `fullspec.md` §10.14 generation contract, §10.15 post-generation verification, §10.16 response UX, §10.17 prompt security, §12.2 `prompt_versions` inventory, §12.4 audit, and §13 API security/error rules.
- Visual/coverage anchor: A-46, A-47 and A-91 through the admin screen manifest and the `P6-BOT-001` checklist in `plan.md`.

## Delivered files

- Domain package: `packages/bot-settings/package.json`, `packages/bot-settings/tsconfig.json`, `packages/bot-settings/src/index.ts`, `packages/bot-settings/src/bot-settings.ts`, `packages/bot-settings/src/bot-settings.test.ts`.
- API boundary: `apps/web/app/api/v1/admin/bot-settings/context.ts`, `errors.ts`, `repository.ts`, `route.ts`, `[id]/route.ts`, `[id]/preview/route.ts`, `[id]/publish/route.ts`, `[id]/rollback/route.ts`.
- Admin UI: `apps/web/app/admin/settings/bot/page.tsx`, `BotSettingsConsole.tsx`, `bot-settings.css`, plus the explicit navigation/icon entries in `apps/web/app/admin/admin-navigation.ts` and `AdminShell.tsx`.
- Database contract: `supabase/migrations/20260811150000_prompt_versions_schema.sql` and `supabase/tests/prompt_versions_schema_contract.sql`.
- Static contracts: `scripts/test_bot_settings_api.py` and the updated `scripts/test_ui_system.py`.
- Workspace wiring: root `package.json`, `apps/web/package.json`, and `pnpm-lock.yaml`.

## Implementation evidence

- Personality controls are allowlisted (`WARM|FORMAL|NEUTRAL`, `CONCISE|GUIDED`, supported locale values). Mandatory disclosure, grounding, handoff, safe-abstention and tenant-isolation controls are immutable in the domain and database policy guard.
- Message fields are normalized and unsafe HTML/instruction-like input is rejected or sanitized before persistence. The preview UI is explicitly marked `data-preview-only="true"`.
- Preview is fail-closed: without authoritative sources it returns `HANDOFF/NO_EVIDENCE`; preview labels never become production evidence. Blank/ambiguous input returns canonical `CLARIFY/AMBIGUOUS_INTENT`.
- Draft/publish/rollback uses tenant scope, idempotency keys, optimistic `rowVersion`, audit entries, version hashes, and a single published revision per tenant/settings key. Publish records `UNIT_AUTO_APPROVED` only after the scoped unit gate passes.
- API routes are explicit (no wildcard route), enforce local/test synthetic context only, and return `CONFIGURATION_UNAVAILABLE` outside that environment rather than inventing production identity or credentials.
- `prompt_versions` has composite tenant integrity, forced RLS, immutable policy checks/triggers, published-version uniqueness, and private publish/rollback functions.
- The admin console exposes locked policy, change-impact warning, source-bound preview, version history, publish/rollback, audit, keyboard focus styles and loading/empty/error/offline/permission/expired-session/conflict states at the supported responsive breakpoints.

## Commands and actual results

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/bot-settings/src/bot-settings.test.ts` | PASS, 5/5 |
| `pnpm test:unit` | PASS, 39 test files / 265 tests |
| `pnpm test:db` | PASS, 134 static contract tests |
| `Get-Content -Raw supabase/tests/prompt_versions_schema_contract.sql \| docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` | PASS, `PROMPT_VERSIONS_SCHEMA_SQL_CONTRACT_PASS` |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm typecheck:packages` | PASS, includes `packages/bot-settings/tsconfig.json` |
| `pnpm security:scan` | PASS, `SECRET_SCAN_CLEAN` |
| `pnpm build` | PASS; production route table includes bot settings page and all explicit bot-settings API routes |
| `pnpm test:all` | PASS, exit code 0; lint → typecheck → package typecheck → unit → static → security → build |
| `pnpm security:sbom` | PASS, 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest` then `pnpm release:verify` | PASS; manifest digest `ffc77099faf2f45c280a100d5e76f126de69d712f983fbe22909b7d6e5b654b9` |

## Local API/UI smoke evidence

Smoke was run against the local production artifact on `http://127.0.0.1:3210` using synthetic tenant/admin/staff fixtures. It was not a Vercel, Supabase, LINE or OpenRouter production test.

```text
GET seed versions as TENANT_ADMIN                 -> 200, one PUBLISHED version
POST draft                                        -> 201, DRAFT
same idempotency key replay                       -> 201, same resource id
HTML message input                                -> sanitized to text
preview with non-authoritative source labels      -> HANDOFF / LOW_EVIDENCE
publish                                           -> PUBLISHED / UNIT_APPROVED
staff mutation                                    -> 403
locked aiDisclosureEnabled=false                  -> 400
tenant-B lookup of tenant-A resource              -> 404
rollback to previous certified version            -> PUBLISHED / CERTIFIED
GET /admin/settings/bot TENANT_ADMIN              -> 200
GET /admin/settings/bot STAFF                     -> 200, permission-denied UI state
```

## Acceptance criteria

- Policy-lock bypass is zero in domain, API static contracts and PostgreSQL policy guard; staff cannot disable mandatory controls.
- Canonical outcomes and reason-code behavior are constrained to the fullspec contract; insufficient/preview-only evidence cannot produce an `ANSWER`.
- Unsafe markup/instruction input is sanitized or rejected, and no browser secret/provider call was added.
- Publish is versioned, auditable, idempotent and reversible; the prior certified revision can be restored.
- Tenant and role boundaries are enforced in the local boundary, with production fail-closed behavior when trusted server configuration is absent.
- The admin screen includes the required safety controls and resilient states without a mock/prototype import.

## Rollback procedure

1. Disable the bot-settings mutation/preview route through the application feature flag and keep the last published revision read-only.
2. Restore the prior certified version with the canonical rollback operation (`POST /api/v1/admin/bot-settings/:id/rollback`) or the repository rollback service; retain audit and idempotency history.
3. If the application artifact itself is implicated, redeploy the previous verified artifact and keep the `prompt_versions` table intact; do not destructively delete published history.
4. Re-run the targeted unit/static/schema contract, `pnpm test:all`, build/security checks and local role/tenant smoke before re-enabling the feature.

## Known limitations and next work

- The route/repository adapter is synthetic and local/test-only. A real authenticated server-session and Supabase persistence adapter is required for production; production currently fails closed with `CONFIGURATION_UNAVAILABLE`.
- Preview source labels are deliberately non-authoritative and cannot certify RAG answers. `P4-QA-001` remains open/blocked, so `P6-KB-001` remains blocked.
- The migration and PostgreSQL contract were validated on the local `citychatbot-p3-db`; no production Supabase migration was applied in this task.
- Full Chrome screenshot comparison, real LINE sandbox/device UAT and Vercel production smoke were not run in this local slice. No completion claim is made for those post-production surfaces.
- `P6-GATE`, P7, P8 and P9 remain open; this Task completion does not mean project completion.
