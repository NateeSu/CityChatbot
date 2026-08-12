import json
import unittest
from pathlib import Path

from scripts.build_conflict_ledger import (
    CR_IDS,
    CORPUS_MANIFEST,
    FULLSPEC,
    DEFAULT_OUTPUT,
    build_ledger,
    canonical_json,
    verify_ledger,
)


UNIT_TEST_IDS = (
    "P0-COR-CONFLICT-ALL-QUARANTINED",
    "P0-COR-CONFLICT-SOURCE-MAPPING",
    "P0-COR-CONFLICT-NO-ACTIVE-FACTS",
    "P0-COR-CONFLICT-EXCLUDED-EVALUATION",
    "P0-COR-CONFLICT-DETERMINISTIC",
)


class ConflictLedgerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fullspec_text = FULLSPEC.read_text(encoding="utf-8")
        cls.manifest = json.loads(CORPUS_MANIFEST.read_text(encoding="utf-8"))
        cls.ledger = build_ledger(cls.fullspec_text, cls.manifest)

    def test_all_conflicts_are_quarantined(self) -> None:
        self.assertEqual([entry["conflictId"] for entry in self.ledger["conflicts"]], list(CR_IDS))
        self.assertTrue(all(entry["state"] == "QUARANTINED" for entry in self.ledger["conflicts"]))
        self.assertTrue(all(entry["answerPolicy"] == "HANDOFF_ONLY" for entry in self.ledger["conflicts"]))

    def test_each_conflict_is_attached_to_manifest_source_files(self) -> None:
        for entry in self.ledger["conflicts"]:
            self.assertGreater(len(entry["sourceFiles"]), 0, entry["conflictId"])
            self.assertTrue(entry["requiredDisposition"])

    def test_no_conflict_fact_can_enter_active_index(self) -> None:
        self.assertEqual(self.ledger["summary"]["activeIndexEligibleCount"], 0)
        self.assertEqual(self.ledger["summary"]["inventoriedFactCount"], 0)
        self.assertTrue(all(entry["activeIndexEligible"] is False and entry["facts"] == [] for entry in self.ledger["conflicts"]))

    def test_template_and_evaluation_only_content_is_not_production_content(self) -> None:
        cr010 = next(entry for entry in self.ledger["conflicts"] if entry["conflictId"] == "CR-010")
        self.assertIn("EXCLUDED", cr010["requiredDisposition"])
        self.assertEqual(cr010["answerPolicy"], "HANDOFF_ONLY")

    def test_checked_in_ledger_is_deterministic_and_integrity_verified(self) -> None:
        checked_in = json.loads(DEFAULT_OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(canonical_json(checked_in), canonical_json(self.ledger))
        self.assertRegex(verify_ledger(checked_in, self.fullspec_text, self.manifest), r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main(verbosity=2)
