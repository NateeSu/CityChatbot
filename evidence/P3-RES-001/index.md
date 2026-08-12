# P3-RES-001 - complaint recovery when AI/integrations fail

Status: DONE (MVP Fast-Track auto-approved)

## Traceability

- Requirements: `RF-06` complaint workflow, `RF-08` AI degradation, `RF-15` operations, `RF-16` QA, `RF-17` architecture.
- Authoritative sections: `fullspec.md` sections 3.3-3.6, 7.2, 8.3, 13.4 and `SPEC-MVP-001`.
- Plan trace: `plan.md` `P3-RES-001`; prerequisites `P3-CMP-002..003`, `P3-ADM-002`, `P3-NOTIF-001` verified.

## Delivered files

- `packages/complaints/src/recovery.ts` - commit-first recovery service, default intake queue fallback, bounded provider timeout, canonical chat handoff, deduplicated retry jobs, worker leases/heartbeat/reclaim, retry backoff and redacted error codes.
- `packages/complaints/src/recovery.test.ts` - failure-injection suite for OpenRouter, embedding, LINE push, map, reverse-geocode, default queue, complaint visibility/number, manual assignment, retry, concurrent idempotency, lease recovery and HANDOFF.
- `packages/complaints/src/index.ts` - recovery exports.
- `apps/web/app/api/v1/citizen/complaints/repository.ts` - recovery service wiring with the synthetic tenant default intake queue.
- `apps/web/app/api/v1/citizen/complaints/route.ts` - complaint submission now uses the recovery service while preserving the canonical response contract.
- `docs/operations/p3-res-001.md` - failure matrix, operator procedure and rollback runbook.
- `scripts/test_recovery_contract.py` - static failure-degradation/runbook contract checks.
- `plan.md`, `evidence/progress/2026-08-10.md` - status and next-task checkpoint.

## Commands and actual results

- `pnpm exec vitest run packages/complaints/src/recovery.test.ts --reporter=verbose` - PASS; `5/5`.
- `pnpm exec tsc -p packages/complaints/tsconfig.json --noEmit` - PASS.
- `pnpm --filter @citychatbot/web typecheck` - PASS.
- `pnpm --filter @citychatbot/web lint` - PASS.
- `pnpm test:db` - PASS; `43/43` static/schema/corpus/GUI/release tests, including recovery contract tests.
- `pnpm test:all` - PASS; 21 test files, `141/141` unit tests, `43/43` Python static tests, lint, web/package typecheck, secret scan and Next production build.
- Local synthetic API smoke on `http://127.0.0.1:3100/api/v1/citizen/complaints`: first submit returned `201` with a complaint number; replay of the same `Idempotency-Key` returned `200` with the same complaint id/number and `idempotentReplay=true`.
- The recovery failure-injection suite verified that all five optional integrations fail after the core complaint is committed, creating five deduplicated retry jobs while the complaint remains `RECEIVED` and visible to staff; manual assignment then succeeds.
- The same suite verified LINE retry completion, expired lease reclaim, stale-worker rejection, concurrent same-key submission, safe manual location fallback and canonical `HANDOFF` / `SYSTEM_ERROR`.
- `pnpm release:manifest` / `pnpm release:verify` - PASS; digest `9a01f96c5aab739bcf0553133363c0be5d381501db356c4f94f895ffd929c9fe`.

## Acceptance criteria

- [x] Core complaint commit (number, intake queue, `RECEIVED` record and staff visibility) completes before optional integrations; failure does not roll back business state.
- [x] OpenRouter failure returns a safe canonical `HANDOFF` with reason `SYSTEM_ERROR`; no provider error/token is returned or persisted.
- [x] Embedding/AI/LINE/map/reverse-geocode failures are represented as bounded retry jobs; duplicate submission or retry does not create a second complaint/job.
- [x] LINE failure preserves business state and remains retryable; notification delivery behavior remains covered by `P3-NOTIF-001`.
- [x] Map/reverse-geocode failure keeps a manual address path available.
- [x] Reconciliation jobs have dedupe, bounded attempts, deterministic backoff, lease/heartbeat, expired-lease reclaim and dead-job state.
- [x] Manual staff assignment works after integration failure; no partial or duplicate complaint is created.
- [x] Runbook includes failure matrix, operator procedure, feature-flag rollback and redaction rules.

## API example

```http
POST /api/v1/citizen/complaints
Idempotency-Key: recovery-route-002
```

Synthetic smoke result:

```json
{
  "firstStatus": 201,
  "first": { "complaintNo": "CCM-2569-000001", "idempotentReplay": false },
  "replayStatus": 200,
  "replay": { "complaintNo": "CCM-2569-000001", "idempotentReplay": true }
}
```

## Rollback

1. Disable optional AI, embedding, map, reverse-geocode and notification consumers independently.
2. Keep the core citizen complaint endpoint and default intake queue enabled.
3. Requeue or inspect retry jobs by tenant/complaint; never delete the committed complaint, number, timeline or outbox.
4. Restore the previous submission service only after replaying the recovery unit/static suite and verifying idempotency.

## Known limitations / next executable work

- The recovery queue is an in-memory adapter for the current local MVP. Durable Supabase `jobs`/worker persistence and real provider adapters remain production hardening work; production configuration is fail-closed and no credentials were guessed.
- The current web smoke uses synthetic tenant data. It does not represent production LINE/OpenRouter acceptance.
- Next executable task is `P3-GATE`; P4-P9 tasks and gates remain open, so project completion is not claimed.
