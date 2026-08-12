"""Static contract checks for P7-JOB-001 job operations delivery."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOMAIN = ROOT / "packages" / "job-ops" / "src" / "job-ops.ts"
DOMAIN_TEST = ROOT / "packages" / "job-ops" / "src" / "job-ops.test.ts"
API = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "job-operations" / "route.ts"
UI = ROOT / "apps" / "web" / "app" / "admin" / "audit" / "JobOperationsPanel.tsx"
CSS = ROOT / "apps" / "web" / "app" / "admin" / "audit" / "job-ops.css"


class JobOperationsContractTests(unittest.TestCase):
    def test_inventory_retry_dlq_replay_reconciliation_and_cron_contract(self) -> None:
        source = DOMAIN.read_text(encoding="utf-8")
        tests = DOMAIN_TEST.read_text(encoding="utf-8")
        for marker in (
            "JOB_DEFINITIONS",
            "CORE_RECONCILIATION_JOB_TYPES",
            "RETRY_WAIT",
            "QUARANTINED",
            "replayIdempotency",
            "RECONCILED",
            "signCronRequest",
            "verifyCronRequest",
            "TENANT_SCOPE_VIOLATION",
        ):
            self.assertIn(marker, source, marker)
        for marker in ("DLQ", "poison", "cron", "idempotent", "reconcile"):
            self.assertIn(marker.lower(), tests.lower(), marker)
        self.assertNotRegex(source, r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-v1-", re.IGNORECASE)

    def test_api_replay_is_explicitly_scoped_and_fail_closed(self) -> None:
        source = API.read_text(encoding="utf-8")
        for marker in ("allowedQueryKeys", "GET", "POST", "TENANT_ADMIN", "EXECUTIVE", "CONFIGURATION_UNAVAILABLE", "IDEMPOTENCY_CONFLICT", "replayLocalJob"):
            self.assertIn(marker, source, marker)
        self.assertNotRegex(source, r"\*\s*/|drop\s+(table|schema)", re.IGNORECASE)

    def test_a97_job_panel_covers_dlq_replay_reconciliation_and_resilient_layout(self) -> None:
        ui = UI.read_text(encoding="utf-8")
        css = CSS.read_text(encoding="utf-8")
        for marker in ("JOB OPERATIONS / DLQ", "aria-busy", "DLQ / poison quarantine", "Reconciliation", "OfflineState", "PermissionDeniedState", "ExpiredSessionState", "idempotency-key"):
            self.assertIn(marker, ui, marker)
        for breakpoint in ("max-width: 1023px", "max-width: 767px", "max-width: 360px"):
            self.assertIn(breakpoint, css, breakpoint)
        for marker in ("focus-visible", "overflow-x: auto", "prefers-reduced-motion"):
            self.assertIn(marker, css, marker)


if __name__ == "__main__":
    unittest.main(verbosity=2)
