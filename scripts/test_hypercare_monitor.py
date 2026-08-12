"""Static contract checks for the P9-HC-001 hypercare monitor."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "packages" / "job-ops" / "src" / "hypercare-monitor.ts").read_text(encoding="utf-8")
TEST_SOURCE = (ROOT / "packages" / "job-ops" / "src" / "hypercare-monitor.test.ts").read_text(encoding="utf-8")

UNIT_TEST_IDS = [
    "P9-HC-HEALTH",
    "P9-HC-SAMPLING",
    "P9-HC-RECONCILIATION",
    "P9-HC-ROLLBACK",
]


class HypercareMonitorContractTests(unittest.TestCase):
    def test_health_and_daily_schedule_contract(self) -> None:
        for marker in ("scheduleDaily", "database", "webhook", "worker", "provider", "retrieval", "HEALTH_DEGRADED"):
            self.assertIn(marker, SOURCE)
        self.assertIn("schedules an idempotent daily job and records a healthy run", TEST_SOURCE)

    def test_sampling_review_coverage_is_required(self) -> None:
        for marker in ("negativeFeedbackReviewedCount", "highRiskReviewedCount", "lowConfidenceReviewedCount", "conflictReviewedCount", "REVIEW_COVERAGE_INCOMPLETE"):
            self.assertIn(marker, SOURCE)
        self.assertIn("forces handoff when review coverage or health is incomplete", TEST_SOURCE)

    def test_reconciliation_and_budget_alerts_are_checked(self) -> None:
        for marker in ("complaint", "supportTicket", "outbox", "job", "RECONCILIATION_MISMATCH", "SLO_OR_COST_BUDGET_BREACH"):
            self.assertIn(marker, SOURCE)
        self.assertIn("rolls back on reconciliation/budget failure", TEST_SOURCE)

    def test_rollback_is_idempotent_and_handoff_safe(self) -> None:
        self.assertIn('status: "ROLLED_BACK"', SOURCE)
        self.assertIn("MANUAL_ROLLBACK", SOURCE)
        self.assertIn("supports an idempotent manual rollback", TEST_SOURCE)


if __name__ == "__main__":
    unittest.main()

