# Evidence — P1-STO-001

สถานะ: `DONE — AUTO_APPROVED_FOR_MVP`

วันที่: 2026-08-10

Task: สร้าง private storage และ secure upload baseline

## Requirement IDs

- `RF-06` COMPLAINT — attachment lifecycle และ upload integrity
- `RF-07` COMPLAINT/DEPARTMENT — tenant/resource binding และ scoped attachment access
- `RF-13` SECURITY — quarantine, malware boundary, signed URL และ path safety
- `RF-14` PRIVACY — private object storage, no public listing, checksum และ minimization
- `RF-16` QA — malicious upload and boundary unit coverage
- `INV-TENANT-001`, `INV-AUDIT-001`
- `SPEC-MVP-001`, `TEST-MVP-001` — L1 Unit Test Green เป็นเงื่อนไข auto-approval ของ MVP

## Files changed

- `packages/storage/package.json`
- `packages/storage/tsconfig.json`
- `packages/storage/README.md`
- `packages/storage/src/storage.ts`
- `packages/storage/src/storage.test.ts`
- `package.json`
- `pnpm-lock.yaml`
- `plan.md`

## Delivered behavior

- Private bucket policy is environment-separated (`citychatbot-<env>-private`),
  explicitly non-public and non-listable. The canonical object key contains
  verified tenant/resource/attachment IDs and an opaque generated filename;
  user filenames never become storage paths.
- Upload completion validates safe filename, extension, exact MIME, magic
  bytes, declared/received size and SHA-256 checksum. Executable extensions,
  traversal, public paths, spoofed MIME and cross-tenant keys are rejected.
- Images/PDFs are checked for suspicious secondary executable/script/archive
  signatures. DOCX/XLSX ZIP containers are conservatively checked for entry
  count, expanded size, compression ratio, traversal, macros, embedded
  objects, external links and required OOXML parts.
- Uploads remain `QUARANTINED` when malware scanning is unavailable or
  suspicious. Only a clean scanner result produces `READY`; the package does
  not parse or index an upload directly.
- Signed upload targets use HMAC-SHA256, a maximum five-minute TTL, exact
  tenant/resource/object binding and a single-use replay guard. Expired,
  tampered, replayed and cross-tenant tokens are rejected.
- The ingestion transition contract follows the canonical
  `QUARANTINED → VALIDATING → MALWARE_SCANNING → ... → APPROVED → ACTIVE`
  lifecycle and rejects unsafe state skips.

## Commands and actual results

| Command / check | Result |
|---|---|
| `pnpm exec vitest run packages/storage/src/storage.test.ts` | **PASS** — 1 file, 11 tests |
| `pnpm exec tsc -p packages/storage/tsconfig.json --noEmit` | **PASS** |
| `pnpm install --frozen-lockfile` | **PASS** — 6 workspace projects |
| `pnpm test:all` | **PASS** — lint, web typecheck, all package typechecks, Vitest 35/35, DB/RLS 10/10, secret scan and Next production build |
| `pnpm audit --prod --audit-level=high` | **PASS** — no known vulnerabilities found |
| `pnpm security:scan` | **PASS** — `SECRET_SCAN_CLEAN` |
| `pnpm security:sbom` | **PASS** — deterministic CycloneDX artifact, 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | **PASS** — 21 corpus/DB/RLS/GUI tests |

The test suite uses synthetic UUIDs and in-memory bytes only. No public
storage bucket, Supabase project, citizen PII or provider credential was
contacted.

## Acceptance criteria

- [x] Private bucket/path convention is explicit; public listing is disabled.
- [x] Spoofed extension/MIME, wrong magic, oversized, checksum mismatch,
  executable, traversal, polyglot and unsafe OOXML/ZIP inputs are rejected.
- [x] Cross-tenant object keys and signed targets cannot pass binding checks.
- [x] Signed upload targets are short-lived, single-use and reject expiry,
  tampering and replay.
- [x] Scanner `UNAVAILABLE` or `SUSPICIOUS` keeps the file quarantined; only
  `CLEAN` can produce `READY`.
- [x] Upload state transitions do not skip the quarantine and malware gates.
- [x] L1 unit suite is green, so this task is auto-approved under `SPEC-MVP-001`.

## Rollback procedure

Disable the upload feature flag and quarantine new objects while leaving any
verified read path available. Revoke outstanding signed-upload keys/targets,
rotate the HMAC secret, and retain finalized/audit references. If a validator
policy is wrong, ship a reviewed forward policy that denies the affected file
class, rerun the storage and full unit suites, and only then restore uploads.
Never make the bucket public as an emergency workaround.

## Known limitations / follow-up

- This task provides the provider-neutral server contract; Supabase Storage
  bucket creation, signed URL adapter, authenticated routes and complaint/
  knowledge metadata tables are implemented in their dependent tasks because
  no real project/credential was configured.
- The replay guard is in-memory for deterministic MVP tests and single-instance
  development. Production horizontal deployment must use a durable atomic
  nonce/idempotency store.
- Malware scanning is an adapter contract; production must fail closed when a
  managed scanner is unavailable. Archive parsing remains quarantine-only until
  the later ingestion/parser tasks add sandboxed resource limits.

ตาม `SPEC-MVP-001` และ `plan.md` ฉบับปัจจุบัน L1 unit suite ผ่านครบและมี
evidence จริง จึง auto-approve `P1-STO-001` สำหรับ MVP โดยไม่อ้างว่า
provider integration หรือ post-production malware infrastructure เสร็จแล้ว
