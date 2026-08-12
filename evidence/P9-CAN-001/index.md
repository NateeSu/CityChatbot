# Evidence - P9-CAN-001

Status: **BLOCKED** (2026-08-12 — external canary dependencies unavailable)

## Traceability

- Task: `P9-CAN-001`
- Requirements: `RF-05`, `RF-06`, `RF-07`, `RF-09`, `RF-15`, `RF-16`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`
- Prerequisite: `P9-DEP-001` is DONE; production foundation is READY.

## Blocker

The internal canary cannot be opened safely because the required real test audience and external business journeys are not configured. The authenticated LINE browser tab is at the login page, and the authenticated Supabase account has no CityChatbot project. The production app correctly keeps citizen/provider endpoints fail-closed. Opening a canary with local synthetic data would violate source-of-truth and tenant-isolation requirements.

Unavailable dependencies are the same seven recorded by `P8-E2E-001`: LINE/LIFF channel and push, durable Supabase storage/index/support/routing/news targets, locked AI/RAG evaluator, and a verified staging/test cohort.

## Safe checks completed

| Check | Result |
|---|---|
| Active production deployment | PASS - Vercel `dpl_Cj5XLhyLZkKFKgUn5B3zY5Eoi1ia` is `READY` |
| Production health | PASS - `/api/health` HTTP 200, environment `production` |
| Citizen feature safety boundary | PASS - `/api/v1/citizen/services` HTTP 503, `CONFIGURATION_UNAVAILABLE` |
| Runtime errors | PASS - no Vercel runtime errors in the last 30 minutes |
| LINE/LIFF canary audience | NOT_AVAILABLE - provider session unauthenticated |
| Durable tenant-isolated canary store | NOT_AVAILABLE - no CityChatbot Supabase project |
| Certified AI/RAG canary evaluator | NOT_AVAILABLE - external evaluator/provider route not configured |
| 24-hour observation window | NOT RUN - canary cannot start safely |

No webhook, push, broadcast, database migration, upload, index activation, feature-flag enablement or production data mutation was performed.

## Acceptance status

- Canary audience and flags: **BLOCKED**.
- LINE/LIFF complaint/chat/handoff/admin/notification probes: **BLOCKED**.
- No production broadcast and no synthetic data promotion: **PASS**.
- Rollback readiness for the foundation deployment: **PASS**; see P9-DEP-001.
- P9-CAN-001 exit criteria: **NOT MET** because the required 24-hour observation cannot begin.

## Unblock procedure

1. Authenticate the authorized LINE developer account and configure the approved webhook, LIFF URL, test account and no-broadcast canary audience.
2. Provision a dedicated CityChatbot Supabase project and apply the reviewed migrations with tenant/RLS checks; keep test data isolated from any existing project.
3. Configure the locked AI/RAG evaluator and approved test corpus/index; keep unresolved conflict ledger entries quarantined.
4. Create an internal canary flag/audience and run the certified probes with audit/log/reconciliation evidence for the full approved observation window.
5. If all probes pass with no Sev1/2, leak, wrong answer or data mismatch, create a new immutable canary evidence bundle and continue to `P9-CAN-002`.

## Rollback procedure

Before the blocker is cleared, keep all citizen/provider flags disabled. If a future canary produces an incident, turn flags off immediately, restore the previous Rich Menu/webhook/model/index/configuration, reconcile test-tenant data and preserve forensic logs. Do not roll back or rewrite the immutable RC.

## Known limitations / next executable action

- This task cannot be marked DONE from the Vercel foundation deployment alone.
- P8 hardening and the external provider configuration remain open; no mock can replace those dependencies.
- Next executable action: authorized provider configuration for LINE/Supabase/AI-RAG, then rerun `P9-CAN-001`.
