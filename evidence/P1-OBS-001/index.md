# Evidence — P1-OBS-001

สถานะ: `DONE — AUTO_APPROVED_FOR_MVP`

วันที่: 2026-08-10

Task: ทำ structured logging, audit, trace และ transactional outbox/job skeleton

## Requirement IDs

- `RF-10` STAFF/OPS — audited operational actions และ job replay boundary
- `RF-13` SECURITY — redaction, tenant-safe telemetry และ no secret leakage
- `RF-15` OPS — correlation, outbox, retry, lease, DLQ และ audit operations
- `RF-17` ARCH — request → outbox → job correlation contract
- `INV-TENANT-001`, `INV-AUDIT-001`
- `SPEC-MVP-001`, `TEST-MVP-001` — L1 Unit Test Green เป็นเงื่อนไข auto-approval ของ MVP

## Files changed

- `packages/telemetry/package.json`
- `packages/telemetry/tsconfig.json`
- `packages/telemetry/README.md`
- `packages/telemetry/src/telemetry.ts`
- `packages/telemetry/src/telemetry.test.ts`
- `package.json`
- `pnpm-lock.yaml`
- `plan.md`

## Delivered behavior

- Correlation context creates/validates `requestId`, `correlationId` and
  optional `causationId`. Structured records include timestamp, severity,
  service/module, environment, pseudonymous tenant hash, actor type,
  route/job, latency, status and canonical error fields.
- Tenant hashes use server-side HMAC; raw tenant ID, prompt/document content,
  token, secret, phone and other sensitive values are not emitted. Error
  details are bounded and redacted before logging.
- Domain events require canonical event type/version, tenant and aggregate
  IDs, correlation, actor and idempotency key. Sensitive event payload fields
  are rejected; consumers can query scoped records by ID instead.
- The outbox adapter deduplicates by tenant/idempotency key, supports bounded
  claims with a lease, attempt count, publish/failure state and retry time.
- The job adapter supports `QUEUED|RUNNING|SUCCEEDED|RETRY_WAIT|DEAD|CANCELLED`,
  priority claim, lease/heartbeat, expired-lease recovery, exponential retry
  schedule with jitter, redacted errors, DLQ and tenant-scoped admin view.
  Replay requires authorization and reason and emits an append-only audit
  record; payload is never returned in the admin view.
- Audit records redact before/after data and use an integrity hash chain. The
  in-memory audit adapter has no update/delete operation and can verify its
  chain after append.

## Commands and actual results

| Command / check | Result |
|---|---|
| `pnpm exec vitest run packages/telemetry/src/telemetry.test.ts` | **PASS** — 1 file, 10 tests |
| `pnpm exec tsc -p packages/telemetry/tsconfig.json --noEmit` | **PASS** |
| `pnpm install --frozen-lockfile` | **PASS** — 7 workspace projects |
| `pnpm test:all` | **PASS** — lint, web typecheck, package typechecks, Vitest 45/45, DB/RLS 10/10, secret scan and Next production build |
| `pnpm audit --prod --audit-level=high` | **PASS** — no known vulnerabilities found |
| `pnpm security:scan` | **PASS** — `SECRET_SCAN_CLEAN` |
| `pnpm security:sbom` | **PASS** — deterministic CycloneDX artifact, 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | **PASS** — 21 corpus/DB/RLS/GUI tests |

All telemetry tests use synthetic IDs, deterministic timestamps where timing
matters and in-memory adapters. No production log sink, tenant data or
provider credential was contacted.

## Acceptance criteria

- [x] Request/correlation/causation IDs are present and propagated through
  event/outbox/job records.
- [x] Structured logs contain only a pseudonymous tenant identifier and redact
  secret/token/PII/error detail by default.
- [x] Event payloads reject raw PII and use ID-only references.
- [x] Outbox idempotency, bounded claim lease, publish and retry behavior are
  covered by tests.
- [x] Job claim is lease-based; heartbeat, lease recovery, retry backoff,
  non-retryable/dead behavior and redacted DLQ view are covered by tests.
- [x] Authorized job replay requires a reason and creates an audit record.
- [x] Audit append-only behavior, tenant filtering, redaction and integrity
  chain verification are covered by tests.
- [x] L1 unit suite is green, so this task is auto-approved under
  `SPEC-MVP-001`.

## Rollback procedure

Pause outbox dispatch and job consumers, disable replay actions, and keep
business writes fail-safe by leaving the durable outbox record in place. Revert
the telemetry adapter or redaction policy to the last reviewed revision, rotate
any affected pseudonymization/log sink key, then replay only authorized jobs
from the durable checkpoint with a new audit record. Re-run unit, secret-scan
and DB contract suites before resuming consumers.

## Known limitations / follow-up

- This is a provider-neutral, deterministic in-memory adapter. Production must
  connect it to Supabase/PostgreSQL transactional outbox and `jobs` tables,
  `FOR UPDATE SKIP LOCKED`, a durable lease/idempotency store and a managed
  structured log/metrics/trace sink.
- Durable dashboards, alert runbooks, worker deployment and cross-process
  replay authorization are covered by later operational/CICD tasks. The core
  schema already contains outbox/jobs/audit primitives validated by P1 DB/RLS
  contracts, but application wiring is not claimed here.
- Tenant pseudonymization requires a managed server secret and coordinated key
  rotation; the package never accepts a client/browser secret.

ตาม `SPEC-MVP-001` และ `plan.md` ฉบับปัจจุบัน L1 unit suite ผ่านครบและมี
evidence จริง จึง auto-approve `P1-OBS-001` สำหรับ MVP โดยไม่อ้างว่า
production worker, collector หรือ dashboard infrastructure เสร็จแล้ว
