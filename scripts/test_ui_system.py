"""Static contract checks for the shared production UI system."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
UI_DIR = ROOT / "apps" / "web" / "app" / "ui"
ADMIN_DIR = ROOT / "apps" / "web" / "app" / "admin"


def contrast_ratio(first: str, second: str) -> float:
    def channel(value: str) -> float:
        normalized = int(value, 16) / 255
        return normalized / 12.92 if normalized <= 0.03928 else ((normalized + 0.055) / 1.055) ** 2.4

    def luminance(color: str) -> float:
        return 0.2126 * channel(color[0:2]) + 0.7152 * channel(color[2:4]) + 0.0722 * channel(color[4:6])

    lighter, darker = sorted((luminance(first), luminance(second)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


class UiSystemContractTests(unittest.TestCase):
    def test_theme_provider_has_canonical_names_and_persisted_scope(self) -> None:
        source = (UI_DIR / "theme.ts").read_text(encoding="utf-8")
        self.assertIn('"light", "dark", "high-contrast"', source)
        self.assertIn("THEME_STORAGE_PREFIX = \"citychatbot:theme:v1\"", source)
        self.assertIn("sanitizeTenantTheme", source)
        self.assertIn("localStorage.setItem(storageKey, theme)", source)

    def test_every_required_product_state_has_an_accessible_primitive(self) -> None:
        source = (UI_DIR / "states.tsx").read_text(encoding="utf-8")
        for state in ("LoadingState", "EmptyState", "ErrorState", "OfflineState", "PermissionDeniedState", "ExpiredSessionState", "StaleState", "ConflictState", "FeatureDisabledState"):
            self.assertIn(f"export function {state}", source)
        self.assertIn('role="alert"', source)
        self.assertIn('aria-live={role === "alert" ? "assertive" : "polite"}', source)

    def test_production_shells_use_the_shared_theme_engine(self) -> None:
        paths = (
            ROOT / "apps" / "web" / "app" / "liff" / "complaints" / "ComplaintTracking.tsx",
            ROOT / "apps" / "web" / "app" / "liff" / "complaints" / "new" / "ComplaintWizard.tsx",
            ROOT / "apps" / "web" / "app" / "admin" / "complaints" / "AdminComplaintInbox.tsx",
            ROOT / "apps" / "web" / "app" / "admin" / "complaints" / "[id]" / "AdminComplaintDetail.tsx",
        )
        for path in paths:
            self.assertIn("useTheme", path.read_text(encoding="utf-8"), path.as_posix())

    def test_tokens_cover_wcag_aa_pairs_and_required_breakpoints(self) -> None:
        source = (UI_DIR / "design-system.css").read_text(encoding="utf-8")
        required_tokens = (
            "--cc-bg",
            "--cc-surface",
            "--cc-text",
            "--cc-text-muted",
            "--cc-primary",
            "--cc-primary-contrast",
            "--cc-focus",
        )
        for token in required_tokens:
            self.assertIn(token, source)
        for breakpoint in ("max-width: 320px", "max-width: 480px"):
            self.assertIn(breakpoint, source)
        self.assertIn("overflow-x: hidden", source)
        self.assertIn("min-height: var(--cc-control-height)", source)
        self.assertIn("focus-visible", source)

        pairs = (
            ("17263b", "f3f7fb"),
            ("075da6", "ffffff"),
            ("f3f7fb", "0e1826"),
            ("82c4ff", "061521"),
            ("ffffff", "000000"),
            ("ffdf00", "000000"),
        )
        for foreground, background in pairs:
            self.assertGreaterEqual(contrast_ratio(foreground, background), 4.5)

    def test_no_unscoped_external_color_or_mock_import_is_added(self) -> None:
        source = (UI_DIR / "theme.ts").read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"https?://|gui-prototype|mock", source, re.IGNORECASE))

    def test_admin_dashboard_has_role_scoped_navigation_and_route_guards(self) -> None:
        navigation = (ADMIN_DIR / "admin-navigation.ts").read_text(encoding="utf-8")
        dashboard = (ADMIN_DIR / "AdminDashboard.tsx").read_text(encoding="utf-8")
        shell = (ADMIN_DIR / "AdminShell.tsx").read_text(encoding="utf-8")
        access = (ADMIN_DIR / "admin-access.ts").read_text(encoding="utf-8")
        for href in ("/admin", "/admin/complaints", "/admin/support-tickets", "/admin/faq-candidates", "/admin/departments", "/admin/news", "/admin/services", "/admin/staff", "/admin/settings/bot", "/admin/settings/theme", "/admin/settings/rich-menu", "/admin/reports"):
            self.assertIn(f'href: "{href}"', navigation)
        for role in ("STAFF", "DEPARTMENT_HEAD", "PR_STAFF", "KNOWLEDGE_STAFF", "TENANT_ADMIN", "EXECUTIVE"):
            self.assertIn(f'"{role}"', navigation)
        for state in ("LoadingState", "EmptyState", "ErrorState", "OfflineState", "PermissionDeniedState", "ExpiredSessionState", "FeatureDisabledState", "StaleState"):
            self.assertIn(state, dashboard)
        for marker in ("aria-controls=\"admin-navigation\"", "role=\"search\"", "notificationCount", "admin-app-breadcrumbs"):
            self.assertIn(marker, shell)
        self.assertIn('id="admin-navigation"', shell)
        self.assertIn("parseOperationalAdminRole", access)
        self.assertIn("localOperationalIdentity", access)
        for relative in (
            Path("complaints") / "page.tsx",
            Path("support-tickets") / "page.tsx",
            Path("faq-candidates") / "page.tsx",
            Path("news") / "page.tsx",
            Path("services") / "page.tsx",
            Path("staff") / "page.tsx",
            Path("settings") / "bot" / "page.tsx",
            Path("settings") / "theme" / "page.tsx",
            Path("settings") / "rich-menu" / "page.tsx",
            Path("reports") / "page.tsx",
        ):
            source = (ADMIN_DIR / relative).read_text(encoding="utf-8")
            self.assertIn("PermissionDeniedState", source, relative.as_posix())
            self.assertIn("query.role", source, relative.as_posix())

    def test_admin_shell_has_responsive_boundaries_and_no_horizontal_overflow(self) -> None:
        source = (ADMIN_DIR / "admin-shell.css").read_text(encoding="utf-8")
        self.assertIn("overflow-x: hidden", source)
        for breakpoint in ("max-width: 1023px", "max-width: 767px", "max-width: 480px", "max-width: 380px", "max-width: 320px"):
            self.assertIn(breakpoint, source)
        self.assertIn("focus-visible", source)


if __name__ == "__main__":
    unittest.main()
