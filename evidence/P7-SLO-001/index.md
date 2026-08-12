# P7-SLO-001 Evidence

Status: **DONE (2026-08-11, scoped MVP Fast-Track auto-approved under `SPEC-MVP-001`)**.

This task delivers the deterministic SLI/SLO registry, error-budget projection,
actionable alert boundary, synthetic probes and tenant-safe operations panel.
It does not claim production monitoring-provider wiring, P7 completion, P8/P9
certification or external approval.

## Requirement trace

- `RF-15`: structured telemetry, SLI/SLO targets, error budgets, alerts and operational runbook context.
- `RF-16`: measurable failure detection, recovery state and owner/escalation evidence.
- `RF-17`: tenant-scoped observability reads and cross-tenant fail-closed checks.
- `RF-10` / `NFR-ADMIN-001`: A-97 operations panel is role-scoped, responsive and accessible.
- `NFR-AVAIL-001`: 99.9% core monthly availability definition.
- `NFR-LINE-001`: webhook acknowledgement p95 1s and p99 2s definitions.
- `NFR-API-001`: citizen non-AI API p95 500ms definition.
- `NFR-ADMIN-001`: admin list/detail p95 1s definition.
- `NFR-RAG-001`: RAG result/fallback p95 12s definition.
- `NFR-LIFF-001`: LIFF mobile LCP p75 2.5s definition.
- `NFR-NOTIFY-001`: enqueue 5s and dispatch attempt p95 60s definitions.
- `NFR-DR-001`: RPO 15 minutes and RTO 4 hours definitions.

## Delivered files

- `packages/slo/package.json`
- `packages/slo/tsconfig.json`
- `packages/slo/src/slo.ts`
- `packages/slo/src/slo.test.ts`
- `apps/web/app/api/v1/admin/slo/repository.ts`
- `apps/web/app/api/v1/admin/slo/route.ts`
- `apps/web/app/admin/audit/page.tsx`
- `apps/web/app/admin/audit/AuditConsole.tsx`
- `apps/web/app/admin/audit/SloDashboardPanel.tsx`
- `apps/web/app/admin/audit/slo.css`
- `apps/web/package.json`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/test_slo_contract.py`
- `plan.md`

## Implemented contract

`SLO_DEFINITIONS` contains the approved fullspec target set for availability,
webhook acknowledgement, citizen/admin/RAG latency, LIFF LCP, notification
enqueue/dispatch and RPO/RTO. Every definition has an owner, severity, source,
window and runbook ID.

`evaluateSlo` filters a tenant and UTC window, uses deterministic nearest-rank
percentiles for latency targets, calculates good ratio and error-budget
consumption, and returns `HEALTHY`, `AT_RISK`, `BREACHED` or `NO_DATA`.
Missing observations stay `NO_DATA`; the evaluator never invents a healthy
value. Mixed-tenant observations and probes are rejected before projection.

`buildSloAlerts` produces one dedupe key per tenant/SLO/window and explicit
`OPEN`, `UPDATE`, `NO_DATA` or `RECOVERY` actions. Each alert carries severity,
owner, escalation, runbook URL and bounded request/correlation IDs. Synthetic
probe results carry status code/latency/failure code only; no response body,
prompt, token, provider secret or PII is accepted.

The canonical API is `GET /api/v1/admin/slo`, with an explicit query allowlist
of `tenantId`, `role`, `accountId`, `from` and `to`. Tenant admin and executive
identity checks run before projection. Local/test uses a synthetic fixture;
non-local environments fail closed with `CONFIGURATION_UNAVAILABLE` until a
trusted session and durable SLI store are configured.

The dashboard is embedded into the existing canonical A-97 operations surface
to avoid inventing a screen outside `screen-manifest.json`. It shows summary
counts, current/target values, error-budget remaining, active alerts, runbook
links, owners/escalation and probe status. It includes loading, error,
offline, permission and expired-session recovery primitives, an accessible
table caption and mobile/tablet responsive layout with only intentional table
overflow.

## Commands and actual results

Targeted verification:

- `pnpm exec vitest run packages/slo/src/slo.test.ts --pool=threads --maxWorkers=1` — **PASS**, 8/8.
- `pnpm exec tsc -p packages/slo/tsconfig.json --noEmit` — **PASS**.
- `pnpm --filter @citychatbot/web lint` — **PASS**.
- `pnpm exec tsc -p apps/web/tsconfig.json --noEmit` — **PASS**.
- `python -m unittest scripts.test_slo_contract -v` — **PASS**, 3/3.
- `pnpm --filter @citychatbot/web build` — **PASS**; route inventory includes `/api/v1/admin/slo` and A-97 remains present.

Composite regression:

- `pnpm test:all` — **PASS**, 49 Vitest files / 322 tests, 176/176 static tests, lint, web/package typechecks, `SECRET_SCAN_CLEAN` and production build.
- `pnpm security:sbom` — **PASS**, 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`.
- `pnpm release:manifest` — **PASS**, 5 files, digest `17a6f34524e86379f704f2a3586ab02116eb311e0c17b0a8c29f9878abaa1f6a`.
- `pnpm release:verify` — **PASS**, the same digest.

Artifact smoke on local `next start` port 3224 after the final build:

- tenant-admin SLO API — HTTP 200, 11 SLO evaluations, 11 healthy, 0 active alerts, 0 failed probes, source `SYNTHETIC_FIXTURE`;
- executive SLO API — HTTP 200, 11 evaluations;
- STAFF — HTTP 403; unknown query key — HTTP 400; reversed window — HTTP 400;
- `/admin/audit?role=EXECUTIVE` — HTTP 200 and rendered HTML contained `SLO / ERROR BUDGET` and `Actionable alerts`.

Production-mode artifact smoke on port 3225 with `CITYCHATBOT_ENV=production`:

- `/api/v1/admin/slo?...` — HTTP 503, error code `CONFIGURATION_UNAVAILABLE`; no synthetic dashboard was served.

## Acceptance assessment

- every fullspec SLO target has a versioned deterministic definition: **PASS**;
- error-budget calculation and no-data safe state: **PASS**;
- injected breach, dedupe/update and recovery behavior: **PASS**;
- alert has severity, owner, dedupe, escalation and runbook context: **PASS**;
- tenant isolation and no raw response/PII boundary: **PASS**;
- synthetic probe status and recovery-visible dashboard: **PASS**;
- tenant/admin role permission and production fail-closed behavior: **PASS**;
- A-97 loading/error/offline/permission/expired/accessibility/responsive surface: **PASS**.

## Rollback procedure

1. Hide the SLO panel and disable the `/api/v1/admin/slo` feature boundary;
   leave complaint, citizen and core admin operations available.
2. Stop the SLI scheduler/consumer or alert projection worker from advancing
   the affected definition/window.
3. Pin the previous verified SLO definition/config artifact and retain prior
   alert history; do not edit telemetry or alert history directly.
4. Recompute the affected window from trusted immutable telemetry, rerun unit,
   static and smoke checks, then restore the verified release manifest.
5. Resume alert evaluation only after the owner confirms the runbook and
   dedupe/recovery boundary is healthy.

## Known limitations and next work

- The checked-in local SLI observations and probes are synthetic only. Durable
  production metrics ingestion, alert delivery, on-call integration and
  provider-specific dashboards require deployment configuration and are not
  claimed as complete.
- The A-97 panel exposes alert actions and runbook links; operator DLQ/replay,
  durable job inventory and scheduler controls remain `P7-JOB-001`.
- Load/soak, restore rehearsal, privacy lifecycle and incident game-day work
  remain later P7/P8 hardening tasks.
- `P6-KB-001`, `P6-QA-001` and `P7-AIRPT-001` remain blocked by the locked
  `P4-QA-001` certification chain. P7-GATE and P8/P9 remain open; this evidence
  is not a project-complete declaration.
