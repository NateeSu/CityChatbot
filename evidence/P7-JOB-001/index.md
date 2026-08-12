# P7-JOB-001 Evidence

Status: **DONE (2026-08-11, scoped MVP Fast-Track auto-approved under `SPEC-MVP-001`)**.

This task delivers the deterministic job-operations domain, explicit retry and
DLQ policy, poison quarantine, authorized replay, core-job reconciliation, cron
request authentication and the A-97 operations surface. It does not claim
production queue/provider/session wiring, P7 completion, P8/P9 certification or
project completion.

## Requirement trace

- `RF-10`: tenant/role-scoped admin job inventory, DLQ inspection and recovery console.
- `RF-13`: redacted job views, secret/payload boundary, explicit allowlists and fail-closed production behavior.
- `RF-15`: observable/recoverable background work, retry policy, DLQ, reconciliation and runbook metadata.
- `RF-17`: idempotent async boundary, lease ownership, tenant isolation and auditable replay.
- `INV-TENANT-001`: every stored job and operation is tenant-scoped; cross-tenant replay is denied.
- `INV-AUDIT-001`: enqueue, claim, retry, quarantine, reconciliation and replay produce append-only hash-linked audit events.
- `INV-CORE-001`: provider outage is isolated to retry/DLQ work; core document/news/SLA/KPI coverage is reconciled independently.
- `ARCH-ASYNC-001`: durable-work boundary is explicit; the HTTP route does not use an unawaited promise as job storage.
- `SPEC-MVP-001`: scoped L1 unit-green delivery may auto-approve this task; production credentials and later hardening gates remain separate.

## Delivered files

- `packages/job-ops/package.json`
- `packages/job-ops/tsconfig.json`
- `packages/job-ops/src/job-ops.ts`
- `packages/job-ops/src/job-ops.test.ts`
- `apps/web/package.json`
- `apps/web/app/api/v1/admin/job-operations/repository.ts`
- `apps/web/app/api/v1/admin/job-operations/route.ts`
- `apps/web/app/admin/audit/page.tsx`
- `apps/web/app/admin/audit/AuditConsole.tsx`
- `apps/web/app/admin/audit/JobOperationsPanel.tsx`
- `apps/web/app/admin/audit/job-ops.css`
- `scripts/test_job_ops_contract.py`
- `package.json`, `pnpm-lock.yaml`, `plan.md`

## Implemented contract

`JOB_DEFINITIONS` inventories eight jobs: document processing/expiry, news
publish, support SLA scan, KPI snapshot, notification dispatch, knowledge
index and audit export. Each definition declares owner, SLO, retry backoff,
maximum attempts, poison error codes, tenant/idempotency boundary and runbook.

The repository enforces safe scalar payload references only. It supports
tenant-scoped enqueue idempotency, lease claim/heartbeat/complete, bounded
retry/backoff, provider-outage DLQ, poison-message quarantine, redacted tenant
views and append-only hash-linked audit events. Replay creates a new job and
never mutates the original payload; it requires `TENANT_ADMIN`, same tenant,
an audit reason, explicit quarantine approval where needed and a replay
idempotency key. Repeated replay input returns the same replay job; changed
input returns `IDEMPOTENCY_CONFLICT`.

Reconciliation checks the exact core set `document.expiry`, `news.publish`,
`support.sla.scan` and `kpi.snapshot`. Optional work remains visible in the
DLQ without being confused with missing core coverage. Cron authentication
uses HMAC-SHA256, a minimum secret length, bounded timestamp skew and a timing-
safe comparison.

The A-97 panel exposes inventory, SLO/retry/idempotency/runbook metadata, DLQ,
reconciliation, replay and audit-safe states. It includes loading, error,
offline, permission and expired-session recovery primitives, keyboard focus
styles, an accessible table and responsive breakpoints for narrow/mobile and
desktop widths. Raw payload references, provider secrets and PII are not
returned by the view/API.

The explicit API boundary is:

```text
GET  /api/v1/admin/job-operations?tenantId=...&role=TENANT_ADMIN|EXECUTIVE&accountId=...
POST /api/v1/admin/job-operations?tenantId=...&role=TENANT_ADMIN&accountId=...
     body: { jobId, reason, idempotencyKey, quarantineApproved? }
```

Query keys are allowlisted. POST requires an `idempotency-key` header equal to
the body key. Local/test uses synthetic data; other environments return
`CONFIGURATION_UNAVAILABLE` until trusted session, durable job store and cron
secret wiring exist.

## Commands and actual results

Targeted verification:

- `pnpm exec vitest run packages/job-ops/src/job-ops.test.ts --pool=threads --maxWorkers=1` — **PASS**, 9/9.
- `pnpm exec tsc -p packages/job-ops/tsconfig.json --noEmit` — **PASS**.
- `pnpm exec tsc -p apps/web/tsconfig.json --noEmit` — **PASS**.
- `pnpm --filter @citychatbot/web lint` — **PASS**.
- `python -m unittest scripts.test_job_ops_contract scripts.test_slo_contract -v` — **PASS**, 6/6.
- `pnpm --filter @citychatbot/web build` — **PASS**; route inventory includes the job-operations API and A-97.

Composite regression:

- `pnpm test:all` — **PASS**, 50 Vitest files / 331 tests, 179/179 static tests, lint, all package typechecks, web typecheck, `SECRET_SCAN_CLEAN` and production build.
- `pnpm security:sbom` — **PASS**, 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`.
- `pnpm release:manifest` — **PASS**, 5 files, digest `f79b27d0df4ffa6f3827bb8d779c6333499eff455bb6a80bcb7a207575a9edcb`.
- `pnpm release:verify` — **PASS**, the same verified digest.

Artifact smoke on local `next start` port 3224 after the final build:

- Tenant admin GET — HTTP 200; 8 definitions, 5 jobs, 1 DLQ, core reconciliation `MATCH`, 1 optional provider-outage job `DEAD`, 0 core missing jobs.
- Executive GET — HTTP 200; same tenant-safe projection and `MATCH` reconciliation.
- STAFF GET — HTTP 403; unknown query key — HTTP 400.
- Authorized replay — HTTP 200, new job `QUEUED`, `replayOf` points to the DLQ job.
- Same replay request — HTTP 200 with the same replay job ID; changed input with the same key — HTTP 409 `IDEMPOTENCY_CONFLICT`.
- Missing/mismatched idempotency header — HTTP 400; executive replay — HTTP 403.
- `/admin/audit?role=EXECUTIVE` — HTTP 200; HTML contains `JOB OPERATIONS / DLQ`, `DLQ / poison quarantine` and `Reconciliation`.

## Acceptance assessment

- all background job definitions have owner/SLO/idempotency/runbook metadata: **PASS**;
- duplicate enqueue and replay are idempotent and changed input conflicts: **PASS**;
- provider outage retries with bounded backoff and ends in DLQ: **PASS**;
- poison error quarantines and replay requires explicit approval: **PASS**;
- raw payload references, provider secrets and PII are absent from job views: **PASS**;
- unauthorized, cross-tenant and non-DLQ replay is denied: **PASS**;
- document expiry/news/SLA/KPI core reconciliation is exact and independently visible from optional DLQ work: **PASS**;
- cron signature, timestamp-skew and timing-safe verification boundary: **PASS**;
- replay is audited and no direct DB edit is used by the console: **PASS**;
- A-97 responsive/accessibility/loading/error/offline/permission/expired states: **PASS**;
- production runtime configuration, durable queue and external provider wiring: **BLOCKED/POST-PRODUCTION**, not silently substituted with credentials or mock production traffic.

## Rollback procedure

1. Pause the affected consumer/cron and keep queued, retry-wait and DLQ records intact.
2. Disable the A-97 job-operations feature flag or route boundary while leaving citizen/core manual workflows available.
3. Pin the previous verified application artifact and compatible job-definition version; do not edit the original payload or DLQ directly.
4. Restore the last trusted worker checkpoint, rerun unit/static/build/smoke and verify the release-manifest digest.
5. Resume consumers only after reconciliation reports the expected core set and the owner approves replay of selected DLQ records with new idempotency keys.

## Known limitations and next work

- The checked-in repository/API fixture is deterministic in-memory local/test data. Durable production `jobs` storage, atomic `FOR UPDATE SKIP LOCKED` worker wiring, cron secret/session configuration and provider delivery remain deployment work.
- Operator notification delivery, real scheduler execution, production SLO integration and full browser/device visual/accessibility/UAT evidence remain later work.
- `P6-KB-001` and `P6-QA-001` remain blocked by `P4-QA-001`; `P7-AIRPT-001` remains blocked by that certification chain.
- `P7-DR-001`, `P7-PERF-001`, `P7-PRIV-001` and `P7-IR-001` remain open or dependency-gated. `P7-GATE`, P8 and P9 remain open; this evidence is not a project-complete declaration.
