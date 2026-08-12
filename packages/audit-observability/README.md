# `@citychatbot/audit-observability`

Tenant-scoped audit, notification and privileged export application contracts.
The package keeps audit records append-only, redacts sensitive values before
storage/export, verifies a per-tenant hash chain, enforces role visibility and
models export requests as an idempotent, auditable background lifecycle.

The in-memory adapter is intentionally used only by local/test API adapters.
Production must connect these contracts to the durable `audit_logs`,
`staff_notifications`, `exports` and `jobs` tables through the trusted server
boundary.
