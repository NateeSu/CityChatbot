# P3-SLA-001 — SLA calculation, escalation and business calendar

Status: DONE (MVP Fast-Track auto-approved)

## Traceability

- Requirements: `RF-03`, `RF-04`, `RF-06`, `RF-12`, `RF-15`, `RF-16`
- Authoritative sections: `fullspec.md` §8.5, §12.2, §13.5, §19.3, `SPEC-MVP-001`
- Prerequisites verified: `P3-CMP-001`, `P3-ADM-002`

## Delivered files

- `packages/complaints/src/sla.ts` — validated SLA rule/calendar domain contract, precedence selection, IANA timezone/DST-aware business seconds, snapshot creation, warning/breach evaluation, pause/resume, idempotent scan and audited historical recompute guard.
- `packages/complaints/src/sla.test.ts` — seven unit scenarios covering precedence, Bangkok weekend/holiday, DST, invalid configuration, exact 80%/100% boundaries, pause/resume, terminal status, idempotent events and historical rewrite behavior.
- `packages/complaints/src/index.ts` — exports the SLA domain contract.
- `supabase/migrations/20260810030000_sla_schema.sql` — additive business calendar/day tables, rule scope extensions, snapshot table, composite tenant FKs, constraints, indexes, RLS and trusted snapshot write boundary.
- `supabase/tests/sla_schema_contract.sql` — executable PostgreSQL table/RLS/seed/isolation assertions.
- `scripts/test_sla_schema.py` — static migration contract tests.
- `supabase/seed.sql` — synthetic Bangkok calendars and deterministic priority/default rules; legacy fixture rows are updated only when their SLA snapshot fields are absent or different.
- `package.json` — `test:db` now discovers every static schema contract under `scripts`.
- `plan.md` — task marked DONE and next executable task opened.

## Commands and actual results

- `pnpm exec vitest run packages/complaints/src/sla.test.ts --reporter=verbose` — PASS; `7/7`.
- `pnpm --filter @citychatbot/complaints exec tsc --noEmit` — PASS.
- `pnpm test:all` — PASS; 18 test files, `126/126` unit tests, lint, web/package typecheck, `33/33` Python static schema/corpus/GUI/release tests, secret scan and Next production build.
- `pnpm install --frozen-lockfile` — PASS; all 10 workspace projects up to date.
- `pnpm audit --prod --audit-level=high` — PASS; no known vulnerabilities.
- `python -m unittest scripts.test_sla_schema -v` — PASS; `5/5`.
- `python -m unittest discover -s scripts -p "test_*.py" -v` — PASS; `33/33`.
- `Get-Content -Raw supabase/migrations/20260810030000_sla_schema.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` — PASS; migration applied on PostgreSQL 16.
- `Get-Content -Raw supabase/seed.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` — PASS; synthetic calendars/rules seeded and legacy fixture fields reconciled.
- `Get-Content -Raw supabase/tests/sla_schema_contract.sql | docker exec -i citychatbot-p3-db psql -v ON_ERROR_STOP=1 -U postgres -d citychatbot` — PASS; required tables/RLS, active-rule calendar source and tenant isolation assertions passed.
- `pnpm security:sbom` — PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`.
- `pnpm release:manifest` / `pnpm release:verify` — PASS; digest `1859ac459e1ec189be77f73a388490e61f146a98acc0303559be22876062b420`.

## API/domain examples

The domain returns a snapshot containing `ruleId`, `ruleVersion`, `timezone`, `responseWarningAt`, `responseDueAt`, `resolutionWarningAt`, `resolutionDueAt`, pause policy and accumulated paused business seconds. Rule selection is deterministic:

```text
category + priority + department
→ category + priority
→ department + priority
→ tenant + priority
→ tenant default
```

Warning/breach events use the canonical event types `complaint.sla_warning` / `complaint.sla_breached` and dedupe keys `complaint.sla_warning:<snapshot>:<milestone>` or `complaint.sla_breached:<snapshot>:<milestone>`. Replaying a scan with the emitted-key set produces zero duplicate events. Historical rule changes are rejected unless an explicit audited override is supplied.

## Acceptance criteria

- [x] Versioned rule selection follows the canonical five-level precedence chain.
- [x] Complaint-time snapshots retain rule version, timezone/calendar, targets, pause policy and due timestamps.
- [x] Business calendars support weekdays, windows, special holidays, IANA timezone conversion and DST-safe arithmetic; Bangkok weekend/holiday fixtures pass exactly.
- [x] 80% warning and 100% breach boundaries are tested; scan events are idempotent.
- [x] `WAITING_FOR_CITIZEN` pause/resume shifts due dates by business time and terminal states complete the snapshot.
- [x] Historical due dates are not silently rewritten; recompute requires an explicit reason and override and returns an audit record.
- [x] New tables are tenant-owned with composite tenant FKs, forced RLS and no authenticated snapshot write policy.
- [x] Synthetic seed and PostgreSQL contract prove active rules have a calendar source and tenant A cannot read tenant B SLA data.

## Rollback

1. Pause SLA scan/escalation workers while retaining existing snapshot/outbox history.
2. Disable SLA rule/calendar management routes and restore the previous app artifact; do not delete snapshots or rewrite due timestamps.
3. Use a reviewed forward migration to retire/correct an invalid rule version; restore the prior active rule version through the audited configuration path.
4. Re-run `pnpm test:all`, the PostgreSQL SLA contract and release manifest verification before resuming scans.

## Known limitations / follow-up

- Complaint creation in the local adapter remains deterministic in-memory; production transaction wiring that selects a configured rule and persists `complaint_sla_snapshots` in the same complaint transaction is a DB/application integration follow-up.
- SLA scan delivery to assignee/head notification channels is `P3-NOTIF-001`; this task proves canonical warning/breach intent and idempotency, not provider delivery.
- Per-date `business_calendar_days.windows` overrides are stored and RLS-protected; the current pure domain adapter receives a normalized calendar and the DB-backed override reader belongs in the configuration/integration layer.
- The local PostgreSQL validation container `citychatbot-p3-db` is a temporary development fixture and is not a production credential or deployment target.
