# Evidence — P2-LINE-002

สถานะ: `DONE — AUTO_APPROVED_FOR_MVP`

วันที่: 2026-08-10

Task: ทำ LINE webhook verification, replay defense และ fast acknowledgment

## Requirement IDs

- `RF-05` LINE/LIFF — raw-body signature, destination and event validation
- `RF-13` SECURITY — replay defense, fail-closed invalid signature and no raw PII log path
- `RF-15` OPS — event idempotency, outbox/queue handoff and correlation
- `RF-17` ARCH — synchronous acknowledgment with background processing boundary
- `SPEC-MVP-001`, `TEST-MVP-001` — L1 Unit Test Green เป็นเงื่อนไข auto-approval ของ MVP

## Files changed

- `packages/line/src/webhook.ts`
- `packages/line/src/webhook.test.ts`
- `packages/line/package.json`
- `package.json`
- `pnpm-lock.yaml`
- `plan.md`

## Delivered behavior

- `verifyLineSignature` verifies the exact raw request bytes with HMAC-SHA256
  and constant-time comparison. JSON parsing occurs only after channel-key
  resolution, server credential lookup and signature verification.
- The handler checks bounded body size, destination equality, event shape,
  supported event/message types, required source, timestamp replay window and
  redelivery marker. Unsupported event types are accepted for worker handling
  and do not fail the batch.
- `InMemoryLineWebhookInbox` enforces unique `(channelRecordId,
  webhookEventId)` and `InMemoryLineWebhookQueue` enqueues only the first
  accepted event. Duplicate delivery has no second side effect.
- Tenant comes from the verified channel resolver; inbox/queue records retain
  only event metadata and IDs, not raw body or line user profile data.
- The request path returns a stable 2xx `accepted` result after inbox/queue
  persistence; provider/AI/notification work is not executed in the handler.
  Rejections use canonical reason codes `FORBIDDEN`, `VALIDATION_ERROR`,
  `CONFLICT` and `DEPENDENCY_NOT_READY`.

## Commands and actual results

| Command / check | Result |
|---|---|
| `pnpm exec vitest run packages/line/src/channel.test.ts packages/line/src/webhook.test.ts` | **PASS** — 2 files, 21 tests |
| `pnpm exec tsc -p packages/line/tsconfig.json --noEmit` | **PASS** |
| `pnpm install --frozen-lockfile` | **PASS** — 8 workspace projects |
| `pnpm test:all` | **PASS** — lint, web/package typecheck, Vitest 66/66, DB/RLS 10/10, secret scan and Next production build |
| `pnpm audit --prod --audit-level=high` | **PASS** — no known vulnerabilities found |
| `pnpm security:scan` | **PASS** — `SECRET_SCAN_CLEAN` |
| `pnpm security:sbom` | **PASS** — deterministic CycloneDX artifact, 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:verify` | **PASS** — release manifest digest `65a6b65c583ddb0a7a31e52e44341c15fc8a72d88d9ff59cc5d5f752c6bc5ba2` |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | **PASS** — 23 corpus/DB/RLS/GUI/release tests |

The suite uses synthetic LINE payloads/signatures only. No LINE webhook was
opened and no Developer Console credential was used.

## Acceptance criteria

- [x] Valid raw-body signature is accepted; altered body, invalid signature,
  malformed JSON and wrong destination have zero side effects.
- [x] Unknown/disabled webhook key fails closed without disclosing channel
  existence; body tenant cannot override the resolver tenant.
- [x] Stale/future events are rejected by replay window and redelivery metadata
  is preserved.
- [x] Duplicate event delivery, including a 100-event batch, produces one
  inbox/queue side effect per event.
- [x] Follow, unfollow, text, image, location and postback are recognized;
  unsupported events are safely accepted for worker handling.
- [x] Acknowledgment occurs after persistence boundary and no heavy provider,
  AI or notification work runs in the request handler.
- [x] L1 unit suite is green, so this task is auto-approved under
  `SPEC-MVP-001`.

## Rollback procedure

Route the webhook to a maintenance/previous handler, pause the consumer while
keeping the inbox records, and preserve the last verified signature policy.
Re-enable only after rerunning signature, destination, replay and idempotency
tests. A bad queue consumer may be stopped/replayed from persisted event IDs;
never bypass signature verification or accept a client-supplied tenant.

## Known limitations / follow-up

- The handler is a provider-neutral contract with in-memory inbox/queue
  adapters. Supabase `line_webhook_inbox`, transactional outbox persistence,
  durable dedupe and production worker wiring remain integration work.
- Real LINE sandbox signature fixtures, p95/p99 acknowledgment measurement,
  rate-limit integration and external redelivery behavior require the
  configured LINE Developer Console and are not claimed as executed.
- Event payload details must be fetched by a scoped worker from durable storage;
  the current L1 queue intentionally carries metadata/IDs only to avoid PII in
  events and logs.

ตาม `SPEC-MVP-001` และ `plan.md` ฉบับปัจจุบัน L1 unit suite ผ่านครบและมี
evidence จริง จึง auto-approve `P2-LINE-002` สำหรับ MVP โดยไม่อ้างว่า
external LINE sandbox หรือ production persistence เสร็จแล้ว
