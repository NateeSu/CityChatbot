# Evidence — P8-TEST-001

Status: **DONE — RC-pinned local test-pyramid baseline** (2026-08-12)

This task is auto-approved under `SPEC-MVP-001` after the required local correctness suite, static contract suite, deterministic marker audit, repeated synthetic smoke and RC verification passed. This evidence does not claim staging E2E, coverage configuration, municipal UAT or production certification; those remain explicit post-production/external work.

## Traceability

- Requirement IDs: `RF-15`, `RF-16`, `RF-17`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`
- Rules: `SPEC-MVP-001`, `TEST-MVP-001`
- Task: `P8-TEST-001`; prerequisite `P8-RC-001` is DONE.
- Pinned RC: `citychatbot-rc-2026-08-11-fb955df9-a56c5a37`
- RC digest: `7706868aa2f8022f17032578c95b280a8a4922bcc4a5640b8e5e740f01033873`
- Report digest: `b7b92afbc47b8bc56ed7a9ac1a4461fe1b771cd9253616f15f76c97dd67a4b8f`

## Delivered

- `scripts/test_pyramid_audit.py`: deterministic L0–L6 inventory, focused/skip marker scan, RC verification, repeated health smoke, retry-disabled regression metadata, quarantine/flaky register and fail-closed staging status.
- `scripts/test_test_pyramid_audit.py`: audit behavior tests covering canonical digest, clean inventory, forbidden marker detection and repository test discovery.
- `package.json`: `test:pyramid` command and repeatable `test:all` ordering.
- `artifacts/test-pyramid-report.json`: immutable report pinned to the RC above.
- `artifacts/archive/`: previous generated report retained as recoverable history.

## Test-pyramid results

| Layer/check | Actual result |
|---|---|
| L0 static inventory | PASS — 95 test files discovered; focused/skipped/quarantined markers `0` |
| L1 unit | PASS — 51 Vitest files, `339/339` tests |
| L2 database contract | PASS — included in Python contract suite |
| L3 integration/API/UI contract | PASS — included in Python contract suite |
| L4 API/UI smoke | PASS — `GET /api/health`, `10/10` repeated local runs |
| L5 staging E2E | `NOT_AVAILABLE` — no connected staging deployment target; traffic remains disabled |
| L6 certification | `POST_PRODUCTION` — locked certification is not an MVP release gate |
| Required-test marker audit | PASS — retry disabled, no `.only`, `.skip`, focused or hidden required test |
| Flaky/quarantine audit | PASS — flaky required tests `0`, quarantine register empty |
| Coverage | `NOT_CONFIGURED` — post-production hardening item, not reported as green |

The repeatable smoke response was HTTP `200` with `{"status":"ok","service":"web","environment":"local"}` on all ten runs. Synthetic local data was not promoted to production.

## Verification commands and actual results

| Command | Result |
|---|---|
| `python -m unittest scripts.test_release_candidate scripts.test_test_pyramid_audit scripts.test_e2e_certification -v` | PASS — `11/11` |
| `python -m unittest discover -s scripts -p "test_*.py" -v` | PASS — `193/193` |
| `pnpm test:all` | PASS — lint, web/package typecheck, package typecheck, Vitest `51/51` files and `339/339` tests, secret scan, SBOM, Next production build, release manifest write/verify and Python contract suite `193/193` |
| `pnpm release:rc:verify` | PASS — RC digest, artifact, source groups and referenced inputs verified |
| `pnpm test:pyramid --base-url http://127.0.0.1:3226 --repeats 10 --regression-status PASS --unit-tests 339 --static-tests 193` | PASS — report written, `10/10` smoke, marker count `0` |
| `python scripts/release_candidate.py --verify artifacts/release-candidate.json --require-staging` | Expected fail-closed — `staging artifact is not verified: NOT_AVAILABLE` |

During the first final regression, three RC unit tests correctly detected a stale `apps/web/.next/BUILD_ID` after build. The release workflow was fixed so `test:all` regenerates/verifies the release manifest after build and before RC contract tests; the complete rerun then passed.

## Acceptance status

- Required local correctness tests pass 100%: **PASS**.
- No focused/skip/hidden required tests: **PASS**.
- Flaky required test count is zero and no quarantine is present: **PASS**.
- Ten repeated synthetic smoke runs: **PASS**.
- RC-to-report identity and digest linkage: **PASS**.
- Staging E2E and coverage gates: **DEFERRED/NOT_AVAILABLE**, explicitly not converted to a green result.
- Production deployment/citizen traffic was **NOT CLAIMED** by this test-pyramid run. The later foundation deployment is recorded in `evidence/P9-DEP-001/index.md`; citizen/provider traffic remains disabled.

## Rollback procedure

1. Do not mutate the current RC or report. Archive the generated pair and create a new RC/report after any source or build change.
2. If a release workflow change is rejected, restore the prior reviewed workflow and rerun `pnpm test:all`, release verification and the pyramid audit before promotion.
3. If a later production promotion fails smoke checks, keep traffic disabled or revert to the previous verified deployment/RC; preserve the failed report for incident review.

## Known limitations

- There is no connected staging deployment, so L5 business journeys and production-like E2E cannot be certified here.
- Coverage tooling/configuration and external certification/UAT are not available in this workspace.
- The local server and test corpus are synthetic; no secret, PII, OpenRouter key, Supabase credential or LINE credential was written to the repository or evidence.
- P8 hardening tasks and P9 deployment/gates remain open; completion of this task does not mean the CityChatbot project is complete.
