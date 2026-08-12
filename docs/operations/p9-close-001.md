# P9-CLOSE-001 release close

Release close is machine-generated from evidence records, traceability rows and
artifact hashes. A missing link, orphan task, invalid hash or changed
idempotency input fails closed. The close record preserves its archive hash and
known limitations; it does not turn an unverified provider or database state
into a passing production claim.

Production rollback remains independent from task closure: disable the affected
feature, route to handoff, preserve audit/evidence, and restore the
last-known-good application/configuration revision.

