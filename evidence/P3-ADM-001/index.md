# P3-ADM-001 — Complaint list / inbox / search / filter / map view

Status: DONE (MVP Fast-Track auto-approved)

## Traceability

- Requirements: `RF-01`, `RF-04`, `RF-06`, `RF-10`
- Authoritative sections: `fullspec.md` §4.3, §13.3, §13.5, §15.6–§15.7, Screen A-20, `SPEC-MVP-001`
- Prerequisites verified: `P3-CMP-001`, `P1-IAM-001`

## Delivered files

- `packages/complaints/src/admin.ts` — tenant/department/personal queue scope, allowlisted filters and sort, cursor pagination, stable `id` tie-breaker, safe staff projection and non-invented SLA state.
- `packages/complaints/src/admin.test.ts` — four unit contracts for scope, queue, pagination, filter validation, facets and redaction.
- `apps/web/app/api/v1/admin/complaints/route.ts` — fail-closed production boundary and local/test API adapter; invalid status/priority/sort/queue values return canonical validation errors instead of being silently ignored.
- `apps/web/app/api/v1/admin/complaints/repository.ts` — deterministic synthetic local fixtures only.
- `apps/web/app/admin/complaints/AdminComplaintInbox.tsx`, `admin-complaints.css`, `page.tsx` — accessible A-20 inbox with table/mobile cards, search, status/priority/queue/sort filters, URL parity, saved session views, selection, loading/empty/filtered-empty/error/offline/permission-safe states, theme modes and map fallback.
- `plan.md` — task status and next executable task updated.

## Commands and actual results

- `pnpm install --frozen-lockfile` — PASS; all 10 workspace projects up to date.
- `pnpm test:all` — PASS; 17 test files, `116/116` unit tests, lint, web/package typecheck, DB/RLS static tests `15/15`, secret scan and Next production build.
- `pnpm exec vitest run packages/complaints/src/admin.test.ts packages/complaints/src/complaint.test.ts --reporter=verbose` — PASS; `19/19`.
- `pnpm --filter @citychatbot/web typecheck` — PASS.
- `pnpm --filter @citychatbot/web lint` — PASS.
- `python -m unittest discover -s scripts -p "test_*.py" -v` — PASS; `28/28`.
- `pnpm audit --prod --audit-level=high` — PASS; no known vulnerabilities.
- `pnpm security:sbom` — PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a`.
- `pnpm release:manifest` / `pnpm release:verify` — PASS; digest `d44da912f23982f5c5541680e88ba4a2695e15a372dc121d772904045d7fa3e7`.

## Browser and API evidence

Local browser QA used the deterministic synthetic tenant at `/admin/complaints`.

- Desktop 1440×900: table rendered five authorized rows, no horizontal overflow (`bodyWidth=1425`, `scrollWidth=1425`), and no browser error logs.
- Mobile 390×844: mobile cards rendered five rows, table was hidden, `bodyWidth=375.2`, `scrollWidth=375`, and no horizontal overflow or browser error logs.
- Search `ขยะ`: URL included `search=ขยะ` and exactly `CCM-2569-000003` remained.
- Sort `PRIORITY_DESC`: URL/API contract accepted the allowlisted sort and urgent rows were ordered first.
- Map toggle: rendered an explicit accessible fallback saying the map layer is disabled in MVP; no unsafe location data was fabricated.
- Selection: complaint checkbox became checked through the accessible role selector; bulk actions stayed disabled until selection.
- Theme toggle: light, dark and high-contrast modes were exercised in the existing browser QA.

Representative request:

```http
GET /api/v1/admin/complaints?tenantId=<tenant>&accountId=<account>&role=TENANT_ADMIN&queue=DEPARTMENT&status=ALL&priority=ALL&sort=UPDATED_DESC&limit=25
```

Representative response shape:

```json
{
  "items": [{
    "id": "<complaint-id>",
    "complaintNo": "CCM-2569-000001",
    "title": "ไฟฟ้าส่องสว่างดับ บริเวณหน้าหมู่บ้านสุขสันต์",
    "canonicalStatus": "IN_PROGRESS",
    "statusLabel": "กำลังดำเนินการ",
    "priority": "URGENT",
    "departmentName": "กองช่าง",
    "assignedToCurrentUser": false,
    "hasAssignee": true,
    "createdAt": "<iso-8601>",
    "updatedAt": "<iso-8601>",
    "sla": { "state": "NOT_CONFIGURED" }
  }],
  "hasMore": false,
  "facets": { "total": 5, "active": 4, "closed": 1, "urgent": 1 }
}
```

The projection intentionally excludes description, phone, LINE identity, internal notes, actor IDs and tenant-internal identifiers. Facets are calculated only after tenant and role scope. Production requests fail closed until a verified staff session and repository adapter are wired.

## Acceptance criteria

- [x] Staff-safe complaint list with department, personal and tenant-admin queues.
- [x] Search, status, priority, department, allowlisted sort and cursor pagination share one domain contract across API and UI URL state.
- [x] Invalid filter values are rejected; unauthorized tenant/queue scope cannot expose rows or counts.
- [x] Priority and SLA indicators are shown without inventing an SLA; unconfigured SLA is explicitly labelled.
- [x] Desktop table, tablet collapse and mobile priority cards are keyboard reachable and have visible focus states.
- [x] Loading, empty, filtered-empty, error/retry, offline, permission-safe and map fallback states are present.
- [x] Fast-track exit is satisfied by the green L1 suite and evidence; remaining production integration is tracked as a limitation rather than claimed as complete.

## Rollback

1. Disable or route-guard `/admin/complaints` and `/api/v1/admin/complaints` with the existing fail-closed response.
2. Hide map/advanced filters and keep the read-only basic list if the UI adapter regresses.
3. Revert only the P3-ADM-001 files in the release artifact, preserving complaint records and audit/outbox history.
4. Re-run `pnpm test:all`, `pnpm release:manifest` and `pnpm release:verify` before re-enabling the slice.

## Known limitations / follow-up

- The local adapter uses in-memory deterministic fixtures; production Supabase query/RLS/session integration is not enabled in this task.
- SLA due dates and escalation are intentionally not calculated until `P3-SLA-001`.
- Map clustering and real location rendering remain behind the MVP-safe fallback.
- Complaint detail, assignment, mutation, notes, audit display and public updates are the next task `P3-ADM-002`.
- Saved views are session-only until a governed persistence task is delivered.
