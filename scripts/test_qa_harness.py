import copy
import json
import tempfile
import unittest
from pathlib import Path

from scripts.qa_harness import (
    MANIFEST,
    UNIT_TEST_IDS,
    QAHarnessError,
    build_report,
    load_manifest,
    report_path,
    validate_manifest,
    verify,
)


class QAHarnessTests(unittest.TestCase):
    def test_manifest_has_canonical_tenants_departments_roles_and_citizens(self) -> None:
        manifest = load_manifest()
        validate_manifest(manifest)
        self.assertEqual({tenant["code"] for tenant in manifest["tenants"]}, {"TENANT_A", "TENANT_B"})
        self.assertEqual({department["code"] for department in manifest["departments"]}, {"A1", "A2", "B1"})
        self.assertEqual(len(manifest["citizens"]), 2)
        self.assertEqual(set(manifest["roles"]), {"CITIZEN", "STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN", "SUPPORT"})

    def test_manifest_is_synthetic_and_provider_network_is_disabled(self) -> None:
        manifest = load_manifest()
        self.assertEqual(manifest["productionDataPolicy"], "SYNTHETIC_ONLY")
        self.assertEqual(manifest["networkPolicy"], "NO_EXTERNAL_NETWORK")
        self.assertEqual(manifest["providerMocks"]["openrouter"]["network"], "disabled")
        self.assertTrue(all(citizen["lineUserId"].startswith("U-SYNTHETIC-") for citizen in manifest["citizens"]))

    def test_provider_fixture_has_duplicate_noop_and_system_error_fallback(self) -> None:
        report = build_report(load_manifest())
        self.assertEqual(report["checks"]["providerMocks"]["lineDuplicateDelivery"], "NO_OP")
        self.assertEqual(report["checks"]["providerMocks"]["providerFailureReasonCode"], "SYSTEM_ERROR")

    def test_clock_is_fixed_to_bangkok(self) -> None:
        report = build_report(load_manifest())
        self.assertEqual(report["checks"]["clock"]["timezone"], "Asia/Bangkok")
        self.assertEqual(report["checks"]["clock"]["now"], "2026-08-12T09:30:00+07:00")

    def test_evidence_report_has_revision_seed_hashes_and_all_unit_ids(self) -> None:
        report = build_report(load_manifest())
        self.assertRegex(report["revision"], r"^[0-9a-f]{40}$")
        self.assertTrue(report["seed"])
        self.assertRegex(report["manifestSha256"], r"^sha256:[0-9a-f]{64}$")
        self.assertRegex(report["modelConfigSha256"], r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(report["requiredTestIds"], list(UNIT_TEST_IDS))
        self.assertEqual(report["passedTestIds"], list(UNIT_TEST_IDS))
        self.assertTrue(report["artifactLinks"])

    def test_tenant_mismatch_is_rejected(self) -> None:
        manifest = copy.deepcopy(load_manifest())
        manifest["departments"][0]["tenantId"] = manifest["tenants"][1]["id"]
        with self.assertRaises(QAHarnessError):
            validate_manifest(manifest)

    def test_checked_in_manifest_is_readable(self) -> None:
        self.assertTrue(MANIFEST.is_file())
        self.assertIsInstance(json.loads(MANIFEST.read_text(encoding="utf-8")), dict)


if __name__ == "__main__":
    unittest.main(verbosity=2)
