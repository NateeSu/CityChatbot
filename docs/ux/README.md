# UX/page-state baseline

`page-state-inventory.json` is a machine-readable baseline for all 41 canonical
Screen IDs. It checks the manifest against prototype source occurrences,
concept assets and rendered screen references. It also records the product-wide
viewport/theme/state matrix required by `fullspec.md` and `plan.md`.

Generate and verify the baseline:

```powershell
python scripts/audit_gui_inventory.py --root . --output docs/ux/page-state-inventory.json
python -m unittest scripts/test_gui_inventory.py -v
```

The prototype's four query states (`ready`, `loading`, `empty`, `error`) are
reference behavior only. Production still needs permission, expired-session,
offline, stale, optimistic-conflict and feature-disabled states. External
task-based usability testing and approval remain post-production follow-up;
under `SPEC-MVP-001` they do not block MVP auto-approval after the automated
baseline and UI unit checks pass.
