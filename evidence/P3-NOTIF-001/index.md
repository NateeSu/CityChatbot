# P3-NOTIF-001 — Complaint domain events and LINE notifications

Status: DONE (MVP Fast-Track auto-approved)

## Traceability

- Requirements: `RF-04`, `RF-05`, `RF-06`, `RF-15`, `RF-16`
- Authoritative sections: `fullspec.md` §3.4, §3.6, §9.1, §14.2–§14.3, `SPEC-MVP-001`
- Prerequisites verified: `P2-LINE-003`, `P3-ADM-002`, `P3-SLA-001`

## Delivered files

- `packages/line/src/complaint-notifications.ts` — canonical complaint-event mapping, versioned Thai/English allowlisted templates, tenant/theme/deep-link configuration, opt-in/feature checks, redacted notification outbox view, idempotent enqueue and retry-preserving dispatch boundary.
- `packages/line/src/complaint-notifications.test.ts` — five unit scenarios for event/template matrix, one-event/one-message, opt-out/disabled, provider outage/retry/no duplicate and cross-tenant/invalid-payload fail-closed behavior.
- `packages/line/src/index.ts`, `packages/line/package.json` — public exports.
- `packages/complaints/src/complaint.ts` — aligned assignment and public-update outbox names with the canonical `fullspec.md` events `complaint.assigned` and `complaint.public_update_added`.
- `packages/complaints/src/sla.ts`, `packages/complaints/src/sla.test.ts` — aligned SLA event names with canonical `complaint.sla_warning` and `complaint.sla_breached`.
- `supabase/migrations/20260810040000_notification_schema.sql` — versioned template, delivery and staff inbox tables, composite tenant FKs, indexes, forced RLS and trusted delivery write boundary.
- `supabase/tests/notification_schema_contract.sql` — executable PostgreSQL table/RLS/seed/isolation assertions.
- `scripts/test_notification_schema.py` — static schema contract tests.
- `supabase/seed.sql` — synthetic Thai/English receipt templates for both tenants.
- `plan.md` — task marked DONE and next executable task recorded.

## Commands and actual results

- `pnpm exec vitest run packages/line/src/complaint-notifications.test.ts --reporter=verbose` — PASS; `5/5`.
- `pnpm exec tsc -p packages/line/tsconfig.json --noEmit` — PASS.
- `pnpm test:all` — PASS; 19 test files, `131/131` unit tests, lint, web/package typecheck, `37/37` Python static tests, secret scan and Next production build.
- `pnpm test:db` — PASS; `37/37` static schema/corpus/GUI/release tests.
- `Get-Content -Raw supabase/migrations/20260810040000_notification_schema.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` — PASS; PostgreSQL 16 migration applied.
- `Get-Content -Raw supabase/seed.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` — PASS; synthetic templates seeded.
- `Get-Content -Raw supabase/tests/notification_schema_contract.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` — PASS; RLS, FK and tenant-isolation assertions passed.
- `pnpm install --frozen-lockfile` — PASS; all 10 workspace projects up to date.
- `pnpm audit --prod --audit-level=high` — PASS; no known vulnerabilities.
- `pnpm security:sbom` — PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`.
- `pnpm release:manifest` / `pnpm release:verify` — PASS; digest `c5e466877302ab53376be0224ae27d3fb491f77cefacaa5da40a953803991b9a`.

## Notification behavior evidence

- Canonical event types are limited to `complaint.created`, `complaint.assigned`, `complaint.status_changed`, `complaint.public_update_added`, `complaint.sla_warning` and `complaint.sla_breached`; no `.v1` aliases are introduced.
- Status mapping covers receipt, assignment, waiting for citizen, resolved, closed, generic status, public update and SLA warning/breach templates.
- Private notes have no public notification event and therefore produce zero citizen delivery records.
- Replaying the same event returns the same outbox record and delivery id; a provider `503` keeps `RETRY_WAIT`, and the subsequent success updates that same record to `API_ACCEPTED`.
- Delivery views expose status/attempt/provider metadata only; recipient identity, reply token and rendered text remain inside the dispatcher boundary.
- Tenant configuration controls enablement, locale, theme version, public contact and HTTPS tracking base URL. The deep link is generated from the trusted complaint UUID and tenant config, not from event-provided arbitrary URLs.

## Acceptance criteria

- [x] One canonical business event creates at most one intended citizen delivery through idempotency.
- [x] Private action creates zero citizen notification events.
- [x] Provider outage preserves retry state; retry does not create a duplicate delivery.
- [x] Tenant, locale/theme version, public contact and deep-link inputs are allowlisted and validated.
- [x] Unknown template variables, invalid event payloads, disabled notification config and opt-out recipients fail closed.
- [x] Versioned template, delivery and staff-notification tables have tenant isolation, composite FKs, explicit RLS and no authenticated delivery insert policy.

## Rollback

1. Pause the notification consumer/sender while retaining domain outbox and delivery records.
2. Disable tenant notification flags or route the sender to the existing fail-closed provider boundary; complaint business state is not rolled back.
3. Revert template/event mapping version while preserving old delivery rows for audit and replay.
4. Re-run `pnpm test:all`, the PostgreSQL notification contract and release verification before resuming delivery.

## Known limitations / next executable work

- The current service and LINE dispatcher are deterministic in-memory adapters; production worker claim/lease integration with `domain_outbox` and `notification_deliveries` remains operational wiring.
- Real LINE credentials/provider validation were intentionally not guessed or stored; the provider boundary is covered with synthetic responses only.
- Template approval/tenant-specific content management is represented by versioned schema and unit-tested defaults; `P3-DUP-001` is the next executable plan task.
