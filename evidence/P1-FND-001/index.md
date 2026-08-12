# Evidence — P1-FND-001

สถานะ: `DONE — AUTO_APPROVED_FOR_MVP`

## Requirement IDs

- `RF-13` Security and secret boundary
- `RF-16` Testability and release evidence
- `RF-17` Architecture and engineering foundation
- `SPEC-MVP-001` L1 Unit Test Fast-Track
- `TEST-MVP-001` MVP unit-test release gate

## Scope

สร้าง production web foundation แบบ workspace monorepo โดยแยก `apps/web` ออกจาก `gui-prototype` ซึ่งยังเป็น visual reference เดิม ไม่ import mock production data หรือ credential จริง

## Files changed

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `.node-version`, `.env.example`
- `.github/pull_request_template.md`
- `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/src/env.ts`, `packages/config/src/env.test.ts`
- `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/next-env.d.ts`, `apps/web/eslint.config.mjs`
- `apps/web/app/layout.tsx`, `globals.css`, `page.tsx`, `loading.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, `robots.ts`, `api/health/route.ts`
- `apps/web/.env.example`, `apps/web/README.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`

## Acceptance results

| Criterion | Result |
|---|---|
| Next.js App Router + strict TypeScript | PASS — Next.js 16.3.0; `tsc --noEmit` passed |
| Reproducible package install | PASS — `pnpm install --frozen-lockfile` |
| Environment validation and fail-fast production URL check | PASS — 4 Vitest tests |
| No hard-coded tenant/model/secret | PASS — tenant/model are optional env values; token scan clean |
| Module boundary | PASS — environment access exists only in `packages/config/src/env.ts`; app imports package contract |
| Health route | PASS — HTTP 200 `{"status":"ok","service":"web","environment":"local"}` |
| Production build | PASS — `next build` completed; routes `/`, `/api/health`, `/_not-found`, `/robots.txt` |
| Lint and unit test | PASS — ESLint clean; 4 Vitest tests passed |
| Dependency audit | PASS — no known high vulnerabilities (`pnpm audit --prod --audit-level=high`) |
| Browser desktop smoke | PASS — title/H1 correct, console warnings/errors = 0, no overflow |
| Browser mobile smoke | PASS — 390×844, no horizontal overflow |

## Commands and actual results

```text
pnpm install --frozen-lockfile
Already up to date

pnpm test:all
pnpm lint                         PASS
pnpm typecheck                    PASS
pnpm test:unit                    PASS — 1 file, 4 tests
pnpm build                        PASS — Next.js 16.3.0

python -m unittest discover -s scripts -p 'test_*.py' -q
Ran 11 tests ... OK

pnpm audit --prod --audit-level=high
No known vulnerabilities found

OPENROUTER_TOKEN_SCAN_CLEAN
```

## Automatic MVP approval

ตาม `SPEC-MVP-001`, `P1-FND-001` ถูก auto-approved หลัง unit tests ของ scope ผ่านครบและ evidence นี้ถูกสร้าง โดยไม่รอ manual approver หรือ post-production hardening. การ auto-approval นี้เป็นสถานะ MVP ตาม revision ปัจจุบันของ `fullspec.md`/`plan.md` ไม่ใช่การอ้างว่า full certification ผ่าน

## Rollback procedure

1. ปิด route/feature ของ `apps/web` และหยุด deploy artifact ล่าสุด
2. restore `package.json`, workspace manifest, lockfile และ app foundation ไป revision ก่อน Task นี้
3. re-run `pnpm install --frozen-lockfile`, `pnpm test:all` และ health/browser smoke ก่อนเปิด artifact ก่อนหน้า
4. ไม่ลบ `gui-prototype` หรือ corpus/evidence baseline เดิม

## Known limitations

- ยังไม่มี database, Supabase Auth/RLS, LINE, OpenRouter call, complaint workflow หรือ production credentials; งานเหล่านี้อยู่ใน Task ถัดไป
- local workspace ยังไม่มี `.git` และ GitHub remote ที่ให้ไว้ยังว่าง จึงไม่มี commit SHA สำหรับ evidence; ใช้ lockfile, package versions และ artifact/test output เป็น revision evidence ชั่วคราว
- `apps/web/AGENTS.md` และ `CLAUDE.md` ถูกสร้างโดย Next.js 16 เพื่อบันทึก framework instructions
