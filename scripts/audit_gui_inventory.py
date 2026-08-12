#!/usr/bin/env python3
"""Audit canonical Screen Catalog coverage against the GUI prototype and designs."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "gui-page-state-inventory.v1"
CANONICAL_SCREEN_IDS = [
    "RM-01",
    "CHAT-01",
    "CHAT-02",
    "CHAT-03",
    "CHAT-04",
    "C-01",
    "C-02",
    "C-03",
    "C-04",
    "C-05",
    "C-07",
    "C-08",
    "C-09",
    "C-10",
    "C-13",
    "C-14",
    "C-15",
    "C-16",
    "C-18",
    "C-19",
    "C-20",
    "A-10",
    "A-20",
    "A-25",
    "A-30",
    "A-31",
    "A-40",
    "A-41",
    "A-46",
    "A-47",
    "A-60",
    "A-61",
    "A-70",
    "A-74",
    "A-75",
    "A-80",
    "A-91",
    "A-93",
    "A-97",
    "S-01",
    "S-02",
]
REQUIRED_VIEWPORT_WIDTHS = [320, 360, 390, 480, 768, 834, 1024, 1440]
REQUIRED_THEMES = ["light", "dark", "contrast"]
REQUIRED_STATES = [
    "loading",
    "empty",
    "success",
    "validation_error",
    "server_error",
    "offline_timeout",
    "permission_denied",
    "expired_session",
    "partial_stale",
    "destructive_confirmation",
    "concurrent_update",
    "feature_disabled",
]


def load_manifest(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def prototype_source_text(prototype_root: Path) -> str:
    source_files = sorted((prototype_root / "src").rglob("*.ts")) + sorted(
        (prototype_root / "src").rglob("*.tsx")
    )
    return "\n".join(path.read_text(encoding="utf-8") for path in source_files)


def build_inventory(repo_root: Path) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    prototype_root = repo_root / "gui-prototype"
    designs_root = repo_root / "gui-designs"
    manifest_path = prototype_root / "screen-manifest.json"
    manifest = load_manifest(manifest_path)
    source_text = prototype_source_text(prototype_root)
    screens = []
    for screen in manifest["screens"]:
        screen_id = screen["id"]
        image_prefix = screen_id.lower() + "-"
        reference_images = sorted(
            path.relative_to(repo_root).as_posix()
            for path in (designs_root / "screens").glob("*.png")
            if path.name.lower().startswith(image_prefix)
        )
        concept_path = (manifest_path.parent / screen["concept"]).resolve()
        screens.append(
            {
                "id": screen_id,
                "title": screen["title"],
                "path": screen["path"],
                "roles": screen["roles"],
                "manifestViewports": screen["viewport"],
                "manifestStates": screen["stateCoverage"],
                "concept": screen["concept"],
                "conceptExists": concept_path.exists(),
                "referenceImages": reference_images,
                "prototypeSourceOccurrences": len(re.findall(re.escape(screen_id), source_text)),
                "stateMatrix": {
                    "canonicalPrototypeStates": screen["stateCoverage"],
                    "requiredProductStates": REQUIRED_STATES,
                    "needsProductionStateValidation": True,
                },
            }
        )

    checks = {
        "manifestScreenCount": len(screens) == len(CANONICAL_SCREEN_IDS),
        "manifestIdsExact": [screen["id"] for screen in screens] == CANONICAL_SCREEN_IDS,
        "uniqueIds": len({screen["id"] for screen in screens}) == len(screens),
        "allConceptsExist": all(screen["conceptExists"] for screen in screens),
        "allHaveReferenceImage": all(screen["referenceImages"] for screen in screens),
        "allHavePrototypeSourceOccurrence": all(
            screen["prototypeSourceOccurrences"] > 0 for screen in screens
        ),
        "allCanonicalStatesPresent": all(
            set(("ready", "loading", "empty", "error")).issubset(screen["manifestStates"])
            for screen in screens
        ),
        "allManifestViewportsPresent": all(
            set(("mobile", "tablet", "desktop")).issubset(set(screen["manifestViewports"]))
            for screen in screens
        ),
    }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "taskId": "P0-UX-001",
        "sourceOfTruth": [
            "fullspec.md §7, §15, §16",
            "plan.md Appendix F",
            "gui-prototype/screen-manifest.json",
            "gui-designs/screens/",
            "gui-designs/concepts/",
        ],
        "screenCount": len(screens),
        "canonicalScreenIds": CANONICAL_SCREEN_IDS,
        "requiredViewportWidths": REQUIRED_VIEWPORT_WIDTHS,
        "requiredThemes": REQUIRED_THEMES,
        "requiredProductStates": REQUIRED_STATES,
        "commonStatePolicy": {
            "canonicalPrototypeQueryStates": ["ready", "loading", "empty", "error"],
            "productionMustAdd": REQUIRED_STATES,
            "note": "Prototype state query coverage is design evidence; it is not production API/state completion.",
        },
        "richMenuSafeArea": {
            "required": True,
            "status": "DESIGN_ACCEPTANCE_REQUIRED",
            "note": "Keep tap geometry/readability and LINE/mobile safe-area acceptance in UX/UAT evidence; no dimensions are invented here.",
        },
        "screens": screens,
        "checks": checks,
        "allAutomatedChecksPass": all(checks.values()),
        "externalAcceptance": {
            "taskBasedUsabilityStudy": "NOT_AVAILABLE_IN_REPOSITORY",
            "requiredParticipants": "at least 5 per persona",
            "requiredSignOff": ["UX", "PO", "UAT", "QA"],
            "status": "BLOCKED_PENDING_EXTERNAL_UAT",
        },
    }


def write_inventory(path: Path, inventory: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(inventory, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    inventory = build_inventory(args.root)
    write_inventory(args.output, inventory)
    print(f"GUI_INVENTORY_WRITTEN {args.output}")
    print(f"SCREEN_COUNT {inventory['screenCount']}")
    print(f"AUTOMATED_CHECKS_PASS {inventory['allAutomatedChecksPass']}")
    print(f"EXTERNAL_ACCEPTANCE {inventory['externalAcceptance']['status']}")
    return 0 if inventory["allAutomatedChecksPass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
