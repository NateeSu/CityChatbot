# P4-INDEX-001 Evidence

Status: DONE (2026-08-11, auto-approved under `SPEC-MVP-001` after L1 unit tests green)

## Requirements and scope

- Requirements: `RF-03`, `RF-07`, `RF-17`.
- Prerequisites verified: `P4-PARSE-001` and `P0-COR-002` are DONE.
- Exit behavior: deterministic chunks and exact facts carry source locators; only reviewed facts from an ACTIVE/effective version are eligible for retrieval; index generations switch atomically and can roll back to a retained generation.

## Changed files

- `packages/knowledge/src/indexer.ts` — deterministic section/FAQ/table/procedure/contact chunking, bounded token budgets, source lineage, exact fact extraction, generation IDs/config hash, review/activation/rollback adapter.
- `packages/knowledge/src/indexer.test.ts` — deterministic ID/content, table header lineage, exact values, review gate, tenant/effective filtering, generation switch/rollback, and no fabricated embedding tests.
- `packages/knowledge/src/index.ts` — package export.
- `supabase/migrations/20260810070000_knowledge_index_schema.sql` — generation/fact tables, immutable chunk lineage columns, pg_trgm lexical index, forced RLS, active/effective/review policies, privileged activation/rollback functions.
- `scripts/test_knowledge_index_schema.py` — static schema/security contract.
- `supabase/tests/knowledge_index_schema_contract.sql` — PostgreSQL integration contract.

## Verification commands and actual results

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/knowledge/src/indexer.test.ts` | PASS, 5/5 |
| `pnpm exec tsc -p packages/knowledge/tsconfig.json --noEmit` | PASS |
| `python -m unittest scripts.test_knowledge_index_schema -v` | PASS, 5/5 |
| Apply `20260810070000_knowledge_index_schema.sql` with `psql -v ON_ERROR_STOP=1` | PASS; re-apply also PASS/idempotent |
| Apply `supabase/tests/knowledge_index_schema_contract.sql` with `psql -v ON_ERROR_STOP=1` | PASS, `KNOWLEDGE_INDEX_SQL_CONTRACT_PASS` |
| `pnpm test:all` | PASS; 25 files, 165/165 unit tests, 53/53 static tests, lint, typecheck, build, secret scan |
| `pnpm security:sbom` | PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest; pnpm release:verify` | PASS; digest `479d75f659641612bd99f0b853bb2af5eb5b8993b559eaa16faa3bb47acf7941` |

## Acceptance criteria

- Section, FAQ, procedure, contact and table-row chunks preserve boundaries and repeat table header context.
- Chunk token count is bounded at `<=700`; prose overlap and parent limits are policy-validated.
- Phone/fee/date/time and other canonical fact types retain normalized value, source chunk, source locator and source quote.
- Re-indexing the same parsed source/config produces identical generation/chunk/fact IDs and content.
- Unreviewed facts cannot activate a generation; ACTIVE retrieval is restricted to the tenant, active/effective version and permitted audience/department.
- Cross-tenant IDs are rejected by the adapter and composite tenant foreign keys/RLS exist in PostgreSQL.
- Previous approved index generation is retained and rollback is atomic.
- No embedding vector is fabricated when no certified model profile exists; optional embedding JSON remains empty until model registry/OD-011 resolution.

## API/SQL examples

```ts
const generation = buildIndexGeneration({
  tenantId, documentVersionId, versionState: "INDEXING",
  approvalStatus: "APPROVED", visibility: "PUBLIC",
  ownerDepartmentId, authorityLevel: 90, parsed, now,
});
repository.registerGeneration(generation);
repository.approveFacts(tenantId, generation.id, generation.facts.map((fact) => fact.id), reviewer, now);
repository.activateGeneration(tenantId, generation.id, { versionState: "ACTIVE", approvalStatus: "APPROVED", at: now });
```

Durable activation and rollback use the privileged functions:

```sql
select private.activate_knowledge_index_generation(:tenant_id, :generation_id, :actor_account_id);
select private.rollback_knowledge_index_generation(:tenant_id, :retained_generation_id, :actor_account_id);
```

## Rollback procedure

1. Stop/disable the affected index publish worker or retrieval generation flag.
2. Keep the failed/new generation retained for audit; do not delete chunks or facts.
3. Call `private.rollback_knowledge_index_generation` with the authorized tenant actor and retained approved generation.
4. Verify the active generation, active/effective predicates and retrieval smoke test for the tenant.
5. Re-run the P4 index unit/SQL contracts before re-enabling the publish path.

## Known limitations

- `InMemoryKnowledgeIndexRepository` is the deterministic domain adapter; durable ingestion-worker/API wiring is delivered by later P4 tasks.
- The local PostgreSQL image has `pg_trgm` but not `pgvector`; embeddings are deliberately fail-closed and require certified model registry/OD-011 resolution before vector migration.
- Conflict-ledger quarantine, provider calls, retrieval benchmark certification and production Supabase verification remain later tasks; unresolved evidence must route to `CLARIFY`/`HANDOFF`.

