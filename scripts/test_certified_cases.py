import json
import unittest
from pathlib import Path

from scripts.build_certified_cases import (
    CANONICAL_REASONS,
    CANONICAL_OUTCOMES,
    HARD_CASES,
    OUTPUT_ROOT,
    SUITE_MANIFEST,
    UNIT_TEST_IDS,
    CertifiedCasesError,
    build_cases,
    build_manifest,
    canonical_json,
    load_suite,
    validate_case,
    verify_suite,
)


class CertifiedCasesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.cases = build_cases()
        cls.manifest = build_manifest(cls.cases)

    def test_canonical_case_schema_and_outcome_reason_mapping(self) -> None:
        self.assertEqual(len(self.cases), 108)
        for case in self.cases:
            validate_case(case)
            self.assertIn(case["expectedOverallOutcome"], CANONICAL_OUTCOMES)
            self.assertIn(case["expectedIntentResults"][0]["expectedReasonCode"], CANONICAL_REASONS)

    def test_all_hard_cases_have_six_variants_and_safety_tags(self) -> None:
        self.assertEqual(self.manifest["coverage"]["hardRegressionCaseCount"], len(HARD_CASES))
        self.assertEqual(self.manifest["coverage"]["variantsPerHardCase"], 6)
        self.assertEqual(self.manifest["coverage"]["negativeAmbiguousSecurityPercent"], 100)
        self.assertTrue(all("NO_ACTIVE_CORPUS" in case["tags"] for case in self.cases))

    def test_every_case_has_source_checksum_and_fully_passed_system_gate(self) -> None:
        for case in self.cases:
            self.assertTrue(case["sourceChecksums"])
            self.assertEqual(case["unitGate"]["actor"], "SYSTEM_UNIT_GATE")
            self.assertEqual(case["unitGate"]["requiredTestIds"], list(UNIT_TEST_IDS))
            self.assertEqual(case["unitGate"]["passedTestIds"], list(UNIT_TEST_IDS))

    def test_split_is_exact_and_blind_ids_are_sealed(self) -> None:
        self.assertEqual(self.manifest["counts"], {"total": 108, "development": 54, "calibration": 27, "blind": 27})
        all_split_ids = [case_id for split in ("development", "calibration", "blind") for case_id in self.manifest["splits"][split]]
        self.assertEqual(len(all_split_ids), len(set(all_split_ids)))
        self.assertEqual(len(self.manifest["splits"]["blind"]), 27)

    def test_checked_in_artifacts_are_deterministic_and_verified(self) -> None:
        cases, manifest = load_suite()
        self.assertEqual(canonical_json(manifest), canonical_json(self.manifest))
        self.assertEqual(len(cases), 108)
        self.assertRegex(verify_suite(), r"^sha256:[0-9a-f]{64}$")
        self.assertTrue((OUTPUT_ROOT / "development.jsonl").is_file())
        self.assertTrue((OUTPUT_ROOT / "calibration.jsonl").is_file())
        self.assertTrue((OUTPUT_ROOT / "blind.jsonl").is_file())
        self.assertTrue(SUITE_MANIFEST.is_file())

    def test_tampered_case_is_rejected(self) -> None:
        tampered = json.loads(json.dumps(self.cases[0], ensure_ascii=False))
        tampered["expectedOverallOutcome"] = "ANSWER"
        with self.assertRaises(CertifiedCasesError):
            validate_case(tampered)


if __name__ == "__main__":
    unittest.main(verbosity=2)
