# `@citychatbot/authz`

This package is a server-side authorization contract for the CityChatbot staff
surface. It must run after the authentication provider has verified the session
and the server has loaded the current account/membership/role/department and
support-grant rows from the database.

Call `buildTrustedSessionContext` with verified claims plus the current database
snapshot, then call `authorize` or `assertAuthorized` for every protected
action. Do not pass browser-supplied `tenant_id`, role, department, or grant
data as the snapshot. Denials use only the canonical API codes
`UNAUTHENTICATED` and `FORBIDDEN`; callers can persist
`toAuthorizationAuditRecord` to `audit_logs` without logging tokens or PII.

The matrix is explicit. Tenant Admin/Super Admin require MFA, sensitive reads
can require recent re-authentication, and Super Admin tenant access requires a
live JIT support grant. There is no client-side authorization shortcut.
