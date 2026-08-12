"""Static contract checks for the P9-CLOSE-001 release close generator."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "packages" / "job-ops" / "src" / "release-close.ts").read_text(encoding="utf-8")
TEST_SOURCE = (ROOT / "packages" / "job-ops" / "src" / "release-close.test.ts").read_text(encoding="utf-8")

UNIT_TEST_IDS = [
    "P9-CLOSE-EVIDENCE",
    "P9-CLOSE-TRACE",
    "P9-CLOSE-IDEMPOTENCY",
]


class ReleaseCloseContractTests(unittest.TestCase):
    def test_evidence_link_and_summary_contract(self) -> None:
        for marker in ("EVIDENCE_LINK_MISSING", "EVIDENCE_EMPTY", "ReleaseSummary", "artifactCount"):
            self.assertIn(marker, SOURCE)
        self.assertIn("generates a linked evidence/trace/archive summary", TEST_SOURCE)

    def test_trace_and_archive_contract(self) -> None:
        for marker in ("TRACE_TASK_WITHOUT_EVIDENCE", "TRACE_ROW_DUPLICATE", "traceHash", "archiveHash"):
            self.assertIn(marker, SOURCE)
        self.assertIn("rejects missing links and orphan trace rows", TEST_SOURCE)

    def test_close_is_idempotent(self) -> None:
        self.assertIn("IDEMPOTENCY_CONFLICT", SOURCE)
        self.assertIn("this.closed", SOURCE)
        self.assertIn("closes idempotently and rejects changed input on the same key", TEST_SOURCE)


if __name__ == "__main__":
    unittest.main()

