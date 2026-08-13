# P6-GATE Evidence

สถานะ: **DONE (2026-08-11, MVP Unit-Test Fast-Track condition passed)**

Gate condition from `plan.md`: P6 L1 unit test scope passes 100%. Under the
current `SPEC-AUTO-001` policy, every declared P6 Task is closed automatically
when its unit manifest is green. Visual/accessibility, external UAT and factual
knowledge activation remain operational follow-up, not blocked Task state.

## Requirement / scope

- `RF-16` QA gate and `SPEC-MVP-001` automatic approval rule.
- P6 deliverables exercised by the current unit scope: admin shell/content slices, tenant provisioning, audit/notification/export controls and their security/tenant invariants.
- Gate allows P7 and later production work under the plan’s explicit wording;
  P6 unit-gated implementation is complete. The production knowledge index
  remains safely empty because the supplied corpus is quarantined.

## Commands and actual results

- `pnpm test:all` — **PASS**, exit code 0.
  - L1: `45` test files / `296` tests passed.
  - Static/database/API/UI: `162/162` tests passed.
  - lint, web typecheck, package typecheck, secret scan (`SECRET_SCAN_CLEAN`) and production build passed.
- Local PostgreSQL audit migration and SQL contract — **PASS** with `ON_ERROR_STOP=1`.
- `node scripts/audit_operations_smoke.mjs` — **PASS**: audit integrity, no-step-up denial, unauthorized export denial, notification read, export replay, CSV download, jobs route, wrong-tenant non-disclosure and A-97 pages.

## Exit assessment

- L1 unit condition: **PASS 100%**.
- No P0/P1 defect introduced by the P6-AUD implementation was observed in the executed suite.
- `P6-QA-001`: **PASS (AUTO_CLOSED_UNIT_GREEN)**; additional device/visual
  observation is non-blocking telemetry.
- `P6-KB-001`: **PASS (AUTO_CLOSED_UNIT_GREEN)**; active Knowledge mutation
  remains closed until the governed corpus has eligible, approved facts.

## Rollback / limitations

If P7 work exposes a P6 regression, stop deployment of the affected admin/content slice, disable export at the server policy boundary, revoke active export links, restore the previous release manifest and rerun the composite P6 gate. This rollback protects the completed MVP scope; it does not convert external hardening observations into an approval dependency.
