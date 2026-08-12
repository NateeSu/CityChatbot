import copy
import json
import unittest

from scripts.build_certified_cases import load_suite
from scripts.rag_evaluator import (
    REPEATS,
    UNIT_TEST_IDS,
    RAGEvaluatorError,
    deterministic_response,
    evaluate_suite,
    self_test,
    validate_output,
    verify,
)


class RAGEvaluatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.cases, cls.manifest = load_suite()

    def test_locked_evaluator_covers_every_case_five_times(self) -> None:
        report = evaluate_suite(REPEATS)
        self.assertEqual(report["status"], "PASSED")
        self.assertEqual(report["caseCount"], len(self.cases))
        self.assertEqual(report["runCount"], len(self.cases) * REPEATS)
        self.assertEqual(report["passedCount"], report["runCount"])
        self.assertEqual(report["failedCount"], 0)

    def test_claim_evidence_and_citation_coverage_is_exact_for_no_active_corpus(self) -> None:
        report = evaluate_suite(REPEATS)
        self.assertEqual(report["coverage"]["claimEvidenceCoverage"], 1.0)
        self.assertEqual(report["coverage"]["citationCorrectness"], 1.0)
        self.assertEqual(report["coverage"]["activeCorpusUsed"], 0)
        self.assertTrue(all(not output["claims"] and not output["citations"] for output in report["outputs"]))

    def test_conflict_stale_injection_and_tenant_cases_use_safe_fallback(self) -> None:
        report = evaluate_suite(REPEATS)
        self.assertEqual(report["coverage"]["conflictStaleSafeFallback"], 1.0)
        self.assertEqual(report["coverage"]["promptInjectionSafe"], 1.0)
        self.assertEqual(report["coverage"]["tenantIsolation"], 1.0)
        self.assertTrue(all(output["outcome"] in {"CLARIFY", "HANDOFF"} for output in report["outputs"]))

    def test_evaluator_self_tests_reject_known_bad_answers(self) -> None:
        results = self_test(self.cases[0])
        self.assertTrue(all(value == "PASS" for value in results.values()))
        bad = copy.deepcopy(deterministic_response(self.cases[0], 1))
        bad["outcome"] = "ANSWER"
        bad["reasonCode"] = "ANSWERABLE"
        with self.assertRaises(RAGEvaluatorError):
            validate_output(self.cases[0], bad)

    def test_canonical_reason_and_outcome_fields_are_only_used(self) -> None:
        report = evaluate_suite(REPEATS)
        for output in report["outputs"]:
            self.assertIn(output["outcome"], {"ANSWER", "CLARIFY", "HANDOFF"})
            self.assertNotIn("expectedResponseTemplate", output)
            self.assertNotIn("approval", json.dumps(output, ensure_ascii=False).lower())

    def test_report_has_metrics_hash_and_unit_ids(self) -> None:
        report = evaluate_suite(REPEATS)
        self.assertRegex(report["suiteSha256"], r"^sha256:[0-9a-f]{64}$")
        self.assertRegex(report["outputsSha256"], r"^sha256:[0-9a-f]{64}$")
        self.assertRegex(report["reportSha256"], r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(report["unitTestIds"], list(UNIT_TEST_IDS))
        self.assertIn("costMinor", report["metrics"])

    def test_checked_in_bundle_is_immutable_and_verified(self) -> None:
        report, path = verify()
        self.assertTrue(path.is_file())
        stored = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(stored["reportSha256"], report["reportSha256"])
        self.assertEqual(stored["runCount"], stored["caseCount"] * REPEATS)


if __name__ == "__main__":
    unittest.main(verbosity=2)
