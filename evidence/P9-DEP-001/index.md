# Evidence - P9-DEP-001

Status: **DONE** (2026-08-12)

## Verified production checkpoint (2026-08-13)

### Superseding production continuation (2026-08-13)

The foundation observations below are historical for `P9-DEP-001`. The current
production state is recorded in `evidence/P9-CAN-001` and `evidence/P9-GATE`:

- Real LINE E2E was verified on READY deployment
  `dpl_6vhzdaSbEGP7tHJdPAX6YWLRvei8`, source commit `d7122d0`, region `sin1`,
  production alias
  `https://city-chatbot-murex.vercel.app`.
- Runtime verification was completed on READY deployment
  `dpl_Chu4YACeLJ4mGywAzmrbBhjPigEH`, source commit `59c26d2`, region `sin1`.
  Its `/api/health` endpoint returned HTTP `200` with production JSON.
- The evidence-only follow-up commit `3b7a109` produced READY deployment
  `dpl_Ehs95f992DhdrWgmibfoBHYj8851` in `sin1`; its health check returned HTTP
  `200` and its selected ten-minute runtime-error scan was empty. This
  follow-up contains no runtime-code change.
- Supabase runtime migrations through
  `20260813020000_fix_line_runtime_claim_qualification.sql` are applied.
- LINE Developers `Use webhook` is enabled for the dedicated canary channel.
- Real LINE E2E completed with webhook HTTP 200, deferred worker `OK`, visible
  canonical safe-abstention reply, inbound `PROCESSED=4`, outbound
  `API_ACCEPTED=4`, and FAILED/DLQ `0/0` in the redacted one-hour aggregate.
- Certified ACTIVE production knowledge remains intentionally absent; factual
  RAG traffic is still fail-closed.

The earlier foundation-only deployment identifiers and fail-closed statements
remain immutable historical evidence and are superseded for current runtime
status by the continuation checkpoints above.

The GitHub-linked Vercel production deployment for the application revision
under verification completed successfully:

| Item | Current verified result |
|---|---|
| Verified application source commit | `c22a0e409d9d6453feca4025e649f4b73a54d9f8` |
| Deployment | `dpl_5iUcCnsQukifmt9gB8X3g7G221MD` — `READY` |
| Production alias | `https://city-chatbot-murex.vercel.app` |
| `/api/health` | HTTP `200`, production JSON status `ok` |
| `/api/v1/citizen/services` | HTTP `503`, `CONFIGURATION_UNAVAILABLE` (expected fail-closed) |
| `/api/v1/line/worker` GET | HTTP `405` (expected method guard) |
| Vercel runtime errors | none found in the selected last-hour window |

The subsequent evidence-only commit `2858652550418799ad7516143f9b70a079363472`
also produced READY deployment `dpl_AbRfCqNtXqkcS6jizykFyzPTsn8u`; its health,
fail-closed citizen and method-guard smoke checks returned the same results.

The repository release verification also passed on this continuation: `63`
Vitest files / `387` tests, `329/329` Python contract tests in `pnpm test:all`,
security scan, production build, release manifest and release-candidate
verification. The current RC digest is
`222cce8ae51acb22db984a506f8b9f703595121f8f0cd6728a7a808b95344bad`.

Direct LINE chat was not claimed live in this foundation checkpoint; that
historical limitation is superseded by the production E2E continuation above.

## Scope and traceability

- Task: `P9-DEP-001`
- Requirements: `RF-13`, `RF-15`, `RF-16`, `RF-17`
- Invariants: `INV-TENANT-001`, `INV-CORE-001`, `INV-AUDIT-001`
- Prerequisites: MVP L1 unit tests green; active immutable RC verified.
- Gate rule: production deployment is allowed after the MVP unit gate; the
  current P8 gate is also auto-closed, while content activation remains
  explicitly fail-closed.

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

Historical baseline: Supabase and LINE were not claimed as configured in the
initial foundation deployment. In the current continuation, their durable
runtime configuration is still not evidenced in this workspace. Citizen/provider
features therefore remain disabled and fail closed; no synthetic data was
promoted.

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

## Known limitations and next operational work

- The citizen LINE experience is live for the dedicated canary account in
  `SAFE_ABSTENTION` mode. Factual RAG remains disabled because no supplied
  corpus file is eligible for the active index.
- No earlier `READY` deployment existed at the first successful promotion, so an automatic previous-artifact promotion was not exercised; the safe no-traffic/fail-closed path is available and subsequent Vercel deployments create a rollback candidate.
- No repository implementation Task remains. The next operational work is
  optional governed content remediation and future certified index activation;
  no approval or manual release action is pending.
