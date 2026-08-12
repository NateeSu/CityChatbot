"""Static contract tests for P3-RES-001 failure degradation and runbook coverage."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RECOVERY = ROOT / "packages" / "complaints" / "src" / "recovery.ts"
RUNBOOK = ROOT / "docs" / "operations" / "p3-res-001.md"


class RecoveryContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.recovery = RECOVERY.read_text(encoding="utf-8")
        cls.runbook = RUNBOOK.read_text(encoding="utf-8")

    def test_failure_classes_and_safe_commit_boundary_are_implemented(self) -> None:
        for marker in (
            '"OPENROUTER"',
            '"EMBEDDING"',
            '"LINE_PUSH"',
            '"MAP"',
            '"REVERSE_GEOCODE"',
            "coreCommitted: true",
            "defaultIntakeQueueForTenant",
            "reconciliation.enqueue",
            "runReconciliationOnce",
            "reclaimExpired",
            'outcome: "HANDOFF"',
            'reasonCode: "SYSTEM_ERROR"',
        ):
            self.assertIn(marker, self.recovery)

    def test_retry_jobs_are_deduplicated_and_raw_provider_errors_are_not_persisted(self) -> None:
        for marker in ("dedupe", "leaseOwner", "attemptCount", "RETRY_WAIT", "DEAD", "EXTERNAL_DEPENDENCY_FAILED"):
            self.assertIn(marker, self.recovery)
        self.assertNotIn("JSON.stringify(error)", self.recovery)
        self.assertNotIn("errorDetailRedacted", self.recovery)

    def test_runbook_covers_every_required_failure_and_rollback(self) -> None:
        for marker in ("OpenRouter", "Embedding", "LINE push", "Map", "Reverse geocode", "Worker crash", "Rollback / feature flags", "manual address"):
            self.assertIn(marker, self.runbook)


if __name__ == "__main__":
    unittest.main(verbosity=2)
