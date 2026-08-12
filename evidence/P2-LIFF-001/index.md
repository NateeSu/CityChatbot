# Evidence — P2-LIFF-001

Status: `DONE — AUTO_APPROVED_FOR_MVP`

Date: 2026-08-10

Task: LIFF server-side identity verification and citizen session.

## Requirement IDs

- `RF-04` — verified citizen identity, tenant binding and consent
- `RF-05` — LINE/LIFF server-side token and channel verification
- `RF-13` — secure session, CSRF, replay and fail-closed behavior
- `RF-14` — citizen session and privacy-safe identity handling
- `SPEC-MVP-001`, `TEST-MVP-001` — L1 unit-test green is the MVP auto-approval condition

## Files changed

- `packages/liff/package.json`
- `packages/liff/tsconfig.json`
- `packages/liff/src/index.ts`
- `packages/liff/src/liff.ts`
- `packages/liff/src/liff.test.ts`
- `packages/liff/src/line-provider.ts`
- `packages/liff/src/line-provider.test.ts`
- `package.json`
- `pnpm-lock.yaml`
- `artifacts/release-manifest.json`
- `plan.md`

## Delivered behavior

- Resolves tenant only from a server-side LIFF app configuration; client tenant/profile values are not trusted.
- Verifies ID tokens through an injectable provider port and a production HTTP adapter for the LINE Login v2.1 verification endpoint. Access tokens are verified server-side and the LINE profile endpoint supplies the verified subject.
- Enforces issuer `https://access.line.me`, configured audience/channel, subject shape, expiry and future-issued clock-skew checks. Provider errors are converted to a generic `UNAUTHENTICATED` error without response/token details.
- Provides secure external login redirects with exact return-URL allowlisting, one-time state, nonce and fixed configured callback URL. State is hashed at rest and expires after five minutes.
- Upserts `line_user` identity records under `(tenant, channel, line user)` scope and never uses a browser-supplied profile as identity truth.
- Issues short-lived opaque, HMAC-signed session cookies with `HttpOnly`, `SameSite=Lax`, secure production behavior and bounded TTL (maximum 15 minutes; default five minutes).
- Binds CSRF tokens to the session key; tampered, cross-session and expired-session tokens fail closed.
- Supports privacy consent version enforcement and append-only consent events.
- Refresh verifies that the new LINE identity matches the active session before any user/consent/session side effect, then rotates the cookie and invalidates the old session.

## Commands and actual results

| Command / check | Result |
|---|---|
| `pnpm exec vitest run packages/liff/src/liff.test.ts packages/liff/src/line-provider.test.ts --reporter=verbose` | **PASS** — 2 files, 13 tests |
| `pnpm exec tsc -p packages/liff/tsconfig.json --noEmit` | **PASS** |
| `pnpm install --frozen-lockfile` | **PASS** — 9 workspace projects |
| `pnpm test:all` | **PASS** — lint, web/package typecheck, Vitest 14 files/90 tests, DB/RLS 10/10, secret scan and Next production build |
| `pnpm audit --prod --audit-level=high` | **PASS** — no known vulnerabilities found |
| `pnpm security:scan` | **PASS** — `SECRET_SCAN_CLEAN` |
| `pnpm security:sbom` | **PASS** — 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | **PASS** — 23 tests |
| `pnpm release:manifest` | **PASS** — 5 files, digest `933d4822be7ca6fef18f8001cb4e3e584de80e818a89a94e034ace0dd27d22f1` |
| `pnpm release:verify` | **PASS** — release manifest verified with the same digest |

## Acceptance criteria

- [x] Forged, expired, wrong-issuer, wrong-audience, wrong-channel, future-issued and nonce-mismatched tokens are denied.
- [x] Tenant and line-user binding is derived from verified provider claims plus server LIFF configuration; cross-tenant lookup is isolated.
- [x] Browser profile input is not part of the identity contract and cannot override the verified subject.
- [x] External-browser login uses fixed callback configuration, exact return allowlist, state, nonce and one-time replay defense.
- [x] Session cookies are short-lived, signed and secure; expired sessions resolve to `UNAUTHENTICATED` with `loginRequired`.
- [x] CSRF validation is session-bound and rejects tampering/cross-session reuse.
- [x] Consent version is enforced and recorded with tenant, line user, channel and timestamp.
- [x] Session refresh rotates the cookie and rejects a token belonging to another citizen before side effects.
- [x] L1 unit suite is green, so this task is auto-approved under `SPEC-MVP-001`.

## Rollback procedure

Disable the LIFF feature flag and revoke active sessions/cookies through the session store, then keep LINE text fallback/contact available. Revert to the previous session/provider package revision, preserve consent and line-user records, and re-run issuer/audience/channel/expiry, state/nonce, CSRF, tenant-isolation and refresh-mismatch tests before re-enabling.

## Known limitations / follow-up

- Session, line-user and consent stores are in-memory test adapters. Durable Supabase `liff_apps`, `line_users`, `consent_events`, session revocation and RLS-backed repositories/API routes remain integration work.
- The HTTP provider is production-shaped and uses the official LINE endpoints, but no real Developer Console credential or external LINE sandbox call was executed in this environment.
- OAuth authorization-code exchange, deployed `/api/v1/liff/session` and `/api/v1/liff/session/refresh` handlers, observability, rate-limit wiring and device/browser E2E remain subsequent integration tasks.

Under the amended `fullspec.md`/`plan.md` MVP Fast-Track rule, this evidence is sufficient to mark `P2-LIFF-001` DONE and continue to the next executable task.
