# Security baseline

The P1 security baseline is server-first:

- `@citychatbot/security/headers` supplies CSP, frame isolation, nosniff,
  referrer/permission policies and production HSTS. HSTS is not enabled in
  local/staging to avoid poisoning non-production browser state. Next
  development-only `unsafe-eval`/WebSocket allowances are excluded from the
  production policy.
- `buildCorsHeaders` accepts exact configured origins only; wildcard origins
  are rejected and credentials are never combined with `*`.
- `@citychatbot/security/cookies` provides HTTP-only, SameSite=Lax session
  cookie defaults and enables Secure for staging/production.
- `@citychatbot/security/csrf` uses a server-only HMAC token and rejects weak
  secrets. Cookie-auth mutation routes must validate the token before parsing
  the mutation body.
- `@citychatbot/security/rate-limit` keys limits by tenant, actor, upstream
  hashed IP and feature. The in-memory implementation is deterministic for
  tests/single-instance development; a durable shared store is required before
  horizontal production scaling.
- `@citychatbot/security/secret-vault` encrypts tenant/provider secrets with
  AES-256-GCM and stores only ciphertext, IV, auth tag and key version. Keys
  come from a vault/environment and are never returned to the browser or logs.
- `scripts/secret_scan.py` fails closed on provider tokens and non-empty service
  role assignments. `scripts/generate_sbom.py` emits a deterministic CycloneDX
  dependency artifact for CI retention.

Do not put real values in `.env.example`, test fixtures, screenshots, logs,
client bundles, or the repository. Rotate/revoke a credential if a scan or
incident detects exposure.
