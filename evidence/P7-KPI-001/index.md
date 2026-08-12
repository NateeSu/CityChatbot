# P7-KPI-001 Evidence

สถานะ: **DONE (2026-08-11, scoped L1/unit and SQL truth gate passed)**

This evidence covers only `P7-KPI-001`. It does not claim that P7 is complete,
does not waive the blocked `P6-KB-001`/`P4-QA-001` chain, and does not claim
production provider configuration, KPI snapshots/jobs, dashboards or UAT.

## Requirement trace

- `RF-06` — complaint facts, status history, SLA snapshot and tenant/department filters are used as the source of truth.
- `RF-12` — every metric has an approved version, formula, cohort, timezone, null rule, tooltip and drill-down metadata.
- `RF-17` — SQL/read-model calculation is tenant-scoped, forced-RLS metadata is additive, and historical definition versions are immutable/readable when pinned.
- `RF-18` — approval metadata and versioned definition lifecycle are explicit; synthetic seed rows are the only auto-approved examples.
- `INV-AI-001` — no AI/provider call or model output participates in numeric KPI calculation.
- `OD-005` — real tenant business-calendar/first-response policy remains a configuration boundary; the SQL uses the approved SLA snapshot fields and synthetic BKK metadata.

## Delivered files

- `packages/reports-kpi/package.json`
- `packages/reports-kpi/tsconfig.json`
- `packages/reports-kpi/README.md`
- `packages/reports-kpi/src/kpi.ts`
- `packages/reports-kpi/src/kpi.test.ts`
- `supabase/migrations/20260811220000_kpi_metric_dictionary.sql`
- `supabase/tests/kpi_metric_schema_contract.sql`
- `supabase/seed.sql` (synthetic approved dictionary only)
- `scripts/test_kpi_schema.py`
- `package.json` and `pnpm-lock.yaml` workspace/typecheck registration
- `plan.md` and `evidence/progress/2026-08-11.md`

## Metric contract

Definition version 1 contains nine approved keys:

`COMPLAINT_RECEIVED_VOLUME`, `COMPLAINT_CLOSED_VOLUME`,
`COMPLAINT_OPEN_BACKLOG`, `COMPLAINT_REOPENED_VOLUME`,
`FIRST_RESPONSE_SLA_RATE`, `RESOLUTION_SLA_RATE`,
`OUT_OF_JURISDICTION_RATE`, `SUPPORT_TICKET_VOLUME`, and
`SUPPORT_TICKET_CLOSED_RATE`.

All periods are half-open UTC instants `[from, to)`. Counts return zero for no
rows. Rates return `null` for a zero denominator. SLA pending and excluded
counts are returned separately. The default SQL calculation selects the
current `APPROVED` version; an explicit version pin can read an immutable
`RETIRED` version for rollback or historical reconciliation. No numeric value
is calculated by TypeScript in production: `private.calculate_kpi` is the
canonical SQL boundary. The TypeScript package is a fixture oracle only.

## Commands and actual results

Targeted checks:

- `pnpm exec vitest run packages/reports-kpi/src/kpi.test.ts --pool=threads --maxWorkers=1` — **PASS**, 1 file / 8 tests.
- `pnpm exec tsc -p packages/reports-kpi/tsconfig.json --noEmit` — **PASS**.
- `python -m unittest scripts.test_kpi_schema -v` — **PASS**, 5/5.
- Migration applied idempotently to local PostgreSQL `citychatbot-p3-db` with `ON_ERROR_STOP=1` — **PASS**.
- `supabase/tests/kpi_metric_schema_contract.sql` via local PostgreSQL with `ON_ERROR_STOP=1` — **PASS**. Forced-RLS, browser write denial, definition metadata, all nine SQL calls, tenant isolation, exact fixture values and version pin/rollback passed. The fixture transaction ended with `ROLLBACK`.

Exact SQL fixture assertions passed:

| Metric | Expected SQL result |
|---|---:|
| Received | 6 cases |
| Closed | 2 cases |
| Open backlog at `to` | 3 cases |
| Reopened | 1 case |
| First-response SLA | 2 / 3; pending 1; excluded 2 |
| Resolution SLA | 2 / 3; pending 1; excluded 2 |
| Out of jurisdiction | 1 / 5; cancelled excluded 1 |
| Support volume | 2 cases |
| Support closed rate | 1 / 2 |
| Department A1 received | 4 cases |

Composite regression:

- `pnpm test:all` — **PASS**, 46 Vitest files / 304 tests, 167 static tests, lint, web typecheck, package typecheck, secret scan (`SECRET_SCAN_CLEAN`) and production build.
- `pnpm security:sbom` — **PASS**, 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`.
- `pnpm release:manifest` — **PASS**, 5 files, digest `b7be60ba720f50dae276cdac8b6376f23aa64b4031f98a745a40219be4ecf7f5`.
- `pnpm release:verify` — **PASS**, the same digest.

## Acceptance assessment

- Definition/formula/cohort/timezone/null-rule/tooltip deliverable: **PASS**.
- Versioned SQL view/function and raw reconciliation contract: **PASS**.
- Zero/one/many, boundary, reopened, cancelled, out-of-jurisdiction, SLA-pause and support-ticket fixtures: **PASS**.
- SQL exact fixture reconciliation: **PASS** (all assertions, mismatch 0).
- Tenant and department filter isolation: **PASS** in TypeScript and PostgreSQL contract.
- AI computes no numeric truth: **PASS**; no provider credential, model, prompt or AI dependency is present in this path.
- Rollback: **PASS** for immutable version pin/retired-version read contract; P7-KPI-002 still owns persisted snapshot/backfill retention.

## API/SQL example

The trusted report service will call the explicit SQL boundary (not an LLM):

```sql
select *
from private.calculate_kpi(
  :tenant_id,
  'FIRST_RESPONSE_SLA_RATE',
  :period_from,
  :period_to,
  :department_id,
  null
);
```

The result includes `definition_version`, `numerator`, `denominator`,
`pending`, `excluded`, `value`, `timezone` and
`source = 'APPROVED_SQL_DEFINITION'`. No production API/dashboard was added
in this task; those consumers are gated by P7-KPI-002 and P7-RPT-001.

## Rollback procedure

1. Stop publishing the affected report metric at the report boundary.
2. Pin the trusted SQL call to the previous immutable definition version with
   `p_definition_version`; do not edit an approved formula in place.
3. If a bad version is active, retire it in the same transaction and approve the
   prior version or a corrected new version with approval metadata.
4. Re-run the SQL reconciliation contract and release manifest before serving
   the metric again. P7-KPI-002 must preserve the definition version on every
   persisted snapshot before historical backfill is enabled.

## Known limitations / next executable work

- OD-005 production business-calendar and first-response policy values still
  require tenant configuration/approval; the checked-in fixture uses Bangkok
  and snapshot pause seconds.
- KPI aggregation jobs, immutable snapshots, watermark/late-data correction
  are `P7-KPI-002`.
- KPI API/dashboard/export/drill-down UI is `P7-RPT-001`.
- `P6-KB-001` remains BLOCKED by `P4-QA-001`; `P6-QA-001` remains BLOCKED by
  that dependency. P7-GATE and P8/P9 are still open.
- No Supabase, LINE, Vercel or OpenRouter production credentials were used or
  stored during this task.
