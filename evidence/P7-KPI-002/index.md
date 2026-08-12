# P7-KPI-002 Evidence

สถานะ: **DONE (2026-08-11, scoped L1/unit and SQL snapshot gate passed)**

This evidence covers only `P7-KPI-002`. It does not claim that P7 is complete,
does not waive the blocked `P6-KB-001`/`P4-QA-001` chain, and does not claim
production scheduler/provider configuration, dashboards, UAT or canary.

## Requirement trace

- `RF-12` — KPI snapshots preserve the approved metric-definition version, raw source watermark, reconciliation result and freshness state.
- `RF-15` — aggregation runs are observable, resumable, idempotent and retain a monotonic source watermark; partial failure cannot advance the watermark.
- `RF-17` — snapshot runs, snapshots, watermarks and reconciliations are tenant-scoped, forced-RLS, and connected with composite tenant foreign keys.
- `RF-06` — snapshots are computed from the approved complaint/ticket source facts through the deterministic SQL KPI boundary.
- `INV-CORE-001` — duplicate/replay and late-data behavior is deterministic, auditable and rollbackable.
- `INV-AI-001` — no AI/provider call or model output participates in KPI calculation or reconciliation.

## Delivered files

- `packages/reports-kpi/src/snapshots.ts`
- `packages/reports-kpi/src/snapshots.test.ts`
- `packages/reports-kpi/src/index.ts`
- `packages/reports-kpi/package.json` (snapshot export)
- `supabase/migrations/20260811230000_kpi_snapshot_jobs_schema.sql`
- `supabase/tests/kpi_snapshot_schema_contract.sql`
- `scripts/test_kpi_snapshots_schema.py`
- `plan.md` and `evidence/progress/2026-08-11.md`

## Implemented contract

`KpiSnapshotRepository` stores immutable-style revisions keyed by tenant,
metric, UTC period, department and granularity. A replay of the same source
watermark/value is idempotent; changed late source data supersedes the current
revision and creates the next revision. Watermarks are monotonic and reject a
rewind. Superseded revisions can be archived only after their retention time;
current revisions are never archived by retention.

`KpiSnapshotJobRunner` uses a deterministic idempotency fingerprint, validates
tenant/granularity boundaries, persists a resumable cursor, records source
facts, reconciles every materialized snapshot against the raw deterministic
calculation, and advances the watermark only after all work completes. A
failure leaves the run `PARTIAL` and can be resumed without double materializing
or advancing the watermark.

The SQL migration mirrors those invariants with `kpi_snapshot_runs`,
`kpi_snapshots`, `kpi_snapshot_watermarks` and
`kpi_snapshot_reconciliations`; all tenant-owned tables use forced RLS and
composite tenant FKs. Snapshot writes are private trusted-server functions,
while browser clients have no mutation privilege. An append-only trigger blocks
mutation of snapshot/reconciliation history.

## Commands and actual results

Targeted checks:

- `pnpm exec vitest run packages/reports-kpi/src/kpi.test.ts packages/reports-kpi/src/snapshots.test.ts --pool=threads --maxWorkers=1` — **PASS**, 2 files / 14 tests.
- `pnpm exec tsc -p packages/reports-kpi/tsconfig.json --noEmit` — **PASS**.
- `python -m unittest scripts.test_kpi_snapshots_schema -v` — **PASS**, 3/3.
- Migration `supabase/migrations/20260811230000_kpi_snapshot_jobs_schema.sql` applied to local PostgreSQL `citychatbot-p3-db` with `ON_ERROR_STOP=1` — **PASS**.
- `supabase/tests/kpi_snapshot_schema_contract.sql` via local PostgreSQL with `ON_ERROR_STOP=1` — **PASS**; the fixture ended with `ROLLBACK`.

The SQL contract passed the following actual assertions:

- empty materialization creates revision 1 and replay returns the same revision;
- a valid late complaint creates revision 2 with the changed value;
- raw-vs-snapshot reconciliation returns `MATCH`;
- run completion records `PARTIAL` with a resumable cursor;
- a watermark advances to the newer point and an older point cannot rewind it;
- browser mutation privileges are denied, forced RLS is enabled, and composite tenant FKs exist.

Composite regression:

- `pnpm test:all` — **PASS**, 47 Vitest files / 310 tests, 170 static tests, lint, web typecheck, package typecheck, `SECRET_SCAN_CLEAN` and production build.
- `pnpm security:sbom` — **PASS**, 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`.
- `pnpm release:manifest` — **PASS**, 5 files, digest `8d75f21d9c900133f572d0afceecbc623557b5544e6105bf04ef30e0d88c6d5c`.
- `pnpm release:verify` — **PASS**, the same digest.

## Acceptance assessment

- Daily and monthly UTC period boundaries: **PASS** in `utcPeriodFor` unit coverage.
- Duplicate/replay idempotency: **PASS** in domain and SQL contract coverage.
- Out-of-order source watermark: **PASS**; monotonic no-rewind assertion passed.
- Partial failure and resume: **PASS**; cursor remains resumable and watermark advances only on complete success.
- Late-data correction: **PASS**; immutable revision supersession preserves prior history and increments revision.
- Raw-vs-snapshot exact reconciliation: **PASS**; mismatch path is explicit and mismatch is not silently accepted.
- Definition version/freshness/source watermark retention: **PASS**; stored on each run/snapshot/reconciliation.
- Tenant isolation: **PASS**; cross-tenant joins require composite tenant FKs, forced RLS is enabled, and the domain runner rejects mixed-tenant input.
- Retention: **PASS** for superseded-only archive policy; current rows are protected.
- AI computes no numeric truth: **PASS**; all truth is delegated to approved SQL.

## SQL/API example

The trusted aggregation worker calls explicit private boundaries; no wildcard
API or LLM-derived number is introduced:

```sql
select *
from private.materialize_kpi_snapshot(
  :tenant_id,
  'COMPLAINT_RECEIVED_VOLUME',
  :period_from,
  :period_to,
  :department_id,
  'DAILY',
  :source_watermark,
  :run_id,
  null,
  'late data correction',
  :retention_until
);

select *
from private.reconcile_kpi_snapshot(:snapshot_id, :run_id);
```

The worker must call `private.advance_kpi_snapshot_watermark` only after the
run is complete and every snapshot reconciliation is `MATCH`.

## Rollback procedure

1. Pause the scheduler/consumer for the affected KPI job and stop advancing its watermark.
2. Hide the affected metric/report boundary and pin the previous approved immutable definition version.
3. Keep the prior snapshot revision; if recomputation is required, rebuild from immutable source facts with a new run/idempotency key and preserve the old revision for audit.
4. Re-run the SQL reconciliation contract and require `MATCH` before promoting the rebuilt revision or watermark.
5. Restore the previous verified release manifest; resume only after the run, reconciliation and audit records are complete.

No direct production DB edit is part of rollback. Full operator replay/DLQ
console and scheduler controls are owned by `P7-JOB-001`.

## Known limitations / next executable work

- `P7-RPT-001` still owns the KPI API/dashboard/filter/drill-down/export UI and is the next dependency-complete task.
- `P7-JOB-001` still owns the full production job inventory, cron authentication, DLQ, operator replay and runbook console.
- Production Supabase/provider configuration, external credentials, tenant business approvals, visual/device UAT and canary were not performed.
- `P6-KB-001` remains **BLOCKED** by `P4-QA-001`; `P6-QA-001` remains blocked by that dependency. `P7-GATE` and P8/P9 are still open.
- No Supabase, LINE, Vercel or OpenRouter production credentials were used or stored during this task.
