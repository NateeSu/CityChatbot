# Evidence - P9-DEP-001

Status: **DONE** (2026-08-12)

## Scope and traceability

- Task: `P9-DEP-001`
- Requirements: `RF-13`, `RF-15`, `RF-16`, `RF-17`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`
- Prerequisites: MVP L1 unit tests green; active immutable RC verified.
- Gate rule: production deployment is allowed after the MVP unit gate; hardening/canary work remains follow-up and is not reported as complete here.

## Production target and configuration

| Item | Verified value/state |
|---|---|
| Git repository | `https://github.com/NateeSu/CityChatbot` |
| Branch and code commit | `main` / `f9f2650b046c4282cf937c7c499bbcb56caac2b0` |
| Vercel team | `nateesu's projects` (`team_DlgaumeAT37hdSSsxmEu2BZA`) |
| Vercel project | `city-chatbot` (`prj_6X89yOQgVVlbR48TCrQ6by9ELdjz`) |
| Framework | Next.js `16.3.0` |
| Root Directory | `apps/web` |
| Build command | `pnpm build` |
| Production alias | `https://city-chatbot-murex.vercel.app` |
| Region | `iad1` |

The project is connected to the GitHub repository. Production-only environment variables were entered through the authenticated Vercel console; values are never recorded here:

`CITYCHATBOT_ENV`, `APP_BASE_URL`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_APP_URL`, `OPENROUTER_MODEL`, `OPENROUTER_API_KEY`, `CSRF_SECRET`, `TENANT_CREDENTIAL_KEY`, `TENANT_CREDENTIAL_KEY_VERSION`.

The supplied OpenRouter key was typed only into the Vercel secret field. Generated CSRF and tenant-credential key material was also typed only into Vercel. No secret was written to the repository, shell command, evidence, screenshot or log.

Supabase and LINE are intentionally not claimed as configured: the authenticated Supabase account has no CityChatbot project and the LINE developer tab is not authenticated. Citizen/provider features therefore remain disabled and fail closed; no synthetic data was promoted.

## Deployment history and fix

1. Initial production build `dpl_HVxCD5Ea52SHsJDXXmnk1KiaC5bB` failed because Vercel detected the repository root as Next.js while `next` is owned by the workspace app.
2. Root Directory was corrected to `apps/web`; retry `dpl_9JC2eDNJbpwNPFfLe8pUzdYToCR7` then reached the Next build but failed Vercel's post-build trace step because the app forced `output: "standalone"`.
3. `apps/web/next.config.ts` was changed to let Vercel manage the Next.js runtime. Local lint, typecheck and build passed; the fix was committed and pushed as `961655e745088bc5d802f69b3ef647f06b512008`.
4. The release-candidate provenance test was corrected for a real commit-pinned repository baseline in `scripts/test_release_candidate.py`; the change was committed as `f9f2650b046c4282cf937c7c499bbcb56caac2b0` and its Vercel deployment `dpl_Cj5XLhyLZkKFKgUn5B3zY5Eoi1ia` completed `READY`.
5. Vercel logs for the successful deployment show Next.js compilation, TypeScript, static generation of 37 pages, route finalization and `Build Completed in /vercel/output`.

## Active release candidate

- RC ID: `citychatbot-rc-2026-08-12-9d61a95d-ae6ccdd5`
- RC digest: `a083bb6eb030363086855ee694b9527a9f5be74bef64d33fda8c3d92539548ca`
- Source digest: `ae6ccdd54857afca87b82f1200a089218f09ea606c56148a30a53e97701a4445`
- Source commit: `f9f2650b046c4282cf937c7c499bbcb56caac2b0`
- Release manifest digest: `9d61a95db5978d3b48a260ffc80fd73342a2404e74577f97b3c3e16edff4279a`
- SBOM: 95 components; dependency digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`
- Staging verification: `NOT_AVAILABLE` and external signature: deferred; neither is fabricated as green.

## Tests and actual results

| Command/check | Result |
|---|---|
| `pnpm test:unit` | PASS - 51 Vitest files / 339 tests |
| `pnpm --filter @citychatbot/web lint` | PASS |
| `pnpm --filter @citychatbot/web typecheck` | PASS |
| `pnpm --filter @citychatbot/web build` | PASS - Next.js 16.3.0 production build; 37 static pages and API route inventory |
| `pnpm security:scan` | PASS - `SECRET_SCAN_CLEAN` |
| `pnpm security:sbom` | PASS - 95 components; digest recorded above |
| `pnpm release:manifest` / `pnpm release:verify` | PASS - manifest digest recorded above |
| `pnpm release:rc` / `pnpm release:rc:verify` | PASS - active RC and all pinned inputs verified |
| `python -m unittest discover -s scripts -p "test_*.py" -v` | PASS - 193/193 |
| `python scripts/test_pyramid_audit.py --base-url http://127.0.0.1:3224 --unit-tests 339 --static-tests 193` | PASS - 10/10 smoke runs; 0 forbidden markers; report digest `0da1f601f06d6b737985aaaa1ae7b58098543af014231c0bc9f58e01bd091eb0` |
| `python scripts/e2e_certification.py --base-url http://127.0.0.1:3224` | Local PASS 16/16; expected exit 1 because seven external dependencies are `NOT_AVAILABLE`; report digest `e02a3e8f21ebec5c968652c55260b9eaa00c84dd88fe25809cca642c6fce873c` |
| Vercel runtime error query, last 30 minutes | PASS - no runtime errors found |

## Production smoke checks

| Check | Actual result |
|---|---|
| Browser GET `/` | PASS - production page loaded and explicitly reports `production`; page states real citizen/provider data is not enabled |
| GET `/api/health` | HTTP 200; `{"status":"ok","service":"web","environment":"production"}` |
| GET `/api/v1/citizen/services` | HTTP 503; `reasonCode=CONFIGURATION_UNAVAILABLE` - production fail-closed behavior verified |
| Tenant/data safety | PASS - no production database, LINE channel, upload index or synthetic source was touched |

## Acceptance criteria

- Verified GitHub-to-Vercel production linkage and immutable code commit: **PASS**.
- Production environment configuration stored provider-side without secret leakage: **PASS**.
- Production build and deployment succeeded: **PASS**.
- Production health and homepage smoke checks succeeded: **PASS**.
- Unconfigured citizen/provider dependencies do not leak local data and return canonical fail-closed behavior: **PASS**.
- Rollback path documented and no database migration was executed: **PASS with first-deployment limitation noted below**.

## Rollback procedure

1. Keep citizen/provider feature flags disabled while external Supabase/LINE targets are unavailable.
2. If a smoke or runtime gate fails, remove the production alias/promote the last `READY` Vercel deployment, or redeploy the exact verified RC source commit `f9f2650...` from the Vercel deployment console.
3. Preserve the failed deployment logs and evidence; do not mutate the immutable RC. No production database migration was applied, so rollback is application/configuration-only for this deployment.
4. Before enabling any citizen feature, configure and verify the required tenant-isolated durable stores, LINE/LIFF channel and independent AI/RAG certification; otherwise keep the endpoint in `CONFIGURATION_UNAVAILABLE` state.

## Known limitations and next task

- This is a production foundation deployment, not a claim that the CityChatbot citizen experience is live. Supabase/LINE external configuration and P8 hardening remain open.
- No earlier `READY` deployment existed at the first successful promotion, so an automatic previous-artifact promotion was not exercised; the safe no-traffic/fail-closed path is available and subsequent Vercel deployments create a rollback candidate.
- `P8-E2E-001` remains blocked by seven external dependencies; `P9-CAN-001` is the next executable task after this deployment.
