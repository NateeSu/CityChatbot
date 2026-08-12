# P3-CMP-002 Evidence — LIFF complaint wizard

## Status

- Task: `P3-CMP-002`
- Status: `DONE (MVP Fast-Track auto-approved)`
- Completed: `2026-08-10`
- Approval rule: `SPEC-MVP-001` — L1 unit tests are the MVP phase/release gate; downstream static, integration, UAT, security, performance and production checks remain tracked as non-blocking follow-up unless they are technical deployment blockers.
- Requirement IDs: `RF-01`, `RF-05`, `RF-06`, `RF-13`, `RF-14`
- Authoritative sections: `fullspec.md` §4.5, §5.5, §7.2; `plan.md` P3-CMP-002.

## Delivered files

- `packages/complaints/src/wizard.ts` — browser-safe draft model, step validation, image limits/MIME validation, safe draft snapshot/restore and submit contract.
- `packages/complaints/src/wizard.test.ts` — seven unit tests for category XOR, field limits, attachment policy, location, phone/consent, snapshot privacy and restore fail-closed behavior.
- `packages/complaints/src/index.ts` — exports the wizard contract.
- `apps/web/app/liff/complaints/new/page.tsx` — production configuration gate and local synthetic-only configuration.
- `apps/web/app/liff/complaints/new/ComplaintWizard.tsx` — accessible four-step wizard, client compression/previews, quarantine state, manual/GPS location path, autosave, offline/retry/session recovery and idempotent submit.
- `apps/web/app/liff/complaints/new/complaint-wizard.css` — responsive light/dark/high-contrast layout and focus states.
- `apps/web/app/api/v1/citizen/complaints/route.ts` — local/test contract endpoint; production fails closed with `CONFIGURATION_UNAVAILABLE` until verified LIFF session and durable repository are wired.
- `apps/web/.env.example`, `apps/web/package.json`, `pnpm-lock.yaml` — configuration and workspace dependency wiring.
- `plan.md` — task status and traceability.

## Commands and actual results

| Command | Result |
| --- | --- |
| `pnpm test:all` | PASS — 16 files, **108/108** unit tests; lint, web typecheck, package typecheck, 15 DB contract tests, secret scan and Next production build passed |
| `pnpm install --frozen-lockfile` | PASS — all 10 workspace projects up to date |
| `pnpm audit --prod --audit-level=high` | PASS — no known vulnerabilities |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | PASS — **28/28** |
| `pnpm security:sbom` | PASS — 95 components; digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest; pnpm release:verify` | PASS — digest `250e58a5f168d3d17a9476a1277ca501b9528ee81725d7489004875fc224b683` |

## Acceptance evidence

- Category selection and explicit uncertain-category path enforce an exact XOR; title/detail, phone and consent constraints produce field-level Thai errors.
- Attachments accept only JPEG/PNG/WebP, maximum five files and 10 MB per file; client compression produces previews and every accepted file remains `QUARANTINED` until server-side processing exists. Rejected files are visible with recovery/remove action.
- Location supports manual address/landmark fallback and a user-triggered geolocation path. GPS denial is represented as an actionable error with the manual path retained.
- The draft autosaves only a minimized snapshot (no phone, consent, file bytes or preview URLs); invalid/old snapshots are discarded. Files are explicitly not restored.
- Review cards provide edit actions, submit uses a stable `Idempotency-Key`, loading/offline/error/retry/session-expired states are rendered, and the local/test path returns a trackable receipt (`201` first create, `200` idempotent replay).
- Browser QA on `http://127.0.0.1:3100/liff/complaints/new`: happy path reached the success receipt `CCM-2569-000001`; empty submit showed required-field alerts; manual location and consent path passed; `tab.dev.logs({levels:["error","warn"]})` returned `[]`.
- Responsive QA at `390×844`: `innerWidth=390`, `scrollWidth=375`, `bodyWidth=375`, `scrollY=0`; no unintended horizontal overflow. Light, dark and high-contrast theme toggles were exercised without console errors. A desktop shell screenshot was also captured during the same browser run.
- Production safety: missing production configuration renders a configuration-unavailable state and the API does not accept the local synthetic path in production.

## API example

```http
POST /api/v1/citizen/complaints
Idempotency-Key: <stable-request-id>
Content-Type: application/json

{ "tenantId": "<configured-tenant>", "categoryId": "<configured-category>",
  "title": "ถนนชำรุด", "description": "พบหลุมบนถนน",
  "location": { "text": "หน้าตลาดเทศบาล" },
  "attachments": [], "notifyChannel": "LINE",
  "consentAccepted": true, "consentVersion": "<active-version>" }
```

Local/test response shape:

```json
{ "complaintId": "<uuid>", "complaintNo": "CCM-2569-000001",
  "idempotentReplay": false, "mode": "local-synthetic" }
```

## Rollback

1. Disable the complaint wizard/form-version flag or route exposure.
2. Keep the minimal text/contact intake fallback available.
3. Disable/quarantine the affected upload type if an image-processing defect is found; do not promote quarantined media to an active index.
4. In production, leave the endpoint fail-closed until the durable repository, verified LIFF identity and storage/malware pipeline are configured. No local synthetic records are production data.

## Known limitations / follow-up

- This task intentionally provides only the local/test repository adapter. Durable Supabase complaint creation, verified LIFF identity extraction, signed storage upload, malware scanning and partial-upload cleanup remain integration work in the subsequent complaint tasks.
- Browser geolocation permission was not granted automatically during QA; the manual fallback was verified and no permission was requested without user action.
- `P3-CMP-003` must add citizen list/detail/timeline/additional-info/survey views and public response privacy snapshots before the complete citizen tracking flow is considered delivered.
