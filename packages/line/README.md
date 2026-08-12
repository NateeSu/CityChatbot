# `@citychatbot/line`

Provider-neutral LINE channel configuration contract. It keeps channel secret
and access token ciphertext server-side, stores only an HMAC of the unguessable
webhook key, resolves channel → tenant from that key, and returns a masked
public view. Credential rotation stages and validates a new version before
activation, retaining the previous version for rollback.

The provider validator is an adapter boundary. A real LINE credential is never
required by unit tests and must be supplied only to the server principal from
the configured secret/database boundary.
