# P5-HO-003 Evidence

Status: DONE (2026-08-11, MVP Fast-Track auto-approved under `SPEC-MVP-001` after L1 unit tests green; external LINE sandbox/receipt E2E remains post-production follow-up)

## Requirements and scope

- Requirement IDs: RF-05 LINE, RF-09 HANDOFF, RF-15 OPS.
- Canonical API surface preserved: `POST /api/v1/admin/support-tickets/{id}/reply`; `sendToLine` extends the reply contract without adding a wildcard route.
- A public staff message can be enqueued to LINE only after tenant/ticket/message scope, `STAFF` author, `PUBLIC` visibility and non-AI-draft checks pass. Internal notes and AI drafts never enter the LINE delivery path.
- The implementation is local/test synthetic only. No production LINE channel, Supabase, Vercel, OpenRouter or citizen identity was used.

## Changed files

- `packages/support-delivery/package.json`, `tsconfig.json`, `src/index.ts` — new workspace boundary for support-to-LINE delivery orchestration.
- `packages/support-delivery/src/delivery.ts` — trusted recipient resolver boundary, public staff message validation, one-delivery-per-message guard, tenant-scoped idempotency, tracking deep link allowlist, out-of-hours copy, LINE dispatcher enqueue/dispatch and redacted delivery view.
- `packages/support-delivery/src/delivery.test.ts` — send-once/replay, deep link/out-of-hours, internal/AI-draft denial, missing recipient, tenant scope and retry-to-DLQ tests.
- `apps/web/app/api/v1/admin/support-tickets/repository.ts` — local dispatcher/provider fixture and support delivery service wiring.
- `apps/web/app/api/v1/admin/support-tickets/[id]/reply/route.ts` — `sendToLine`/`outOfHours` validation, canonical staff reply → delivery orchestration and delivery response.
- `apps/web/app/api/v1/admin/support-tickets/errors.ts` — support delivery error mapping.
- `apps/web/app/admin/support-tickets/[id]/SupportTicketDetail.tsx` — send-to-LINE option, out-of-hours policy checkbox and delivery status/tracking display.
- `apps/web/package.json`, `package.json`, `pnpm-lock.yaml` — workspace dependency and package typecheck wiring.
- `scripts/test_support_delivery_api.py` — four static delivery/privacy/route/UI contract tests.
- `plan.md`, `evidence/progress/2026-08-11.md`, `artifacts/sbom.cdx.json`, `artifacts/release-manifest.json` — task status, traceability and release evidence.

## Verification commands and actual results

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/support-delivery/src/delivery.test.ts` | PASS, 3/3 |
| `pnpm exec tsc -p packages/support-delivery/tsconfig.json --noEmit` | PASS |
| `python -m unittest scripts.test_support_delivery_api -v` | PASS, 4/4 |
| `pnpm test:all` | PASS, exit code 0; 35 Vitest files, 246/246 L1 unit tests, 118/118 static tests, lint, typecheck, package typecheck, production build and secret scan |
| `pnpm security:sbom` | PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest` and `pnpm release:verify` | PASS; digest `ed86f6421e24518588ed95983d718924123a9cdcd0d5d3d767073115e98cd0f3` |
| local canonical `/reply` smoke on `http://127.0.0.1:3100` | PASS; `sendToLine=true` returned `API_ACCEPTED`, attempt `1`, `outOfHours=true`, tracking link `https://citychatbot.local/liff/support/SUP-2026-000001`, same idempotency replay retained the same accepted delivery |

## Acceptance criteria

- Authorized public staff reply enqueues and dispatches once through the `LineMessagingDispatcher`; a second request with the same idempotency key does not call the provider again.
- Retryable provider response remains `RETRY_WAIT`, honors retry state, and reaches `DLQ` after the configured maximum; non-retryable failures remain visible as failed delivery state through the underlying dispatcher contract.
- Delivery view contains status, attempts, provider status/message ID, correlation, tracking link and timestamps, but never raw LINE recipient, reply token or message body.
- `outOfHours` is explicit policy input and adds deterministic Thai notice; the tracking deep link is HTTPS and host-allowlisted.
- Wrong tenant, missing recipient mapping, internal message, AI draft, citizen message, closed ticket and cancelled ticket fail closed; closed-ticket behavior is explicitly no new LINE continuation.
- Delivery remains attached to the exact support ticket/public staff message; a different idempotency key cannot send the same public message twice.
- The canonical admin reply route validates the option before mutating an internal note and returns delivery visibility alongside the detail view; no provider secret is persisted or returned.

## API example

```json
{
  "expectedVersion": 2,
  "body": "เจ้าหน้าที่รับเรื่องแล้ว จะติดตามให้ค่ะ",
  "visibility": "PUBLIC",
  "previewConfirmed": true,
  "sendToLine": true,
  "outOfHours": true,
  "idempotencyKey": "support-reply-001"
}
```

Synthetic response excerpt:

```json
{
  "delivery": {
    "status": "API_ACCEPTED",
    "attemptCount": 1,
    "maxAttempts": 3,
    "outOfHours": true,
    "deepLink": "https://citychatbot.local/liff/support/SUP-2026-000001"
  }
}
```

`API_ACCEPTED` is not reported as delivered/read; real LINE receipt requires provider evidence.

## Rollback procedure

1. Disable `sendToLine` for the support reply feature flag while retaining staff public/internal message history.
2. Pause the outbound LINE worker/provider boundary; leave queued/retry/DLQ records visible for authorized staff and manual contact fallback.
3. Keep the canonical reply mutation available as a draft/internal or database message path without provider dispatch.
4. Restore the prior delivery/provider configuration revision and replay only authorized retryable records after incident review.
5. Re-run support-delivery unit/static tests, `pnpm test:all`, API smoke and release verification before re-enabling outbound delivery.

## Known limitations

- The tested runtime uses an in-memory delivery store and a deterministic local provider; durable `notification_deliveries`/outbox worker persistence, leases and production provider adapter remain integration work.
- The trusted recipient resolver is a local fixture. Production must resolve the verified tenant-scoped LINE mapping server-side; caller-provided raw recipient IDs are not accepted by the UI contract.
- Real LINE sandbox receipt, webhook delivery/read evidence, citizen continuation messages and device/UAT certification were unavailable; under `SPEC-MVP-001` they are post-production follow-up and do not block the MVP slice.
- Out-of-hours is an explicit input from a versioned policy boundary; a full tenant calendar/policy admin surface remains downstream work.
- P5-GATE and all P6-P9 tasks remain open; this evidence does not claim project completion.

## Traceability

- Plan item: P5-HO-003.
- Source contract: `fullspec.md` §6.3, §9.1/§9.2 and `plan.md` P5-HO-003.
