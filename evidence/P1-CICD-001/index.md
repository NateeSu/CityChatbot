# Evidence — P1-CICD-001

สถานะ: `DONE — AUTO_APPROVED_FOR_MVP`

วันที่: 2026-08-10

Task: ทำ CI/CD, migration dry-run และ immutable release artifact baseline

## Requirement IDs

- `RF-13` SECURITY — required checks, secret scan และ provenance boundary
- `RF-15` OPS — reproducible build, migration rehearsal และ rollback artifact
- `RF-16` QA — CI test/build gates and evidence artifacts
- `RF-17` ARCH — migration-first, versioned and immutable release input
- `SPEC-MVP-001`, `TEST-MVP-001` — L1 Unit Test Green เป็นเงื่อนไข auto-approval ของ MVP

## Files changed

- `.github/workflows/ci.yml`
- `scripts/release_manifest.py`
- `scripts/test_release_manifest.py`
- `package.json`
- `pnpm-lock.yaml`
- `docs/operations/release.md`
- `artifacts/release-manifest.json`
- `plan.md`

## Delivered behavior

- CI uses pinned pnpm/Node versions, frozen lockfile installation, complete
  lint/typecheck/unit/DB/security/build checks and concurrency cancellation.
- A PostgreSQL 16 CI service applies both migrations, synthetic seed and SQL
  schema/RLS contracts with `ON_ERROR_STOP=1`; a failed migration or contract
  fails the job.
- `release_manifest.py` hashes the exact package/lock/build-ID/SBOM inputs,
  rejects missing/outside/duplicate paths and writes a deterministic manifest.
  Verification fails if any listed artifact changes after build.
- CI uploads the manifest, SBOM and Next build artifact. Main pushes have a
  GitHub build-provenance attestation step with explicit OIDC/attestation
  permissions.
- Release/rollback policy is documented as artifact promotion: the same
  verified artifact is used across environments, flags can disable the slice,
  and production schema/build edits are not performed manually.

## Commands and actual results

| Command / check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | **PASS** — 7 workspace projects |
| `pnpm test:all` | **PASS** — lint, web/package typecheck, Vitest 45/45, DB/RLS 10/10, secret scan and Next production build |
| `pnpm release:manifest` | **PASS** — 5 inputs, digest `2ca8daf378ad57571ef022367c9956a7764582330afb6d7f3b39310e2b584f52` |
| `pnpm release:verify` | **PASS** — manifest re-hash verified with the same digest |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | **PASS** — 23 corpus/DB/RLS/GUI/release-manifest tests |
| `pnpm audit --prod --audit-level=high` | **PASS** — no known vulnerabilities found |
| `pnpm security:scan` | **PASS** — `SECRET_SCAN_CLEAN` |
| `pnpm security:sbom` | **PASS** — deterministic CycloneDX artifact, 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |

The GitHub service-container migration job and provenance attestation are
configured in `.github/workflows/ci.yml` but cannot be claimed as remotely run
because the connected GitHub repository is currently empty and no CI run was
triggered. Local migration/RLS contract validation is recorded in
`P1-DB-001`/`P1-RLS-001`.

## Acceptance criteria

- [x] Frozen install, lint, typecheck, unit, security and build are required in
  the CI workflow.
- [x] Migration dry-run applies the additive chain, seed and schema/RLS
  contracts to an isolated PostgreSQL 16 service.
- [x] Release inputs have a deterministic, verifiable manifest and uploaded
  artifact path; changed artifacts fail verification.
- [x] Main-branch provenance attestation is configured with explicit least
  permissions.
- [x] Staging/production promotion and rollback procedure is documented and
  does not require a manual untracked build or schema edit.
- [x] L1 unit suite is green, so this task is auto-approved under
  `SPEC-MVP-001`.

## Rollback procedure

Stop promotion, disable the affected feature flag, and redeploy the previous
verified manifest/provenance artifact. Keep the database backward compatible;
if a migration is involved, apply a reviewed forward compatibility migration
and re-run the isolated dry-run. Revoke/rotate environment credentials only in
the external secret manager, never in the repository or workflow logs.

## Known limitations / follow-up

- GitHub protected branches, required-check settings, GitHub Environments,
  Vercel project linkage, Supabase project linkage and deployment credentials
  are external configuration and are not present in the empty remote. No fake
  deploy step was added.
- The workflow's provenance attestation requires a main-branch GitHub run;
  local evidence proves manifest integrity but not GitHub's attestation result.
- Artifact signing/promotion, canary and production synthetic checks remain
  later P9 release gates under the MVP Fast-Track plan.

ตาม `SPEC-MVP-001` และ `plan.md` ฉบับปัจจุบัน L1 unit suite ผ่านครบและมี
evidence จริง จึง auto-approve `P1-CICD-001` สำหรับ MVP โดยไม่อ้างว่า
external GitHub/Vercel/Supabase deployment configuration เสร็จแล้ว
