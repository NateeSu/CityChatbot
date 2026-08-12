# P5-HO-001 Evidence

Status: DONE (2026-08-11, auto-approved under SPEC-MVP-001 after L1 unit tests green)

## Requirements and scope

- Requirement IDs: RF-04 IAM, RF-07 RAG safe handoff, RF-09 HANDOFF, RF-15 OPS.
- Canonical handoff reason codes are the nine values from `fullspec.md` §9.2; no alias was added.
- Canonical ticket states are `NEW`, `ASSIGNED`, `IN_PROGRESS`, `WAITING_FOR_CITIZEN`, `ANSWERED`, `CLOSED`, and `CANCELLED`.
- Non-urgent handoff requires citizen confirmation. Automatic creation is limited to `URGENT` plus a versioned `urgentAutomaticIntake` policy.
- The implementation is synthetic/local only. No production Supabase, LINE, Vercel, OpenRouter or citizen identity was used.

## Changed files

- `packages/support-handoff/src/handoff.ts` — tenant-scoped ticket creation, confirmation/urgent policy, HMAC identity hash, normalized-topic dedupe, source trace, redaction/prompt-injection boundary, assignments, optimistic versions, canonical transitions, SLA pause/resume, append-only audit/outbox store.
- `packages/support-handoff/src/handoff.test.ts` — 12 L1 tests for every reason code, confirmation, urgent policy, source/request idempotency, active dedupe, citizen/tenant/department isolation, redaction, assignment, state machine, reopen and SLA behavior.
- `packages/support-handoff/src/index.ts`, `packages/support-handoff/package.json`, `packages/support-handoff/tsconfig.json` — package boundary and workspace typecheck.
- `supabase/migrations/20260810120000_support_handoff_schema.sql` — support ticket, message, assignment, status-log and audit tables with composite tenant FKs, idempotency indexes, forced RLS, append-only triggers, state validation and support outbox triggers.
- `supabase/tests/support_handoff_schema_contract.sql` — PostgreSQL contract assertions.
- `scripts/test_support_handoff_schema.py` — 5 static schema contract tests.
- `package.json`, `pnpm-lock.yaml` — package typecheck and workspace lock metadata.
- `supabase/README.md` — migration, contract, validation and rollback instructions.
- `plan.md` — P5-HO-001 marked DONE with actual verification results.
- `artifacts/sbom.cdx.json`, `artifacts/release-manifest.json` — regenerated release artifacts.

## Verification commands and actual results

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/support-handoff/src/handoff.test.ts` | PASS, 12/12 |
| `pnpm exec tsc -p packages/support-handoff/tsconfig.json --noEmit` | PASS |
| `python -m unittest scripts.test_support_handoff_schema -v` | PASS, 5/5 |
| `pnpm typecheck:packages` | PASS, including `@citychatbot/support-handoff` |
| local migration apply via `citychatbot-p3-db` | PASS, `20260810120000_support_handoff_schema.sql` |
| local migration re-apply via `citychatbot-p3-db` | PASS, idempotent notices only |
| local PostgreSQL contract | PASS, `SUPPORT_HANDOFF_SQL_CONTRACT_PASS` |
| `pnpm test:all` | PASS, exit code 0; 31 test files, 220/220 L1 unit tests, 83/83 static tests, lint, web/package typecheck, package typecheck, secret scan and production build |
| `pnpm security:sbom` | PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest` and `pnpm release:verify` | PASS; digest `1c5513e8fa310d191c8d9d4651c4a3f4fcd4ad770c7940d9269ce9bba3199be6` |

## Acceptance criteria

- Every canonical handoff reason code creates a correctly traced ticket after confirmation; `SYSTEM_ERROR` is still a safe ticket path.
- Replaying the same request key or source event returns the same ticket and does not create a duplicate.
- Active duplicate handoffs are scoped by tenant, HMAC citizen identity, normalized topic and policy time window; a different citizen is not deduplicated into another citizen's ticket.
- Suggested/assigned departments and memberships must be present in authorized same-tenant candidate sets; cross-tenant and unauthorized department paths fail closed.
- Raw citizen identity, prompt-injection text, secret text and prohibited source-trace keys are not stored in the ticket boundary; only a 64-character HMAC identity hash is persisted.
- Assignment and transition mutations require explicit permission, expected row version and idempotency key; stale versions fail with `VERSION_CONFLICT`.
- State transitions match the canonical matrix; `CLOSED -> IN_PROGRESS` requires explicit reopen authorization in the service boundary, and terminal tickets cannot be assigned.
- SLA policy/version, timezone, response/resolution targets and due timestamps are snapshotted; `WAITING_FOR_CITIZEN` pauses and later resumes with the elapsed pause added to due times.
- PostgreSQL tables use tenant isolation, composite tenant foreign keys, forced RLS, explicit read policies, deny-by-default browser writes and append-only support history.
- `support.created` and `support.assigned` are represented through the existing domain outbox boundary; no raw provider secret or response is persisted.
- Screenshots: not applicable; this task is a backend/schema boundary with no new visual surface.

## API example

```ts
const result = service.createHandoff({
  tenantId,
  citizenIdentity: verifiedCitizenIdentity,
  channel: "LINE",
  source: { sourceEventId, sessionId, messageId, retrievalTraceId },
  reasonCode: "NO_EVIDENCE",
  topic: "street light near market",
  defaultIntakeQueueId,
  candidateDepartments: sameTenantDepartments,
  suggestedDepartmentId: suggestedDepartmentIdFromDb,
  priority: "NORMAL",
  citizenConfirmed: true,
  policy: versionedSupportPolicy,
  idempotencyKey,
});
// result.outcome is CONFIRMATION_REQUIRED, TICKET_CREATED or DEDUPLICATED.
// AI suggestion is never persisted as assigned_department_id by this boundary.
```

## Rollback procedure

1. Disable the handoff/auto-routing feature flag and route new cases to the existing central intake queue.
2. Preserve existing support tickets, messages, status logs, audit rows and outbox records; do not delete history.
3. Stop the new support mutation worker/RPC path and keep the read-only staff/central queue fallback available.
4. For an isolated local database, recreate the synthetic database if the additive migration must be removed. For shared/production data, use a reviewed forward-only compatibility migration after backup verification.
5. Re-run the handoff unit/static/PostgreSQL contracts and the full repository gate before re-enabling the feature.

## Known limitations

- The tested runtime uses an in-memory `SupportHandoffStore`; the durable Supabase repository/RPC adapter and transactional worker are downstream integration work.
- Citizen RLS reads expect a backend-signed `citizen_identity_hash` JWT claim; Supabase auth claim provisioning remains deployment configuration.
- Staff queue/detail/reply UI, citizen continuation messages, LINE delivery/retry/DLQ and FAQ learning are P5-HO-002, P5-HO-003 and P5-FAQ-001 work.
- SLA alert/reconciliation workers are P5-OPS-001; this task snapshots and mutates SLA state in the service boundary and validates the database shape.
- Production credential configuration, model/provider certification, production canary and P6-P9 gates remain open; this evidence does not claim project completion.

## Traceability

- Plan item: P5-HO-001.
- Source contract: `fullspec.md` §9.2 Chat/Handoff state, §12.1/§12.2 data model, §13.4 idempotency, and `plan.md` P5-HO-001.
