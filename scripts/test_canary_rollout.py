"""Static contract checks for the P9-CAN-002 unit-gated rollout adapter."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "packages" / "job-ops" / "src" / "canary-rollout.ts").read_text(encoding="utf-8")
TEST_SOURCE = (ROOT / "packages" / "job-ops" / "src" / "canary-rollout.test.ts").read_text(encoding="utf-8")

UNIT_TEST_IDS = [
    "P9-CAN-COHORT",
    "P9-CAN-RECONCILIATION",
    "P9-CAN-FAIL-CLOSED",
    "P9-CAN-SAMPLING",
]


class CanaryRolloutContractTests(unittest.TestCase):
    def test_cohort_contract_is_hmac_and_tenant_scoped(self) -> None:
        self.assertIn('createHmac("sha256"', SOURCE)
        self.assertIn('`${tenantId}:${featureKey}:${subjectKey}`', SOURCE)
        self.assertIn('audience: "STAFF_SUPERVISED"', SOURCE)
        self.assertIn("assertTenantId", SOURCE)

    def test_reconciliation_contract_detects_cross_tenant_and_duplicate_events(self) -> None:
        for marker in ("duplicateEventIds", "unexpectedTenantEventIds", "staleFlagEventIds", "outOfCohortEventIds"):
            self.assertIn(marker, SOURCE)
        self.assertIn("status: allIssues.some", SOURCE)
        self.assertIn("reconciles duplicate, cross-tenant, stale and out-of-cohort observations", TEST_SOURCE)

    def test_fail_closed_and_rollback_contract(self) -> None:
        self.assertIn('route: "HANDOFF"', SOURCE)
        self.assertIn('state: ready ? "PILOT" : "OFF"', SOURCE)
        self.assertIn('status: "FAIL_CLOSED"', SOURCE)
        self.assertIn("fails closed when dependencies are not ready and rollback is idempotent", TEST_SOURCE)

    def test_automated_sampling_contract(self) -> None:
        self.assertIn("scheduleSampling", SOURCE)
        self.assertIn("runDueSampling", SOURCE)
        self.assertIn("windowKey", SOURCE)
        self.assertIn("schedules one tenant-scoped sample window and fails closed on mismatch", TEST_SOURCE)


if __name__ == "__main__":
    unittest.main()
