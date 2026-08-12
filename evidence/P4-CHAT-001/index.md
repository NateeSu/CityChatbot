# P4-CHAT-001 Evidence

Status: DONE (2026-08-11, auto-approved under SPEC-MVP-001 after L1 unit tests green)

## Requirements and scope

- Requirements: RF-01, RF-07, RF-08, RF-09, RF-13.
- Prerequisites verified: P4-RET-001 and P4-AIGW-001 are DONE.
- Canonical outcomes are restricted to ANSWER, CLARIFY, and HANDOFF; reason codes are the canonical values from fullspec.md.

## Changed files

- packages/chat/package.json, packages/chat/tsconfig.json — grounded chatbot domain package with workspace dependencies.
- packages/chat/src/grounding.ts — answerability policy, canonical discriminated result types, deterministic fact answer rendering, claim/evidence/citation verification, strict grounded-turn schema, gateway integration, safe fallback and response sanitizer.
- packages/chat/src/grounding.test.ts — 7 L1 tests for answer, clarify, handoff, conflict/sensitive behavior, outcome precedence, unsupported numeric claims, strict fields and gateway verification.
- package.json / pnpm-lock.yaml — package typecheck and workspace dependency graph.

## Verification commands and actual results

| Command | Result |
|---|---|
| pnpm exec vitest run packages/chat/src/grounding.test.ts | PASS, 7/7 |
| pnpm exec tsc -p packages/chat/tsconfig.json --noEmit | PASS |
| pnpm install --lockfile-only | PASS; lockfile updated for workspace dependency |
| pnpm test:all | PASS; 27 files, 181/181 unit tests, 63/63 static tests, lint, typecheck, build, secret scan |
| pnpm security:sbom | PASS; 95 components, digest 0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a |
| pnpm release:manifest; pnpm release:verify | PASS; digest 5e28b1542716edb6866a24f718f91f2017bde82ace9c276b8f7698d1797fa917 |

## Acceptance criteria

- ANSWER contains at least one material claim and citation; each material claim references final-context public evidence.
- Phone/number/digit claims are checked against source evidence; unsupported exact values fail verification.
- CLARIFY contains no claims/citations and uses only AMBIGUOUS_ENTITY, MISSING_TIME or AMBIGUOUS_INTENT.
- HANDOFF is used for no/low/conflicting evidence, sensitive/person-specific/policy/security/staff/system cases with canonical reason codes.
- Outcome precedence is enforced: HANDOFF > CLARIFY > ANSWER.
- The model output schema is strict; unknown fields, invalid discriminants and malformed shape never reach business output.
- Gateway-generated turns are re-verified against evidence; any failed verification becomes HANDOFF/SYSTEM_ERROR.
- Internal evidence markers and prompt/secret-like lines are removed from answer text before presentation.

## API example

    const decision = decideAnswerability(queryPlan, retrievalResult, {
      documentTitles,
      contacts,
    });

    const checked = verifyModelGroundedTurn(modelTurn, decision.evidence);

The deterministic path produces an answer from approved exact facts first; a model may produce a structured turn only through @citychatbot/ai-gateway, followed by the same verifier.

## Rollback procedure

1. Disable free-form AI answer generation and route all turns to deterministic retrieval or HANDOFF.
2. Keep retrieval/model/prompt versions and verifier traces for replay; do not delete evidence.
3. Raise the handoff threshold or pin the previous gateway/model/prompt configuration.
4. Re-run grounded decision and gateway failure tests before enabling model output again.

## Known limitations

- Durable ai_chat_sessions, ai_chat_messages, ai_runs, ai_claims, ai_citations and ai_feedback persistence plus LINE conversation wiring are later tasks (P4-CHAT-002/P5).
- Claim entailment is deterministic exact-field/source validation; full locked certification and multi-turn production replay remain P4-QA/P8 hardening.
- Prompt-injection and PII/URL output controls are intentionally a separate P4-AISEC-001 boundary; unresolved security cases must hand off.

