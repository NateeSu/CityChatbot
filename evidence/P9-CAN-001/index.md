# Evidence - P9-CAN-001

Status: **DONE (AUTO_CLOSED_UNIT_GREEN + PRODUCTION_E2E_VERIFIED)** (unit gate 2026-08-12; production E2E 2026-08-13; report `evidence/P9-CAN-001/unit-gate-report.json`, reportHash `de24536b083102b6feb74efe0fc6cb1756a5c0409799b193b5f29af430a9bb40`)

## Traceability

- Task: `P9-CAN-001`
- Requirements: `RF-05`, `RF-06`, `RF-07`, `RF-09`, `RF-15`, `RF-16`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`, `INV-ANSWER-001`, `INV-CLAIM-001`, `INV-HANDOFF-001`
- Prerequisite: `P9-DEP-001` is DONE; production foundation is READY.

## Current production baseline

### Real LINE E2E delivery checkpoint (2026-08-13)

This is the production proof that was previously pending. It used only the
dedicated `CityChatbot Canary` account and the already-open authenticated LINE
Desktop session; no unrelated LINE channel, broadcast, or public tenant was
changed.

- LINE Developers initially showed `Use webhook=false` for this channel. The
  switch was enabled and re-read as `true`; the configured webhook URL and
  provider verification remained unchanged.
- Forward-only migration
  `supabase/migrations/20260813020000_fix_line_runtime_claim_qualification.sql`
  was applied in the production Supabase SQL editor. It qualifies tenant and
  row references in both durable worker claim functions. The SQL editor
  returned `Success. No rows returned`.
- The latest READY production deployment is
  `dpl_6vhzdaSbEGP7tHJdPAX6YWLRvei8`, source commit `d7122d0`, region `sin1`,
  with alias `https://city-chatbot-murex.vercel.app`.
- One new benign real LINE text event reached the production webhook with
  HTTP `200`, `acceptedEventCount=1`, `duplicateEventCount=0`, and a `73 ms`
  acknowledgment. Its deferred worker completed `OK` in `978 ms`, draining
  four durable test events with `chatProcessed=4`, `deliveryAccepted=4`,
  `retryScheduled=0`, and `deadLettered=0`.
- The LINE Desktop conversation visibly showed the canonical safe-abstention
  reply. Because the production knowledge index has zero active public
  versions/generations/chunks/facts, the reply was CLARIFY/HANDOFF behavior;
  no factual answer was asserted.
- A redacted one-hour Supabase aggregate returned
  `inbound_processed=4`, `outbound_api_accepted=4`,
  `inbox_failed_or_dlq=0`, and `outbound_failed_or_dlq=0`. No raw message,
  LINE user ID, webhook key, token, or encrypted payload was copied into this
  evidence.
- Post-fix Vercel verification found no `line_worker_step_failed` log and no
  runtime error cluster in the selected five-minute window.

### Current production deployment verification (2026-08-13)

After the real LINE journey, the forward-only migration and evidence updates
were pushed as commit `59c26d2`. Vercel created the latest READY production
deployment `dpl_Chu4YACeLJ4mGywAzmrbBhjPigEH` in `sin1` and assigned the
production alias `https://city-chatbot-murex.vercel.app`. The real message
journey above remains attributed to the preceding runtime deployment
`dpl_6vhzdaSbEGP7tHJdPAX6YWLRvei8`; the current deployment contains the same
runtime fix plus the forward-only migration/documentation checkpoint.

- Vercel authenticated fetch of `/api/health`: HTTP `200`,
  `{"status":"ok","service":"web","environment":"production"}`.
- Current deployment inspection: `READY`, source commit `59c26d2`, region
  `sin1`, alias assignment successful.
- Current deployment runtime-error scan for the selected ten-minute window:
  no runtime errors and no logs returned.
- Current release artifacts: `pnpm release:manifest` and
  `pnpm release:verify` passed; an explicit immutable RC written to
  `artifacts/release-candidate-2026-08-13.json` was verified successfully
  (digest `92588376171acd609deef9440488da2df4d8675e8c4c51a0ff60c39bfe9ec6f2`).

#### E2E rollback and known limitations

Run `supabase/ops/deactivate_line_chat_production.sql`, set
`LINE_CHAT_RUNTIME_ENABLED=false`, and promote the previous READY deployment
if the webhook, worker, provider, or ledger smoke regresses. Preserve durable
rows for reconciliation; do not delete them. Certified ACTIVE knowledge is
still intentionally absent, so production remains safe-abstention only and
does not claim certified factual RAG coverage.

## Production LINE activation checkpoint (2026-08-13)

This checkpoint supersedes every earlier statement in this evidence file that
the direct LINE runtime, worker environment, or tenant chat flag is disabled.
The real inbound/outbound chat journey is recorded in the E2E checkpoint above.

- Applied `20260813010000_line_chat_runtime.sql` to the dedicated production
  Supabase project. Verification passed for 12 runtime columns, 9 private
  functions, 2 claim indexes, FORCE RLS on both durable tables, and zero
  `anon`/`authenticated` execute grants.
- Added the server-only production worker/user hash secrets and enabled
  `LINE_CHAT_RUNTIME_ENABLED`. No secret value was written to source or evidence.
- Fixed the webhook request path so LINE receives its HTTP acknowledgement
  before the durable worker runs. Next.js `after()` keeps the persisted worker
  work in the function lifecycle without blocking the provider response.
- Added root `vercel.json` with the single Hobby-compatible `sin1` region,
  colocating Vercel Functions with Supabase Singapore. Deployment
  `dpl_2bNYaEftcKMh6LxEvuUiv9iDV6Q5` from commit `40d2b9c` is READY and owns the
  production aliases.
- LINE Developers `Verify` returned `Success`. The post-activation request
  returned HTTP `200` in `75 ms`, `workerStatus=DEFERRED`, zero accepted/duplicate
  events (the canonical verification probe), and no runtime error cluster.
- Ran `supabase/ops/activate_line_chat_production.sql`. The idempotent transaction
  set the single ACTIVE channel to `HEALTHY`, recorded `last_verified_at`, enabled
  the tenant chat flag in `SAFE_ABSTENTION` mode, and appended two redacted SYSTEM
  audit events. Verification passed 5/5; FAILED/DLQ durable jobs remain zero.
- Production currently has zero ACTIVE public knowledge versions, generations,
  chunks, or approved facts. Consequently the canonical behavior is safe
  CLARIFY/HANDOFF; this checkpoint makes no claim that factual RAG answers are
  available and no uncertified corpus was promoted.

### Production recovery files

- `apps/web/app/api/v1/line/webhooks/[webhookKey]/route.ts`
- `scripts/test_line_webhook_api.py`
- `vercel.json`
- `supabase/ops/activate_line_chat_production.sql`
- `supabase/ops/deactivate_line_chat_production.sql`
- `plan.md`
- `evidence/P9-CAN-001/index.md`

### Production recovery tests and actual results

| Command / check | Actual result |
|---|---|
| `python -m unittest scripts.test_line_webhook_api -v` | PASS - 10/10 contract tests |
| `pnpm test:all` | PASS - lint, all package typechecks, Vitest 63/63 files and 387/387 tests, secret scan, SBOM, build, release manifest, Python 331/331 tests |
| Vercel deployment inspection | PASS - READY, commit `40d2b9c`, region `sin1`, aliases assigned |
| LINE Developers webhook verification after tenant activation | PASS - provider UI `Success`, production HTTP 200 in 75 ms |
| Supabase activation verification | PASS - 5/5 checks; one ACTIVE+HEALTHY channel, one AI-enabled tenant, two audit events, zero FAILED/DLQ jobs |
| Production knowledge readiness query | SAFE-EMPTY - active public versions/generations/chunks/approved facts all `0`; factual answering remains fail-closed |

### Recovery and rollback

Run `supabase/ops/deactivate_line_chat_production.sql` to atomically disable the
tenant chat flag, mark the channel `DEGRADED`, and append rollback audit events.
Then set `LINE_CHAT_RUNTIME_ENABLED=false` and redeploy the previous READY
deployment. Durable inbox/message rows are retained for reconciliation; no
rollback step deletes citizen data or rewrites an immutable release artifact.

### Historical remaining production proof (superseded 2026-08-13)

The earlier checkpoint correctly withheld the claim until a real LINE message
and resulting inbound/outbound/API-accepted ledger were observed. That proof is
now complete and is recorded above without retaining the message or user
identity.

The following authenticated production checkpoint supersedes the earlier
"not signed in" note below. It was executed against the dedicated canary
tenant only; no public citizen tenant, broadcast, AI traffic, or existing
municipal LINE channel was changed.

## Latest authenticated production checkpoint (2026-08-12)

- Production URL: `https://city-chatbot-murex.vercel.app`
- LIFF app: dedicated canary LIFF `2011079856-gKTrdPNA`; the existing LINE
  Login session completed authentication and the app rendered the Thai
  canary home screen.
- Runtime path: `POST /api/v1/liff/session` returned `201`,
  `GET /api/v1/citizen/bootstrap` returned `200`, and the authenticated
  complaint list returned `200` after the forward list-projection fix.
- Complaint create: a synthetic complaint was created through the real LIFF
  form and the receipt page showed `CITYCHATBOT-2569-000001`, status
  `RECEIVED`, and a detail timeline. The payload contained no PII and was
  explicitly marked synthetic.
- Idempotency: replaying the same tenant, LINE user, idempotency key, request
  hash, and complaint payload returned the same complaint id/number with
  `idempotent_replay=true`; no second complaint was created.
- Cleanup: the exact canary complaint was transitioned to `CANCELLED` with
  `row_version=2` through a constrained production SQL operation. It was not
  deleted, preserving the audit/status timeline; the user-facing tracking
  view showed the cancelled state.
- Isolation: the runtime role could execute the scoped private wrappers while
  direct `SELECT` on `public.complaints` remained denied.

The two forward-only migrations applied to production are:

- `20260812170000_fix_liff_identity_return.sql` — qualifies the LIFF identity
  persistence return projection and conflict-update row version.
- `20260812180000_fix_citizen_list_projection.sql` — groups the pagination
  flag in the complaint list projection, fixing the PostgreSQL aggregate
  error that previously caused list requests to return `503`.

The durable LINE consumer/provider implementation is now present in the
production bundle and passed the automatic unit gate. It claims leased inbox
jobs, rehydrates only validated text events from encrypted payloads, routes
through the canonical chat service, enqueues encrypted/idempotent outbound
responses, retries provider timeout/429/5xx failures, and dead-letters
malformed or exhausted work. The runtime migration, scoped Vercel environment,
regional deployment, provider verification, and tenant activation are complete
as recorded in the 2026-08-13 checkpoint above. Auto-reply, greeting, group
participation, broadcast, and uncertified factual RAG answers remain off.

The former observation window is advisory under the autonomous MVP rule. The
direct LINE response path is enabled for the dedicated tenant; a real inbound
message is still required for end-to-end delivery evidence.

## Latest verified production checkpoint (2026-08-12)

The latest production code includes the citizen complaint runtime and the
optimistic-concurrency fix for additional information. The public complaint
projection now exposes only the non-sensitive `rowVersion` token; the
production message route rejects a missing/unsafe `expectedVersion` instead
of defaulting to version 1. Additive migration
`20260812160000_citizen_public_row_version.sql` was applied in the Supabase
SQL editor in small verified steps: the original projection was renamed to a
private base function, the wrapper was created, and only `citychatbot_app`
received execute privilege.

Production boundary verification through the runtime role returned:

- LIFF resolver rows: `1` for the dedicated canary LIFF app, with the app enabled.
- `citychatbot_app` execute on the row-version projection: `true`.
- `citychatbot_app` execute on the private base projection: `false`.
- Direct `SELECT` on `public.complaints`: `false`.
- The dedicated canary tenant still has citizen AI traffic disabled and no
  broadcast/auto-reply/group participation is enabled.

The latest Vercel production deployment for the CSP allowlist is READY. A
browser smoke reached the LINE Login authorization surface after the
deployment (the previous LIFF client-feature failure was resolved by the
production CSP allowlist). The available Chrome session is not signed in to
the dedicated LINE Login channel, so the authenticated LIFF session,
bootstrap, complaint create and receipt journey cannot yet be certified.
This is an external-authentication blocker, not a reason to enable public
traffic or to fabricate a user identity.

Latest local verification after the row-version change: `pnpm test:unit`
PASS (53 files, 347 tests); `pnpm test:db` PASS (215 tests); `pnpm lint`
PASS; `pnpm typecheck` and `pnpm typecheck:packages` PASS; `pnpm build` PASS;
release manifest and release-candidate verification PASS; `pnpm
security:scan` PASS (`SECRET_SCAN_CLEAN`).

The latest production deployment for commit `2771f66` is READY. Production
smoke on `https://city-chatbot-murex.vercel.app` returned health `200`,
unauthenticated citizen bootstrap/complaint requests returned `401`, and the
LIFF session route rejected `GET` with `405` as designed. The production CSP
contains `api.line.me`, `access.line.me`, `liff.line.me`, and
`static.line-scdn.net`, while production `unsafe-eval` is absent. The LIFF
browser smoke reached the LINE Login page; it did not proceed to session or
bootstrap because the available Chrome session is not signed in.

The authenticated Supabase organization now owns a dedicated `CityChatbot Production` project in Singapore. All 25 existing reviewed migrations were applied in timestamp order through the authenticated SQL editor without running `supabase/seed.sql`. A production-gap audit found that the six canonical LINE/LIFF tables required by `fullspec.md` were absent, so additive migration `20260812120000_line_liff_schema.sql` and its static contract test were implemented, tested, and applied as migration 26.

The LINE Developer session is authenticated. The existing channel named `AI ChatBotเทศบาล v.1` currently points to an unrelated n8n webhook, so it was deliberately not overwritten. The owner accepted LINE's data-use terms and a dedicated `CityChatbot Canary` Messaging API channel was enabled on the free plan. Greeting, auto-reply, group participation, broadcasts, webhooks and citizen AI traffic remain disabled. Production runtime persistence is deployed; credential/runtime alignment, locked AI/RAG route, and a verified internal test cohort are still required before external traffic can be enabled.

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
| Dedicated LINE OA | PASS - `CityChatbot Canary` created without modifying the existing municipal channel |
| Messaging API channel | PASS - dedicated channel enabled on free plan; token validated against LINE bot-info API; provider-owned destination matched |
| LINE/LIFF canary audience | IN_PROGRESS - dedicated encrypted channel metadata, enabled LIFF app, signed webhook URL, runtime resolver and fail-closed canary tenant are provisioned; authenticated LIFF journey and observation window remain open |
| Certified AI/RAG canary evaluator | IN_PROGRESS - user-authorized provider secret is available but model/index/evaluator route remains locked and unconfigured |
| 24-hour observation window | NOT RUN - real LINE Login session is not yet available and public/AI traffic remains disabled |

No production seed, upload, knowledge-index activation, push, broadcast, webhook cutover, or citizen feature-flag enablement was performed. Secret values were not written to the repository or this evidence.

## Files changed

- `supabase/migrations/20260812120000_line_liff_schema.sql`
- `supabase/migrations/20260812130000_line_runtime_functions.sql`
- `supabase/migrations/20260812170000_fix_liff_identity_return.sql`
- `supabase/migrations/20260812180000_fix_citizen_list_projection.sql`
- `apps/web/app/api/v1/line/webhooks/[webhookKey]/route.ts`
- `apps/web/app/api/v1/line/webhooks/[webhookKey]/store.ts`
- `apps/web/app/api/v1/line/worker/route.ts`
- `apps/web/app/api/v1/line/worker/runtime.ts`
- `apps/web/src/server/runtime-database.ts`
- `supabase/migrations/20260813010000_line_chat_runtime.sql`
- `supabase/migrations/20260813020000_fix_line_runtime_claim_qualification.sql`
- `packages/line/src/durable-webhook.ts`
- `packages/line/src/durable-chat.test.ts`
- `packages/chat/src/durable-line-worker.ts`
- `packages/chat/src/durable-line-worker.test.ts`
- `packages/line/src/durable-webhook.test.ts`
- `packages/config/src/env.ts`
- `packages/config/src/env.test.ts`
- `scripts/test_line_liff_schema.py`
- `scripts/test_line_runtime_schema.py`
- `scripts/test_line_webhook_api.py`
- `scripts/test_liff_runtime_schema.py`
- `scripts/test_citizen_runtime_schema.py`
- `plan.md`
- `evidence/P9-CAN-001/index.md`

## Commands and actual results

| Command / check | Actual result |
|---|---|
| `python -m unittest scripts.test_line_liff_schema -v` | PASS - 6/6 tests |
| `python -m unittest scripts.test_line_webhook_api scripts.test_line_runtime_schema scripts.test_line_liff_schema -v` | PASS - 15/15 tests |
| `pnpm exec vitest run packages/config/src/env.test.ts packages/line/src/durable-webhook.test.ts` | PASS - 2 files, 9 tests |
| Full unit regression after runtime-schema correction | PASS - 52 files, 343 tests |
| Full Python contract/static suite | PASS - 208 tests |
| `pnpm lint`; web/package typechecks; `pnpm security:scan` | PASS - lint and all TypeScript projects clean; `SECRET_SCAN_CLEAN` |
| Signed empty-event verification probe tests | PASS - 2 files, 15 tests; valid signature/destination returns 200 without persistence |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS - canonical `/api/v1/line/webhooks/[webhookKey]` production route compiled |
| `pnpm security:scan` | PASS - `SECRET_SCAN_CLEAN` |
| `pnpm exec tsc -p packages/line/tsconfig.json --noEmit` | PASS |
| `pnpm exec tsc -p packages/chat/tsconfig.json --noEmit` | PASS |
| `pnpm exec tsc -p apps/web/tsconfig.json --noEmit` | PASS |
| `pnpm exec vitest run packages/line/src/durable-chat.test.ts packages/chat/src/durable-line-worker.test.ts --reporter=dot` | PASS - 2 files, 8 tests |
| `python -m unittest scripts.test_line_runtime_schema scripts.test_line_webhook_api -v` | PASS - 16/16 tests after claim qualification fix |
| `pnpm --filter @citychatbot/web typecheck` | PASS |
| `pnpm --filter @citychatbot/web lint` | PASS |
| `python scripts/secret_scan.py` | PASS - `SECRET_SCAN_CLEAN` |
| Production Supabase migration `20260813020000_fix_line_runtime_claim_qualification.sql` | PASS - SQL editor returned `Success. No rows returned` |
| Real LINE webhook/worker E2E on `dpl_6vhzdaSbEGP7tHJdPAX6YWLRvei8` | PASS - HTTP 200; accepted 1; worker `OK`; 4 chat processed; 4 provider API accepted; retries/DLQ 0 |
| Redacted production ledger aggregate, one-hour window | PASS - inbound `PROCESSED=4`; outbound `API_ACCEPTED=4`; FAILED/DLQ `0/0` |
| Vercel post-fix worker-failure/runtime-error scan | PASS - no `line_worker_step_failed`; no runtime errors in selected five-minute window |
| `python -m unittest scripts.test_line_webhook_api scripts.test_line_runtime_schema scripts.test_line_liff_schema scripts.test_liff_runtime_schema scripts.test_citizen_runtime_schema -v` | PASS - 29 tests |
| `pnpm lint` | PASS |
| `pnpm typecheck:packages` | PASS |
| `pnpm test:unit` | PASS - 57 files, 365 tests |
| `pnpm build` | PASS - `/api/v1/line/worker` and webhook routes compiled |
| `python scripts/unit_gate.py --task-id P9-CAN-001` | PASS - 5/5 commands; Runner closed this task and queued `P9-CAN-002` |
| `python -m unittest scripts.test_liff_runtime_schema scripts.test_citizen_runtime_schema scripts.test_line_liff_schema scripts.test_line_runtime_schema scripts.test_line_webhook_api -v` | PASS - 26/26 tests |
| `pnpm test:unit` | PASS - 53 files, 347 tests |
| `pnpm test:db` | PASS - 219 tests |
| `pnpm lint` | PASS |
| `pnpm typecheck`; `pnpm typecheck:packages` | PASS |
| `pnpm build` | PASS - Next production build compiled the canonical LIFF, citizen, and LINE webhook routes |
| Latest `pnpm test:unit` after the production fix | PASS - 63 files, 387 tests |
| Latest `pnpm test:db` after refreshing the post-build release manifest | PASS - 333 Python contract/database tests |
| Latest explicit release-manifest and RC verification | PASS - manifest digest `6cd8526f583b48518a13855fb74b5e6d32304d1d54fbfb18e970672fcf8e0cce`; current RC digest recorded above |
| Vercel production runtime error/warning scan, last 2 hours | PASS - no runtime errors or warning/error logs returned |
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
- LINE signed production probe: **PASS** with HTTP 200 for the configured dedicated webhook; a synthetic signed duplicate was persisted idempotently and cleaned up with exact canary identifiers.
- Authenticated LIFF session/bootstrap/complaint list/create/detail/idempotent replay: **PASS** on the dedicated synthetic canary tenant; the synthetic row was then constrained to `CANCELLED` for cleanup.
- Direct LINE text chat/AI/handoff/provider delivery implementation: **PASS (UNIT GATE + PRODUCTION E2E)**; production runtime and tenant flag are **ON in SAFE_ABSTENTION mode** after migration/environment/provider verification. Real inbound, canonical safe-abstention reply, encrypted durable processing, and provider `API_ACCEPTED` reconciliation passed.
- No production broadcast and no synthetic data promotion: **PASS**.
- Rollback readiness for the foundation deployment: **PASS**; see P9-DEP-001.
- P9-CAN-001 exit criteria: **MET for the authoritative automatic unit gate and the dedicated real production LINE journey**. Extended observation and certified knowledge activation remain follow-up hardening.

## Unblock procedure

1. Keep production knowledge empty until certified ingestion/RAG gates are complete.
2. Preserve only redacted counts, reason code, latency, deployment id and correlation evidence; never copy provider tokens, webhook keys, raw payloads or citizen identifiers into evidence.

## Rollback procedure

Keep factual RAG and broadcast features disabled while certification is incomplete. If a future canary produces an incident, turn the affected flags off immediately, restore the previous Rich Menu/webhook/model/index/configuration, reconcile test-tenant data and preserve forensic logs. Do not roll back or rewrite the immutable RC.

## Known limitations / next executable action

- The task is closed by the authoritative automatic unit-gate rule; schema provisioning and production traffic remain separately evidenced.
- The existing municipal LINE channel was not reused because its webhook is already assigned to another system; overwriting it would be an unsafe external mutation.
- LINE legal acceptance is resolved: the owner accepted the agreement and Messaging API is enabled on the dedicated free-plan channel.
- The dedicated LINE webhook is saved and verified, and authenticated LIFF session/bootstrap/complaint smoke is complete. Keep the dedicated app restricted to the canary audience until locked RAG certification and the observation window are complete.
- Direct LINE text chat is enabled for the dedicated production tenant in `SAFE_ABSTENTION` mode. Do not claim factual municipal Q&A until certified ACTIVE public knowledge is ingested; with the current empty production index the required behavior is CLARIFY/HANDOFF.
- The Supabase transaction-pooler TLS connection is encrypted but currently uses `rejectUnauthorized: false` because the project UI did not offer a CA download on its free plan. Replace this with CA verification when the certificate is available.
- Production LINE E2E proof is complete. Next executable work is the remaining non-blocking P8/P9 certification and knowledge-index hardening; factual RAG traffic stays fail-closed until those gates pass.

## Automated unit gate checkpoint — 2026-08-12T23:12:36Z

<!-- unit-gate-runner -->
Status: **PASSED**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `6d8c4ba311e0943ca66b481f6be05170de5c3bd7`  
Report hash: `de24536b083102b6feb74efe0fc6cb1756a5c0409799b193b5f29af430a9bb40`

### Unit-gate result

- Manifest: `task-unit-gates.v1` (`9ad089fc062c66236b85d5a2a20b0ca281734008baea3cef35bfeef49adf2ff5`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `7ba669f3143ba6d4e46b701aaefb68de6a69198faf61b437d4bd9640299b7def`
- Pass/total: `5/5` required test IDs
- Command pass/total: `5/5`

### Commands

- `pnpm exec tsc -p packages/line/tsconfig.json --noEmit` → exit `0`
- `pnpm exec tsc -p packages/chat/tsconfig.json --noEmit` → exit `0`
- `pnpm exec tsc -p apps/web/tsconfig.json --noEmit` → exit `0`
- `pnpm exec vitest run packages/line/src/durable-chat.test.ts packages/chat/src/durable-line-worker.test.ts --reporter=dot` → exit `0`
- `python -m unittest scripts.test_line_webhook_api scripts.test_line_runtime_schema scripts.test_line_liff_schema scripts.test_liff_runtime_schema scripts.test_citizen_runtime_schema -v` → exit `0`

### Acceptance

- Required commands exited with code `0`: **PASS**
- No skipped/only/focused/flaky unit signal: **PASS**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **PASS**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
