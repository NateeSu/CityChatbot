# P3-ADM-002 — Complaint detail, assignment, status, notes and public updates

Status: DONE (MVP Fast-Track auto-approved)

## Traceability

- Requirements: `RF-01`, `RF-04`, `RF-06`, `RF-10`, `RF-14`
- Authoritative sections: `fullspec.md` §8.2–§8.3, §13.5 admin complaint API inventory, Screen `A-25`, `SPEC-MVP-001`
- Prerequisites verified: `P3-ADM-001`, `P3-CMP-003`

## Delivered files

- `packages/complaints/src/complaint.ts` — assignment mutation, admin mutation idempotency, audit trail, attachment internal projection, public-update outbox, and optimistic version conflict behavior.
- `packages/complaints/src/admin.ts` — A-25 safe detail projection, role/department access, action matrix, assignment/forward/transition/comment service boundaries.
- `packages/complaints/src/admin.test.ts` — detail redaction, audit/public-private outbox, scope and stale-version contracts.
- `apps/web/app/api/v1/admin/complaints/context.ts`, `errors.ts` — local identity boundary, actor mapping, canonical error/If-Match/Idempotency-Key parsing.
- `apps/web/app/api/v1/admin/complaints/[id]/route.ts` — detail endpoint.
- `apps/web/app/api/v1/admin/complaints/[id]/{assign,forward,transitions,internal-notes,public-updates}/route.ts` — canonical mutation endpoints with fail-closed production behavior.
- `apps/web/app/admin/complaints/[id]/page.tsx`, `AdminComplaintDetail.tsx`, `admin-complaint-detail.css` — A-25 responsive detail workspace and recovery states.
- `apps/web/app/admin/complaints/AdminComplaintInbox.tsx` — complaint numbers now link to A-25.
- `plan.md` — task marked DONE and next executable task opened.

## Commands and actual results

- `pnpm exec vitest run packages/complaints/src/admin.test.ts packages/complaints/src/complaint.test.ts --reporter=verbose` — PASS; `22/22`.
- `pnpm test:all` — PASS; 17 test files, `119/119` unit tests, lint, web/package typecheck, DB/RLS static tests `15/15`, secret scan and Next production build.
- `pnpm install --frozen-lockfile` — PASS; all 10 workspaces up to date.
- `python -m unittest discover -s scripts -p "test_*.py" -v` — PASS; `28/28`.
- `pnpm audit --prod --audit-level=high` — PASS; no known vulnerabilities.
- `pnpm security:sbom` — PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`.
- `pnpm release:manifest` / `pnpm release:verify` — PASS; digest `07300ceaa6a77840948e9efdee0b56c01e1852c15b8e5acd4bac19036d78e484`.

## API and browser evidence

Local synthetic tenant/account was used; no production credential was guessed or stored.

- `GET /api/v1/admin/complaints/{id}` returned the A-25 projection with description, safe location, attachment state, canonical timeline, comments, audit trail, row version, allowed transitions and permissions. It did not serialize `lineUserId`, encrypted phone or actor IDs.
- `POST /internal-notes` through the detail UI added a private comment and incremented row version; no `complaint.public_update_added` event was emitted.
- `POST /public-updates` through the detail UI added a public comment, audit action `PUBLIC_UPDATE_ADDED`, incremented row version and emitted one canonical `complaint.public_update_added` outbox event.
- A stale `POST /public-updates` with `If-Match: "4"` returned `409 VERSION_CONFLICT` with current version `6` and current status `IN_PROGRESS`; no last-write-wins occurred.
- A `STAFF` attempt to call `POST /assign` returned `403 FORBIDDEN`; no mutation happened.
- Assignment, transition and composer requests include both `If-Match`/`expectedVersion` and `Idempotency-Key`; domain replay returns the original result and does not duplicate audit/outbox side effects.
- Desktop A-25 loaded with timeline, assignment form, status form, separate private/public composers and audit trail; browser error logs were empty.
- Mobile 390×844 rendered the single-column workspace with no horizontal overflow (`bodyWidth=375.2`, `scrollWidth=375`); light, dark and high-contrast themes were exercised and browser error logs remained empty.

Representative mutation request:

```http
POST /api/v1/admin/complaints/<id>/public-updates?tenantId=<tenant>&accountId=<account>&role=TENANT_ADMIN
If-Match: "6"
Idempotency-Key: public-update-001
Content-Type: application/json

{"expectedVersion":6,"body":"เจ้าหน้าที่กำลังดำเนินการตรวจสอบให้คุณ"}
```

Representative conflict response:

```json
{
  "error": {
    "reasonCode": "VERSION_CONFLICT",
    "message": "ข้อมูลเรื่องนี้ถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนลองใหม่"
  },
  "current": {
    "canonicalStatus": "IN_PROGRESS",
    "rowVersion": 6
  }
}
```

## Acceptance criteria

- [x] Detail workspace exposes only staff-safe fields and never citizen identity/phone/storage path.
- [x] Assignment/reassignment/forwarding is role and department scoped, version checked, idempotent and audited.
- [x] Canonical transitions use the full domain matrix and reject invalid transitions.
- [x] Internal note is private and produces zero citizen notification event.
- [x] Public update is visibly separate, auditable and creates a notification outbox event.
- [x] Stale concurrent mutation returns 409 with safe current summary; last-write-wins is not used.
- [x] Attachments preserve quarantine state; only READY attachment URLs can be opened.
- [x] Loading, error, permission-safe, offline and conflict recovery states are present; responsive and theme QA passed.

## Rollback

1. Disable admin mutation feature flags or route-guard the five POST endpoints; keep GET detail read-only.
2. Revert the A-25 UI to read-only if mutation rendering regresses; do not delete complaint timeline, comments, audit or outbox rows.
3. Pause public-update notification consumption while retaining outbox rows for replay/reconciliation.
4. Re-run `pnpm test:all`, release manifest generation and verification before re-enabling mutations.

## Known limitations / follow-up

- API adapters still use the deterministic in-memory repository in local/test; production Supabase transaction/RLS wiring and real staff session claims remain integration work.
- Notification provider delivery/retry/templates are `P3-NOTIF-001`; this task proves transactional outbox intent, not provider delivery.
- SLA due dates are explicitly not invented; `P3-SLA-001` is next.
- Duplicate decisions, real map cluster and attachment malware scanning are separate follow-up tasks.
