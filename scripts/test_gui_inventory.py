#!/usr/bin/env python3
"""Regression tests for canonical GUI/page/state inventory coverage."""

from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

UNIT_TEST_IDS = (
    "P6-QA-SCREEN-MANIFEST",
    "P6-QA-RESPONSIVE-MATRIX",
    "P6-QA-THEME-MATRIX",
    "P6-QA-A11Y-STATE-CONTRACT",
    "P8-UX-RESPONSIVE",
    "P8-UX-A11Y",
    "P8-UX-THEME",
    "P8-UX-VISUAL-CONTRACT",
)

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

    def test_p8_responsive_contract_covers_required_widths_orientation_and_reflow(self) -> None:
        self.assertEqual(
            self.inventory["requiredViewportWidths"],
            [320, 360, 390, 480, 768, 834, 1024, 1440],
        )
        self.assertTrue(all({"mobile", "tablet", "desktop"}.issubset(set(screen["manifestViewports"])) for screen in self.inventory["screens"]))

        design_system = (ROOT / "apps" / "web" / "app" / "ui" / "design-system.css").read_text(encoding="utf-8")
        liff_shell = (ROOT / "apps" / "web" / "app" / "liff" / "liff.css").read_text(encoding="utf-8")
        admin_shell = (ROOT / "apps" / "web" / "app" / "admin" / "admin-shell.css").read_text(encoding="utf-8")
        for source in (design_system, liff_shell, admin_shell):
            self.assertIn("overflow-x: hidden", source)
            self.assertIn("@media", source)
        for breakpoint in ("max-width: 320px", "max-width: 480px", "max-width: 767px", "max-width: 1023px"):
            self.assertTrue(any(breakpoint in source for source in (design_system, liff_shell, admin_shell)), breakpoint)
        self.assertIn("prefers-reduced-motion", design_system)
        self.assertIn("prefers-reduced-motion", liff_shell)

    def test_p8_accessibility_contract_covers_language_states_keyboard_and_reflow(self) -> None:
        layout = (ROOT / "apps" / "web" / "app" / "layout.tsx").read_text(encoding="utf-8")
        states = (ROOT / "apps" / "web" / "app" / "ui" / "states.tsx").read_text(encoding="utf-8")
        design_system = (ROOT / "apps" / "web" / "app" / "ui" / "design-system.css").read_text(encoding="utf-8")
        admin_shell = (ROOT / "apps" / "web" / "app" / "admin" / "AdminShell.tsx").read_text(encoding="utf-8")
        theme_toggle = (ROOT / "apps" / "web" / "app" / "ui" / "theme-toggle.tsx").read_text(encoding="utf-8")

        self.assertIn('<html lang="th"', layout)
        for state in (
            "LoadingState",
            "EmptyState",
            "ErrorState",
            "OfflineState",
            "PermissionDeniedState",
            "ExpiredSessionState",
            "StaleState",
            "ConflictState",
            "FeatureDisabledState",
        ):
            self.assertIn(f"export function {state}", states)
        for marker in ('aria-live=', 'role="alert"', "aria-busy=", "focus-visible", "min-height: var(--cc-control-height)"):
            self.assertIn(marker, states + design_system)
        for marker in ('aria-controls="admin-navigation"', "aria-expanded=", 'role="search"', "aria-label="):
            self.assertIn(marker, admin_shell)
        self.assertIn("aria-label={themeAriaLabel(theme)}", theme_toggle)

        app_source = "\n".join(path.read_text(encoding="utf-8") for path in (ROOT / "apps" / "web" / "app").rglob("*.tsx"))
        self.assertIsNone(re.search(r"user-scalable\\s*=\\s*['\"]?no", app_source, re.IGNORECASE))
        self.assertIsNone(re.search(r"maximum-scale\\s*[:=]\\s*1(?:[;\"']|$)", app_source, re.IGNORECASE))

    def test_p8_theme_contract_covers_light_dark_high_contrast_and_safe_tenant_scope(self) -> None:
        theme = (ROOT / "apps" / "web" / "app" / "ui" / "theme.ts").read_text(encoding="utf-8")
        css = (ROOT / "apps" / "web" / "app" / "ui" / "design-system.css").read_text(encoding="utf-8")
        self.assertIn('"light", "dark", "high-contrast"', theme)
        for data_theme in ('html[data-theme="dark"]', 'html[data-theme="high-contrast"]'):
            self.assertIn(data_theme, css)
        self.assertIn("color-scheme: light", css)
        self.assertIn("color-scheme: dark", css)
        for marker in ("sanitizeTenantTheme", "isSafeTenantColor", "getThemeStorageKey", "THEME_STORAGE_PREFIX"):
            self.assertIn(marker, theme)
        self.assertIn("--cc-focus: #00ffff", css)
        self.assertIn("--cc-primary: #ffdf00", css)
        self.assertEqual(self.inventory["requiredThemes"], ["light", "dark", "contrast"])

    def test_p8_visual_contract_maps_every_screen_to_reference_and_prototype_source(self) -> None:
        self.assertTrue(self.inventory["allAutomatedChecksPass"])
        for screen in self.inventory["screens"]:
            self.assertTrue(screen["conceptExists"], screen["id"])
            self.assertTrue(screen["referenceImages"], screen["id"])
            self.assertGreater(screen["prototypeSourceOccurrences"], 0, screen["id"])
            self.assertTrue(screen["stateMatrix"]["needsProductionStateValidation"])
        self.assertEqual(self.inventory["externalAcceptance"]["status"], "BLOCKED_PENDING_EXTERNAL_UAT")


if __name__ == "__main__":
    unittest.main(verbosity=2)
