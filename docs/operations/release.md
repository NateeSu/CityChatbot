# Release and rollback baseline

The CI workflow is the source of the MVP build artifact. It installs the
locked workspace, runs the complete unit/build/security checks, applies the
Supabase migration chain to an isolated PostgreSQL 16 service with synthetic
fixtures, and writes `artifacts/release-manifest.json`.

`pnpm release:manifest` hashes the exact release inputs and build identifiers;
`pnpm release:verify` fails if any listed file changes. The same uploaded
artifact is the input to the optional GitHub build-provenance attestation.

Staging and production GitHub Environment approvals, protected branch rules,
Vercel/Supabase project linkage and deployment credentials are intentionally
external configuration. They must be configured before enabling a deploy job;
this repository does not contain provider secrets or a fake deploy command.

Rollback is artifact-based: disable the feature flag if applicable, redeploy
the last verified manifest/provenance artifact, keep migrations backward
compatible, and run the health/smoke checks before restoring traffic. Never
edit production schema or build files manually.
