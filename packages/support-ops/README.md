# Support operations boundary

`@citychatbot/support-ops` evaluates tenant-scoped support tickets and
conversation references into deterministic operational alerts. It never reads
or stores citizen message bodies, raw LINE IDs, phone numbers or provider
payloads. Alert records contain only safe ticket/public IDs, department scope,
alert kind, policy version and timestamps.

## Alert rules

| Alert | Boundary | Recipient | Recovery |
|---|---|---|---|
| `UNASSIGNED` | Any non-terminal ticket without a department | `CENTRAL_QUEUE` | Resolves when an owner is assigned |
| `STALE` | `now - updatedAt >= staleAfterSeconds` | department head or central queue | Resolves when the ticket is updated or no longer stale |
| `RESPONSE_SLA_WARNING` | `now >= due - target * (1 - warningRatio)` | department head or central queue | Replaced by breach or resolved when response starts |
| `RESPONSE_SLA_BREACHED` | `now >= responseDueAt` | department head or central queue | Remains visible until response starts |
| `RESOLUTION_SLA_WARNING` | `now >= due - target * (1 - warningRatio)` | department head or central queue | Replaced by breach or resolved on terminal state |
| `RESOLUTION_SLA_BREACHED` | `now >= resolutionDueAt` | department head or central queue | Remains visible until terminal state |
| `ORPHAN_CONVERSATION` | Pending conversation has no open ticket | `CENTRAL_QUEUE` | Reconciliation run resolves it when attached |

The scanner uses exact inclusive threshold boundaries and the `policyVersion`
provided by the trusted configuration. Re-running a scan with the same tenant,
ticket, alert kind and boundary is idempotent; a changed owner or SLA boundary
updates/resolves the previous alert instead of creating noisy duplicates.

## Runbook

1. Run the tenant-scoped scan with a correlation ID and the current versioned
   policy. Never pass a mixed-tenant ticket or conversation list.
2. If an `UNASSIGNED` alert is open, central queue owns the next action until
   a same-tenant department/membership assignment succeeds.
3. For SLA warnings, verify the ticket snapshot and notify the department head;
   for breaches, preserve the alert and escalate according to tenant policy.
4. If the scan worker is unavailable, replay the same input after recovery.
   Alert dedupe prevents duplicate notifications and the dashboard exposes the
   remaining ownerless/orphan counts.
5. If the scanner is noisy or unsafe, pause the alert consumer, keep the
   central scheduled scan/report active, and force new handoffs to the central
   queue. Preserve alert records for audit; do not delete or rewrite history.

## Rollback

Disable the alert consumer or feature flag, retain the existing support ticket
and alert store, and use the central scheduled scan/report until the reviewed
policy revision is deployed. Re-run the unit, static and full repository gates
before resuming alert delivery.
