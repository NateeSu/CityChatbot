# CityChatbot database bootstrap

`migrations/20260810000000_core_schema.sql` creates the P1 core/identity and
operations schema required by `RF-03`, `RF-04`, `RF-15`, and `RF-17`.
`migrations/20260810010000_rls_policy_hardening.sql` adds the permission-aware
department/tenant policies for `RF-03`, `RF-04`, `RF-07`, `RF-13`, and `RF-16`.

The migration is additive and safe to run again on the same schema. It enables
and forces RLS on every exposed core table, grants authenticated read access
only where a tenant policy exists, and intentionally installs no authenticated
write policy. `P1-IAM-001`/`P1-RLS-001` add the role/action write matrix.

`seed.sql` is test-only synthetic data for two isolated tenants. Never run it
against production. It is deterministic and uses `example.invalid`/synthetic
identifiers only.

`migrations/20260810100000_ai_chat_schema.sql` adds tenant-scoped chat sessions,
redacted messages, AI run metadata, claims, citations and feedback. Chat trace
tables are forced-RLS and append-only; authenticated clients have no write
privilege. Raw LINE user IDs and provider request/response bodies are not
stored.

migrations/20260810110000_complaint_routing_hardening.sql adds the P4
suggestion-only routing trace columns and tenant-composite source/candidate
foreign keys to complaint_routing_runs. The migration keeps the existing
append-only trigger and creates a tenant/complaint/request idempotency index.
final_department_id is a staff-reviewed routing-log value; it does not mutate
the canonical complaint assignment.

`migrations/20260810120000_support_handoff_schema.sql` adds the P5 support
ticket boundary: tenant-composite ticket/queue/department/membership keys,
citizen-safe identity/topic dedupe, SLA snapshot, canonical status validation,
append-only messages/assignments/status/audit history, forced RLS and explicit
read-only authenticated policies. Ticket mutations stay on the trusted
server/RPC boundary.

`migrations/20260810130000_support_ops_alerts.sql` adds the durable P5
operations alert read boundary for unassigned/stale/SLA/orphan signals. It is
tenant-composite, forced-RLS, read-only to browser clients, and stores no
conversation body or raw citizen identity.

`migrations/20260810140000_rich_menu_schema.sql` adds the tenant-scoped Rich
Menu version/tap-area boundary for `P2-RM-001`: canonical lifecycle states,
tenant-composite foreign keys, immutable audit/outbox events, validation
checks, forced RLS and browser read-only access. The trusted server/provider
boundary must perform LINE object creation, image upload and default switching;
the local web Builder uses an in-memory synthetic provider only.

## Local validation

With a Supabase project or a local Postgres instance configured with the
standard `authenticated` role:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260810000000_core_schema.sql
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/core_schema_contract.sql
```

For the chat boundary, apply migrations in filename order and run:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260810100000_ai_chat_schema.sql
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ai_chat_schema_contract.sql
```

For the complaint routing boundary, apply the additive hardening migration and
run:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260810110000_complaint_routing_hardening.sql
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/complaint_routing_hardening_contract.sql
```

For the human handoff boundary, apply the support migration and run:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260810120000_support_handoff_schema.sql
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/support_handoff_schema_contract.sql
```

For support operations alerts, apply the additive migration and run:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260810130000_support_ops_alerts.sql
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/support_ops_alerts_contract.sql
```

For the Rich Menu boundary, apply the additive migration and run:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260810140000_rich_menu_schema.sql
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rich_menu_schema_contract.sql
```

The queue consumer must claim work in one transaction with a tenant predicate,
`FOR UPDATE SKIP LOCKED`, a lease owner/expiry, and an idempotent handler. The
migration provides the indexes and lease columns; worker behavior is covered by
the later job task.

## RLS validation

Apply the migrations in filename order, then run the synthetic seed and the
contract assertions:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260810010000_rls_policy_hardening.sql
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_policy_contract.sql
```

The contract uses tenant A/B and department A1/A2/B1. A staff A1 session can
read only A1, cannot write a department row, and cannot see tenant B. A
synthetic tenant admin can write within tenant A in a rolled-back transaction.

## Rollback

The bootstrap migration has no destructive `down` migration. If a fresh/test
database must be reset, recreate that isolated database. For a shared or
production database, take and verify a backup, disable the affected feature,
and ship a reviewed forward-only compatibility migration. Do not drop core
tables while audit, outbox, job, or tenant data is retained.
