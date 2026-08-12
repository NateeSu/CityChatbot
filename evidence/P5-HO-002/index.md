# P5-HO-002 Evidence

Status: DONE (2026-08-11, MVP Fast-Track auto-approved under `SPEC-MVP-001` after L1 unit tests green; external staff UAT remains post-production follow-up)

## Requirements and scope

- Requirement IDs: RF-01 UX, RF-04 IAM, RF-09 HANDOFF, RF-10 ADMIN.
- Canonical scope: A-30 `/admin/support-tickets` queue and A-31 `/admin/support-tickets/{id}` detail, with the fullspec §9.2 ticket state/reason contract preserved.
- The workflow separates Citizen, AI/Bot, Staff and System messages; `PUBLIC` and `INTERNAL` visibility are explicit; an AI draft is never allowed to become a public message.
- The implementation is local/test synthetic only. No production Supabase, LINE, Vercel, OpenRouter or citizen identity was used.

## Changed files

- `packages/support-handoff/src/handoff.ts` — added `addStaffMessage` with staff authorization, public/internal validation, AI-draft guard, safe text boundary, optimistic row-version check, idempotent replay and append-only message/audit mutation.
- `packages/support-handoff/src/handoff.test.ts` — added public reply/internal note, idempotent replay, public AI-draft rejection, stale concurrent reply and unauthorized actor tests; handoff package now has 15 L1 tests.
- `apps/web/package.json`, `pnpm-lock.yaml` — wired the support-handoff workspace package into the web app.
- `apps/web/app/api/v1/admin/support-tickets/repository.ts` — tenant-scoped local fixture store/service, role-aware read model, queue filters, SLA view, evidence/source trace allowlist, permission matrix and response templates.
- `apps/web/app/api/v1/admin/support-tickets/context.ts`, `errors.ts` — local identity boundary, fail-closed role context, canonical error mapping and mutation header/body parsing.
- `apps/web/app/api/v1/admin/support-tickets/route.ts` — A-30 list/filter endpoint.
- `apps/web/app/api/v1/admin/support-tickets/[id]/route.ts` — A-31 detail endpoint.
- `apps/web/app/api/v1/admin/support-tickets/[id]/assign/route.ts` — permission-aware assign/reassign endpoint.
- `apps/web/app/api/v1/admin/support-tickets/[id]/reply/route.ts` — public-preview/internal-note endpoint with idempotency and version checks.
- `apps/web/app/api/v1/admin/support-tickets/[id]/transitions/route.ts` — canonical state-transition endpoint.
- `apps/web/app/admin/support-tickets/page.tsx`, `SupportTicketInbox.tsx`, `support-tickets.css` — responsive A-30 queue, filters, SLA metrics, loading/empty/error/offline/permission/expired-session states, shared theme and keyboard-friendly controls.
- `apps/web/app/admin/support-tickets/[id]/page.tsx`, `SupportTicketDetail.tsx` — A-31 conversation/evidence/timeline/audit, assignment, transition, template/public preview/internal note and mobile/tablet/desktop layout.
- `apps/web/app/admin/complaints/AdminComplaintInbox.tsx` — added navigation entry to the support queue.
- `scripts/test_support_ticket_api.py` — six static route/UI/privacy/permission contract tests.
- `plan.md`, `evidence/progress/2026-08-11.md`, `artifacts/sbom.cdx.json`, `artifacts/release-manifest.json` — status, traceability and release evidence.

## Verification commands and actual results

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/support-handoff/src/handoff.test.ts` | PASS, 15/15 |
| `python -m unittest scripts.test_support_ticket_api -v` | PASS, 6/6 |
| `pnpm --filter @citychatbot/web lint` | PASS |
| `pnpm --filter @citychatbot/web typecheck` | PASS |
| `pnpm --filter @citychatbot/web build` | PASS; A-30/A-31 and five support API routes compiled |
| `pnpm test:all` | PASS, exit code 0; 34 Vitest files, 242/242 L1 unit tests, 114/114 static tests, lint, typecheck, package typecheck, production build and secret scan |
| `pnpm security:sbom` | PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest` and `pnpm release:verify` | PASS; digest `f2a21d33a0a818d21d0e34625e603aa40a8c866e1e036088d839d0f14cb5b4a8` |
| local API smoke on `http://127.0.0.1:3100` | PASS; list 6, detail 200, assign `ASSIGNED`, public reply, transition `IN_PROGRESS` v4, missing preview `400`, internal AI draft 1, replay retained v5, cross-tenant detail `404` |
| local page smoke on `http://127.0.0.1:3100` | PASS; `/admin/support-tickets` 200 and `/admin/support-tickets/{id}` 200 |

## Acceptance criteria

- Queue supports status, priority, queue, SLA, search and sort filters; urgent/near-due/overdue metrics derive from the versioned SLA snapshot.
- A-31 exposes refusal reason, source trace and public retrieval trace labels without serializing `citizenIdentityHash`.
- Staff assignment/reassignment is role-aware; tenant admin can assign across the two synthetic departments, department staff can only read its authorized scope and cannot call assignment without permission.
- Public reply requires an explicit recipient/channel preview confirmation; internal note uses separate visibility; `isAiDraft=true` is accepted only for `INTERNAL`.
- Staff replies use `expectedVersion` and `idempotency-key`; stale concurrent reply returns `VERSION_CONFLICT`, replay does not append a second message, and audit records before/after versions.
- Canonical state transitions are delegated to `SupportHandoffService`; terminal tickets cannot receive a reply and reopen remains explicitly authorized.
- Loading, empty, error, offline, permission and expired-session recovery states are present; controls use labels, semantic headings, links/buttons and visible focus styling; responsive CSS covers the configured desktop/tablet/mobile bands without intentional horizontal overflow.
- Production boundary is fail-closed: every support endpoint returns `CONFIGURATION_UNAVAILABLE` outside local/test synthetic environment and the production page does not render synthetic data.

## API examples

List:

```text
GET /api/v1/admin/support-tickets?tenantId=<tenant>&accountId=<staff>&role=TENANT_ADMIN&queue=TENANT&sort=PRIORITY_DESC
→ 200 { items, facets: { total, urgent, nearDue, overdue }, synthetic: true }
```

Public reply (preview required):

```json
{
  "expectedVersion": 2,
  "body": "เจ้าหน้าที่รับเรื่องแล้วและกำลังตรวจสอบค่ะ",
  "visibility": "PUBLIC",
  "previewConfirmed": true,
  "idempotencyKey": "support-reply-001"
}
```

Internal AI draft is only accepted with `visibility: "INTERNAL"`; stale version returns `VERSION_CONFLICT` and a public reply without preview returns `400`.

## Rollback procedure

1. Hide `/admin/support-tickets` behind the feature flag and keep the existing central/read-only admin queue available.
2. Disable assign/reply/transition mutations at the trusted server boundary; preserve ticket/message/audit history.
3. Remove template actions from the UI while retaining stored messages and the last known ticket state.
4. The local synthetic store can be discarded by restarting the local server; shared/production persistence must use a reviewed forward-only compatibility change after backup verification.
5. Re-run support-handoff unit/static contracts, `pnpm test:all`, the API smoke and release verification before re-enabling.

## Known limitations

- The web repository uses `InMemorySupportHandoffStore` and deterministic synthetic fixtures; the durable Supabase repository/RPC adapter and cross-process authorization are downstream work.
- LINE push, delivery retry/DLQ, citizen continuation and `support.staff_replied` provider delivery are P5-HO-003; the current public reply records the canonical staff message but does not call a production provider.
- FAQ proposal/approval/reindex remains P5-FAQ-001; the detail page intentionally shows a disabled handoff to that workflow and does not auto-learn staff replies.
- External staff UAT, real keyboard/screen-reader matrix, real device visual regression and production credential configuration were not available in this local run; under `SPEC-MVP-001` they are post-production follow-up and do not block this MVP slice.
- P5-GATE and all P6-P9 tasks remain open; this evidence does not claim project completion.

## Traceability

- Plan item: P5-HO-002.
- Screen IDs: A-30, A-31.
- Source contract: `fullspec.md` §9.2, §16.2/§16.3; `plan.md` P5-HO-002.
