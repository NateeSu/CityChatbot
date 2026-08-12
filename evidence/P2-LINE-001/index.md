# Evidence — P2-LINE-001

สถานะ: `DONE — AUTO_APPROVED_FOR_MVP`

วันที่: 2026-08-10

Task: ทำ LINE channel configuration และ credential lifecycle ต่อ tenant

## Requirement IDs

- `RF-03` TENANCY — channel → tenant resolver จาก trusted webhook key
- `RF-05` LINE/LIFF — channel metadata, destination และ credential lifecycle
- `RF-13` SECURITY — encrypted credentials, server-only access, masked output
- `RF-15` OPS — rotation/revoke/audit และ fail-closed diagnostic
- `SPEC-MVP-001`, `TEST-MVP-001` — L1 Unit Test Green เป็นเงื่อนไข auto-approval ของ MVP

## Files changed

- `packages/line/package.json`
- `packages/line/tsconfig.json`
- `packages/line/README.md`
- `packages/line/src/channel.ts`
- `packages/line/src/channel.test.ts`
- `package.json`
- `pnpm-lock.yaml`
- `plan.md`

## Delivered behavior

- Channel records contain tenant, channel/destination, LIFF IDs, health,
  quota/last-verified metadata, key version and canonical state
  `DRAFT|VALIDATING|ACTIVE|DEGRADED|DISABLED`.
- Channel secret and access token are encrypted with AES-256-GCM through the
  server security package; public views, resolver results and audit events do
  not contain plaintext credentials or webhook key.
- The unguessable webhook key is HMAC-hashed. `resolveByWebhookKey` derives
  tenant from the matched stored channel and does not accept a client/body
  tenant as a source of truth.
- Provider validation is a server adapter boundary. Invalid provider results
  fail closed with non-secret diagnostics; disabled channels cannot resolve or
  mutate.
- Credential rotation stages a new encrypted version while the old active
  version remains usable, validates the staged version, then activates it.
  Retired versions are retained for explicit rollback; revocation disables all
  versions.
- Configuration changes emit redacted audit events and all public/admin views
  expose only version/state/key-version metadata.

## Commands and actual results

| Command / check | Result |
|---|---|
| `pnpm exec vitest run packages/line/src/channel.test.ts` | **PASS** — 1 file, 10 tests |
| `pnpm exec tsc -p packages/line/tsconfig.json --noEmit` | **PASS** |
| `pnpm install --frozen-lockfile` | **PASS** — 8 workspace projects |
| `pnpm test:all` | **PASS** — lint, web/package typecheck, Vitest 55/55, DB/RLS 10/10, secret scan and Next production build |
| `pnpm audit --prod --audit-level=high` | **PASS** — no known vulnerabilities found |
| `pnpm security:scan` | **PASS** — `SECRET_SCAN_CLEAN` |
| `pnpm security:sbom` | **PASS** — deterministic CycloneDX artifact, 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:verify` | **PASS** — release manifest digest `527955b9ee67ca15ec949aa0da16b7661a639bd27e418084193d68b51a84a599` |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | **PASS** — 23 corpus/DB/RLS/GUI/release tests |

All LINE tests use synthetic credentials held only in process memory. No LINE
Developer Console, Supabase project or provider token was contacted.

## Acceptance criteria

- [x] Valid/invalid provider credential behavior is covered; invalid setup
  fails closed without returning a secret.
- [x] Channel A resolver returns tenant A only from its hashed webhook key;
  unknown/disabled keys return no channel.
- [x] Credentials are encrypted, key-versioned, server-principal-only and
  absent from browser/public/audit representations.
- [x] Rotation stages and validates a new version without taking the old
  active version offline; activation and rollback are explicit and audited.
- [x] Channel revoke disables resolution and revokes all credential versions.
- [x] L1 unit suite is green, so this task is auto-approved under
  `SPEC-MVP-001`.

## Rollback procedure

Keep the prior validated credential version active while a new version is
investigated. If compromise is suspected, revoke the channel key/token,
disable the tenant channel flag, and activate the last verified encrypted
version only after an authorized audit reason. Re-run channel and full unit
suites; never copy credentials into logs, UI, fixtures or this repository.

## Known limitations / follow-up

- The package is a provider-neutral server contract. Actual LINE Developer
  Console validation, Supabase persistence/RLS for `line_channels`, credential
  rotation UI/API and health/quota polling require the configured external
  project and are intentionally not guessed.
- Webhook raw-body signature verification, replay defense and fast
  acknowledgment are the dependent `P2-LINE-002` task; this task only supplies
  the channel resolver/credential boundary.
- Encryption key rotation across multiple active key versions remains in the
  external secret-vault/deployment configuration; each record carries the
  current encryption key version for migration/rollback.

ตาม `SPEC-MVP-001` และ `plan.md` ฉบับปัจจุบัน L1 unit suite ผ่านครบและมี
evidence จริง จึง auto-approve `P2-LINE-001` สำหรับ MVP โดยไม่อ้างว่า
LINE Developer Console หรือ production provider integration เสร็จแล้ว
