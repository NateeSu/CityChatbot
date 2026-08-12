# P7-RPT-001 Evidence

Status: **DONE (2026-08-11, scoped MVP Fast-Track auto-approved under `SPEC-MVP-001`)**.

This task delivers the deterministic department/executive KPI report projection,
explicit API boundary, A-80 admin report surface and safe CSV export. It does
not claim that the P7 gate, production provider configuration, external UAT or
P8/P9 certification is complete.

## Requirement trace

- `RF-01` / `NFR-ADMIN-001`: A-80 responsive admin report surface, keyboard-visible focus, screen-reader labels, table fallback and resilient UI states.
- `RF-04`: department and executive operational visibility is role-scoped and uses server-derived tenant/department identity.
- `RF-12`: all nine approved KPI definitions, immutable snapshot values, period comparison, freshness and reconciliation status are exposed together.
- `RF-14`: report output does not expose unapproved personal data and CSV export is formula-injection safe.
- `RF-15` / `RF-17`: report reads are derived from tenant-scoped snapshot/reconciliation boundaries; no browser mutation or cross-tenant widening is introduced.
- `INV-AI-001`: report numbers, status and reconciliation are deterministic snapshot facts; no LLM/provider output is used as numeric truth.
- `INV-TENANT-001`: request tenant, role, account and department scope are checked before projection; unsupported scope fails closed.

## Delivered files

- `packages/reports-kpi/src/report.ts`
- `packages/reports-kpi/src/report.test.ts`
- `packages/reports-kpi/src/index.ts`
- `apps/web/package.json`
- `pnpm-lock.yaml`
- `apps/web/app/api/v1/admin/reports/kpi/repository.ts`
- `apps/web/app/api/v1/admin/reports/kpi/route.ts`
- `apps/web/app/admin/admin-navigation.ts`
- `apps/web/app/admin/reports/page.tsx`
- `apps/web/app/admin/reports/KpiReportConsole.tsx`
- `apps/web/app/admin/reports/reports.css`
- `scripts/test_kpi_report.py`
- `scripts/test_ui_system.py`
- `plan.md`

## Implemented contract

The report read model returns the nine approved version-1 KPI definitions with
latest/previous values, change and change-percent, trend points, unit, cohort,
timezone, null rule, source, freshness, reconciliation and a deterministic
drill-down query key. It supports explicit MONTHLY and DAILY periods and
tenant-wide or department-scoped reads. A department head is constrained to
the department in the trusted server identity; tenant admin and executive
roles may view the listed tenant departments.

The canonical route is `GET /api/v1/admin/reports/kpi`. Query parameters are
explicitly allowlisted (`tenantId`, `role`, `accountId`, `from`, `to`,
`departmentId`, `categoryId`, `timezone`, `granularity`, `format`). Unknown
parameters, account/tenant tampering, unauthorized roles and unsupported
category semantics fail closed. Category filtering remains visibly disabled
until an approved category-aware KPI definition exists; the implementation
does not silently broaden a category request to a tenant-wide number.

The A-80 surface includes loading, empty, stale, partial/mismatch, error,
offline, permission-denied and expired-session states. It provides an
accessible data table fallback for trends, focus-visible controls, responsive
breakpoints and intentional table overflow only. CSV values are bounded and
formula-like text is escaped before export.

## Commands and actual results

Targeted verification:

- `pnpm exec vitest run packages/reports-kpi/src/kpi.test.ts packages/reports-kpi/src/snapshots.test.ts packages/reports-kpi/src/report.test.ts --pool=threads --maxWorkers=1` — **PASS**, 3 files / 18 tests.
- `pnpm --filter @citychatbot/web lint` — **PASS**.
- `pnpm exec tsc -p apps/web/tsconfig.json --noEmit` — **PASS**.
- `pnpm exec tsc -p packages/reports-kpi/tsconfig.json --noEmit` — **PASS**.
- `python -m unittest scripts.test_kpi_report scripts.test_ui_system -v` — **PASS**, 10/10.
- `pnpm --filter @citychatbot/web build` — **PASS**; build output contains `/admin/reports` and `/api/v1/admin/reports/kpi`.

Composite regression:

- `pnpm test:all` — **PASS**, 48 Vitest files / 314 tests, 173/173 static tests, lint, web and package typechecks, `SECRET_SCAN_CLEAN` and production build.
- `pnpm security:sbom` — **PASS**, 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`.
- `pnpm release:manifest` — **PASS**, 5 files, digest `03ada4baead32b2e1068376525231120165c317bd36b3a8a61ecb0891e5aeb46`.
- `pnpm release:verify` — **PASS**, the same digest.

Local production-artifact smoke on `127.0.0.1:3224` after the final build:

- tenant-admin MONTHLY JSON — HTTP 200, 9 definitions, 9 current metrics, 9 reconciled metrics, `READY`;
- tenant-admin DAILY JSON — HTTP 200, 9 current metrics, 9 reconciled metrics, 3 trend points, `READY`;
- department-head MONTHLY JSON — HTTP 200, enforced department `55555555-5555-4555-8555-555555555555`, 9 current metrics, `READY`;
- CSV — HTTP 200, 9 data rows, `text/csv; charset=utf-8`, attachment disposition;
- STAFF — HTTP 403; department tampering — HTTP 403; unsupported category — HTTP 400; unexpected query key — HTTP 400;
- `/admin/reports?role=EXECUTIVE` — HTTP 200.

## API example

```http
GET /api/v1/admin/reports/kpi?tenantId=00000000-0000-4000-8000-000000000001&role=DEPARTMENT_HEAD&accountId=10000000-0000-4000-8000-000000000004&from=2026-07-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z&timezone=Asia%2FBangkok&granularity=MONTHLY
```

The production environment intentionally returns `CONFIGURATION_UNAVAILABLE`
until a trusted server session and real snapshot persistence are configured.
The checked-in local fixture is synthetic and cannot be selected as production
data.

## Acceptance assessment

- all nine approved KPI definitions shown with exact snapshot values: **PASS**;
- monthly/daily period and trend comparison: **PASS**;
- tenant/admin, executive and department-head scope: **PASS**;
- definition/cohort/timezone/null-rule/source/freshness/drill-down visibility: **PASS**;
- empty/stale/partial/mismatch and resilient UI primitives: **PASS**;
- CSV export and formula-injection protection: **PASS**;
- category request is safely rejected pending approved category-aware definition: **PASS**;
- no AI-derived numeric truth, wildcard route or production browser secret: **PASS**.

## Rollback procedure

1. Disable or hide the report route/navigation entry through the release
   feature boundary and keep existing complaint/support operations available.
2. Pin the previous verified report artifact/manifest and serve the previous
   immutable snapshot/report version.
3. Do not edit snapshot history directly. If a projection is corrected, create
   a new server-side report/snapshot revision and require reconciliation before
   promotion.
4. Re-run the targeted report tests, `pnpm test:all` and `pnpm release:verify`
   before re-enabling the report surface.

## Known limitations and next work

- Production Supabase persistence, trusted server session, Vercel deployment,
  LINE configuration and provider credentials were not used or stored.
- Category-aware KPI filtering is intentionally unavailable until its metric
  definitions and SQL boundary are approved.
- Current export is safe CSV. Generic durable XLSX/PDF export jobs and the full
  operator job/DLQ console remain owned by subsequent P7 work.
- `P6-KB-001` and `P6-QA-001` remain blocked by `P4-QA-001`; `P7-GATE`, P8 and
  P9 are open. This evidence must not be interpreted as project completion.
