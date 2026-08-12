import json
import tempfile
import unittest
from pathlib import Path

try:
    from e2e_certification import E2ECertificationError, canonical_json, external_dependencies, validate_report_contract, write_report
except ModuleNotFoundError:
    from scripts.e2e_certification import E2ECertificationError, canonical_json, external_dependencies, validate_report_contract, write_report


ROOT = Path(__file__).resolve().parents[1]
UAT_MANIFEST = ROOT / "docs" / "qa" / "p8-uat-001-manifest.json"
UAT_RUNBOOK = ROOT / "docs" / "operations" / "p8-uat-001.md"


UNIT_TEST_IDS = (
    "P8-E2E-LIFF",
    "P8-E2E-LINE",
    "P8-E2E-ADMIN",
    "P8-E2E-CLEANUP",
    "P8-UAT-JOURNEYS",
    "P8-UAT-HANDOFF",
    "P8-UAT-ROLLBACK",
    "P8-UAT-ARTIFACT-LINKS",
)


class E2ECertificationTests(unittest.TestCase):
    def test_canonical_json_is_stable(self) -> None:
        self.assertEqual(canonical_json({"b": 2, "a": 1}), canonical_json({"a": 1, "b": 2}))

    def test_report_write_is_immutable(self) -> None:
        report = {"schemaVersion": 1, "taskId": "P8-E2E-001", "reportSha256": "abc"}
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "e2e.json"
            write_report(path, report)
            write_report(path, report)
            altered = dict(report, reportSha256="changed")
            with self.assertRaisesRegex(E2ECertificationError, "immutable"):
                write_report(path, altered)

    def test_report_is_json_object(self) -> None:
        report = {"schemaVersion": 1, "taskId": "P8-E2E-001", "reportSha256": "abc"}
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "e2e.json"
            write_report(path, report)
            self.assertIsInstance(json.loads(path.read_text(encoding="utf-8")), dict)

    def test_journey_contract_reconciles_local_checks_and_cleanup(self) -> None:
        report = {
            "schemaVersion": 1,
            "taskId": "P8-E2E-001",
            "mode": "local-synthetic",
            "summary": {"localChecks": 2, "localPassed": 2, "localFailed": 0, "externalNotAvailable": 1},
            "journeys": [{"id": "J01", "checks": [{"status": "PASS"}, {"status": "PASS"}]}],
            "cleanup": {"syntheticData": "in-memory/local only", "productionDataTouched": False},
            "externalDependencies": [{"id": "J01-LINE", "status": "NOT_AVAILABLE"}],
        }
        validate_report_contract(report)
        with self.assertRaisesRegex(E2ECertificationError, "production data"):
            validate_report_contract({**report, "cleanup": {"productionDataTouched": True}})

    def test_external_dependencies_are_explicitly_fail_closed(self) -> None:
        dependencies = external_dependencies()
        self.assertGreaterEqual(len(dependencies), 1)
        self.assertTrue(all(item["status"] == "NOT_AVAILABLE" for item in dependencies))
        self.assertTrue(all(item.get("reason") for item in dependencies))

    def test_unit_gate_ids_cover_journey_and_artifact_boundaries(self) -> None:
        self.assertEqual(len(UNIT_TEST_IDS), len(set(UNIT_TEST_IDS)))
        for test_id in ("P8-E2E-LIFF", "P8-E2E-LINE", "P8-E2E-ADMIN", "P8-E2E-CLEANUP"):
            self.assertIn(test_id, UNIT_TEST_IDS)
        for test_id in ("P8-UAT-JOURNEYS", "P8-UAT-HANDOFF", "P8-UAT-ROLLBACK", "P8-UAT-ARTIFACT-LINKS"):
            self.assertIn(test_id, UNIT_TEST_IDS)

    def test_uat_role_manifest_and_training_artifact_are_complete(self) -> None:
        manifest = json.loads(UAT_MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(manifest["schemaVersion"], "uat-harness.v1")
        self.assertEqual(manifest["taskId"], "P8-UAT-001")
        self.assertEqual(manifest["mode"], "AUTOMATED_UNIT_HARNESS")
        self.assertFalse(manifest["productionDataTouched"])
        self.assertFalse(manifest["manualSignOffRequired"])
        required_roles = {"CITIZEN", "STAFF", "DEPARTMENT_HEAD", "KNOWLEDGE_STAFF", "PR_STAFF", "TENANT_ADMIN", "EXECUTIVE"}
        self.assertTrue(required_roles.issubset(set(manifest["roles"])))
        self.assertEqual(set(manifest["canonicalOutcomes"]), {"ANSWER", "CLARIFY", "HANDOFF"})
        self.assertGreaterEqual(len(manifest["journeys"]), len(required_roles))
        for journey in manifest["journeys"]:
            self.assertRegex(journey["id"], r"^UAT-[A-Z0-9-]+$")
            self.assertIn(journey["role"], required_roles)
            self.assertTrue(journey["assertion"])
            self.assertTrue(journey["artifact"].startswith("docs/operations/p8-uat-001.md#"))

        runbook = UAT_RUNBOOK.read_text(encoding="utf-8")
        for marker in (
            "productionDataTouched: false",
            "NOT_AVAILABLE",
            "idempotency",
            "tenant-scoped",
            "quarantined",
            "unit-gated",
            "CLARIFY",
            "HANDOFF",
            "canonical reason code",
            "Do not overwrite",
            "health",
            "smoke checks",
        ):
            self.assertIn(marker.lower(), runbook.lower(), marker)

    def test_uat_artifact_links_resolve_inside_repository(self) -> None:
        manifest = json.loads(UAT_MANIFEST.read_text(encoding="utf-8"))
        for journey in manifest["journeys"]:
            artifact, anchor = journey["artifact"].split("#", 1)
            path = ROOT / artifact
            self.assertTrue(path.is_file(), artifact)
            self.assertIn(f"{{#{anchor}}}", path.read_text(encoding="utf-8"), journey["id"])


if __name__ == "__main__":
    unittest.main()
