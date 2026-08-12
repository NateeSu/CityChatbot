#!/usr/bin/env python3
"""Regression tests for canonical GUI/page/state inventory coverage."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from audit_gui_inventory import (  # noqa: E402
    CANONICAL_SCREEN_IDS,
    REQUIRED_STATES,
    REQUIRED_THEMES,
    REQUIRED_VIEWPORT_WIDTHS,
    build_inventory,
)


class GuiInventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.inventory_path = ROOT / "docs" / "ux" / "page-state-inventory.json"
        cls.inventory = build_inventory(ROOT)

    def test_all_canonical_screens_are_present_in_exact_order(self) -> None:
        self.assertEqual(self.inventory["canonicalScreenIds"], CANONICAL_SCREEN_IDS)
        self.assertEqual(self.inventory["screenCount"], 41)
        self.assertEqual(len({screen["id"] for screen in self.inventory["screens"]}), 41)

    def test_concepts_images_and_prototype_sources_are_covered(self) -> None:
        self.assertTrue(self.inventory["checks"]["allConceptsExist"])
        self.assertTrue(self.inventory["checks"]["allHaveReferenceImage"])
        self.assertTrue(self.inventory["checks"]["allHavePrototypeSourceOccurrence"])

    def test_manifest_canonical_states_and_viewports_are_complete(self) -> None:
        self.assertTrue(self.inventory["checks"]["allCanonicalStatesPresent"])
        self.assertTrue(self.inventory["checks"]["allManifestViewportsPresent"])
        self.assertEqual(self.inventory["requiredViewportWidths"], REQUIRED_VIEWPORT_WIDTHS)
        self.assertEqual(self.inventory["requiredThemes"], REQUIRED_THEMES)
        self.assertEqual(self.inventory["requiredProductStates"], REQUIRED_STATES)

    def test_generated_artifact_is_stable_and_marks_external_uat(self) -> None:
        checked_in = json.loads(self.inventory_path.read_text(encoding="utf-8"))
        self.assertEqual(checked_in, self.inventory)
        self.assertEqual(
            self.inventory["externalAcceptance"]["status"],
            "BLOCKED_PENDING_EXTERNAL_UAT",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
