# Evidence — P0-UX-001

สถานะ: `DONE` (2026-08-11, auto-approved under `SPEC-MVP-001` after GUI unit/inventory checks and prototype lint/build passed)

ขอบเขตการอนุมัติ MVP: automated design baseline และ prototype build ผ่านครบตามที่ตรวจได้ใน repository แล้ว ส่วน external usability study, Rich Menu safe-area review และ UX/PO/UAT/QA sign-off ยังเป็น post-production follow-up ตาม fast-track rule และไม่ถูกอ้างว่าเสร็จใน evidence นี้

## Requirement IDs

- `RF-01` UX, responsive behavior, states and accessibility
- `RF-02` theme tokens/light/dark/high-contrast
- `RF-05` LINE/Rich Menu/citizen surfaces
- `RF-10` back office and role-aware screen coverage
- `RF-16` QA/visual/accessibility evidence
- `fullspec.md §7`, `§15`, `§16`
- `plan.md Appendix F`

## Files changed

- `scripts/audit_gui_inventory.py`
- `scripts/test_gui_inventory.py`
- `docs/ux/README.md`
- `docs/ux/page-state-inventory.json`
- `evidence/P0-UX-001/screenshots/a20-empty-desktop.png`
- `evidence/P0-UX-001/screenshots/c09-ready-mobile.png`
- `evidence/P0-UX-001/screenshots/c03-error-contrast-mobile.png`
- `plan.md`

## Commands and actual results

```text
python scripts/audit_gui_inventory.py --root . --output docs/ux/page-state-inventory.json
GUI_INVENTORY_WRITTEN docs\ux\page-state-inventory.json
SCREEN_COUNT 41
AUTOMATED_CHECKS_PASS True
EXTERNAL_ACCEPTANCE BLOCKED_PENDING_EXTERNAL_UAT

python -m unittest scripts.test_gui_inventory -v
Ran 4 tests ... OK

pnpm --dir gui-prototype lint
exit 0

pnpm --dir gui-prototype build
Vite transformed 1,592 modules
exit 0

python -m unittest discover -s scripts -p 'test_*.py' -v
Ran 11 tests ... OK

python -m compileall -q scripts
exit 0

cd gui-prototype
pnpm lint
LINT_EXIT=0
pnpm build
BUILD_EXIT=0
Vite transformed 1,592 modules
```

## Automated inventory acceptance

| Acceptance criterion | Result |
|---|---|
| All canonical Screen IDs `RM-01`, `CHAT-01..04`, `C-*`, `A-*`, `S-*` present exactly 41 | PASS |
| Manifest IDs unique and in canonical order | PASS |
| Every screen has concept asset | PASS |
| Every screen has at least one `gui-designs/screens/*.png` reference | PASS |
| Every screen has prototype source occurrence | PASS |
| Manifest state coverage includes `ready/loading/empty/error` | PASS |
| Manifest roles and mobile/tablet/desktop coverage present | PASS |
| Required viewport matrix recorded: 320/360/390/480/768/834/1024/1440 | PASS (inventory) |
| Required themes recorded: light/dark/contrast | PASS (inventory) |
| Production state matrix includes permission/expired/offline/stale/conflict/feature-disabled | PASS (inventory warning; implementation validation remains) |
| Rich Menu safe-area acceptance has invented dimensions | PASS — no dimensions invented; acceptance remains required |
| External task-based usability study, at least 5 participants/persona | DEFERRED — participant records absent; post-production follow-up under `SPEC-MVP-001` |
| UX/PO/UAT/QA approval | DEFERRED — approval records absent; not part of the MVP auto-approval boundary |

## Browser QA evidence

Target flow: app loads → catalog renders → theme/search/state controls respond → representative desktop/mobile screens render without console errors or horizontal overflow.

Environment: `http://127.0.0.1:4173`, Codex In-app Browser, explicit viewports 1440×900 and 390×844.

| Check | Result | Actual evidence |
|---|---|---|
| Page identity/catalog | PASS | URL `/catalog`, title `CityChatbot GUI Reference` |
| Not blank/framework overlay | PASS | meaningful catalog DOM and representative screen DOM; no overlay |
| Console health | PASS | 0 warning/error entries in catalog, A-20, C-09 and C-03 flows |
| Catalog interaction | PASS | clicked `สว่าง` → `data-theme=light`; selected `ไม่มีข้อมูล`; searched `A-20` → A-20 remained and A-10 was hidden |
| A-20 empty state | PASS | `ยังไม่มีข้อมูลเรื่องร้องเรียน`, retry/return action present, `lang=th`, no unlabeled buttons/images without alt |
| C-09 ready mobile | PASS | public timeline/next step rendered; `scrollWidth=375`, `clientWidth=375` |
| C-03 error/high contrast mobile | PASS | alert and `ลองอีกครั้ง` rendered; `scrollWidth=390`, `clientWidth=390`, `data-theme=contrast` |

Screenshots:

- [A-20 empty desktop](./screenshots/a20-empty-desktop.png)
- [C-09 ready mobile](./screenshots/c09-ready-mobile.png)
- [C-03 error/high-contrast mobile](./screenshots/c03-error-contrast-mobile.png)

## Rollback procedure

1. Restore the prior approved UX inventory/reference artifact; do not mutate a published baseline in place.
2. Revert only the inventory/evidence change if it contains an incorrect mapping; prototype source and visual references remain untouched.
3. Hide any route/theme/state that lacks approved baseline behind its feature flag; serve the last approved shell.
4. Re-run inventory, browser smoke and visual/a11y checks before using a revised baseline.

## Known limitations / blocker resolution

- Prototype coverage is not production implementation; the inventory explicitly flags the additional product states that still require implementation tests.
- Browser smoke is not a full WCAG 2.2 AA audit, screen-reader certification, 200% text/reflow matrix or all eight viewport certification.
- External usability sessions (at least 5 participants per persona), task completion results, Rich Menu safe-area review, and UX/PO/UAT/QA signatures remain post-production follow-up; they do not invalidate this MVP Task completion under `SPEC-MVP-001`.
- Production implementation must still consume this inventory and implement the full product-state matrix; the prototype is not a production data source.
- Next executable task: `P1-UI-001`, because its prerequisites `P0-UX-001` and `P1-FND-001` are now complete.
