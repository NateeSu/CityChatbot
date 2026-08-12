# P4-DOC-001 — Document lifecycle, versioning, approval and processing jobs

Status: DONE

## Traceability

- Requirements: `RF-07`, `RF-10`, `RF-13`, `RF-17`.
- Authoritative sources: `fullspec.md` §5.3, §10.2–10.3, §10.8, §12.1, §14.2 and `plan.md` P4-DOC-001.
- The implementation preserves the canonical state machine. `ACTIVE` is never an upload state and `READY`/`EXPIRED`/`DISABLED`/`TESTING` are not knowledge states.

## Implementation

- `packages/knowledge/src/documents.ts` — tenant-scoped document/version repository, checksum dedupe, immutable version fields, processing transition guard, extraction metadata, approval records, retry/idempotency, leased ingestion jobs, atomic activation, retrieval filtering and privileged rollback.
- `packages/knowledge/src/documents.test.ts` — six unit scenarios covering quarantine, canonical lifecycle, duplicate hash, new version, failure recovery, expiry/visibility/department/tenant isolation, approval and searchable chunks.
- `packages/knowledge/package.json`, `packages/knowledge/tsconfig.json`, `packages/knowledge/src/index.ts` — canonical package boundary; package typecheck is part of `typecheck:packages`.
- `supabase/migrations/20260810060000_knowledge_document_schema.sql` — additive schema for categories, logical documents, immutable versions, artifacts, chunks, approvals and ingestion runs; composite tenant FKs; unique checksum/active-version indexes; forced RLS; append-only lineage; approval/activation/rollback security-definer functions.
- `supabase/seed.sql` — synthetic knowledge categories and `knowledge.manage.tenant` permission assignment for the deterministic tenant-admin fixture.
- `supabase/tests/knowledge_schema_contract.sql` and `scripts/test_knowledge_schema.py` — PostgreSQL and static contract checks.
- `package.json` and `pnpm-lock.yaml` — package typecheck and workspace dependency registration.

## Verification evidence

Commands run from repository root `D:\codex\CityChatbot`:

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/knowledge/src/documents.test.ts` | PASS — 6/6 tests |
| `pnpm exec tsc -p packages/knowledge/tsconfig.json --noEmit` | PASS |
| `python -m unittest scripts.test_knowledge_schema -v` | PASS — 5/5 tests |
| Apply migration through Docker PostgreSQL 16 | PASS; migration applied and re-applied idempotently |
| `supabase/tests/knowledge_schema_contract.sql` through Docker PostgreSQL | PASS — `DO`, `DO`, `DO` |
| Tenant-admin SQL smoke: approve → activate → tenant query | PASS — `ACTIVE/APPROVED`; tenant B returned 0 rows |
| Tenant-admin SQL smoke: activate v2 → rollback retained v1 | PASS — v1 `ACTIVE`, v2 `RETIRED` |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm test:all` | PASS — 22 test files, 147/147 unit tests, 48/48 static tests, lint, web/package typecheck, secret scan and production build |
| `pnpm security:sbom` | PASS — 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest; pnpm release:verify` | PASS — manifest digest `8ac89b945214549b1bc56b35d0ef1846b5914eacf359dc31c878c8899761d63b` |

## Acceptance criteria

- [x] Every upload starts `QUARANTINED`; direct `ACTIVE` insert/update is rejected by trigger/RLS.
- [x] Canonical processing transitions, retry to quarantine and redacted failure detail are enforced in domain and database contracts.
- [x] Same tenant checksum is deduplicated; a changed checksum creates the next immutable logical-document version.
- [x] Authority, visibility, owner department, category, effective window, review due, parser and extraction metadata are stored before publish.
- [x] Approval is an explicit append-only record; `ACTIVE` requires approved metadata and an atomic publish function.
- [x] Only `ACTIVE` versions inside the effective window are retrievable; citizen retrieval is `PUBLIC` only and staff retrieval is department-scoped for non-public content.
- [x] Failed candidates do not replace the previous active version; the previous approved version can be restored through the privileged rollback path.
- [x] Every tenant-owned knowledge table has `tenant_id`, composite tenant foreign keys where applicable, forced RLS and explicit policies.
- [x] Chunk retrieval is lineage-bound to the active version and is empty for unapproved, failed, retired or expired versions.

## API/SQL examples

The trusted database boundary exposes only constrained functions, not wildcard endpoints:

```sql
select private.approve_knowledge_document_version(
  :tenant_id, :document_version_id, :reviewer_account_id, :reason, :confirm_unknown_effective_date
);
select private.activate_knowledge_document_version(
  :tenant_id, :document_version_id, :actor_account_id
);
select private.rollback_knowledge_document_version(
  :tenant_id, :retained_approved_version_id, :actor_account_id
);
```

All three functions validate the current tenant/account context and `knowledge.manage.tenant` permission. The SQL contract also proves that an unauthenticated/unscoped direct `ACTIVE` upload is rejected and tenant B cannot observe tenant A rows.

## Rollback procedure

1. Disable the affected ingestion/index feature flag and stop the worker that is processing the candidate.
2. Keep the failed revision in `FAILED` or return it to `QUARANTINED` through the idempotent retry path; do not delete the source or lineage.
3. Use `private.rollback_knowledge_document_version` with an approved retained version and an audited actor reason. The function retires the current active revision and switches the alias atomically.
4. Verify active/effective/visibility filters and the tenant isolation contract, then resume processing only after the candidate is re-evaluated.

## Known limitations

- The TypeScript repository is an in-memory deterministic adapter used by the unit suite; production request/worker wiring to Supabase storage and the parser is intentionally delivered in the following P4 parser/index tasks. The durable SQL schema and constrained security-definer operations are present.
- Parser implementations, embeddings, hybrid retrieval, chatbot generation and full corpus certification remain open tasks in P4 and are not claimed by this evidence.
- `OD-001`, `OD-004`, `OD-010` and `OD-012` remain external/configuration decisions; no production credential or business approval was guessed.

