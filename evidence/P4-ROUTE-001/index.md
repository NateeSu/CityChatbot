# P4-ROUTE-001 Evidence

Status: DONE (2026-08-11, auto-approved under SPEC-MVP-001 after L1 unit tests green)

## Requirements and scope

- Requirement IDs: RF-06, RF-08, RF-10, RF-16.
- The implementation is suggestion-only. It never mutates complaints.assigned_department_id, canonical status, or staff assignment.
- AI output is advisory; only DB-provided active tenant department work scopes can become candidates.
- Critical/high-risk, sensitive, prompt-injected, low-confidence, unavailable, malformed, disabled, or scope-less cases default to intake review.
- Synthetic/local fixtures only. No production Supabase, LINE, Vercel, OpenRouter, or citizen identity was used.

## Changed files

- packages/complaints/src/routing.ts — tenant-scoped candidate normalization, strict model output, prompt/PII boundary, safe fallback, suggestion run, idempotency, correction permission/version/audit flow.
- packages/complaints/src/routing.test.ts — 10 L1 tests covering candidate scope, tenant isolation, suggestion-only behavior, fallback classes, prompt injection, redaction, idempotency, correction and gateway schema.
- packages/complaints/src/index.ts — exports routing contracts.
- packages/complaints/package.json and pnpm-lock.yaml — workspace dependencies for AI gateway and AI safety.
- supabase/migrations/20260810110000_complaint_routing_hardening.sql — additive trace fields, structured-output checks, tenant-composite source/recommended-department FKs, request idempotency index and source index.
- supabase/tests/complaint_routing_hardening_contract.sql — PostgreSQL RLS, trigger, FK and idempotency assertions.
- scripts/test_complaint_routing_schema.py — 4 static schema contract tests.
- supabase/README.md — migration, validation and rollback instructions.

## Verification commands and actual results

| Command | Result |
|---|---|
| pnpm exec vitest run packages/complaints/src/routing.test.ts | PASS, 10/10 |
| pnpm exec tsc -p packages/complaints/tsconfig.json --noEmit | PASS |
| python -m unittest scripts.test_complaint_routing_schema -v | PASS, 4/4 |
| local migration apply | PASS, 20260810110000_complaint_routing_hardening.sql |
| local migration re-apply | PASS, idempotent notices only |
| local PostgreSQL contract | PASS, COMPLAINT_ROUTING_SQL_CONTRACT_PASS |
| pnpm test:all | PASS, exit code 0; 30 test files, 208/208 L1 unit tests, 78/78 static tests, lint, web/package typecheck, package typecheck, secret scan and production build |
| pnpm security:sbom | PASS; 95 components, digest 0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a |
| pnpm release:manifest; pnpm release:verify | PASS; digest 184f38533aee41c56579796a2b107662e78072f1f6e3594ffff8105a6590286b |

## Acceptance criteria

- Candidate departments are selected from active/effective DB work scopes, latest scope version per department, tenant-filtered before model invocation, and never hard-coded.
- Cross-tenant department and duplicate candidates are excluded before the model boundary; the model receives no cross-tenant candidate identifier.
- Strict structured output validates summary, category, priority, risk, confidence, reason, recommended department ID and duplicate candidate IDs.
- Recommended department IDs and duplicate IDs must belong to the DB-provided candidate sets; invalid output falls back safely.
- High confidence produces only a SUGGESTION with requiresHumanReview=true and assignmentApplied=false.
- Low confidence/provider failure/malformed output/no candidate/prompt injection/disabled feature produces DEFAULT_INTAKE with a safe reason.
- HIGH/URGENT output is DEFAULT_INTAKE with highRiskAlert=true; SENSITIVE output is DEFAULT_INTAKE; AI never makes a final status or assignment decision.
- Complaint text, location text and scope text are redacted/bounded before the provider boundary; raw phone data is not sent.
- Replayed requests are idempotent; a reused key with different data is rejected.
- Staff accept/correct requires explicit authorization, matching complaint version, authorized same-tenant department, idempotency and an append-only ai.routing_corrected audit event.
- SQL trace is versioned and append-only, has forced RLS, tenant-composite source/recommended-department FKs, structured JSON checks and a tenant/complaint/request uniqueness index.
- Screenshots: not applicable; this task is a backend/routing contract with no visual surface.

## API example

    const suggestion = await routing.route({
      tenantId,
      complaint: complaintSnapshot,
      defaultIntakeQueueId,
      scopes: activeScopesFromDb,
      duplicateCandidates: dbCandidates,
      featureEnabled: true,
      idempotencyKey: requestId,
    });
    // suggestion.decision.assignmentApplied is always false

## Rollback procedure

1. Disable complaint_ai_routing_enabled and route all new complaints to the existing intake queue.
2. Keep the canonical complaint create/assignment flow available for manual staff handling.
3. Preserve the append-only routing run and correction evidence; do not delete trace rows.
4. For an isolated test database, recreate the named database if the additive migration must be removed. For shared/production data, use a reviewed forward-only compatibility migration.
5. Re-run routing unit/static/PostgreSQL contracts and the full test gate before re-enabling the feature.

## Known limitations

- The production persistence adapter still needs to map ComplaintRoutingStore to the approved Supabase API/RPC boundary; the local in-memory store is the tested runtime boundary.
- Production feature-flag, model certification, provider privacy/DPA approval, and deployment credentials remain external configuration; the synthetic seed keeps complaint_ai_routing_enabled false.
- Actual complaint assignment, staff UI and handoff workflow remain downstream tasks; this task only records the reviewed routing suggestion/correction boundary.
- Full routing certification and post-production canary are not this MVP unit-test task and remain P4-QA/P8/P9 work.

## Traceability

- Plan item: P4-ROUTE-001.
- Source contract: fullspec.md section 8.6 Routing and schema inventory section 12.3.
