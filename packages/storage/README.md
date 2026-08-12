# `@citychatbot/storage`

Server-side private upload contract for CityChatbot. It does not expose a
Supabase client, service key, public bucket or raw object path to a browser.

The package provides:

- canonical opaque `attachments/<tenant>/<resource>/<resource-id>/<attachment-id>.<ext>` keys;
- exact extension/MIME/magic-byte, size and SHA-256 validation;
- conservative image/PDF polyglot checks and OOXML ZIP limits that reject
  traversal, macros, embedded objects, external links and expansion bombs;
- five-minute, HMAC-signed, single-use upload targets bound to tenant and
  resource identifiers;
- a quarantine-first finalization adapter. `UNAVAILABLE` malware scans stay
  `QUARANTINED`; only a clean scan can produce `READY`.

Provider adapters must call this contract after verified tenant/citizen or
staff authorization and must keep the bucket private. No upload may enter an
active knowledge index directly.
