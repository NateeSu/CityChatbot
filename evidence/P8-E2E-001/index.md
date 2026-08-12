# Evidence — P8-E2E-001

Status: **BLOCKED — local RC journey checks complete; external certified journeys unavailable** (2026-08-12)

The implementation and local checks are complete, but the task exit requires every critical business journey to pass on a verified RC. That cannot be honestly marked complete without a verified LINE/LIFF channel, durable Supabase/storage/index target, locked AI/RAG evaluator and staging target. The task is therefore BLOCKED under the external-configuration rule; no local synthetic result is promoted to production evidence.

## Traceability

- Requirement IDs: `RF-01`, `RF-03`, `RF-04`, `RF-05`, `RF-06`, `RF-07`, `RF-08`, `RF-09`, `RF-10`, `RF-11`, `RF-12`, `RF-16`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`
- Rules: `SPEC-MVP-001`, `TEST-MVP-001`
- Task: `P8-E2E-001`; prerequisite `P8-RC-001` is DONE.
- Pinned RC: `citychatbot-rc-2026-08-11-fb955df9-a56c5a37`
- RC digest: `7706868aa2f8022f17032578c95b280a8a4922bcc4a5640b8e5e740f01033873`
- E2E report digest: `bd351f488506538e69cfa97ef0863c4787e45c8c44ad071a80e76f63a376606e`

## Delivered

- `scripts/e2e_certification.py`: RC verification, local route/journey checks, idempotent complaint intake, source reads, KPI/reconciliation read, tenant-boundary negative checks, explicit external dependency classification and immutable report output.
- `scripts/test_e2e_certification.py`: canonical digest and immutable report tests.
- `package.json`: `e2e:cert` command; the CLI accepts direct and pnpm-wrapped arguments.
- `artifacts/e2e-certification.json`: immutable report for the RC above.
- `plan.md`: task moved to `IN_PROGRESS`, then BLOCKED with the exact external dependency.

## Local RC results

Command:

```text
pnpm e2e:cert -- --base-url http://127.0.0.1:3226
```

The command wrote the report and returned the expected non-zero blocked status because seven external dependencies were `NOT_AVAILABLE`.

| Check | Result |
|---|---|
| RC verification | PASS — RC digest and all pinned inputs verified |
| HTML surfaces `/`, `/liff`, `/liff/complaints/new`, `/admin`, `/admin/complaints`, `/admin/reports` | PASS — all returned HTTP 200 |
| Synthetic complaint create with quarantined attachment + location | PASS |
| Complaint replay/idempotency boundary | PASS |
| Citizen complaint tracking and staff inbox boundary | PASS |
| Approved citizen news/services reads | PASS |
| KPI report/reconciliation read | PASS |
| Wrong-tenant and wrong-account denial checks | PASS — all expected HTTP 404 |
| Local checks | `16/16` passed; `0` failed |
| Production traffic/data | Disabled; no production data touched |

Example safe API observation from the local target: `GET /api/health` returned HTTP `200` with `status=ok`, `service=web`, `environment=local`. The report stores statuses and safe metadata only, not response bodies, PII or credentials.

## External blocker

The report records these seven dependencies as `NOT_AVAILABLE`, not PASS:

- `J01-LINE`: verified LINE OA webhook/menu/push target and credential.
- `J03-AI`: locked AI/RAG certification target, provider route and citation evaluator.
- `J04-SUPPORT`: external LINE push and durable support-ticket integration.
- `J05-ROUTING`: certified routing feedback target and independent evaluator.
- `J06-KNOWLEDGE`: durable upload/quarantine/index/rollback target.
- `J07-NEWS`: certified external news delivery and audit target.
- `J08-STAGING`: verified staging deployment target for full business journeys.

These are the only reason the critical journey exit is blocked; local failure count is zero. The blocker requires provider configuration, authorized external testing and/or business certification, not a code workaround.

## Verification commands and actual results

| Command | Result |
|---|---|
| `python -m unittest scripts.test_e2e_certification -v` | PASS — `3/3` |
| `pnpm test:all` | PASS — 51 Vitest files / 339 tests; Python contract/static suite `193/193`; lint, typechecks, secret scan, SBOM, build and release manifest verify |
| `pnpm release:rc:verify` | PASS — RC `citychatbot-rc-2026-08-11-fb955df9-a56c5a37` |
| `pnpm test:pyramid --base-url http://127.0.0.1:3226 --repeats 10 --regression-status PASS --unit-tests 339 --static-tests 193` | PASS — 10/10 synthetic smoke, marker count 0; report pinned to the same RC |
| `pnpm e2e:cert -- --base-url http://127.0.0.1:3226` | BLOCKED as designed — local `16/16`, external `7 NOT_AVAILABLE` |
| `python scripts/release_candidate.py --verify artifacts/release-candidate.json --require-staging` | Expected fail-closed — `staging artifact is not verified: NOT_AVAILABLE` |

## Acceptance status

- Local route and API checks on the RC: **PASS**.
- Tenant/department/citizen negative checks: **PASS**.
- Critical business journeys through real LINE/LIFF/Admin plus external integrations: **BLOCKED** — verified external targets unavailable.
- Severity 1–2 defect count from local run: `0`; this does not replace external certification.
- Production deployment/citizen traffic during this certification run: **NOT CLAIMED**. Subsequent P9 foundation deployment is recorded separately in `evidence/P9-DEP-001/index.md`; citizen/provider traffic remains disabled.

## Unblock procedure

1. Configure and verify the LINE OA webhook/channel/menu, LIFF app URL and authorized test account through the provider consoles; keep credentials in the provider secret store.
2. Configure the Supabase durable database/storage, quarantine scanner/index worker and audit target for the approved test tenant.
3. Configure the locked AI/provider route and independent RAG/citation evaluator; run the certified cases without using an LLM judge as the sole oracle.
4. Provide a verified staging deployment and test cohort. Rerun `pnpm e2e:cert -- --base-url <verified-target>` and attach video/network/audit evidence for every critical journey.
5. If all journeys pass, create a new immutable RC/report pair; never mutate this blocked report.

## Rollback procedure

No production mutation occurred during this certification run. The later P9 foundation deployment did not run migrations or enable citizen traffic. Keep production traffic disabled for this certification. If a future external run creates partial data, use the provider-approved test-tenant cleanup and preserve audit evidence; discard the failed RC/report pair and promote only a newly verified immutable artifact.

## Known limitations

- This evidence is pinned to the prior RC `citychatbot-rc-2026-08-11-fb955df9-a56c5a37`; a new immutable RC was generated after the commit-provenance test fix. Rerun against a verified external target before claiming the blocked journeys complete.
- Browser/device video, real LINE push, durable storage/index operations, locked AI/RAG certification and staging E2E were not available in this workspace.
- Local server data is synthetic and in-memory; it is not an authoritative production source.
- `P8-E2E-001` remains BLOCKED until the listed external dependencies are available; `P8-UAT-001` and `P8-GO-001` remain downstream blocked.
