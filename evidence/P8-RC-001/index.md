# Evidence — P8-RC-001

สถานะ: **DONE — local immutable RC baseline** (2026-08-12)

Task นี้ auto-approved ภายใต้ `SPEC-MVP-001` หลัง RC unit/static checks, full regression, build และ artifact verification ผ่าน 100% งาน P8 เป็น post-production hardening และไม่บล็อก P9 ตามแผน อย่างไรก็ตาม evidence นี้ไม่อ้างว่ามี staging deployment, external signature หรือ production go-live แล้ว

## RC identity

- RC ID: `citychatbot-rc-2026-08-11-fb955df9-a56c5a37`
- RC digest: `7706868aa2f8022f17032578c95b280a8a4922bcc4a5640b8e5e740f01033873`
- Artifact release manifest digest: `fb955df935cf684cbd73165dc2946502358798519460ef2a35548d7269d50085` (file SHA-256 `cdd4334067f2b5768c1acdf0a18d750ee2fd77e106e940051a8385e025a76a80`)
- SBOM: 95 components; dependency digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`; file SHA-256 `ecc65e64efa6339deac91f31a531d62ed86dddc58fab2183b4c35ab3069c9561`
- Source state: `workspace-snapshot` with deterministic tree digest `a56c5a370d1b844895eee5917455d2e274a88b753429869aee7ab3130110a49a`; no local git commit exists at the workspace root.
- Staging verification: `NOT_AVAILABLE` (no staging deployment target in connected Vercel project).
- Signature: `UNSIGNED_EXTERNAL_SIGNING_REQUIRED`; no key material is stored in the repository or manifest.

The RC is immutable: rerunning with changed inputs refuses to overwrite the existing file. Previous generated RC files were moved to `artifacts/archive/` as recoverable immutable history before a new artifact was created.

## Traceability

- Requirement IDs: `RF-13`, `RF-15`, `RF-16`, `RF-17`, `RF-18`
- Invariants: `INV-TENANT-001`, `INV-AUDIT-001`, `INV-CORE-001`
- Rules: `SPEC-MVP-001`, `TEST-MVP-001`
- Task: `P8-RC-001`; prerequisite `P7-GATE` is DONE.

## Delivered

- `scripts/release_candidate.py`: deterministic RC ID/digest, safe path checks, source snapshot, artifact/release-manifest/SBOM references, migration hashes, environment key schema without values, traffic/AI flags, corpus/index/model/prompt/retrieval/provider metadata, change-log hashes, provenance state, immutable write and tamper verifier.
- `scripts/test_release_candidate.py`: canonical digest, metadata-only/no-secret, staging fail-closed, tamper/immutability tests.
- `package.json`: `release:rc`, `release:rc:verify` and repeatable `test:all` artifact ordering (build → release manifest verify → contract tests) commands.
- `artifacts/release-candidate.json`: current RC metadata.
- `artifacts/archive/`: prior RC metadata retained for rollback/audit history.
- `plan.md` and `evidence/progress/2026-08-12.md`: RC traceability and next-task state.

The generated RC pins 25 Supabase migration files, 17 corpus metadata files, 11 environment keys, production-safe traffic policy (`disabled-until-verified-deployment`) and provider versions without copying any provider secret, PII, prompt text or corpus content into the manifest.

## Verification commands and actual results

| Command | Result |
|---|---|
| `python -m unittest scripts.test_release_candidate -v` | PASS — 4/4 |
| `pnpm security:scan` | PASS — `SECRET_SCAN_CLEAN` |
| `pnpm build` | PASS — Next.js production build; 37 static pages and explicit API route inventory |
| `pnpm test:all` | PASS — 51 Vitest files / 339 tests; 193/193 static tests; lint, web/package typecheck, secret scan, SBOM, production build and release manifest verify |
| `pnpm security:sbom` | PASS — 95 components; dependency digest and file SHA-256 recorded above |
| `pnpm release:manifest` | PASS — manifest digest recorded above |
| `pnpm release:verify` | PASS — artifact files and manifest digest verified |
| `pnpm release:rc` | PASS — RC ID/digest recorded above |
| `pnpm release:rc:verify` | PASS — RC digest, artifact, source groups and all referenced inputs verified |
| `python scripts/release_candidate.py --verify artifacts/release-candidate.json --require-staging` | Expected fail-closed — staging status `NOT_AVAILABLE`; this prevents an unverified staging state being reported as matched |

## Acceptance status

- RC ID and immutable metadata manifest: **PASS**.
- Artifact, SBOM and build ID pinning: **PASS**.
- Migration, env schema, flags, corpus/index/model/prompt/retrieval/provider and change-log hashes: **PASS**.
- Tamper detection and no-overwrite behavior: **PASS**.
- Local build provenance and release manifest verification: **PASS**.
- Repeatable test/release ordering after a real stale-`BUILD_ID` failure: **PASS** — `test:all` now regenerates and verifies the release manifest after build before RC contract tests.
- Deployed staging digest match: **DEFERRED** — no staging target/deployment exists; `--require-staging` fails closed.
- Cryptographic external signature: **DEFERRED** — external signing key/service is required; no key was invented or committed.
- All new RC-specific tests/evidence reference this RC ID. Existing historical evidence remains immutable and is linked by task ID; it is not rewritten to falsify historical runs.

## Rollback procedure

1. Do not overwrite the current RC; discard only an unpromoted candidate and select the previous archived RC/release manifest.
2. Verify the selected RC with `pnpm release:rc:verify` and `pnpm release:verify` before promotion.
3. Keep production traffic disabled until the staging digest and external signature are available.
4. If a later deployment fails smoke checks, redeploy the previous verified artifact/configuration and preserve the failed RC/evidence for incident review.

## Known limitations

- This evidence is the immutable gate-capture record for the prior RC `citychatbot-rc-2026-08-11-fb955df9-a56c5a37`. After production Git provenance was enabled and the release-candidate test was corrected, the active RC was regenerated as `citychatbot-rc-2026-08-12-9d61a95d-ae6ccdd5`; current deployment evidence is in `evidence/P9-DEP-001/index.md`.
- No local git metadata/commit or detached cryptographic signature is available in this workspace.
- Vercel `city-chatbot` had no deployment/domain/live target when this RC evidence was captured. Current production deployment/configuration is recorded in `evidence/P9-DEP-001/index.md`.
- Supabase, LINE, OpenRouter and secret-vault provider versions are external configuration references only. No provider credential is in the RC.
- P8-RC completion does not claim hardening, citizen/provider activation or project completion.
