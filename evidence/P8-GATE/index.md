# Evidence — P8-GATE

Status: **BLOCKED — hardening evidence is incomplete because required external targets and approvals are unavailable** (2026-08-12)

P8 is a non-blocking post-production hardening phase under `SPEC-MVP-001`, but its exit gate is not marked passed while required hardening tasks remain TODO/BLOCKED. Local correctness evidence is preserved; unavailable staging, provider and approval state is not converted into a green gate.

## Traceability

- Requirement IDs: `RF-13`, `RF-15`, `RF-16`, `RF-17`, `RF-18`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`
- Rules: `SPEC-MVP-001`, `TEST-MVP-001`
- Gate: `P8-GATE`
- Current RC: `citychatbot-rc-2026-08-11-fb955df9-a56c5a37`

## Gate inputs

| Input | Status | Evidence/blocker |
|---|---|---|
| L1 unit correctness | PASS | `51/51` Vitest files, `339/339` tests |
| L0/L2–L4 local pyramid | PASS | `193/193` Python contract/static tests; 10/10 local health smoke |
| P8-RC-001 | DONE | [RC evidence](../P8-RC-001/index.md) |
| P8-TEST-001 | DONE | [test-pyramid evidence](../P8-TEST-001/index.md) |
| P8-RAG-001 | BLOCKED/TODO | Requires `P4-QA-001` locked certification and independent approval |
| P8-E2E-001 | BLOCKED | [E2E evidence](../P8-E2E-001/index.md); 16/16 local checks, seven external dependencies unavailable |
| P8-SEC-001 | BLOCKED/TODO | Requires `P0-SEC-001` threat/privacy baseline and independent review |
| P8-UX-001 | BLOCKED/TODO | Requires `P6-QA-001` canonical page/state certification |
| P8-RES-001 | BLOCKED/TODO | Requires production-like staging plus `P7-DR-001` and `P7-PERF-001` |
| P8-UAT-001 / P8-GO-001 | BLOCKED/TODO | Downstream of RAG, E2E, UX and production-like rehearsal |

## Verification commands and actual results

| Command | Result |
|---|---|
| `pnpm test:all` | PASS — 51 Vitest files / 339 tests; Python suite `193/193`; lint/typecheck/package typecheck/secret scan/SBOM/build/release manifest verify |
| `pnpm release:rc:verify` | PASS — current RC and pinned inputs verified |
| `pnpm test:pyramid --base-url http://127.0.0.1:3226 --repeats 10 --regression-status PASS --unit-tests 339 --static-tests 193` | PASS locally — 10/10 smoke, marker count 0; staging L5 remains `NOT_AVAILABLE` |
| `pnpm e2e:cert -- --base-url http://127.0.0.1:3226` | BLOCKED as designed — local 16/16, seven external dependencies `NOT_AVAILABLE` |
| `python scripts/release_candidate.py --verify artifacts/release-candidate.json --require-staging` | Expected fail-closed — staging status `NOT_AVAILABLE` |

## Gate decision

- Local unit and artifact safety: **PASS**.
- Hardening completion: **BLOCKED**, not waived.
- Production authorization: independent of P8; `P9-DEP-001` remains BLOCKED by the missing verified Vercel deployment target/configuration.
- Project completion: **NOT CLAIMED**; P8/P9 tasks and gates remain open.

## Unblock and rollback

Unblock the listed prerequisites through authorized content/security/municipal/provider owners, configure a verified staging target, rerun the affected certification tasks, and create new immutable RC/evidence when inputs change. No production mutation occurred in this gate attempt, so there is nothing to roll back. Keep traffic disabled and retain this blocked evidence for traceability.

## Known limitations

- No external credentials, browser session, production database, LINE channel, AI provider route or staging deployment was used to manufacture a pass.
- P8 hardening failure/blocker does not revoke the separate MVP unit-test authorization, but it prevents this hardening gate from being reported as complete.

