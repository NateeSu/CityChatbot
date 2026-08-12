# Evidence - P9-CAN-001

Status: **IN_PROGRESS** (2026-08-12 — production data plane provisioned; provider/runtime canary wiring remains)

## Traceability

- Task: `P9-CAN-001`
- Requirements: `RF-05`, `RF-06`, `RF-07`, `RF-09`, `RF-15`, `RF-16`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`
- Prerequisite: `P9-DEP-001` is DONE; production foundation is READY.

## Current production baseline

The authenticated Supabase organization now owns a dedicated `CityChatbot Production` project in Singapore. All 25 existing reviewed migrations were applied in timestamp order through the authenticated SQL editor without running `supabase/seed.sql`. A production-gap audit found that the six canonical LINE/LIFF tables required by `fullspec.md` were absent, so additive migration `20260812120000_line_liff_schema.sql` and its static contract test were implemented, tested, and applied as migration 26.

The LINE Developer session is authenticated. The existing channel named `AI ChatBotเทศบาล v.1` currently points to an unrelated n8n webhook, so it was deliberately not overwritten. A dedicated CityChatbot channel/webhook, production runtime persistence adapter, locked AI/RAG route, and verified internal test cohort are still required before external traffic can be enabled.

## Safe checks completed

| Check | Result |
|---|---|
| Active production deployment | PASS - Vercel `dpl_Cj5XLhyLZkKFKgUn5B3zY5Eoi1ia` is `READY` |
| Production health | PASS - `/api/health` HTTP 200, environment `production` |
| Citizen feature safety boundary | PASS - `/api/v1/citizen/services` HTTP 503, `CONFIGURATION_UNAVAILABLE` |
| Runtime errors | PASS - no Vercel runtime errors in the last 30 minutes |
| Supabase production project | PASS - dedicated project is healthy in Singapore; PostgreSQL 17.6 |
| Reviewed migrations | PASS - 25/25 existing migrations plus 1 additive LINE/LIFF migration; production seed not run |
| Production tenant RLS | PASS - before LINE migration, 82/82 tenant tables had RLS enabled and forced; after LINE migration, the six new tables reported RLS disabled 0 and RLS not forced 0 |
| Composite tenant FK audit | PASS - 195 tenant-bearing FKs inspected; tenant-to-tenant FK missing tenant pair = 0 |
| LINE/LIFF table grants | PASS - 6/6 tables present, 6 scoped read policies, anon grants 0, authenticated write grants 0 |
| Broad policy review | PASS - one broad read policy is the intentional global `permissions` catalog; no tenant table broad policy was introduced |
| LINE provider session | PASS - authenticated provider/channel inventory inspected; existing unrelated webhook preserved |
| LINE/LIFF canary audience | IN_PROGRESS - dedicated channel, LIFF app and test audience not yet activated |
| Certified AI/RAG canary evaluator | IN_PROGRESS - user-authorized provider secret is available but model/index/evaluator route remains locked and unconfigured |
| 24-hour observation window | NOT RUN - canary cannot start safely |

No production seed, upload, knowledge-index activation, push, broadcast, webhook cutover, or citizen feature-flag enablement was performed. Secret values were not written to the repository or this evidence.

## Files changed

- `supabase/migrations/20260812120000_line_liff_schema.sql`
- `supabase/migrations/20260812130000_line_runtime_functions.sql`
- `apps/web/app/api/v1/line/webhooks/[webhookKey]/route.ts`
- `apps/web/app/api/v1/line/webhooks/[webhookKey]/store.ts`
- `packages/line/src/durable-webhook.ts`
- `packages/line/src/durable-webhook.test.ts`
- `packages/config/src/env.ts`
- `packages/config/src/env.test.ts`
- `scripts/test_line_liff_schema.py`
- `scripts/test_line_runtime_schema.py`
- `scripts/test_line_webhook_api.py`
- `plan.md`
- `evidence/P9-CAN-001/index.md`

## Commands and actual results

| Command / check | Actual result |
|---|---|
| `python -m unittest scripts.test_line_liff_schema -v` | PASS - 6/6 tests |
| `python -m unittest scripts.test_line_webhook_api scripts.test_line_runtime_schema scripts.test_line_liff_schema -v` | PASS - 15/15 tests |
| `pnpm exec vitest run packages/config/src/env.test.ts packages/line/src/durable-webhook.test.ts` | PASS - 2 files, 9 tests |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS - canonical `/api/v1/line/webhooks/[webhookKey]` production route compiled |
| `pnpm security:scan` | PASS - `SECRET_SCAN_CLEAN` |
| Supabase migration execution, files `20260810000000` through `20260811230000` | PASS - each returned `Success. No rows returned` |
| Supabase migration execution, `20260812120000_line_liff_schema.sql` | PASS - `Success. No rows returned` |
| Production RLS/policy audit | PASS - public tables 85 before LINE migration; tenant tables 82, RLS disabled 0, FORCE RLS missing 0, policies 129 |
| Production composite FK audit | PASS - tenant tables 82, tenant-bearing FKs 195, missing tenant pair 0, tenant unique constraints 146 |
| Production LINE/LIFF schema audit | PASS - tables present 6, RLS disabled 0, FORCE RLS missing 0, scoped policies 6, anon grants 0, authenticated write grants 0 |
| Production runtime role audit | PASS - `citychatbot_app` login is non-superuser with connection limit 12; direct public table access denied; only two private functions executable |
| Git/Vercel deployment | PASS - commit `e192c66`; deployment `4QGgHZXqfMmLAnZqeHcG6VaA9Ztt` READY in Production |
| Production webhook fail-closed smoke | PASS - invalid key/signature returned HTTP 403 `FORBIDDEN`; Vercel logs show request and Error count 0 |

## Acceptance status

- Canary audience and flags: **IN_PROGRESS**.
- Durable tenant-isolated production data plane: **PASS**.
- LINE/LIFF complaint/chat/handoff/admin/notification probes: **NOT RUN** pending runtime/provider wiring.
- No production broadcast and no synthetic data promotion: **PASS**.
- Rollback readiness for the foundation deployment: **PASS**; see P9-DEP-001.
- P9-CAN-001 exit criteria: **NOT MET** because the required 24-hour observation cannot begin.

## Unblock procedure

1. Add the trusted production persistence adapters and canonical webhook/LIFF routes; verify raw-body signature, encrypted payload persistence and idempotent job handoff on the real database.
2. Create or select a dedicated LINE channel without modifying unrelated production webhooks, then configure its webhook, LIFF URL, test account and no-broadcast canary audience.
3. Configure the locked AI/RAG evaluator and approved corpus/index; keep unresolved conflict-ledger entries quarantined.
4. Create an internal canary flag/audience and run the certified probes with audit/log/reconciliation evidence for the full observation window.
5. If all probes pass with no Sev1/2, leak, wrong answer or data mismatch, mark this task DONE and continue to `P9-CAN-002`.

## Rollback procedure

Before the blocker is cleared, keep all citizen/provider flags disabled. If a future canary produces an incident, turn flags off immediately, restore the previous Rich Menu/webhook/model/index/configuration, reconcile test-tenant data and preserve forensic logs. Do not roll back or rewrite the immutable RC.

## Known limitations / next executable action

- This task cannot be marked DONE from schema provisioning alone.
- The existing municipal LINE channel was not reused because its webhook is already assigned to another system; overwriting it would be an unsafe external mutation.
- The production application still intentionally fails closed because its current API repositories are local/test adapters; durable runtime wiring must pass tests before provider cutover.
- Next executable action: implement the trusted database/runtime adapters and dedicated LINE webhook route, configure server-only production secrets, deploy, then run the no-broadcast canary.
