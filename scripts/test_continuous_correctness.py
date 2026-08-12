"""Static contract checks for P9-BAU-001 continuous correctness."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "packages" / "job-ops" / "src" / "continuous-correctness.ts").read_text(encoding="utf-8")
TEST_SOURCE = (ROOT / "packages" / "job-ops" / "src" / "continuous-correctness.test.ts").read_text(encoding="utf-8")

UNIT_TEST_IDS = [
    "P9-BAU-EXPIRY",
    "P9-BAU-STALE-SOURCE",
    "P9-BAU-REGRESSION",
    "P9-BAU-ALERT",
]


class ContinuousCorrectnessContractTests(unittest.TestCase):
    def test_schedule_and_expiry_contract(self) -> None:
        for marker in ("schedule", "WEEKLY", "MONTHLY", "QUARTERLY", "validUntil", "SOURCE_EXPIRED_OR_STALE"):
            self.assertIn(marker, SOURCE)
        self.assertIn("schedules weekly/monthly/quarterly cadence idempotently", TEST_SOURCE)

    def test_stale_source_forces_handoff_and_tenant_scope(self) -> None:
        for marker in ("STALE_DOMAIN_FORCE_HANDOFF", "TENANT_SCOPE_VIOLATION", "resolveDomain"):
            self.assertIn(marker, SOURCE)
        self.assertIn("disables stale or expired source domains and preserves tenant scope", TEST_SOURCE)

    def test_regression_requires_unit_gate_and_recertification(self) -> None:
        for marker in ("affectedUnitGateGreen", "recertificationPassed", "REGRESSION_REQUIRED", "RECERTIFIED"):
            self.assertIn(marker, SOURCE)
        self.assertIn("requires unit gate plus recertification before publishing a change", TEST_SOURCE)

    def test_alert_and_rollback_contract(self) -> None:
        self.assertIn("rollbackDomain", SOURCE)
        self.assertIn('status: "ROLLED_BACK"', SOURCE)
        self.assertIn("rolls back stale domains idempotently and routes to handoff", TEST_SOURCE)


if __name__ == "__main__":
    unittest.main()

