# P3-CMP-003 Evidence — citizen complaint tracking

## Status

- Task: `P3-CMP-003`
- Status: `DONE (MVP Fast-Track auto-approved)`
- Completed: `2026-08-10`
- Approval rule: `SPEC-MVP-001` — L1 unit tests are the MVP phase/release gate; non-blocking downstream checks remain follow-up unless they are technical deployment blockers.
- Requirement IDs: `RF-01`, `RF-04`, `RF-06`, `RF-14`
- Authoritative sections: `fullspec.md` §7.3, §13.2, §13.5; `plan.md` P3-CMP-003.

## Delivered files

- `packages/complaints/src/complaint.ts` — public citizen tracking projection, human status labels/next-step text, cursor pagination/filtering, public-only timeline/comments/attachments, additional-information transition and idempotency, one-time eligible survey and idempotency.
- `packages/complaints/src/complaint.test.ts` — 15 unit tests including pagination/tenant isolation, additional-info replay/concurrency path, survey eligibility/once-only behavior and public allowlist privacy snapshot.
- `apps/web/app/api/v1/citizen/complaints/repository.ts` — shared local/test repository and synthetic identity gate.
- `apps/web/app/api/v1/citizen/complaints/route.ts` — canonical `GET` list and existing `POST` create endpoint.
- `apps/web/app/api/v1/citizen/complaints/[id]/route.ts` — canonical public detail endpoint.
- `apps/web/app/api/v1/citizen/complaints/[id]/messages/route.ts` — additional-information endpoint.
- `apps/web/app/api/v1/citizen/complaints/[id]/surveys/route.ts` — survey endpoint.
- `apps/web/app/liff/complaints/ComplaintTracking.tsx`, `tracking.css`, `tracking-config.ts` — C-08/C-09/C-10 UI with loading, empty, error, offline, session-expired, retry, public timeline, location/media, additional info and survey states.
- `apps/web/app/liff/complaints/page.tsx`, `[id]/page.tsx`, `[id]/additional-info/page.tsx` — canonical LIFF routes.
- `plan.md` — task status and traceability.

## Commands and actual results

| Command | Result |
| --- | --- |
| `pnpm test:all` | PASS — 16 files, **112/112** unit tests; lint, web typecheck, package typecheck, 15 DB contract tests, secret scan and production build passed |
| `pnpm install --frozen-lockfile` | PASS — all 10 workspace projects up to date |
| `pnpm audit --prod --audit-level=high` | PASS — no known vulnerabilities |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | PASS — **28/28** |
| `pnpm security:sbom` | PASS — 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest; pnpm release:verify` | PASS — digest `1278c826e4d5521e692bfe57fef351099d70cae3dfd59a1a18d46ed9cdfd7966` |

## Acceptance evidence

- List is tenant + citizen scoped, supports `ALL`/`ACTIVE`/`CLOSED` filters, cursor pagination and generic not-found behavior for an unauthorized identity or guessed complaint ID.
- Detail uses a strict public projection: no description, line user ID, tenant ID, actor ID/type, internal visibility, internal notes, encrypted phone, AI reasoning or raw storage path. Only `READY` public attachment metadata is serialized.
- Public timeline exposes status labels and timestamps only. The current next step and request-for-information are derived from canonical status; a resolved citizen message clears the active request state.
- Additional information is `PUBLIC` citizen information, requires ownership, uses stable `Idempotency-Key`, records a public comment, transitions `WAITING_FOR_CITIZEN → IN_PROGRESS`, and safely replays without a duplicate message/status event.
- Survey is eligible only for `RESOLVED`/`CLOSED`, rating is 1–5, the database-aligned repository enforces one survey per tenant/complaint/citizen, and same-key retry replays.
- Browser QA on `http://127.0.0.1:3100`: empty list state rendered; a wizard submission returned synthetic receipt `CCM-2569-000001`; list card opened detail; public timeline and location/media-empty tab rendered; the browser console returned `[]` for error/warn logs.
- Responsive QA at `390×844`: `innerWidth=390`, `scrollWidth=390`, `bodyWidth=390`, `scrollY=0`; no unintended horizontal overflow. Keyboard/semantic snapshot showed headings, tabs, textbox, links, buttons and navigation labels.
- `fullspec.md` production boundary is respected: local/test synthetic repository is explicitly marked, while production API routes return `CONFIGURATION_UNAVAILABLE` until verified LIFF identity and durable Supabase repositories are configured.

## API examples

```http
GET /api/v1/citizen/complaints?tenantId=<tenant>&lineUserId=<line-user>&status=ACTIVE&limit=20
```

```json
{
  "items": [{
    "id": "<uuid>", "complaintNo": "CCM-2569-000001",
    "title": "ถนนชำรุด", "canonicalStatus": "RECEIVED",
    "statusLabel": "รับเรื่องแล้ว", "publicTimeline": [],
    "publicAttachments": [], "nextExpectedStep": "เจ้าหน้าที่จะตรวจสอบข้อมูลและส่งต่อหน่วยงานที่เกี่ยวข้อง",
    "survey": { "eligible": false, "submitted": false }, "publicComments": []
  }]
}
```

```http
POST /api/v1/citizen/complaints/<id>/messages
Idempotency-Key: <stable-request-id>
Content-Type: application/json

{ "tenantId": "<tenant>", "lineUserId": "<line-user>", "body": "ส่งข้อมูลเพิ่มเติม" }
```

```http
POST /api/v1/citizen/complaints/<id>/surveys
Idempotency-Key: <stable-request-id>
Content-Type: application/json

{ "tenantId": "<tenant>", "lineUserId": "<line-user>", "rating": 5, "comment": "ขอบคุณ" }
```

## Rollback

1. Disable the add-information and survey UI flags/routes independently; read-only tracking remains available.
2. If a public projection defect is detected, disable the affected response field/route and retain the allowlisted baseline detail/list response.
3. Roll back the web release to the prior form/tracking version; do not delete complaint timeline, comments or survey rows.
4. In production, keep the new endpoints fail-closed until the verified LIFF session, Supabase repository and RLS-backed public queries are deployed.

## Known limitations / follow-up

- The repository used by the new API slice is local/test synthetic only; durable Supabase queries, verified LIFF session extraction and production RLS integration remain deployment work.
- Attachment upload/complete, signed media delivery and malware scanning are not enabled by this task; only the existing wizard quarantine metadata and `READY` public allowlist are represented.
- There is no staff mutation screen in this task to produce `WAITING_FOR_CITIZEN` or `CLOSED` state interactively; domain unit tests cover additional-info and survey state transitions. Staff workspace is P3-ADM-001/P3-ADM-002.
