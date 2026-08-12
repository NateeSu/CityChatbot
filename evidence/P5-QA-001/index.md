# P5-QA-001 Evidence

สถานะ: **DONE (2026-08-11, MVP Fast-Track)**

Task นี้ครอบคลุม `RF-07`, `RF-08`, `RF-09`, `RF-13` และ `RF-16` ตาม `fullspec.md`/`plan.md`. L1 unit suite เป็น blocking gate ตาม `SPEC-MVP-001`; external LINE/device/UAT และ provider integration เป็น post-production follow-up ที่ไม่ทำให้ local MVP release ค้าง แต่ทุก boundary fail-closed.

## สิ่งที่ส่งมอบ

- `packages/chat/src/grounding.test.ts` เพิ่ม locked decision matrix สำหรับ no knowledge, low relevance, conflicting evidence, sensitive, person-specific, policy/legal discretion, staff request และ security พร้อม ambiguous unresolved → `CLARIFY`; ทุก handoff case ต้องไม่มี claims และใช้ canonical reason code
- `packages/support-handoff/src/handoff.test.ts` เพิ่ม confirmation/urgent policy cases และ retry/burst resilience case
- production handoff/chat implementation ที่ทดสอบร่วมกันยังคงบังคับ canonical outcomes `ANSWER | CLARIFY | HANDOFF`, fail-closed provider verification, tenant-scoped ticket storage, idempotency และ active-topic dedupe

## ผลการทดสอบจริง

- `pnpm exec vitest run packages/support-handoff/src/handoff.test.ts packages/chat/src/grounding.test.ts` — **PASS**, 2 files / 25 tests
- `pnpm test:unit` — **PASS**, 37 test files / 255 tests
- `pnpm test:db` — **PASS**, 123 static contract tests
- `pnpm lint` — **PASS**
- `pnpm typecheck` — **PASS**
- `pnpm typecheck:packages` — **PASS**
- `pnpm build` — **PASS**, production Next.js build, TypeScript และ static pages 19/19
- `pnpm security:scan` — **PASS**, `SECRET_SCAN_CLEAN`

## Locked acceptance results

- canonical handoff reasons map exactly to `NO_EVIDENCE`, `LOW_EVIDENCE`, `CONFLICTING_EVIDENCE`, `SENSITIVE`, `PERSON_SPECIFIC`, `POLICY_REFUSAL`, `SECURITY`, `STAFF_REQUESTED`, `SYSTEM_ERROR`; no alias/outcome นอกสัญญา
- ambiguous unresolved request maps to `CLARIFY` with `AMBIGUOUS_ENTITY`, `MISSING_TIME` หรือ `AMBIGUOUS_INTENT`; no answer claims are emitted
- no-knowledge/low-relevance/conflict/risk cases produce `HANDOFF` with zero claims; provider output verification failure produces `SYSTEM_ERROR` handoff
- non-urgent handoff before citizen confirmation creates **0 tickets**; after confirmation creates **1 ticket**; urgent policy creates **1 automatic ticket** with `URGENT_AUTOMATIC`
- five repeated submissions and a 100-event burst keep **1 ticket, 1 outbox event, 106 unique messages** and 105 deduplication audits; no lost/duplicate ticket or message
- source-event/idempotency replay returns the same ticket without a second outbox; different citizens do not cross-deduplicate
- tenant/department permission checks reject out-of-scope assignments; raw identity/injection text is redacted; public AI draft and stale staff mutation are rejected; missing reply permission is rejected
- active handoff topic does not receive an interleaved answer until the user changes topic

## UAT / API evidence

The local synthetic service fixture executed the locked cases and direct service boundary. No production Supabase, LINE, Vercel or provider credential was used. External LINE sandbox/device acceptance is unavailable in this session and remains explicitly tracked as post-production UAT; the production path is configured to fail closed rather than fabricate delivery or ticket status.

## Rollback procedure

1. Set chatbot routing to force `HANDOFF` to the central queue and disable FAQ publication if a correctness or queue incident is detected.
2. Pause delivery/consumer processing, replay from the durable outbox/checkpoint after the fixed version, and keep existing ticket/audit/message history.
3. Restore the last approved routing/policy version; verify no duplicate source-event/idempotency keys were emitted before resuming.

## Known limitations / next executable work

- local burst test is deterministic in-process coverage, not a production load test; shared worker/queue and provider retry canary remain post-production operational work
- real LINE receipt, provider outage drills, device accessibility/UAT and stakeholder certification cannot be claimed without external configured surfaces
- `P5-GATE` is the next gate. P6–P9 tasks/gates remain open, so project completion is not claimed
