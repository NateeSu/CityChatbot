# Evidence — P2-GATE

Status: `DONE — AUTO_APPROVED_FOR_MVP_SERVER_SLICE`

Date: 2026-08-10

## Gate rule

Under `SPEC-MVP-001` in `fullspec.md`, green L1 unit tests are the only
condition required to pass a phase/release gate for MVP. Static, integration,
RLS, E2E, UAT, accessibility, resilience and manual approval remain tracked
quality work and are not release blockers unless a technical deployment
dependency makes deployment impossible.

## P2 L1 scope

The executable P2 server scope is LINE channel lifecycle, webhook verification,
messaging delivery, LIFF token verification and LIFF session security. The
Rich Menu/UI/E2E tasks remain explicitly `BLOCKED` in `plan.md` because
`P1-UI-001`/`P0-UX-001` visual authority is not available; those features must
remain behind flags and LINE text fallback remains available.

## Commands and actual results

| Command / check | Result |
|---|---|
| `pnpm exec vitest run packages/line/src/channel.test.ts packages/line/src/webhook.test.ts packages/line/src/messaging.test.ts packages/liff/src/liff.test.ts packages/liff/src/line-provider.test.ts` | **PASS** — 5 files, 45 tests |
| `pnpm test:all` | **PASS** — Vitest 14 files/90 tests, DB/RLS 10/10, lint, typecheck, secret scan and production build |
| `pnpm install --frozen-lockfile` | **PASS** — 9 workspace projects |
| `pnpm audit --prod --audit-level=high` | **PASS** — no known vulnerabilities found |
| `pnpm security:scan` | **PASS** — `SECRET_SCAN_CLEAN` |
| `python -m unittest discover -s scripts -p 'test_*.py' -v` | **PASS** — 23 tests |
| `pnpm release:verify` | **PASS** — manifest digest `933d4822be7ca6fef18f8001cb4e3e584de80e818a89a94e034ace0dd27d22f1` |

## Acceptance criteria

- [x] All executable P2 L1 unit tests are green (45/45).
- [x] LINE/LIFF server slice has evidence links for each completed task.
- [x] P2 proceeds to P3 under the amended MVP auto-approval rule.
- [x] Rich Menu/UI/E2E dependencies are not falsely marked complete; they are
      blocked and remain feature-flagged/off until the visual dependency is
      resolved.
- [x] No production credential, token or external LINE session was required
      to pass this L1 gate.

## Rollback procedure

Keep LINE/LIFF server features behind per-tenant flags, disable the affected
slice, redeploy the previous verified artifact, revoke LIFF sessions if the
identity surface is suspect, and retain webhook/delivery records for replay.
Re-enable only after the P2 combined unit suite is green again.

## Known limitations / follow-up

- This is an MVP server-slice gate, not a claim that blocked Rich Menu/UI/E2E
  tasks are complete.
- Supabase durable LIFF/session/line-user persistence and real LINE sandbox
  E2E require the future configured external integration.

P2 may now advance to the next executable P3 task while the blocked P2 tasks
remain visible in the authoritative plan.
