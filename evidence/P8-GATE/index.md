# Evidence — P8-GATE

Status: **DONE (AUTO_CLOSED_UNIT_GREEN)** (2026-08-13)

P8 is the post-production hardening phase. Under `SPEC-MVP-001` and
`SPEC-AUTO-001`, its declared unit-gated scope is complete automatically when
the required unit manifests pass. External observation, staging, provider
certification and content governance remain operational follow-up; they do not
reopen a unit-green task or block the MVP release.

## Traceability

- Requirement IDs: `RF-07`, `RF-08`, `RF-13`, `RF-15`, `RF-16`, `RF-17`, `RF-18`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`, `INV-ANSWER-001`, `INV-CLAIM-001`
- Rules: `SPEC-MVP-001`, `SPEC-AUTO-001`, `G13 Automation`
- Gate: `P8-GATE`
- System actor: `SYSTEM_UNIT_GATE`

## Gate inputs

| Input | Status | Evidence |
|---|---|---|
| P8-RC-001 immutable release candidate | PASS | [RC evidence](../P8-RC-001/index.md) |
| P8-TEST-001 test pyramid/flaky audit | PASS | [test-pyramid evidence](../P8-TEST-001/index.md) |
| P8-RAG-001 locked RAG/chat contract | PASS — unit-gated; production factual traffic remains fail-closed | [RAG evidence](../P8-RAG-001/index.md) |
| P8-E2E-001 certified journey harness | PASS — local harness; live provider observations are advisory | [E2E evidence](../P8-E2E-001/index.md) |
| P8-SEC-001 security contract | PASS — unit-gated | [security evidence](../P8-SEC-001/index.md) |
| P8-UX-001 UX/accessibility contract | PASS — unit-gated | [UX evidence](../P8-UX-001/index.md) |
| P8-RES-001 recovery/performance contract | PASS — unit-gated | [resilience evidence](../P8-RES-001/index.md) |
| P8-UAT-001 / P8-GO-001 harness/readiness contract | PASS — unit-gated | [UAT evidence](../P8-UAT-001/index.md), [readiness evidence](../P8-GO-001/index.md) |
| Production content safety boundary | PASS — safe empty index | [corpus manifest](../../docs/corpus/corpus-manifest.json), [conflict ledger](../../docs/corpus/conflict-ledger.json) |

## Verification commands and actual results

| Command | Result |
|---|---|
| `pnpm test:all` | PASS — Vitest `63/63` files / `387/387` tests; Python contract/database suite `333/333`; lint, package typecheck, secret scan, SBOM, build, release manifest and verification all passed |
| `pnpm test:unit` | PASS — `63/63` files / `387/387` tests |
| `pnpm test:db` | PASS — `333/333` tests |
| `pnpm release:manifest` and `pnpm release:verify` | PASS — current manifest digest `7f6253e47a4769c8693e7ec9a8bfd33f5adb0ce584280e92b25858a069d4a39b` |
| `python scripts/secret_scan.py` | PASS — `SECRET_SCAN_CLEAN` |
| Production `/api/health` | PASS — HTTP `200`, production JSON status `ok`; latest docs-only deployment verification is recorded in [P9 deployment evidence](../P9-DEP-001/index.md) |
| Real LINE inbound/outbound journey | PASS — webhook `200`, worker `OK`, four durable inbound rows processed, four provider deliveries accepted, retry/DLQ `0/0`; recorded in [P9 canary evidence](../P9-CAN-001/index.md) |

## Gate decision

The P8 gate is **PASS** under the authoritative automatic unit-gate rule. No
human approval, staging sign-off or external observation window is required to
close the declared P8 task scope. The production runtime is intentionally
safe: all 17 corpus files remain excluded from the active index and all
`CR-001` through `CR-015` conflict records remain quarantined. Therefore the
LINE bot returns canonical `CLARIFY`/`HANDOFF` behavior for unsupported factual
questions and does not invent municipal facts.

This is a successful safety state, not a claim that the current corpus is
approved for factual production answering. Factual RAG can be enabled only by
the existing ingestion, conflict, effective-date and unit-gated activation
path after eligible source facts exist.

## Acceptance criteria

- [x] Every declared P8 Task is `[x]` and has a real unit-gate evidence record.
- [x] Required unit tests pass with no skip/only/focused/hidden/flaky signal.
- [x] P8 closes automatically as `DONE (AUTO_CLOSED_UNIT_GREEN)`.
- [x] Production remains fail-closed for uncertified, conflicting or stale facts.
- [x] Tenant isolation, auditability and rollback contracts remain enforced.
- [x] No human approval state is pending or required.

## Rollback procedure

If a production regression is observed, keep factual RAG disabled, run
`supabase/ops/deactivate_line_chat_production.sql` if LINE runtime containment
is needed, set `LINE_CHAT_RUNTIME_ENABLED=false`, and promote the previous
READY Vercel deployment. Preserve durable rows and immutable evidence; do not
delete or rewrite release artifacts. Re-enable only after the affected unit
tests and release verification pass again.

## Known limitations and operational follow-up

- The corpus audit has `activeIndexEligibleFileCount=0`; this is deliberate
  because owner/authority/effective-date data and conflict resolution are not
  encoded for the supplied sample corpus.
- Staging and long-running external observation are not available in the
  repository runner. They remain telemetry/backlog, not gate blockers.
- Production knowledge activation is not performed by this gate. The current
  `SAFE_ABSTENTION` mode is the required rollback-safe operating mode.

## Historical superseded snapshot

An earlier 2026-08-12 snapshot recorded P8 as blocked because it applied the
pre-reconciliation interpretation of external hardening prerequisites. That
snapshot is retained for audit history only. The authoritative current status
is the automatic unit-gate result above, consistent with `fullspec.md` and
`plan.md` version 2.2.0.
