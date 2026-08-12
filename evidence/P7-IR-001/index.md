# Evidence — P7-IR-001

สถานะ: **DONE** (2026-08-11)

งานนี้ถูก auto-approved ภายใต้ `SPEC-MVP-001` หลัง L1 unit test ของ scope ผ่าน 100% ตามกฎใน `fullspec.md` และ `plan.md` การอนุมัตินี้ไม่อ้างว่า production credential, durable provider wiring, game day จริง หรือ P7/P8/P9 gate อื่นผ่านแล้ว

## Traceability

- Requirement IDs: `RF-08`, `RF-13`, `RF-15`, `RF-18`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`
- Security baseline: `SEC-BASE-001`
- MVP progression rule: `SPEC-MVP-001`
- Full specification anchors: §5.6 Incident severity, §19.2 Metrics/alerts, §19.4 Cost/usage, §20.1 L1 unit gate
- Plan task: `P7-IR-001`; evidence path: `evidence/P7-IR-001/index.md`

## Delivered scope

- Deterministic severity model `S0`–`S3` and six required incident playbooks: tenant isolation breach, wrong answer, secret leak, LINE/provider outage, queue backlog and cost spike.
- Explicit roles, commander/escalation rules, safe status communication and lifecycle `DECLARED → CONTAINING → RECOVERING → RESOLVED/ACCEPTED`.
- Narrowly scoped feature/model/prompt/index/tenant/global kill switches with role and tenant checks; global activation is restricted to SRE/SECURITY.
- Evidence preservation stores a SHA-256 digest and redacted artifact reference only; unsafe secret, PII and prompt-like content is rejected.
- Append-only hash-linked incident audit trail, idempotent declaration/status/kill-switch operations and tenant isolation tests.
- Deterministic per-tenant budget guard for LINE API, AI tokens, storage egress, active documents, staff seats and complaint tickets: warning at 70%, restrict non-critical AI at 90%, safe handoff at 100%; core complaint flow remains allowed.
- Postmortem template, rollback/recovery instructions and six synthetic tabletop cases covering detect, contain and recover.
- Explicit admin API and A-97 audit/operations panel with loading, empty, error, offline, permission and expired-session handling, responsive layout and keyboard-visible focus states.

## Files changed

- `packages/incident-ops/package.json`
- `packages/incident-ops/tsconfig.json`
- `packages/incident-ops/src/incident-ops.ts`
- `packages/incident-ops/src/incident-ops.test.ts`
- `apps/web/package.json`
- `apps/web/app/api/v1/admin/incident-operations/repository.ts`
- `apps/web/app/api/v1/admin/incident-operations/route.ts`
- `apps/web/app/admin/audit/page.tsx`
- `apps/web/app/admin/audit/AuditConsole.tsx`
- `apps/web/app/admin/audit/IncidentOperationsPanel.tsx`
- `apps/web/app/admin/audit/incident-ops.css`
- `scripts/test_incident_ops_contract.py`
- `docs/operations/p7-ir-001.md`
- `package.json`, `pnpm-lock.yaml`, `plan.md`, `evidence/progress/2026-08-11.md`

## Verification commands and actual results

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/incident-ops/src/incident-ops.test.ts --pool=threads --maxWorkers=1` | PASS — 8/8 |
| `pnpm exec tsc -p packages/incident-ops/tsconfig.json --noEmit` | PASS |
| `pnpm exec tsc -p apps/web/tsconfig.json --noEmit` | PASS |
| `pnpm --filter @citychatbot/web lint` | PASS |
| `python -m unittest scripts.test_incident_ops_contract -v` | PASS — 3/3 |
| `pnpm --filter @citychatbot/web build` | PASS — incident route included; 37 static pages |
| `pnpm test:all` | PASS — 51 Vitest files / 339 tests; 182/182 static tests; lint, typecheck, package typecheck, secret scan and production build passed |
| `pnpm security:sbom` | PASS — 95 components; SHA-256 `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest` | PASS — SHA-256 `439e196f0ad8c24a4bffd9f4a5da0518792419188944b8c09f265507e5c40c34` |
| `pnpm release:verify` | PASS — manifest digest verified |

## Artifact smoke and API evidence

Against the local production artifact on `127.0.0.1:3224` using the deterministic local/test fixture:

- Admin GET: HTTP 200; `playbooks=6`, `incidents=1`, `switches=1`, `budgets=2`, `tabletop=6`, `open=1`.
- Executive GET: HTTP 200; tenant-safe read projection returned.
- STAFF GET: HTTP 403; unknown query parameter: HTTP 400.
- Admin `ACTIVATE_KILL_SWITCH` with matching header/body idempotency key: HTTP 200, `ACTIVE`, `FEATURE`; repeating the same key returned the same operation; changed input with the same key returned HTTP 409 `IDEMPOTENCY_CONFLICT`.
- Admin `PUBLISH_STATUS`: HTTP 200, `INTERNAL`; executive POST: HTTP 403.
- `/admin/audit?role=EXECUTIVE`: HTTP 200 and rendered `INCIDENT RESPONSE / COST CONTROL`, `Budget guard`, `Incident playbooks` and `Tabletop` markers.

Production-mode fail-closed smoke was rerun with `CITYCHATBOT_ENV=production` set before `next start` on an isolated local port. `GET /api/v1/admin/incident-operations?...` returned HTTP 503 with `CONFIGURATION_UNAVAILABLE` and the message that a trusted server session and durable incident store are required. The earlier attempt with incorrect environment quoting returned 200 and is intentionally **not** used as evidence.

Representative request (synthetic IDs only; no credential or real PII):

```http
POST /api/v1/admin/incident-operations
X-Idempotency-Key: ir-demo-001
Content-Type: application/json

{"action":"ACTIVATE_KILL_SWITCH","tenantId":"00000000-0000-4000-8000-000000000001","role":"TENANT_ADMIN","accountId":"local-admin","incidentId":"incident-local-line-outage","scope":"FEATURE","target":"noncritical-ai","reason":"contain provider outage"}
```

Expected local/test response shape:

```json
{"data":{"killSwitch":{"status":"ACTIVE","scope":"FEATURE","target":"noncritical-ai"}}}
```

## Acceptance criteria

- Severity, owner, commander, escalation, communication and six incident playbooks: **PASS**.
- Tabletop coverage of at least five incidents: **PASS** — 6/6 synthetic cases detect/contain/recover.
- Kill switch is narrowest-scoped and authorization/tenant checked: **PASS**.
- Evidence preservation is immutable by digest and does not retain raw secret/PII/prompt content: **PASS**.
- Status publication and privileged mutations are auditable and idempotent: **PASS**.
- Cost thresholds and core-complaint protection: **PASS** — 70/90/100 evaluations covered by unit tests.
- Tenant isolation and unauthorized role behavior: **PASS**.
- Build, L1 unit, static, lint, typecheck, secret scan, artifact smoke and release verification: **PASS**.

## Rollback procedure

1. Disable the affected feature/provider/model/index/tenant switch at the narrowest scope; use global scope only through SRE/SECURITY emergency authorization.
2. Force non-critical AI to safe handoff while keeping the core complaint path available; pause affected jobs/consumers if queue containment is required.
3. Restore the last-known-good application/config/prompt/model/index artifact and keep the incident evidence digest and audit chain.
4. Re-run the relevant deterministic tests/tabletop and publish a resolved status only after recovery checks pass.
5. If the release must be reverted, redeploy the previous verified artifact; database changes use a forward fix or approved rollback procedure and never direct production edits.

## Known limitations and blockers

- The repository has no git metadata at the workspace root, so no commit/push claim is made.
- The checked API uses a deterministic local/test fixture. Durable production incident storage, trusted server session, LINE/provider wiring, secret rotation and real on-call integrations require the production target/configuration and remain unclaimed; production mode correctly fails closed with HTTP 503 when absent.
- Game day with real participants, production-like staging, restore rehearsal, load/soak and privacy lifecycle are separate hardening work.
- `P6-KB-001`, `P6-QA-001` and `P7-AIRPT-001` remain blocked by `P4-QA-001`; `P7-DR-001`/`P7-PERF-001` require production-like staging; `P7-PRIV-001` requires `P0-SEC-001`.
- `P7-GATE`, all P8 tasks/gates and P9 deployment/hypercare tasks remain open. This evidence does not declare the project complete.
