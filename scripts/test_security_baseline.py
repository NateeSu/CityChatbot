import copy
import re
import unittest
from pathlib import Path

from scripts.security_baseline import (
    DATA_CLASSES,
    DATA_CLASSIFICATION,
    THREAT_IDS,
    THREAT_MODEL,
    UNIT_TEST_IDS,
    SecurityBaselineError,
    load_json,
    validate_data_classification,
    validate_threat_model,
    verify,
)


class SecurityBaselineTests(unittest.TestCase):
    def test_declared_unit_ids_cover_every_threat(self) -> None:
        document = load_json(THREAT_MODEL)
        ids = {test_id for threat in document["threats"] for test_id in threat["requiredUnitTestIds"]}
        self.assertTrue(ids)
        self.assertTrue(ids.issubset(set(UNIT_TEST_IDS)))
        self.assertEqual(tuple(threat["id"] for threat in document["threats"]), THREAT_IDS)

    def test_all_threats_have_preventive_detective_and_automatic_controls(self) -> None:
        document = load_json(THREAT_MODEL)
        validate_threat_model(document)
        for threat in document["threats"]:
            self.assertGreaterEqual(len(threat["preventiveControls"]), 2)
            self.assertGreaterEqual(len(threat["detectiveControls"]), 2)
            self.assertTrue(threat["automaticMitigation"])

    def test_privacy_inventory_covers_four_classes_and_synthetic_test_rule(self) -> None:
        document = load_json(DATA_CLASSIFICATION)
        validate_data_classification(document)
        self.assertEqual(set(document["classes"]), set(DATA_CLASSES))
        self.assertTrue(all(item["devTestRule"] for item in document["inventory"]))
        self.assertEqual(document["classes"]["RESTRICTED"]["aiPolicy"], "NEVER_SEND_TO_AI")

    def test_tampered_threat_without_detection_is_rejected(self) -> None:
        document = copy.deepcopy(load_json(THREAT_MODEL))
        document["threats"][0]["detectiveControls"] = []
        with self.assertRaises(SecurityBaselineError):
            validate_threat_model(document)

    def test_tampered_classification_with_approval_dependency_is_rejected(self) -> None:
        document = copy.deepcopy(load_json(DATA_CLASSIFICATION))
        document["rules"].append("wait for human approval")
        with self.assertRaises(SecurityBaselineError):
            validate_data_classification(document)

    def test_checked_in_baseline_is_deterministic(self) -> None:
        first = verify()
        second = verify()
        self.assertRegex(first, r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(first, second)

    def test_p8_red_team_contract_covers_untrusted_edges_and_fail_closed_boundaries(self) -> None:
        root = Path(__file__).resolve().parents[1]
        route = (root / "apps" / "web" / "app" / "api" / "v1" / "line" / "webhooks" / "[webhookKey]" / "route.ts").read_text(encoding="utf-8")
        storage = (root / "packages" / "storage" / "src" / "storage.ts").read_text(encoding="utf-8")
        ai_safety = (root / "packages" / "security" / "src" / "ai-safety.ts").read_text(encoding="utf-8")
        headers = (root / "packages" / "security" / "src" / "headers.ts").read_text(encoding="utf-8")
        migration_text = "\n".join(path.read_text(encoding="utf-8") for path in (root / "supabase" / "migrations").glob("*.sql"))
        combined = "\n".join((route, storage, ai_safety, headers, migration_text))
        for marker in (
            "request.arrayBuffer()",
            "x-line-signature",
            "processDurableLineWebhook",
            "QUARANTINED",
            "POLYGLOT_DETECTED",
            "TOKEN_REPLAYED",
            "tenantId",
            "CROSS_TENANT",
            "NOT_ALLOWLISTED",
            "frame-ancestors 'none'",
            "force row level security",
            "private.retention_purge_allowed",
        ):
            self.assertIn(marker, combined, marker)
        self.assertNotIn('value: "*"', headers)
        self.assertNotRegex(combined, r"sk-or-v1-[A-Za-z0-9_-]{20,}")
        self.assertNotRegex(combined, r"(?i)select\s+\*\s+from\s+public\.(?:complaints|line_users|knowledge_chunks)\b")

    def test_p8_tenant_and_provider_paths_have_no_wildcard_or_browser_secret_contract(self) -> None:
        root = Path(__file__).resolve().parents[1]
        source_files = [
            root / "packages" / "security" / "src" / "headers.ts",
            root / "apps" / "web" / "app" / "api" / "v1" / "line" / "webhooks" / "[webhookKey]" / "route.ts",
            root / "apps" / "web" / "app" / "api" / "v1" / "citizen" / "runtime.ts",
            root / "apps" / "web" / "app" / "api" / "v1" / "liff" / "runtime.ts",
        ]
        combined = "\n".join(path.read_text(encoding="utf-8") for path in source_files)
        self.assertNotIn('value: "*"', combined)
        self.assertNotIn("NEXT_PUBLIC_DATABASE", combined)
        self.assertNotIn("service_role", combined.lower())
        self.assertNotRegex(combined, r"(?i)tenant_id\s*=\s*req(?:uest)?\.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
