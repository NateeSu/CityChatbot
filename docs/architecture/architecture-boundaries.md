# CityChatbot architecture boundaries

Revision: `architecture-boundaries.v1`  
System actor: `SYSTEM_UNIT_GATE`

## Request and background boundaries

The request path authenticates, authorizes, validates, performs the atomic
business transaction, writes the transactional outbox, and returns a stable
response. AI analysis, document processing, embedding/evaluation, LINE push,
SLA scans, KPI snapshots, exports and notification retry belong to a durable
background worker. No unawaited promise is treated as a job.

## Module ownership

| Boundary | Owner package/surface | Source of truth |
|---|---|---|
| Web/API | `apps/web` | explicit route inventory in `fullspec.md` |
| Tenant/IAM/RLS | `supabase/migrations`, `packages/authz` | tenant-scoped database contracts |
| Complaint workflow | `packages/complaints` | canonical status/state transitions |
| LINE/LIFF | `packages/line`, `packages/liff` | signed webhook and server-side identity |
| Knowledge/RAG | `packages/knowledge` | versioned active evidence only |
| AI gateway/chat | `packages/ai-gateway`, `packages/chat` | structured outcome and safe fallback |
| Handoff/notification | `packages/support-handoff`, `packages/support-delivery` | ticket/delivery/outbox lineage |
| Operations | `packages/job-ops`, `packages/telemetry`, `packages/incident-ops` | jobs, SLO and recovery contracts |

## Data and security boundaries

- Every tenant-owned query carries tenant scope; public and citizen reads use
  private database wrappers with runtime grants, not direct table access.
- Service-role credentials never reach the browser or normal request path.
- Every integration event is written to `domain_outbox` in the same transaction
  as its aggregate mutation; retries use an idempotency key.
- Worker claims require atomic lease/heartbeat/DLQ behavior. A missing worker
  target or provider is a retryable operational dependency and remains
  fail-closed.
- AI can only emit `ANSWER`, `CLARIFY` or `HANDOFF`; it cannot become source of
  status, SLA, KPI, price, fee or transaction truth.

## Contract reconciliation

The repository route inventory is explicit and contains no wildcard endpoint.
The webhook is an acknowledgement-only ingestion boundary; durable consumer
and provider delivery are separate background responsibilities. Direct LINE
text chat therefore remains disabled until that worker boundary is implemented
and its unit gate passes.

## Rollback

Deploy the previous immutable revision, disable the affected feature flag, keep
database changes backward-compatible, preserve append-only audit/outbox lineage,
and replay only idempotent jobs after reconciliation.
