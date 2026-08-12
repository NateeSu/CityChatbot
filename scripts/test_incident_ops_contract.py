"""Static contract checks for P7-IR-001 incident response delivery."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOMAIN = ROOT / "packages" / "incident-ops" / "src" / "incident-ops.ts"
DOMAIN_TEST = ROOT / "packages" / "incident-ops" / "src" / "incident-ops.test.ts"
RUNBOOK = ROOT / "docs" / "operations" / "p7-ir-001.md"
API = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "incident-operations" / "route.ts"
UI = ROOT / "apps" / "web" / "app" / "admin" / "audit" / "IncidentOperationsPanel.tsx"
CSS = ROOT / "apps" / "web" / "app" / "admin" / "audit" / "incident-ops.css"


class IncidentOperationsContractTests(unittest.TestCase):
    def test_severity_playbooks_kill_switch_budget_and_tabletop_contract(self) -> None:
        source = DOMAIN.read_text(encoding="utf-8")
        tests = DOMAIN_TEST.read_text(encoding="utf-8")
        runbook = RUNBOOK.read_text(encoding="utf-8")
        for marker in ("S0", "S1", "S2", "S3", "INCIDENT_PLAYBOOKS", "TENANT_ISOLATION_BREACH", "WRONG_ANSWER", "SECRET_LEAK", "LINE_PROVIDER_OUTAGE", "QUEUE_BACKLOG", "COST_SPIKE", "KILL_SWITCH", "evaluateBudget", "RESTRICT_NONCRITICAL_AI", "SAFE_HANDOFF", "POSTMORTEM_TEMPLATE", "TABLETOP_CASES"):
            self.assertIn(marker, source, marker)
        for marker in ("70", "90", "100", "core complaint", "Tabletop", "Rollback", "evidence"):
            self.assertIn(marker.lower(), runbook.lower(), marker)
        for marker in ("lifecycle", "kill", "budget", "tenant", "tabletop"):
            self.assertIn(marker, tests.lower(), marker)
        self.assertNotRegex(source, r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-v1-", re.IGNORECASE)

    def test_api_is_explicitly_scoped_and_fail_closed(self) -> None:
        source = API.read_text(encoding="utf-8")
        for marker in ("allowedQueryKeys", "GET", "POST", "TENANT_ADMIN", "EXECUTIVE", "CONFIGURATION_UNAVAILABLE", "idempotency-key", "ACTIVATE_KILL_SWITCH", "PUBLISH_STATUS"):
            self.assertIn(marker, source, marker)
        self.assertNotRegex(source, r"\*\s*/|drop\s+(table|schema)", re.IGNORECASE)

    def test_a97_panel_covers_resilient_controls_and_responsive_layout(self) -> None:
        ui = UI.read_text(encoding="utf-8")
        css = CSS.read_text(encoding="utf-8")
        for marker in ("INCIDENT RESPONSE / COST CONTROL", "LoadingState", "OfflineState", "PermissionDeniedState", "ExpiredSessionState", "kill switch", "Tabletop", "aria-busy"):
            self.assertIn(marker, ui, marker)
        for breakpoint in ("max-width: 1023px", "max-width: 767px", "max-width: 360px"):
            self.assertIn(breakpoint, css, breakpoint)
        for marker in ("focus-visible", "overflow-x: auto", "prefers-reduced-motion"):
            self.assertIn(marker, css, marker)


if __name__ == "__main__":
    unittest.main(verbosity=2)
