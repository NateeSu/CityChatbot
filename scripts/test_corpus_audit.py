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

from audit_corpus import (  # noqa: E402
    EXPECTED_BASELINE,
    build_manifest,
    canonical_json,
    extract_docx,
    audit_file,
)


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

    def test_fail_safe_governance_blocks_every_file_from_active_index(self) -> None:
        self.assertEqual(self.manifest["governanceSummary"]["activeIndexEligibleFileCount"], 0)
        self.assertFalse(self.manifest["governanceSummary"]["ownerAssignmentsComplete"])
        self.assertIn("OD-001", self.manifest["governanceSummary"]["blockedBy"])
        self.assertTrue(
            all(not record["governance"]["activeIndexEligible"] for record in self.manifest["files"])
        )

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
