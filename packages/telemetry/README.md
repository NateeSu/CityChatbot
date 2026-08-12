# `@citychatbot/telemetry`

Server-side observability contracts for CityChatbot. The package keeps raw
tenant IDs, prompt/document content, tokens, secrets and unnecessary PII out
of structured logs and domain events.

It provides correlation context, pseudonymous tenant logging, append-only
redacted audit records, transactional-outbox semantics, and a deterministic
job queue adapter with lease recovery, retry backoff, DLQ and authorized replay
audit. The in-memory adapters are for unit tests and single-instance local
development; production must connect the same contracts to durable database,
queue and log sinks.
