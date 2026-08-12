# P4-CHAT-002 Evidence

Status: DONE (2026-08-11, auto-approved under SPEC-MVP-001 after L1 unit tests green)

## Requirements and scope

- Requirement families: RF-01, RF-05, RF-07, RF-08, RF-09.
- Canonical outcomes remain only ANSWER, CLARIFY and HANDOFF; all reason codes are from fullspec.md.
- LINE provider, Supabase and tenant fixtures used in tests are synthetic/local only. No production credential or real citizen identity was used.

## Changed files

- packages/chat/src/conversation.ts — tenant-scoped session/context state, hashed LINE identity, deterministic topic routing, active-handoff lock, prompt guard, timeout/cancellation, safe truncation, after-hours/source-label rendering, feedback, audit/usage and final delivery through the LINE dispatcher.
- packages/chat/src/conversation.test.ts — 10 L1 tests for session lifecycle, phases, dedupe/redelivery, multi-turn context, topic switch, staff handoff, injection/oversize fallback, cancellation, feedback, after-hours, LINE delivery and unverified output.
- packages/chat/src/index.ts — exports conversation contracts.
- packages/chat/package.json / pnpm-lock.yaml — explicit line and security workspace dependencies.
- supabase/migrations/20260810100000_ai_chat_schema.sql — ai_chat_sessions, ai_chat_messages, ai_runs, ai_claims, ai_citations and ai_feedback with composite tenant FKs, forced RLS, append-only trace triggers and idempotency indexes.
- supabase/tests/ai_chat_schema_contract.sql — PostgreSQL assertions for forced RLS, tenant policies, append-only triggers, authenticated write denial and idempotency.
- scripts/test_ai_chat_schema.py — 6 static schema contract tests.
- supabase/README.md — local chat schema validation and rollback notes.

## Verification commands and actual results

| Command | Result |
|---|---|
| pnpm exec vitest run packages/chat/src/conversation.test.ts packages/security/src/ai-safety.test.ts | PASS, 17/17 |
| pnpm exec tsc -p packages/chat/tsconfig.json --noEmit | PASS |
| pnpm install --lockfile-only | PASS |
| docker local migration apply | PASS, 20260810100000_ai_chat_schema.sql |
| docker local migration re-apply | PASS, idempotent notices only |
| docker local PostgreSQL contract | PASS, AI_CHAT_SCHEMA_SQL_CONTRACT_PASS |
| python -m unittest scripts.test_ai_chat_schema -v | PASS, 6/6 |
| pnpm test:all | PASS, exit code 0; 29 test files, 198/198 L1 unit tests, 74/74 static tests, lint, web/package typecheck, secret scan and production build |
| pnpm security:sbom | PASS; 95 components, digest 0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a |
| pnpm release:manifest; pnpm release:verify | PASS; digest bd5cc393316f1af91dc216d53c1c1bc249321136c71a1e017677b43c4650aeea |

## Acceptance criteria

- A LINE user is represented in chat state by an HMAC hash; raw LINE user ID is not persisted in the session store or SQL schema.
- Session identity is tenant/channel/user scoped, expires by TTL, and retains only a bounded redacted context window.
- Replayed LINE events are idempotent; duplicate delivery returns the stored response and does not invoke the processor twice.
- Every accepted turn emits TYPING, ACK and FINAL phases; only the final text is sent through LineMessagingDispatcher with reply/push idempotency.
- Source labels, clarify/handoff copy, after-hours notice and official contact allowlist are rendered in Thai and bounded to LINE text limits.
- Staff request, active handoff topic, prompt injection, oversized input, provider timeout and unverified output fail safely without an unsupported ANSWER.
- Topic switch clears prior context before processing; same-topic active handoff does not receive an AI answer inserted into the handoff flow.
- Cancellation aborts an in-flight processor and preserves CANCELLED session status; feedback is tenant/message scoped and PII redacted.
- Session/message/run/claim/citation/feedback tables have composite tenant relationships, forced RLS, deny-by-default authenticated writes, append-only trace protection and event/session indexes.

## API example

    const response = await chat.process({
      tenantId,
      channel: "LINE",
      eventId: webhookEventId,
      lineUserId,
      text,
      replyToken,
      correlationId,
    });

    await chat.recordFeedback({
      tenantId,
      sessionId: response.session.id,
      messageId: response.message.id,
      value: "HELPFUL",
    });

## Rollback procedure

1. Turn off the chat feature flag or route chat to the information-only/HANDOFF response.
2. Stop final LINE delivery for the affected route; preserve complaint intake and support channels.
3. Restore the previous chat/prompt/model/index bundle and keep append-only trace evidence.
4. If the schema change must be reverted in an isolated environment, recreate that explicitly named test database; for shared/production data use a reviewed forward-only compatibility migration.
5. Re-run the conversation, AI-safety, SQL contract and full unit gate before re-enabling traffic.

## Known limitations

- The production adapter still needs wiring to the approved Supabase project and actual LINE/Vercel environment; local in-memory store and synthetic LINE provider are the executable unit boundary.
- Distributed rate limiting, durable worker/outbox delivery and production webhook configuration remain operational follow-up.
- Support ticket creation and staff reply/FAQ learning are P5 scope; the current handoff preserves the state and safe user copy without creating a ticket.
