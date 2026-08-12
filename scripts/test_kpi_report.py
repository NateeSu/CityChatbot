"""Static/API-surface contract checks for the P7-RPT-001 KPI report slice."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "packages" / "reports-kpi" / "src" / "report.ts"
PACKAGE_TEST = ROOT / "packages" / "reports-kpi" / "src" / "report.test.ts"
API = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "reports" / "kpi" / "route.ts"
PAGE = ROOT / "apps" / "web" / "app" / "admin" / "reports" / "KpiReportConsole.tsx"
CSS = ROOT / "apps" / "web" / "app" / "admin" / "reports" / "reports.css"
AI_PACKAGE = ROOT / "packages" / "reports-kpi" / "src" / "ai-report.ts"
AI_PACKAGE_TEST = ROOT / "packages" / "reports-kpi" / "src" / "ai-report.test.ts"
AI_API = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "reports" / "ai-quality" / "route.ts"

UNIT_TEST_IDS = (
    "P7-AIRPT-SQL-TRUTH",
    "P7-AIRPT-NO-INVENT",
    "P7-AIRPT-COST-BOUNDARY",
)


class KpiReportContractTests(unittest.TestCase):
    def test_report_projection_is_snapshot_definition_and_reconciliation_backed(self) -> None:
        source = PACKAGE.read_text(encoding="utf-8")
        tests = PACKAGE_TEST.read_text(encoding="utf-8")
        for marker in (
            "buildKpiReport",
            "KPI_DEFINITIONS",
            "APPROVED_KPI_SNAPSHOTS",
            "freshness",
            "reconciliation",
            "drilldown",
            "sourceWatermark",
            "definitionVersion",
            "kpiReportToCsv",
        ):
            self.assertIn(marker, source, marker)
        for marker in ("exact snapshot values", "department scope", "unsupported category", "stale", "formula-like"):
            self.assertIn(marker.lower(), tests.lower(), marker)
        self.assertNotRegex(source, r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-v1-", re.IGNORECASE)

    def test_api_is_explicitly_allowlisted_tenant_and_permission_scoped(self) -> None:
        source = API.read_text(encoding="utf-8")
        for marker in (
            "allowedFilters",
            "tenantId",
            "accountId",
            "DEPARTMENT_HEAD",
            "TENANT_ADMIN",
            "EXECUTIVE",
            "FORBIDDEN",
            "CONFIGURATION_UNAVAILABLE",
            "format === \"csv\"",
            "kpiReportToCsv",
            "KpiReportError",
        ):
            self.assertIn(marker, source, marker)
        self.assertNotRegex(source, r"\*\s*\/|drop\s+(table|schema)", re.IGNORECASE)

    def test_a80_ui_covers_states_accessibility_and_responsive_report_layout(self) -> None:
        page = PAGE.read_text(encoding="utf-8")
        css = CSS.read_text(encoding="utf-8")
        for marker in (
            "A-80",
            "LoadingState",
            "EmptyState",
            "ErrorState",
            "OfflineState",
            "PermissionDeniedState",
            "ExpiredSessionState",
            "StaleState",
            "aria-busy",
            "aria-label",
            "definition",
            "trend",
            "ดาวน์โหลด CSV",
        ):
            self.assertIn(marker, page, marker)
        for breakpoint in ("max-width: 1100px", "max-width: 767px", "max-width: 480px", "max-width: 360px"):
            self.assertIn(breakpoint, css, breakpoint)
        for marker in ("focus-visible", "overflow-x: auto", "prefers-reduced-motion"):
            self.assertIn(marker, css, marker)

    def test_ai_quality_report_is_deterministic_and_narrative_is_fail_closed(self) -> None:
        source = AI_PACKAGE.read_text(encoding="utf-8")
        tests = AI_PACKAGE_TEST.read_text(encoding="utf-8")
        route = AI_API.read_text(encoding="utf-8")
        for marker in (
            "SQL_PREPARED_AI_RUNS",
            "outcomeCounts",
            "citedMaterialClaimCount",
            "correctionDenominator",
            "inputTokens",
            "outputTokens",
            "costReconciliation",
            "modelRevisions",
            "promptVersions",
            "indexVersions",
            "verifyExecutiveNarrative",
            "UNAVAILABLE",
        ):
            self.assertIn(marker, source, marker)
        for marker in ("cost arithmetic", "cross-tenant", "invented numbers"):
            self.assertIn(marker, tests.lower(), marker)
        for marker in ("CONFIGURATION_UNAVAILABLE", "allowedFilters", "reportRoles", "buildAiQualityReport"):
            self.assertIn(marker, route, marker)
        self.assertNotRegex(source + route, r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-v1-", re.IGNORECASE)


if __name__ == "__main__":
    unittest.main(verbosity=2)
