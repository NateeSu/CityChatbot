# Evidence - P9-GATE

Status: **DONE** (2026-08-14)

This gate records the MVP production deployment gate. The P8 automatic gate is
also complete under the current authoritative policy. The later `P9-KNOW-002`
continuation now enables only the screened `safe-facts-mvp` knowledge surface;
uncertified factual knowledge and broadcast traffic remain disabled.

## Final knowledge activation checkpoint (2026-08-14)

`P9-KNOW-002` is complete. The dedicated production tenant has `17/17`
receipt-bound `ACTIVE + UNIT_GATED` source versions, `17` READY index
generations, `18` active PUBLIC chunks and `6` APPROVED PUBLIC exact facts. A
real LINE request completed `ANSWER / ANSWERABLE`, provider delivery was
accepted, and no retry or dead letter was created. Commit `42f1fca` fixes
entity-scoped fact rendering and source-title citations. Migration commit
`2e1635b` bounds both durable LINE claim clocks to the Postgres clock and is
active in Supabase production. Final request
`4adb782c-015f-4831-a91a-ce834423affe` on READY deployment
`dpl_2fFdTghydAwDkkXk4JasD76abhZs` accepted one event and completed chat `1`
plus provider delivery `1` in the same webhook invocation, with retry/DLQ
`0/0`. LINE visibly returned only `ค่าบริการรายครั้ง 30 บาท` and
`แหล่งข้อมูล: ฟิตเนส`. Production health returned HTTP `200` and the final
runtime-error scan was clean.
See [P9-KNOW-002](../P9-KNOW-002/index.md).

## Current continuation checkpoint (2026-08-13)

The repository-side P9 implementation sequence through `P9-CLOSE-001` is unit
green and recorded by the automatic gate runner. The latest release-close
revision is `619dff11f65412be42285edc05ff961999cae932`; its required tests passed
`3/3` with report hash
`42a4dbf28d4ae844e0f6a176348d46ddd68d2d290ab98040d57124beb43b8428`.

The close-phase action was intentionally recorded as
`DEFERRED_FAIL_CLOSED` because no external dispatcher is configured in the
repository runner. This does not create a human approval dependency.

The production LINE runtime is **CONFIGURED AND PROVIDER-VERIFIED** for the new
durable worker. Migrations
`supabase/migrations/20260813010000_line_chat_runtime.sql` and
`supabase/migrations/20260813020000_fix_line_runtime_claim_qualification.sql`
are applied, scoped Vercel environment values are configured, the tenant flag
is enabled in audited `SAFE_ABSTENTION` mode, and LINE Developers `Verify`
passes.
At this historical checkpoint the production knowledge index was empty. It is
superseded by the final knowledge activation checkpoint above; content outside
the six certified exact-fact anchors still uses canonical CLARIFY/HANDOFF.

The real LINE journey was verified on deployment
`dpl_6vhzdaSbEGP7tHJdPAX6YWLRvei8` from source commit `d7122d0`. Runtime
verification then passed on READY deployment
`dpl_Chu4YACeLJ4mGywAzmrbBhjPigEH` from source commit `59c26d2`, region `sin1`,
with `/api/health` HTTP `200`. The evidence-only follow-up commit `3b7a109`
produced READY deployment `dpl_Ehs95f992DhdrWgmibfoBHYj8851`; it also returned
health HTTP `200` and had no runtime errors in its selected window.

### Latest repository verification

On the current workspace after `P9-CLOSE-001`, the release pipeline passed:

- `pnpm lint` — PASS
- `pnpm typecheck` and `pnpm typecheck:packages` — PASS
- `pnpm test:unit` — PASS, `63` files / `387` tests
- `pnpm security:scan` — PASS
- `python scripts/unit_gate.py --validate-only` — PASS
- `pnpm build` — PASS
- `pnpm release:manifest` and `pnpm release:verify` — PASS
- `pnpm test:db` — PASS; Python contract/database suite `333/333`
- `pnpm release:manifest` and `pnpm release:verify` — PASS; current manifest
  digest `6cd8526f583b48518a13855fb74b5e6d32304d1d54fbfb18e970672fcf8e0cce`
- Explicit current RC write/verify — PASS; RC digest
  `92588376171acd609deef9440488da2df4d8675e8c4c51a0ff60c39bfe9ec6f2`

These results validate the repository release artifact. Any earlier default RC
command result is historical; the immutable default candidate was intentionally
not overwritten. The current manifest and explicit current RC verification are
recorded above. External Supabase, Vercel and LINE provider verification is
separately recorded in `evidence/P9-CAN-001`; the dedicated real
inbound/outbound LINE journey also passed. Certified ACTIVE production
knowledge remains distinct operational evidence and is intentionally absent.

### Real LINE production E2E continuation checkpoint (2026-08-13)

- LINE Developers `Use webhook` was found disabled for the dedicated canary
  channel, enabled, and re-read as enabled. No unrelated channel was changed.
- Production deployment `dpl_6vhzdaSbEGP7tHJdPAX6YWLRvei8` (commit `d7122d0`,
  `sin1`, READY) accepted one new real LINE message with HTTP `200`,
  `acceptedEventCount=1`, and `duplicateEventCount=0`.
- The deferred worker completed `OK` in `978 ms`, processing four queued
  durable test events and accepting four provider deliveries. Retry and
  dead-letter counters were both zero.
- The visible LINE Desktop conversation showed the canonical safe-abstention
  reply. With zero active public knowledge versions/generations/chunks/facts,
  the response was CLARIFY/HANDOFF behavior and made no factual claim.
- Redacted one-hour Supabase aggregate: inbox `PROCESSED=4`, outbound
  `API_ACCEPTED=4`, inbox FAILED/DLQ `0`, outbound FAILED/DLQ `0`.
- Post-fix Vercel scan: no `line_worker_step_failed` log and no runtime error
  cluster in the selected five-minute window.

### Production deployment checkpoints (2026-08-13)

- Runtime verification deployment: `dpl_Chu4YACeLJ4mGywAzmrbBhjPigEH`,
  source commit `59c26d2`, region `sin1`, production alias
  `https://city-chatbot-murex.vercel.app`.
- Evidence-only follow-up deployment: `dpl_Ehs95f992DhdrWgmibfoBHYj8851`,
  source commit `3b7a109`, READY in `sin1`; it contains no runtime-code change.
- Vercel authenticated fetch of `/api/health`: HTTP `200`, production JSON
  status `ok`.
- Both verification windows had no runtime errors; the evidence-only
  deployment had no logs in its selected ten-minute window.
- The current explicit immutable RC at
  `artifacts/release-candidate-2026-08-13.json` verified successfully.

## Gate traceability

- Gate: `P9-GATE`
- Requirements: `RF-13`, `RF-15`, `RF-16`, `RF-17`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`
- Rule: `SPEC-MVP-001` - L1 unit tests are the MVP deployment gate; external hardening remains tracked and explicit.
- Historical RC: `citychatbot-rc-2026-08-12-9d61a95d-ae6ccdd5` (immutable)
- Current explicit RC: `citychatbot-rc-2026-08-13-6cd8526f-215fb2df`
- Current RC digest: `92588376171acd609deef9440488da2df4d8675e8c4c51a0ff60c39bfe9ec6f2`

## Gate inputs

| Input | Result | Evidence |
|---|---|---|
| MVP L1 unit suite | PASS - 63 files / 387 tests | `pnpm test:unit` |
| Release candidate verification | PASS - current explicit immutable RC | `python scripts/release_candidate.py --verify artifacts/release-candidate-2026-08-13.json` |
| Production build | PASS | Vercel deployment logs and local Next.js build |
| Production deployment | PASS - runtime verification `dpl_Chu4YACeLJ4mGywAzmrbBhjPigEH` and evidence-only follow-up `dpl_Ehs95f992DhdrWgmibfoBHYj8851`, both `READY` | [P9-DEP-001](../P9-DEP-001/index.md) |
| Production health | PASS - HTTP 200, environment `production` | [P9-DEP-001](../P9-DEP-001/index.md) |
| Fail-closed citizen dependency boundary | PASS - HTTP 503 `CONFIGURATION_UNAVAILABLE` | [P9-DEP-001](../P9-DEP-001/index.md) |
| Dedicated LINE real inbound/outbound journey | PASS - webhook 200, worker `OK`, visible CLARIFY/HANDOFF, ledger reconciled | [P9-CAN-001](../P9-CAN-001/index.md) |
| Durable ledger after SQL claim fix | PASS - 4 `PROCESSED`, 4 `API_ACCEPTED`, FAILED/DLQ 0/0 | [P9-CAN-001](../P9-CAN-001/index.md) |

## Decision

The P9 immediate production gate is **PASS** because the release artifacts passed the L1 unit gate, real production deployments completed, and the dedicated LINE inbound/outbound journey reconciled successfully. Dedicated LINE traffic is enabled after migration, environment, RLS/grant, regional deployment and provider verification. The later `P9-KNOW-002` gate safely activates six certified exact-fact anchors; every other factual path remains fail-closed.

## Verification commands

- `pnpm test:unit` - PASS, 400/400.
- `pnpm --filter @citychatbot/web lint` - PASS.
- `pnpm --filter @citychatbot/web typecheck` - PASS.
- `pnpm --filter @citychatbot/web build` - PASS.
- `pnpm security:scan` - PASS.
- `python scripts/release_candidate.py --verify artifacts/release-candidate-2026-08-13.json` - PASS for the current explicit immutable RC.
- Vercel authenticated fetch `https://city-chatbot-murex.vercel.app/api/health` - HTTP 200 with production JSON.
- `Invoke-WebRequest https://city-chatbot-murex.vercel.app/api/v1/citizen/services` - HTTP 503 with `CONFIGURATION_UNAVAILABLE`.
- Vercel runtime errors for the last 30 minutes - none found.
- Real LINE E2E ledger query, one-hour redacted aggregate - PASS (`PROCESSED=4`, `API_ACCEPTED=4`, FAILED/DLQ `0/0`).
- Vercel post-fix worker failure query, five minutes - PASS (no `line_worker_step_failed`; no runtime errors).
- `python -m unittest scripts.test_line_runtime_schema scripts.test_line_webhook_api` - PASS, 17/17.
- Supabase production clock-fix postconditions - PASS, webhook/delivery `true / true / true`.
- Final fresh LINE same-webhook probe - PASS, accepted/chat/delivery `1/1/1`, retry/DLQ `0/0`.

## Rollback

Run `supabase/ops/deactivate_line_chat_production.sql`, set
`LINE_CHAT_RUNTIME_ENABLED=false`, and promote the prior READY deployment if a
production smoke or runtime gate fails. Preserve durable rows and evidence.
The additive runtime schema remains in place; rollback does not delete or
rewrite production data.

## Open work after the gate

- No repository implementation task remains in the unit-gate manifest after
  `P9-CLOSE-001`; the dedicated real LINE inbound/outbound/API-accepted
  reconciliation is complete.
- `P8-GATE` is complete under `SPEC-AUTO-001`; external observation and content
  governance remain safe operational follow-up.
- Supabase project provisioning, LINE developer authentication, tenant data
  wiring and screened `safe-facts-mvp` activation are complete.
- MVP project completion is **claimed for the declared unit-gated and
  production-safe scope**, including the six certified ACTIVE exact facts and
  their safe CLARIFY/HANDOFF boundary.
