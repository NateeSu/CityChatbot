# P4-RET-001 Evidence

Status: DONE (2026-08-11, auto-approved under `SPEC-MVP-001` after L1 unit tests green)

## Requirements and scope

- Requirements: `RF-07`, `RF-08`, `RF-16`.
- Prerequisites verified: `P4-INDEX-001` and `P0-QA-001` are DONE.
- The retrieval path binds tenant, audience, department and as-of time before candidate scoring. It returns only bounded evidence or a fail-safe `CLARIFY`/`HANDOFF` result.

## Changed files

- `packages/knowledge/src/retriever.ts` — Thai/Unicode normalization, Thai digit normalization, bounded typo/entity resolution, original-preserving conversation rewrite, exact/lexical/optional dense retrieval, RRF fusion, exact/authority/entity boosts, calibrated score, source/section/version diversity, parent/neighbor context expansion, coverage and conflict handling.
- `packages/knowledge/src/retriever.test.ts` — 7 L1 tests for normalization, exact values, tenant isolation, dense candidate rejection, deterministic RRF, diversity/context budget, ambiguous/missing-time clarification, typo resolution, policy row loading, conflict handoff and validation.
- `packages/knowledge/src/index.ts` — retriever exports.
- `supabase/migrations/20260810080000_retrieval_policy_schema.sql` — tenant-scoped versioned retrieval thresholds/config, forced RLS, approval/activation/rollback lifecycle and active/effective policy reader.
- `scripts/test_retrieval_policy_schema.py` — static policy contract.
- `supabase/tests/retrieval_policy_schema_contract.sql` — PostgreSQL policy/RLS/function/index contract.

## Verification commands and actual results

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/knowledge/src/retriever.test.ts` | PASS, 7/7 |
| `pnpm exec tsc -p packages/knowledge/tsconfig.json --noEmit` | PASS |
| `python -m unittest scripts.test_retrieval_policy_schema -v` | PASS, 5/5 |
| Apply `20260810080000_retrieval_policy_schema.sql` with `psql -v ON_ERROR_STOP=1` | PASS; re-apply also PASS/idempotent |
| Apply `supabase/tests/retrieval_policy_schema_contract.sql` with `psql -v ON_ERROR_STOP=1` | PASS, `RETRIEVAL_POLICY_SQL_CONTRACT_PASS` |
| Synthetic tenant-admin lifecycle transaction | PASS: `DRAFT → APPROVED → ACTIVE`, active reader returned version 1, tenant B visibility `0`; transaction rolled back |
| `pnpm test:all` | PASS; 25 files, 166/166 unit tests, 58/58 static tests, lint, typecheck, build, secret scan |
| `pnpm security:sbom` | PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest; pnpm release:verify` | PASS; digest `cc4b2522761893c5ed2d215a5b629d219cff525d59c3119e5ba726bdcfb1e0f9` |

## Acceptance criteria

- Normalization preserves the original question, converts Thai digits, retains negation markers and creates deterministic retrieval queries.
- Entity/department catalogs support exact aliases and bounded edit-distance typo resolution; unresolved multiple matches return `CLARIFY` with canonical reason code.
- Exact structured facts are matched before generative use; pending/rejected facts are excluded.
- Lexical candidates, optional dense candidates and exact candidates are restricted to the already scoped source; dense IDs outside the tenant are discarded.
- Reciprocal Rank Fusion uses versioned `rrf_k`; scoring includes exact, entity, authority and freshness signals, then calibrates to `[0,1]`.
- Duplicate source hashes and over-represented sections/versions are diversified; parent/neighbor expansion is bounded by context budget.
- Missing as-of date, no evidence, low evidence and conflicting approved facts fail closed to `CLARIFY` or `HANDOFF`.
- Retrieval policy top-k/threshold values are stored in `retrieval_policy_versions` and loaded through `retrievalPolicyFromRow`; approved configurations are immutable and activation/rollback is atomic.

## API/examples

```ts
const result = retrieve(indexRepository, tenantId, question, {
  audience: "CITIZEN",
  departmentId,
  at: new Date(),
  policy: activePolicy,
  entities: approvedDepartmentCatalog,
  denseRetriever: optionalCertifiedDenseProvider,
});

// result.outcome is READY, CLARIFY, or HANDOFF; result.trace records the
// tenant/effective/active boundary and candidate counts.
```

```sql
select * from private.get_active_retrieval_policy(:tenant_id, 'default');
select private.rollback_retrieval_policy_version(:tenant_id, :retained_policy_id, :actor_account_id);
```

## Rollback procedure

1. Disable the affected retrieval policy feature flag or force exact/lexical-only fallback.
2. Keep the bad policy version and retrieval traces for audit; do not delete evidence or index generations.
3. Call `private.rollback_retrieval_policy_version` for the retained approved policy.
4. Verify active/effective policy read and tenant-isolation retrieval smoke tests.
5. Re-run the P4-RET unit and PostgreSQL contracts before re-enabling dense retrieval.

## Known limitations

- The dense path is an optional, scope-checked provider interface. The local fixture has no certified `pgvector`/embedding model, so no vector is fabricated; provider certification belongs to later AI gateway/hardening work.
- The current domain adapter is in-process. Supabase RPC wiring, frozen gold-set Recall@K benchmark and production latency/cost measurements remain post-production hardening under `SPEC-MVP-001`.
- Retrieval does not generate an answer; P4-CHAT-001 owns final `ANSWER|CLARIFY|HANDOFF` generation and citation verification.

