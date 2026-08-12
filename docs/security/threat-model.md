# Security, privacy and data-flow baseline

This is the deterministic P0 security baseline for `P0-SEC-001`. The machine-readable sources are
[`threat-model.json`](./threat-model.json) and [`data-classification.json`](./data-classification.json).

The trust-boundary flow is:

```text
LINE / LIFF / upload / user text (untrusted)
  -> signature, token, schema, replay and consent checks
  -> tenant-scoped application authorization
  -> Postgres/RLS + private storage + leased outbox jobs
  -> public-only or redacted provider adapter
  -> structured verifier
  -> ANSWER, CLARIFY or HANDOFF; safe fallback on uncertainty
```

Uploads remain quarantined until validation, scanning, parsing, conflict checks and a unit gate complete.
There is no direct LINE citizen-AI consumer in this baseline; citizen AI traffic stays disabled until
`AUTO-CHAT-UNIT` is implemented and passes its own deterministic gate.

Every listed threat has preventive controls, detective controls, an automatic fail-closed mitigation,
and executable unit-test IDs. S0/S1 findings disable or quarantine the affected slice automatically;
they do not wait for a human approval state. Privacy handling is purpose-limited, minimized, auditable,
legal-hold aware and uses synthetic values in development/test.
