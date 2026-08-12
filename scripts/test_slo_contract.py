"""Static contract checks for P7-SLO-001 observability delivery."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOMAIN = ROOT / "packages" / "slo" / "src" / "slo.ts"
DOMAIN_TEST = ROOT / "packages" / "slo" / "src" / "slo.test.ts"
API = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "slo" / "route.ts"
UI = ROOT / "apps" / "web" / "app" / "admin" / "audit" / "SloDashboardPanel.tsx"
CSS = ROOT / "apps" / "web" / "app" / "admin" / "audit" / "slo.css"


class SloContractTests(unittest.TestCase):
    def test_registry_evaluator_and_alert_contract_are_deterministic(self) -> None:
        source = DOMAIN.read_text(encoding="utf-8")
        tests = DOMAIN_TEST.read_text(encoding="utf-8")
        for marker in (
            "NFR-AVAIL-001",
            "NFR-LINE-001-P95",
            "NFR-API-001-P95",
            "NFR-RAG-001-P95",
            "NFR-DR-001-RTO",
            "errorBudget",
            "buildSloAlerts",
            "RECOVERY",
            "runbookUrl",
            "SYNTHETIC_PROBES",
            "CROSS_TENANT_OBSERVATION",
        ):
            self.assertIn(marker, source, marker)
        for marker in ("error-budget", "cross-tenant", "recovery", "NO_DATA"):
            self.assertIn(marker.lower(), tests.lower(), marker)
        self.assertNotRegex(source, r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-v1-", re.IGNORECASE)

    def test_api_is_explicitly_allowlisted_and_fails_closed(self) -> None:
        source = API.read_text(encoding="utf-8")
        for marker in (
            "allowedFilters",
            "tenantId",
            "accountId",
            "TENANT_ADMIN",
            "EXECUTIVE",
            "CONFIGURATION_UNAVAILABLE",
            "SloContractError",
            "getLocalSloDashboard",
        ):
            self.assertIn(marker, source, marker)
        self.assertNotRegex(source, r"\*\s*/|drop\s+(table|schema)", re.IGNORECASE)

    def test_a97_panel_covers_states_accessibility_and_responsive_layout(self) -> None:
        ui = UI.read_text(encoding="utf-8")
        css = CSS.read_text(encoding="utf-8")
        for marker in (
            "SLO / ERROR BUDGET",
            "LoadingState",
            "OfflineState",
            "PermissionDeniedState",
            "ExpiredSessionState",
            "Actionable alerts",
            "Synthetic probes",
            "aria-busy",
            "aria-label",
            "caption",
        ):
            self.assertIn(marker, ui, marker)
        for breakpoint in ("max-width: 1023px", "max-width: 767px", "max-width: 360px"):
            self.assertIn(breakpoint, css, breakpoint)
        for marker in ("focus-visible", "overflow-x: auto", "prefers-reduced-motion"):
            self.assertIn(marker, css, marker)


if __name__ == "__main__":
    unittest.main(verbosity=2)
