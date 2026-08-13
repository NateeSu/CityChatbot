#!/usr/bin/env python3
"""Deterministic regression tests for the corpus audit tool."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

UNIT_TEST_IDS = (
    "P0-COR-AUDIT-BASELINE",
    "P0-COR-DETERMINISTIC-MANIFEST",
    "P0-COR-CONFLICT-QUARANTINE",
    "P0-COR-OOXML-CONTROL",
    "P0-COR-MACRO-REJECT",
    "P8-RAG-PARSER",
    "P8-RAG-RECALL",
    "P8-RAG-CITATION",
    "P8-RAG-CONFLICT-STALE",
    "P8-RAG-INJECTION-TENANT",
    "P9-KNOW-CORPUS-AUTHORITY",
    "P9-KNOW-DETERMINISTIC-MANIFEST",
    "P9-KNOW-CONFLICT-SEGMENT-POLICY",
    "P9-KNOW-OOXML-CONTROL",
    "P9-KNOW-MACRO-REJECT",
    "P9-KNOW-SAFETY-REGRESSION",
)

from audit_corpus import (  # noqa: E402
    EXPECTED_BASELINE,
    build_manifest,
    canonical_json,
    extract_docx,
    audit_file,
)
from rag_evaluator import REPEATS, evaluate_suite, self_test  # noqa: E402


class CorpusAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.corpus = ROOT / "doc_rag_test"
        cls.manifest_path = ROOT / "docs" / "corpus" / "corpus-manifest.json"
        cls.manifest = build_manifest(cls.corpus, "corpus-2026-08-10")

    def test_frozen_corpus_counts_match_spec(self) -> None:
        for key, expected in EXPECTED_BASELINE.items():
            self.assertEqual(self.manifest["summary"][key], expected, key)
        self.assertTrue(self.manifest["frozenBaseline"]["allChecksPass"])

    def test_manifest_is_deterministic_and_matches_checked_in_artifact(self) -> None:
        second = build_manifest(self.corpus, "corpus-2026-08-10")
        self.assertEqual(canonical_json(self.manifest), canonical_json(second))
        checked_in = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(canonical_json(self.manifest), canonical_json(checked_in))

    def test_project_owner_authority_makes_intact_files_screened_ingestion_eligible(self) -> None:
        authorization = self.manifest["authorization"]
        self.assertEqual(authorization["declaredBy"], "PROJECT_OWNER")
        self.assertEqual(authorization["owner"], "SYSTEM_UNIT_GATE")
        self.assertEqual(self.manifest["governanceSummary"]["activeIndexEligibleFileCount"], EXPECTED_BASELINE["fileCount"])
        self.assertTrue(self.manifest["governanceSummary"]["ownerAssignmentsComplete"])
        self.assertTrue(self.manifest["governanceSummary"]["authorityAssignmentsComplete"])
        self.assertTrue(self.manifest["governanceSummary"]["effectiveDateAssignmentsComplete"])
        self.assertNotIn("OD-001", self.manifest["governanceSummary"]["blockedBy"])
        self.assertTrue(all(record["governance"]["activeIndexEligible"] for record in self.manifest["files"]))

    def test_conflict_ledger_is_attached_to_known_sources(self) -> None:
        by_name = {record["filename"]: record for record in self.manifest["files"]}
        self.assertIn("CR-001", by_name["งานทะเบียนราษฎรและบัตรประจำตัวประชาชน .docx"]["governance"]["blockedBy"])
        self.assertIn("CR-004", by_name["กองสาธารณสุข (2).docx"]["governance"]["blockedBy"])
        self.assertIn("CR-010", by_name["สถานธนานุบาลเทศบาลเมืองฉะเชิงเทรา 1.docx"]["governance"]["blockedBy"])

    def test_ooxml_content_control_keeps_adl_comparator(self) -> None:
        source = self.corpus / "กองสาธารณสุข (2).docx"
        extracted = extract_docx(source)
        self.assertTrue(extracted["containsInlineContentControls"])
        self.assertIn("≤ 6", extracted["displayText"])
        record = next(item for item in self.manifest["files"] if item["filename"] == source.name)
        self.assertEqual(
            record["audit"]["requiredComparatorRegression"],
            "ADL ≤ 6 present in extracted text",
        )

    def test_integrity_digests_are_present(self) -> None:
        integrity = self.manifest["integrity"]
        self.assertRegex(integrity["manifestDigest"], r"^sha256:[0-9a-f]{64}$")
        self.assertRegex(integrity["sourceSetDigest"], r"^sha256:[0-9a-f]{64}$")

    def test_macro_docx_is_rejected_and_quarantined(self) -> None:
        document_xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            '<w:body><w:p><w:r><w:t>safe text</w:t></w:r></w:p></w:body></w:document>'
        ).encode("utf-8")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "macro.docx"
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr("[Content_Types].xml", "<Types/>")
                archive.writestr("word/document.xml", document_xml)
                archive.writestr("word/vbaProject.bin", b"not executable in test")
            record = audit_file(source, root)
            self.assertEqual(record["governance"]["disposition"], "REJECT")
            self.assertIn("MACRO_DETECTED", record["governance"]["remediationReasons"])

    def test_locked_rag_parser_recall_and_claim_citation_contract(self) -> None:
        report = evaluate_suite(REPEATS)
        self.assertEqual(report["status"], "PASSED")
        self.assertEqual(report["runCount"], report["caseCount"] * REPEATS)
        self.assertEqual(report["passedCount"], report["runCount"])
        self.assertEqual(report["coverage"]["claimEvidenceCoverage"], 1.0)
        self.assertEqual(report["coverage"]["citationCorrectness"], 1.0)

    def test_locked_rag_conflict_stale_injection_and_tenant_boundaries(self) -> None:
        report = evaluate_suite(REPEATS)
        self.assertEqual(report["coverage"]["conflictStaleSafeFallback"], 1.0)
        self.assertEqual(report["coverage"]["promptInjectionSafe"], 1.0)
        self.assertEqual(report["coverage"]["tenantIsolation"], 1.0)
        self.assertEqual(report["coverage"]["activeCorpusUsed"], 0)
        self.assertTrue(all(output["outcome"] in {"CLARIFY", "HANDOFF"} for output in report["outputs"]))
        self.assertTrue(all(value == "PASS" for value in self_test(_first_case()).values()))


def _first_case() -> dict:
    from build_certified_cases import load_suite

    cases, _ = load_suite()
    return cases[0]


if __name__ == "__main__":
    unittest.main(verbosity=2)
