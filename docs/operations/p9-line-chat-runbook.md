# LINE chat runtime runbook

## Enablement guard

The runtime is fail-closed unless the database migration, encrypted credential
key, user hash secret, worker secret and active approved public knowledge are
available. A missing dependency leaves the tenant disabled and returns a safe
dependency result; it does not expose provider errors or secrets.

## Probe sequence

1. Send a signed LINE webhook verification request to the dedicated webhook.
2. Send one bounded text event and verify inbox claim, grounded outcome and
   idempotent delivery.
3. Replay the same event and verify no second response is sent.
4. Exercise provider timeout/429/5xx and verify retry/DLQ without losing the
   inbox record.
5. Exercise no evidence, stale source, conflict and injection fixtures and
   verify `CLARIFY` or `HANDOFF`.

## Rollback

Set the tenant feature flag off, keep the webhook persistence boundary active,
route chat traffic to handoff, and run reconciliation before restoring the
last-known-good revision. Never put raw LINE tokens, reply tokens, user IDs or
message content in logs or evidence.

