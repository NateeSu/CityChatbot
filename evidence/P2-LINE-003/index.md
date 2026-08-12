# Evidence — P2-LINE-003

Status: `DONE — AUTO_APPROVED_FOR_MVP`

Date: 2026-08-10

Task: LINE message adapter, versioned templates, retry policy and delivery log.

## Requirement IDs

- `RF-05` — LINE channel messaging and provider integration
- `RF-06` — citizen outbound notification semantics
- `RF-09` — notification templates, delivery and human handoff support
- `RF-15` — idempotency, correlation and operational traceability
- `SPEC-MVP-001`, `TEST-MVP-001` — L1 unit-test green is the MVP auto-approval condition

## Files changed

- `packages/line/src/messaging.ts`
- `packages/line/src/messaging.test.ts`
- `packages/line/src/index.ts`
- `packages/line/package.json`
- `artifacts/release-manifest.json`
- `plan.md`

## Delivered behavior

- Provides reply and push provider adapters with strict route/token validation.
- Provides versioned Thai templates with an explicit variable allowlist, control-character removal and bounded LINE text length.
- Supports caller-supplied or generated `eventId`, correlation ID, tenant scope, recipient HMAC hash, template metadata and optional provider message ID.
- Enforces tenant-scoped idempotency and rejects changed content, recipient or supplied event identity under the same key.
- Separates `API_ACCEPTED` from delivery/read claims. 2xx is accepted; permanent 4xx becomes `FAILED`; 408/429/5xx and provider exceptions use bounded retry with jitter, honor `Retry-After`, and enter `DLQ` after the configured attempt limit.
- Applies a quota guard per tenant and returns `LINE_QUOTA_EXCEEDED` without spending another tenant's quota.
- Public delivery views omit recipient ID, reply token, message text, content hash and idempotency key; tests verify that content and token do not appear in delivery listings.
- Exposes channel, webhook and messaging modules through the package public exports.

## Commands and actual results

| Command / check | Result |
|---|---|
| `pnpm exec vitest run packages/line/src/messaging.test.ts --reporter=verbose` | **PASS** — 1 file, 11 tests |
| `pnpm exec vitest run packages/line/src/channel.test.ts packages/line/src/webhook.test.ts packages/line/src/messaging.test.ts` | **PASS** — 3 files, 32 tests |
| `pnpm exec tsc -p packages/line/tsconfig.json --noEmit` | **PASS** |
| `pnpm test:all` | **PASS** — lint, web typecheck, package typecheck, Vitest 12 files/77 tests, DB/RLS 10/10, secret scan and Next production build |
| `pnpm audit --prod --audit-level=high` | **PASS** — no known vulnerabilities found |
| `pnpm security:scan` | **PASS** — `SECRET_SCAN_CLEAN` |
| `pnpm security:sbom` | **PASS** — 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | **PASS** — 23 tests |
| `pnpm release:manifest` | **PASS** — 5 files, digest `2b7121a43b37d7aab4d6f277539b6049c52f2c49b8e2e392661d98e14227f6a7` |
| `pnpm release:verify` | **PASS** — release manifest verified with the same digest |

## Acceptance criteria

- [x] 2xx provider responses become `API_ACCEPTED` and are never reported as `DELIVERED` or `READ`.
- [x] Permanent 4xx, 429, selected 5xx and timeout behavior is classified correctly; retryable failures use backoff and `Retry-After`.
- [x] Retry exhaustion is visible as `DLQ`; permanent failures are visible as `FAILED`.
- [x] Idempotency prevents a duplicate outbound delivery and detects changed delivery data.
- [x] Template versions and allowlisted variables are required; unsafe/oversized text is rejected or sanitized before provider submission.
- [x] Quota state is isolated by tenant.
- [x] Delivery trace includes event/correlation/tenant/recipient-hash/template/provider metadata without exposing sensitive content.
- [x] L1 unit suite is green, so this task is auto-approved under `SPEC-MVP-001`.

## Rollback procedure

Pause the sender/consumer, keep accepted delivery records, switch to the previous provider/template configuration revision, and replay only authorized `DLQ` records with their original idempotency keys. If a credential is suspected, revoke it through the channel credential lifecycle and keep the LINE integration in its safe disabled/degraded state. Re-run the messaging, idempotency, quota and redaction tests before resuming.

## Known limitations / follow-up

- The adapter currently uses an in-memory delivery store and quota guard. Supabase `line_messages`/notification persistence, durable worker leases, real provider observability and admin delivery console remain later integration work.
- Provider implementations are contract doubles; no LINE Developer Console credential or external LINE sandbox call was used. Real API acceptance and provider message IDs require the configured channel.
- Retry and quota behavior is unit-certified, but production load, p95/p99 delivery latency and cross-region recovery remain post-production validation items.

Under the amended `fullspec.md`/`plan.md` MVP Fast-Track rule, this evidence is sufficient to mark `P2-LINE-003` DONE and continue to the next executable task.
