import csv
import unittest
from pathlib import Path

from scripts.requirements_trace import (
    FULLSPEC,
    OUTPUT,
    PLAN,
    build_catalog,
    canonical_csv,
    canonical_ids,
    verify_catalog,
)


UNIT_TEST_IDS = (
    "P0-GOV-TRACE-CANONICAL-COVERAGE",
    "P0-GOV-TRACE-BIDIRECTIONAL-LINKS",
    "P0-GOV-TRACE-NO-DUPLICATES",
    "P0-GOV-TRACE-SOURCE-LOCATORS",
    "P0-GOV-TRACE-DETERMINISTIC-HASH",
)


class RequirementsTraceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fullspec_text = FULLSPEC.read_text(encoding="utf-8")
        cls.plan_text = PLAN.read_text(encoding="utf-8")
        cls.rows = build_catalog(cls.fullspec_text, cls.plan_text)

    def test_catalog_covers_all_canonical_fullspec_ids(self) -> None:
        self.assertEqual({row["requirementId"] for row in self.rows}, set(canonical_ids(self.fullspec_text)))
        self.assertGreaterEqual(len(self.rows), 40)

    def test_bidirectional_links_point_to_real_task_evidence_and_test_ids(self) -> None:
        digest = verify_catalog(self.rows, self.fullspec_text, self.plan_text)
        self.assertEqual(len(digest), 64)
        self.assertTrue(all(row["taskId"] and row["testId"] and row["evidencePath"] for row in self.rows))

    def test_no_duplicate_requirement_or_approval_state(self) -> None:
        self.assertEqual(len(self.rows), len({row["requirementId"] for row in self.rows}))
        serialized = canonical_csv(self.rows).upper()
        self.assertNotIn("WAITING_FOR_APPROVAL", serialized)
        self.assertNotIn("GO_NO_GO_PENDING", serialized)
        self.assertNotIn("PENDING_USER", serialized)

    def test_source_locators_are_line_addressable(self) -> None:
        total_lines = len(self.fullspec_text.splitlines())
        for row in self.rows:
            prefix, line = row["source"].split(":")
            self.assertEqual(prefix, "fullspec.md")
            self.assertGreaterEqual(int(line), 1)
            self.assertLessEqual(int(line), total_lines)

    def test_repository_catalog_is_deterministic(self) -> None:
        with OUTPUT.open("r", encoding="utf-8", newline="") as handle:
            committed_rows = list(csv.DictReader(handle))
        self.assertEqual(canonical_csv(committed_rows), canonical_csv(self.rows))
        self.assertEqual(verify_catalog(committed_rows, self.fullspec_text, self.plan_text), verify_catalog(self.rows, self.fullspec_text, self.plan_text))


if __name__ == "__main__":
    unittest.main(verbosity=2)
