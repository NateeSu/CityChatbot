"""Static contract checks for the tenant-safe theme/branding settings slice."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "theme-versions"
UI = ROOT / "apps" / "web" / "app" / "admin" / "settings" / "theme"
PACKAGE = ROOT / "packages" / "theme-settings" / "src"
MIGRATION = ROOT / "supabase" / "migrations" / "20260811160000_theme_versions_schema.sql"


class ThemeSettingsContractTests(unittest.TestCase):
    def test_canonical_routes_are_explicit_and_fail_closed(self) -> None:
        routes = (
            API / "route.ts",
            API / "[id]" / "route.ts",
            API / "[id]" / "validate" / "route.ts",
            API / "[id]" / "publish" / "route.ts",
            API / "[id]" / "rollback" / "route.ts",
        )
        for route in routes:
            source = route.read_text(encoding="utf-8")
            self.assertIn("isThemeSettingsLocalEnvironment", source, route.as_posix())
            self.assertIn('"CONFIGURATION_UNAVAILABLE"', source, route.as_posix())
            self.assertIn("localThemeSettingsContext", source, route.as_posix())
        self.assertNotIn("[...slug]", "\n".join(path.as_posix() for path in API.rglob("*")))

    def test_domain_has_wcag_gate_asset_scope_versioning_audit_and_rollback(self) -> None:
        source = (PACKAGE / "theme-settings.ts").read_text(encoding="utf-8")
        for marker in (
            "THEME_MODES",
            "chooseReadableForeground",
            "contrastRatio",
            "validateThemeConfig",
            "verifyThemeSettingsUnitGate",
            "ASSET_PATH_PATTERN",
            "UNIT_AUTO_APPROVED",
            "SUPERSEDED",
            "ROLLED_BACK",
            "IDEMPOTENCY_CONFLICT",
            "tenantId",
        ):
            self.assertIn(marker, source)

    def test_schema_has_composite_tenant_integrity_forced_rls_and_atomic_functions(self) -> None:
        source = MIGRATION.read_text(encoding="utf-8")
        for marker in (
            "create table if not exists public.theme_versions",
            "theme_versions_tenant_id_uq",
            "theme_versions_published_uq",
            "theme_versions_token_shape_ck",
            "theme_versions_color_shape_ck",
            "alter table public.theme_versions enable row level security",
            "alter table public.theme_versions force row level security",
            "theme_versions_guard",
            "private.publish_theme_version",
            "private.rollback_theme_version",
        ):
            self.assertIn(marker, source)
        self.assertIn("revoke insert, update, delete, truncate on public.theme_versions", source)

    def test_a91_ui_has_preview_modes_gate_rollback_and_resilient_states(self) -> None:
        page = (UI / "page.tsx").read_text(encoding="utf-8")
        console = (UI / "ThemeSettingsConsole.tsx").read_text(encoding="utf-8")
        css = (UI / "theme-settings.css").read_text(encoding="utf-8")
        for marker in ("PermissionDeniedState", "FeatureDisabledState", "themeSettingsRepository", "ThemeSettingsConsole"):
            self.assertIn(marker, page)
        for marker in ("LIVE PREVIEW", "ตรวจ contrast", "data-preview-mode", "rollback", "ExpiredSessionState", "ConflictState", "OfflineState", "LoadingState", "ErrorState", "logoAssetPath"):
            self.assertIn(marker, console)
        for breakpoint in ("max-width: 1023px", "max-width: 767px", "max-width: 480px", "max-width: 320px"):
            self.assertIn(breakpoint, css)
        self.assertNotIn("gui-prototype", console)

    def test_no_browser_secret_or_provider_call_is_added(self) -> None:
        for path in (API / "context.ts", API / "errors.ts", UI / "ThemeSettingsConsole.tsx"):
            source = path.read_text(encoding="utf-8")
            self.assertNotIn("SUPABASE_SERVICE_ROLE", source)
            self.assertNotIn("OPENROUTER_API_KEY", source)
            self.assertNotIn("sk-or-", source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
