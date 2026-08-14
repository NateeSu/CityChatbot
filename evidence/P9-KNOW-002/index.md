# Evidence — P9-KNOW-002

Status: **IN_PROGRESS** (2026-08-14 — final same-webhook LINE probe pending)

## Traceability

- Task: `P9-KNOW-002`
- Requirement IDs: `RAG-CORPUS-001` through `RAG-CORPUS-011`, `INV-TENANT-001`, `INV-ANSWER-001`, `INV-CLAIM-001`, `INV-AUDIT-001`, `SPEC-AUTO-001`
- Activation receipt: `sha256:f08981a910049cbfe90580100eae8f307235e2a345e84400a88b2ff8e6cfe4e4`
- Redacted machine record: [production-verification.json](./production-verification.json)

## Delivered outcome

The screened `safe-facts-mvp` artifact was applied idempotently to the dedicated production tenant. The production receipt query passed for all `17/17` source records: every source has an `ACTIVE + UNIT_GATED` version and one READY tenant-scoped index generation. Private retrieval wrappers returned `18` active PUBLIC chunks and `6` APPROVED PUBLIC exact facts. No bulk document body, PII, QR destination, screenshot/template contamination, evaluation-only text, or quarantined `CR-001` through `CR-015` segment was made answerable.

The original production retrieval failure was traced to PostgreSQL `timestamptz` values arriving as JavaScript `Date` objects while the retriever expected canonical ISO strings. Commit `79f5a41` normalizes all database timestamps before effective-range filtering. A real LINE probe then completed with `ANSWER / ANSWERABLE`, an accepted provider delivery, and no retry or dead letter.

The visible probe reply also exposed an entity-relevance defect: two independently grounded FEE facts from different services were included. Commit `5f98004` closes that gap by deriving service aliases from source locators, scoping facts to the named entity, returning `CLARIFY / AMBIGUOUS_ENTITY` for an unscoped multi-entity fee question, and supplying the real source title to citations. This final release is READY in production and is covered by the release unit suite.

## Files changed

- `apps/web/app/api/v1/line/worker/runtime.ts`
- `apps/web/src/server/database-timestamp.ts`
- `apps/web/src/server/database-timestamp.test.ts`
- `packages/knowledge/src/retriever.ts`
- `packages/knowledge/src/retriever.test.ts`
- `packages/knowledge/src/runtime-context.ts`
- `packages/knowledge/src/runtime-context.test.ts`
- `packages/knowledge/src/index.ts`
- `packages/chat/src/grounding.ts`
- `packages/chat/src/production-fitness-answer.test.ts`
- `supabase/migrations/20260814010000_fix_line_delivery_clock_skew.sql`
- `scripts/test_line_runtime_schema.py`
- `evidence/P9-KNOW-002/index.md`
- `evidence/P9-KNOW-002/production-verification.json`
- `plan.md`
- `evidence/task-unit-gates.json`
- `evidence/automation-queue.json`
- `evidence/automation-events.jsonl`

## Production evidence

| Check | Actual result |
|---|---|
| Activation/receipt query | PASS — source records `17/17`, active unit-gated versions `17`, READY generations `17` |
| Private retrieval wrappers | PASS — active PUBLIC chunks `18`, APPROVED PUBLIC facts `6`, single tenant scope hash `a94eb94221d8` |
| Real LINE webhook | PASS — request `64441e7d-c742-437f-be1b-8805dfad8078`, HTTP `200`, accepted `1`, duplicate `0` |
| Retrieval/decision | PASS — `READY`, coverage complete, `ANSWER / ANSWERABLE` |
| Durable delivery | PASS — processed `1`, API accepted `1`, retry `0`, DLQ `0` |
| Visible LINE response | PASS — a factual fee response was visible in the dedicated `CityChatbot Canary` conversation |
| Final runtime release | PASS — commit `5f98004`, deployment `dpl_BJ98vGo16dm6HjRh2HWBgcgka4Qn`, `READY`, `sin1` |
| Production health | PASS — `GET /api/health` returned HTTP `200` and production status `ok` |
| Runtime error scan | PASS — no grouped runtime errors in the selected 30-minute window |

## 2026-08-14 grounding and queue-clock regression checkpoint

The original visible reply was not acceptable: it merged the Fitness fee with a free KCC fact, repeated the fee label and emitted a generic citation. Commit `42f1fca` now renders only the exact matched fact and limits citations to chunks supporting that fact. The deterministic final-render regression locks the LINE output to `ค่าบริการรายครั้ง 30 บาท` plus `แหล่งข้อมูล: ฟิตเนส` and rejects KCC/free-service leakage.

The first post-release live probe exposed a separate production timing defect. Postgres stamped newly queued jobs after the Vercel host timestamp passed into the claim RPC, so inbound and outbound jobs could miss the same worker invocation by milliseconds and move one probe behind. Migration `20260814010000_fix_line_delivery_clock_skew.sql` replaces both claim functions with database-bounded `claim_at := greatest(p_now, statement_timestamp())` semantics. Supabase production postconditions passed for webhook, delivery and queue eligibility (`true / true / true`).

After the migration, the LINE Developers provider Verify probe succeeded and drained the pending real message. Vercel request `7587dfa8-8e63-42e4-84cb-08387e42078f` completed `OK` with `chatProcessed=1`, `deliveryAccepted=1`, retry `0`, DLQ `0`. LINE Desktop visibly showed the exact two-line Fitness answer at 11:40 Asia/Bangkok. A final fresh real-message probe remains required to prove that both counts occur in the originating webhook invocation, rather than during a drain probe; therefore this task remains IN_PROGRESS.

The LINE webhook path, channel credentials, LINE user identifier, source PII, and database credentials are intentionally omitted. The Vercel runtime log retained only a tenant hash, input shape/hash, counts, canonical outcomes, and request identifier.

## Verification commands and actual results

| Command/check | Result |
|---|---|
| `pnpm exec vitest run packages/knowledge/src/runtime-context.test.ts packages/knowledge/src/retriever.test.ts packages/chat/src/grounding.test.ts apps/web/src/server/database-timestamp.test.ts --reporter=dot` | PASS — `4` files / `25` tests |
| `pnpm test:unit` | PASS — `67` files / `400` tests |
| `pnpm lint` | PASS |
| `pnpm typecheck && pnpm typecheck:packages` | PASS |
| `pnpm security:scan` | PASS — `SECRET_SCAN_CLEAN` |
| `pnpm build` | PASS — Next.js production build, `42/42` static pages generated |
| `pnpm release:manifest && pnpm release:verify` | PASS — digest `606c47ccc98bd20ba63c407282529739d42b95df2b6aacde161193f4cfb12014` |
| `python -m unittest discover -s scripts -p "test_*.py" -v` | PASS — `341/341` |
| Corpus/activation/conflict targeted suite and artifact verification | PASS — `22/22`; corpus manifest, conflict ledger, activation manifest and SQL contract verified |
| `python scripts/unit_gate.py --validate-only` | PASS — manifest valid |
| Vercel deployment inspection | PASS — final deployment READY with production aliases and no alias error |
| Vercel authenticated health fetch | PASS — HTTP `200` |
| `python -m unittest scripts.test_line_runtime_schema scripts.test_line_webhook_api` | PASS — `17/17` |
| Supabase production claim-function postconditions | PASS — webhook clock, webhook queue eligibility and delivery clock all `true` |
| LINE Developers provider Verify | PASS — webhook verification `Success` |
| Production drain telemetry | PASS — request `7587dfa8-8e63-42e4-84cb-08387e42078f`; chat `1`, delivery accepted `1`, retry/DLQ `0/0` |

The first `pnpm test:db` attempt correctly failed three release-candidate tests because the local production build had changed `.next/BUILD_ID` after the previous release manifest. The release manifest was regenerated and verified; the entire Python suite then passed `341/341`. This recovery is part of the actual test record rather than being hidden.

## Acceptance criteria

- Additive activation is tenant-scoped, deterministic and idempotent: **PASS**
- All 17 source receipts are `ACTIVE + UNIT_GATED` with READY generations: **PASS**
- Active retrieval is PUBLIC, effective-range filtered and tenant isolated: **PASS**
- Exact fact can produce canonical `ANSWER` with source evidence: **PASS**
- Multi-entity ambiguity cannot merge unrelated fees and instead clarifies: **PASS**
- PII, QR, template/screenshot, evaluation-only and conflict material remain fail-closed: **PASS**
- One actual LINE request receives a grounded factual reply and durable delivery reconciles: **PASS**
- Final production release and health are READY with no detected runtime error: **PASS**
- Rollback remains narrow and auditable: **PASS**

## Rollback procedure

1. Execute `artifacts/authorized-corpus/rollback.sql` in one transaction for tenant slug `citychatbot-canary`. It retires only the receipt-bound versions/generations and preserves history.
2. Re-run the private receipt and retrieval wrapper queries. Expected result is zero active answerable facts for this activation and canonical safe abstention from chat.
3. If the runtime itself regresses, keep the corpus retired and promote previous READY deployment `dpl_6zgrjXfP7XBbf1pVbLCcrnJ9R3ke` (commit `79f5a41`). Do not restore factual traffic until entity-scoping checks pass again.
4. Preserve webhook inbox/outbound ledgers and audit records; do not delete or rewrite production rows.

## Known limitations

- The production MVP intentionally exposes only six certified exact-fact anchors. Questions outside that small surface safely return `CLARIFY` or `HANDOFF`; the remaining screened corpus is not bulk-answerable.
- Grounding and queue-clock fixes are active and the corrected answer is visible. Task closure still requires one fresh real-message probe whose own webhook telemetry records both chat processing and provider acceptance; no additional representational LINE message will be sent without a new action-time confirmation.
- Source screenshots and raw production identifiers are deliberately not stored in repository evidence. The redacted telemetry record is sufficient to reproduce counts and canonical outcomes without exposing PII or credentials.
