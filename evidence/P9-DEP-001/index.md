# Evidence — P9-DEP-001

สถานะ: **IN_PROGRESS** (2026-08-12 — production configuration resumed)

## Current execution

The previously observed external blocker is being resolved through the authenticated provider sessions explicitly supplied for this task. The Vercel project and the empty GitHub repository were re-verified before any mutation; no provider secret has been written to the repository or printed to logs. Deployment remains open until the provider configuration, immutable RC deployment, smoke checks and rollback handle are all verified.

## Blocker

P9-DEP-001 มี prerequisite ด้าน code ผ่านแล้ว แต่ยังขาด production target/configuration ที่ยืนยันได้และ deployment credential/configuration ที่จำเป็น จึงยัง deploy หรือเปิด citizen traffic อย่างปลอดภัยไม่ได้

Concrete external state:

- Vercel team: `nateesu's projects` (`team_DlgaumeAT37hdSSsxmEu2BZA`)
- Vercel project: `city-chatbot` (`prj_6X89yOQgVVlbR48TCrQ6by9ELdjz`)
- Project state from connected Vercel read API: `live=false`, `latestDeployment=null`, `domains=[]`, `framework=null`.
- Deployment list: `count=0`.
- Repository state: no `.vercel/project.json`, no `vercel.json`, no Vercel CLI in PATH, and `docs/operations/release.md` explicitly says project linkage/deployment credentials are external configuration.
- `.env.example` contains empty placeholders only. No production Supabase/LINE/secret-vault session configuration is committed or inferred.

This is the exact dependency named by `plan.md`: `build artifact/production target/credentials ที่จำเป็นมีจริง`. The blocker is not a test failure and must not be bypassed with local/test mode or synthetic data.

## Traceability

- Requirement IDs: `RF-13`, `RF-15`, `RF-16`, `RF-17`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`
- Related gate: `P7-GATE` passed under `SPEC-MVP-001`.
- Task: `P9-DEP-001`; plan status remains open and blocked.

## Checks completed

| Check | Result |
|---|---|
| `pnpm test:unit` | PASS — 51 files / 339 tests |
| Latest `pnpm test:all` | PASS — 51 Vitest files / 339 tests, 193/193 static, lint/typecheck/package typecheck/secret scan/SBOM/build/release manifest verify |
| `pnpm release:rc:verify` | PASS — verified final RC `citychatbot-rc-2026-08-11-fb955df9-a56c5a37`, digest `7706868aa2f8022f17032578c95b280a8a4922bcc4a5640b8e5e740f01033873` |
| Vercel connected read: list teams/projects/get project/list deployments | PASS — account/project found, but no deployable live target or deployment exists |
| Connected Vercel deploy preflight | **NOT RUN** — connector requires a target/name/file payload; no payload was submitted and no state was mutated |
| Production-mode local fail-closed smoke | PASS — HTTP 503 `CONFIGURATION_UNAVAILABLE` when trusted server session/durable store is absent |
| Production deployment | **NOT RUN** — blocked before mutation |

## Why no deploy was attempted

The local/test artifact intentionally serves deterministic synthetic data and must not be promoted as production. The production environment requires an explicit app URL, trusted server session/durable stores, Supabase/LINE wiring, secret-vault values and Vercel project configuration. Inventing any of these would violate tenant isolation, source-of-truth and secret-handling invariants.

The OpenRouter key supplied in the conversation was not written to a file, command line, evidence, Vercel variable or log. No secret was echoed.

## Unblock request

An authorized operator must configure/confirm the `city-chatbot` Vercel project root/framework/domain and production environment variables through the trusted provider/session, then provide a verifiable deployment target. Required values must be entered in the provider secret store, not this repository. Once available, rerun `P9-DEP-001` with the verified artifact and record deployment URL, deployment ID, build result, smoke checks and rollback handle.

## Rollback procedure

No production mutation occurred, so there is nothing to roll back. After unblocking, promote only the verified release artifact; if post-deploy smoke fails, immediately disable feature flags/revert alias to the last verified deployment and preserve logs/evidence. Database migrations use forward-compatible recovery or approved rollback, never manual production edits.

## Next executable task

`P9-DEP-001` is the next executable task after an authorized operator configures and verifies the Vercel production target, project linkage and provider configuration. Until then it remains BLOCKED; P8-RC/P8-TEST are complete and P8 hardening is tracked separately.
