"""Static contract checks for the P9-CAN-003 rollout checkpoint adapter."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "packages" / "job-ops" / "src" / "rollout-checkpoints.ts").read_text(encoding="utf-8")
TEST_SOURCE = (ROOT / "packages" / "job-ops" / "src" / "rollout-checkpoints.test.ts").read_text(encoding="utf-8")

UNIT_TEST_IDS = [
    "P9-CAN-ROLLOUT-25",
    "P9-CAN-ROLLOUT-50",
    "P9-CAN-ROLLOUT-100",
    "P9-CAN-ROLLBACK",
]


class RolloutCheckpointContractTests(unittest.TestCase):
    def test_checkpoint_sequence_is_explicit(self) -> None:
        self.assertIn('OFF: 25, ROLLOUT_25: 50, ROLLOUT_50: 100', SOURCE)
        for percent in ("25", "50", "100"):
            self.assertIn(f'ROLLOUT_{percent}', SOURCE)

    def test_thresholds_and_fail_closed_are_enforced(self) -> None:
        for marker in ("minimumObservations", "maxErrorRateBps", "maxMismatchCount", "maxCriticalErrorCount", "DEPENDENCY_NOT_READY", "THRESHOLD_BREACH"):
            self.assertIn(marker, SOURCE)
        self.assertIn("rejects skipped checkpoints and threshold breaches", TEST_SOURCE)

    def test_rollback_is_idempotent_and_handoff_safe(self) -> None:
        self.assertIn('state: "ROLLED_BACK"', SOURCE)
        self.assertIn('percent: 0', SOURCE)
        self.assertIn("keeps rollback fail-closed and idempotent", TEST_SOURCE)

    def test_tenant_scope_is_checked(self) -> None:
        self.assertIn("TENANT_SCOPE_VIOLATION", SOURCE)
        self.assertIn("metrics belong to another tenant", SOURCE)
        self.assertIn("rejects cross-tenant metrics and keeps tenants isolated", TEST_SOURCE)


if __name__ == "__main__":
    unittest.main()

