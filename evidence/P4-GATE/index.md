# P4-GATE Evidence

Status: DONE (2026-08-11, auto-approved under SPEC-MVP-001 after P4 L1 unit tests green)

## Gate decision

- The MVP fast-track gate is the P4 L1 unit-test gate defined in fullspec.md/plan.md.
- P4-CHAT-002 and P4-ROUTE-001 are implemented with task evidence and all P4 unit/static contracts are green.
- Retrieval benchmark, locked certification, red-team, provider E2E and CO/UAT review remain post-production work under the approved SPEC-MVP-001 rule; they do not block the MVP unit gate.

## Actual verification

- pnpm test:all: PASS, exit code 0.
- 30 test files passed.
- 208/208 L1 unit tests passed.
- 78/78 static contract tests passed.
- Lint, web/package typecheck, all package typechecks, secret scan and production build passed.
- P4 routing PostgreSQL contract: COMPLAINT_ROUTING_SQL_CONTRACT_PASS.
- P4 chat PostgreSQL contract: AI_CHAT_SCHEMA_SQL_CONTRACT_PASS.
- SBOM digest: 0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a.
- Release manifest digest: 184f38533aee41c56579796a2b107662e78072f1f6e3594ffff8105a6590286b.

## Acceptance

- P4 L1 unit-test pass rate is 100% with no focused/skip-only test used by the full suite.
- Safe fallbacks, tenant isolation, append-only AI traces, strict output validation and suggestion-only complaint routing are covered by tests.
- P4 evidence: evidence/P4-CHAT-002/index.md, evidence/P4-ROUTE-001/index.md.

## Rollback and boundary

- Keep the AI/chat/routing flags disabled or force HANDOFF/default intake if a post-production issue appears.
- Preserve trace evidence and restore the prior model/prompt/index bundle; do not delete audit data.
- This gate does not claim production deployment, canary, P5-P9 completion or project completion.
