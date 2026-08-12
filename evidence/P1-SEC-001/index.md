# Evidence — P1-SEC-001

สถานะ: `DONE — AUTO_APPROVED_FOR_MVP`

วันที่: 2026-08-10

Task: จัดการ secrets, secure headers, CSRF/CORS, rate limits และ supply-chain baseline

## Requirement IDs

- `RF-13` SECURITY — OWASP baseline, secret handling, secure boundary และ abuse controls
- `RF-15` OPS — scan, SBOM, operational rollback และ production-safe configuration
- `RF-16` QA — unit tests, static checks และ browser smoke evidence
- `SEC-BASE-001`
- `SPEC-MVP-001`, `TEST-MVP-001` — L1 Unit Test Green เป็นเงื่อนไข auto-approval ของ MVP

## Files changed

- `packages/security/package.json`
- `packages/security/tsconfig.json`
- `packages/security/src/headers.ts`
- `packages/security/src/headers.test.ts`
- `packages/security/src/rate-limit.ts`
- `packages/security/src/rate-limit.test.ts`
- `packages/security/src/csrf.ts`
- `packages/security/src/csrf.test.ts`
- `packages/security/src/cookies.ts`
- `packages/security/src/cookies.test.ts`
- `packages/security/src/secret-vault.ts`
- `packages/security/src/secret-vault.test.ts`
- `packages/config/src/env.ts`
- `packages/config/src/env.test.ts`
- `.env.example`
- `apps/web/.env.example`
- `apps/web/package.json`
- `apps/web/next.config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/secret_scan.py`
- `scripts/generate_sbom.py`
- `.github/workflows/security.yml`
- `docs/security/README.md`
- `artifacts/sbom.cdx.json`
- `plan.md`

## Delivered behavior

- `buildSecurityHeaders` adds CSP, `frame-ancestors`, HSTS in production,
  `X-Frame-Options`, `nosniff`, referrer, permission, COOP and CORP headers.
  Next development-only `unsafe-eval` and WebSocket allowances are scoped to
  local/test and are absent from the production CSP.
- `buildCorsHeaders` accepts exact configured origins only. Unknown origins,
  malformed origins and `*` are rejected; credentials are never paired with a
  wildcard origin.
- `buildSessionCookieOptions` produces HTTP-only, SameSite=Lax cookies and
  enables Secure for staging/production.
- CSRF tokens use HMAC-SHA256 with a minimum 32-byte server secret and reject
  tampering or weak secrets.
- Rate-limit keys include tenant, actor, hashed upstream IP and feature. The
  deterministic token bucket returns remaining quota, reset time and retry
  seconds for a 429 adapter.
- Tenant/provider credentials use AES-256-GCM with IV, authentication tag and
  key version. Plaintext keys are read only from server environment/vault
  boundaries and are not emitted to the browser or logs.
- The secret scan is fail-closed for provider/service-role patterns. The SBOM
  script emits a deterministic CycloneDX artifact and CI retains the scan,
  audit, unit, build and SBOM outputs.

## Commands and actual results

| Command / check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | **PASS** — 5 workspace projects, lockfile current |
| `pnpm test:all` | **PASS** — lint, web typecheck, package typecheck, Vitest 24/24, DB/RLS 10/10, secret scan and Next production build |
| `pnpm exec vitest run packages/security/src packages/config/src packages/authz/src` | **PASS** — 7 files, 24 tests |
| `pnpm exec tsc -p packages/security/tsconfig.json --noEmit` | **PASS** |
| `pnpm security:scan` | **PASS** — `SECRET_SCAN_CLEAN` |
| `pnpm audit --prod --audit-level=high` | **PASS** — no known vulnerabilities found |
| `pnpm security:sbom` | **PASS** — CycloneDX artifact, 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | **PASS** — 21 corpus/DB/RLS/GUI tests |
| Local browser QA at `http://127.0.0.1:3100/` | **PASS** — home and `/api/health` HTTP 200, meaningful DOM/title, keyboard Tab action, no console warn/error, no overlay error, 320px document/body width equals viewport |
| Local response header check | **PASS** — CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, no `X-Powered-By`; health body `{"status":"ok","service":"web","environment":"local"}` |

The browser check used only the local synthetic web foundation. No Supabase,
LINE, OpenRouter, citizen data or production credential was contacted.

## Acceptance criteria

- [x] Test secret/provider-token scan is fail-closed and the current repository/build artifacts are clean.
- [x] Credentials are server-only, encrypted with AES-256-GCM, include key version, and have a rotation/revocation procedure.
- [x] Production security headers include CSP/HSTS/frame isolation/nosniff and secure cookie policy utilities are covered by tests.
- [x] Cookie-auth mutation CSRF token creation/verification and tamper rejection are covered by unit tests.
- [x] Rate-limit key isolation covers tenant, actor, IP and feature dimensions and returns retry metadata for 429 handling.
- [x] Strict CORS exact-origin behavior rejects wildcard and unknown origins.
- [x] Dependency audit, secret scan and deterministic SBOM checks pass; the Next production build completes.
- [x] MVP L1 unit suite is green, so this task is auto-approved under `SPEC-MVP-001`.

## Rollback procedure

Revoke or rotate the affected server credential and key version in the external
secret store/environment without copying the value into the repository. If a
header or CORS revision is unsafe, roll forward to the last reviewed policy or
disable the affected route/feature flag. Re-run `pnpm test:all`, the secret scan
and SBOM generation before re-enabling traffic. The in-memory limiter can be
cleared or the affected feature disabled while preserving audit records.

## Known limitations / follow-up

- No real Supabase/LINE provider or authenticated mutation route is configured
  yet; CSRF, CORS, cookie and vault utilities are server-side contracts ready
  for the next integration tasks.
- The rate limiter is intentionally in-memory for deterministic MVP tests and
  single-instance development. A durable shared store is required before
  horizontal production scaling.
- Next local/test CSP contains the development-only `unsafe-eval` allowance;
  the production policy excludes it. Nonce-based CSP hardening remains a
  post-production task.
- Quota/cost ceilings, managed encryption-at-rest, external SAST and provider
  key rotation plumbing depend on deployment/managed-service configuration and
  remain post-production hardening items under the MVP Fast-Track rule.

ตาม `SPEC-MVP-001` และ `plan.md` ฉบับปัจจุบัน L1 unit suite ผ่านครบและมี
evidence จริง จึง auto-approve `P1-SEC-001` สำหรับ MVP โดยไม่อ้างว่า
post-production hardening ที่ระบุไว้ใน limitations เสร็จแล้ว
