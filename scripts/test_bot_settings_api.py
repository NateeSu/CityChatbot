"""Static contract checks for the policy-locked bot settings slice."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "bot-settings"
UI = ROOT / "apps" / "web" / "app" / "admin" / "settings" / "bot"
PACKAGE = ROOT / "packages" / "bot-settings" / "src"
MIGRATION = ROOT / "supabase" / "migrations" / "20260811150000_prompt_versions_schema.sql"


class BotSettingsContractTests(unittest.TestCase):
    def test_explicit_routes_have_environment_guard_and_no_wildcard(self) -> None:
        routes = (
            API / "route.ts",
            API / "[id]" / "route.ts",
            API / "[id]" / "preview" / "route.ts",
            API / "[id]" / "publish" / "route.ts",
            API / "[id]" / "rollback" / "route.ts",
        )
        for route in routes:
            source = route.read_text(encoding="utf-8")
            self.assertIn("isBotSettingsLocalEnvironment", source, route.as_posix())
            self.assertIn('"CONFIGURATION_UNAVAILABLE"', source, route.as_posix())
            self.assertIn("localBotSettingsContext", source, route.as_posix())
        self.assertNotIn("[...slug]", "\n".join(path.as_posix() for path in API.rglob("*")))

    def test_domain_contains_policy_lock_safety_outcomes_and_reversible_lifecycle(self) -> None:
        source = (PACKAGE / "bot-settings.ts").read_text(encoding="utf-8")
        for marker in (
            "MANDATORY_BOT_POLICY",
            "aiDisclosureEnabled: true",
            "groundingRequired: true",
            "handoffEnabled: true",
            "tenantIsolationRequired: true",
            "safeAbstentionRequired: true",
            "INSTRUCTION_INJECTION_PATTERN",
            "UNIT_AUTO_APPROVED",
            "previewOnly: true",
            "SUPERSEDED",
            "ROLLED_BACK",
            "tenantId",
        ):
            self.assertIn(marker, source)

    def test_prompt_schema_has_composite_tenant_integrity_forced_rls_and_immutable_policy(self) -> None:
        source = MIGRATION.read_text(encoding="utf-8")
        for marker in (
            "create table if not exists public.prompt_versions",
            "prompt_versions_tenant_id_uq",
            "prompt_versions_policy_lock_ck",
            "alter table public.prompt_versions enable row level security",
            "alter table public.prompt_versions force row level security",
            "prompt_versions_policy_guard",
            "prompt_versions_published_uq",
            "private.publish_prompt_version",
            "private.rollback_prompt_version",
        ):
            self.assertIn(marker, source)
        self.assertIn("revoke insert, update, delete, truncate on public.prompt_versions", source)

    def test_ui_exposes_locked_policy_preview_rollback_and_resilient_states_without_mock_import(self) -> None:
        page = (UI / "page.tsx").read_text(encoding="utf-8")
        console = (UI / "BotSettingsConsole.tsx").read_text(encoding="utf-8")
        css = (UI / "bot-settings.css").read_text(encoding="utf-8")
        for marker in ("PermissionDeniedState", "FeatureDisabledState", "botSettingsRepository", "BotSettingsConsole"):
            self.assertIn(marker, page)
        for marker in ("PolicyLock", "Run preview", "data-preview-only", "sourceBoundary", "UNIT_AUTO_APPROVED", "rollback", "ExpiredSessionState", "ConflictState", "OfflineState", "LoadingState", "ErrorState"):
            self.assertIn(marker, console)
        for breakpoint in ("max-width: 900px", "max-width: 560px", "max-width: 320px"):
            self.assertIn(breakpoint, css)
        self.assertNotIn("gui-prototype", console)

    def test_no_browser_secret_or_provider_call_is_added(self) -> None:
        for path in (API / "context.ts", API / "errors.ts", UI / "BotSettingsConsole.tsx"):
            source = path.read_text(encoding="utf-8")
            self.assertNotIn("SUPABASE_SERVICE_ROLE", source)
            self.assertNotIn("OPENROUTER_API_KEY", source)
            self.assertNotIn("sk-or-", source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
