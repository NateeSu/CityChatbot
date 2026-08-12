# P3-DUP-001 - deterministic duplicate candidates and map safety

Status: DONE (MVP Fast-Track auto-approved)

## Traceability

- Requirements: `RF-04` IAM/tenant scope, `RF-06` complaint workflow, `RF-13` security, `RF-14` privacy, `RF-16` QA.
- Authoritative sections: `fullspec.md` section 8.7 Duplicate, section 13.4 Idempotency, section 13.5 Admin endpoint inventory, and `SPEC-MVP-001`.
- Plan trace: `plan.md` `P3-DUP-001`; prerequisites `P3-CMP-001` verified.

## Delivered files

- `packages/complaints/src/duplicates.ts` - tenant/status/location/time/category-first candidate generation, bounded deterministic ranking, safe map clustering, staff decision model and idempotent audit repository.
- `packages/complaints/src/duplicates.test.ts` - distance/time boundaries, same coordinates, missing GPS, category/text similarity, tenant isolation, deterministic ordering, high-density aggregation, decision idempotency, stale version and no automatic status mutation.
- `packages/complaints/src/index.ts` - duplicate domain exports.
- `apps/web/app/api/v1/admin/complaints/[id]/duplicate-decisions/route.ts` - canonical staff decision endpoint; production configuration fails closed until the real auth/database adapter is wired.
- `apps/web/app/api/v1/admin/complaints/repository.ts` - synthetic admin locations for local candidate/API verification.
- `supabase/migrations/20260810050000_duplicate_candidates.sql` - idempotency constraint/index, tenant/status/time lookup indexes, Haversine candidate SQL function, and explicit human-decision boundary.
- `supabase/tests/duplicate_schema_contract.sql` - PostgreSQL 16 function/index/forced-RLS assertions.
- `scripts/test_duplicate_schema.py` - static schema and no-auto-merge contract tests.
- `plan.md`, `evidence/progress/2026-08-10.md` - status and resume checkpoint.

## Commands and actual results

- `pnpm exec vitest run packages/complaints/src/duplicates.test.ts --reporter=verbose` - PASS; `5/5`.
- `pnpm exec tsc -p packages/complaints/tsconfig.json --noEmit` - PASS.
- `pnpm --filter @citychatbot/web lint` - PASS.
- `pnpm test:all` - PASS; 20 test files, `136/136` unit tests, `40/40` Python static tests, lint, web/package typecheck, secret scan and Next production build.
- `pnpm test:db` - PASS; `40/40` static/schema/corpus/GUI/release tests.
- `Get-Content -Raw supabase/migrations/20260810050000_duplicate_candidates.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` - PASS; PostgreSQL 16 migration applied.
- `Get-Content -Raw supabase/tests/duplicate_schema_contract.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` - PASS; both `DO` blocks passed with forced RLS/function/index checks.
- Local synthetic API check on `http://127.0.0.1:3100`: `POST /api/v1/admin/complaints/{id}/duplicate-decisions` returned `201`; replay with the same idempotency key returned `200` and `idempotentReplay=true`; the complaint remained `IN_PROGRESS` with the same row version.
- `pnpm install --frozen-lockfile` - PASS; workspace already up to date.
- `pnpm audit --prod --audit-level=high` - PASS; no known vulnerabilities.
- `pnpm security:sbom` - PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`.
- `pnpm release:manifest` / `pnpm release:verify` - PASS; digest `3cc213c83e50b4223dab35ae938e64b4afa210b3851ab5dbac29bf7b9ccf6e09`.

## Acceptance criteria

- [x] Candidate filtering is tenant-scoped and excludes resolved, closed, out-of-jurisdiction and cancelled complaints before scoring.
- [x] Radius and time window are configurable, inclusive at the boundary, and candidates without a complete GPS pair are excluded.
- [x] Category match is preferred; deterministic title-token similarity is the bounded fallback; result ordering and limit are deterministic.
- [x] AI/clients receive only a bounded safe candidate projection; no citizen endpoint exposes another reporter identity, phone, LINE ID, description or map candidate id.
- [x] Map output is aggregated to rounded density clusters with candidate count and no reporter or complaint identity.
- [x] Staff decisions are limited to `LINK`, `MERGE_REFERENCE`, and `NOT_DUPLICATE`; decision writes are idempotent and audited.
- [x] No decision mutates complaint status or performs an automatic merge/close; a candidate must still satisfy the configured suggestion boundary.
- [x] Existing `complaint_duplicate_links` forced RLS and composite tenant FKs remain intact; duplicate decision idempotency is tenant-scoped.

## API example

```http
POST /api/v1/admin/complaints/{complaintId}/duplicate-decisions?role=TENANT_ADMIN&accountId={synthetic-account}
Content-Type: application/json

{
  "candidateComplaintId": "{same-tenant-candidate}",
  "decision": "MERGE_REFERENCE",
  "reason": "เจ้าหน้าที่ตรวจสอบแล้วเป็นเหตุเดียวกัน",
  "expectedVersion": 4,
  "idempotencyKey": "api-duplicate-decision-003"
}
```

The synthetic run returned `201` on the first request and `200` on replay. `MERGE_REFERENCE` is a reference decision only; no complaint state transition was emitted.

## Rollback

1. Disable the duplicate suggestion/map feature flag and stop calling the staff decision endpoint.
2. Keep complaints independent; do not delete complaint rows or decision/audit records.
3. If the migration must be rolled back in a controlled deployment, first stop duplicate decision writes, preserve `complaint_duplicate_links` audit data, then remove only the P3 index/function/nullable idempotency artifacts using the release migration procedure.
4. Re-run `pnpm test:all`, `pnpm test:db`, the PostgreSQL duplicate contract and release verification before re-enabling the feature.

## Known limitations / next executable work

- The local web route uses synthetic fixtures and the existing fail-closed environment guard; production Supabase auth/session and durable repository wiring are not guessed or enabled by this task.
- Candidate similarity is deterministic token Jaccard in the application adapter; the production SQL function intentionally uses the indexed same-category boundary and must be paired with the approved production similarity implementation before broader rollout.
- The next executable plan task is `P3-RES-001`, followed by `P3-GATE`. Project completion and P9 status are not claimed.
