"""Regression tests for the Project Owner-authorized municipal corpus bundle."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

try:
    from scripts.authorized_corpus_activation import (
        ACTIVATION_SCHEMA_VERSION,
        LEDGER,
        MANIFEST,
        POLICY,
        REQUIRED_TEST_IDS,
        ROOT,
        TARGET_TENANT_SLUG,
        build_activation,
        canonical_json,
    )
except ModuleNotFoundError:  # pragma: no cover - direct script invocation
    from authorized_corpus_activation import (
        ACTIVATION_SCHEMA_VERSION,
        LEDGER,
        MANIFEST,
        POLICY,
        REQUIRED_TEST_IDS,
        ROOT,
        TARGET_TENANT_SLUG,
        build_activation,
        canonical_json,
    )


UNIT_TEST_IDS = (
    "P9-KNOW-CORPUS-AUTHORITY",
    "P9-KNOW-DETERMINISTIC-MANIFEST",
    "P9-KNOW-CONFLICT-SEGMENT-POLICY",
    "P9-KNOW-PII-TEMPLATE-QR-EXCLUSION",
    "P9-KNOW-EXACT-SYMBOL-PRESERVATION",
    "P9-KNOW-IDEMPOTENT-ACTIVATION-SQL",
    "P9-KNOW-TENANT-SCOPED-ROLLBACK",
    "P9-KNOW-GROUNDED-ANSWER",
    "P9-KNOW-SAFE-HANDOFF",
)


class AuthorizedCorpusActivationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.activation_manifest, cls.activation_sql, cls.rollback_sql = build_activation()
        cls.documents = cls.activation_manifest["documents"]

    def test_project_owner_authority_and_source_artifacts_are_consistent(self) -> None:
        policy = json.loads(POLICY.read_text(encoding="utf-8"))
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
        self.assertEqual(policy["declaredBy"], "PROJECT_OWNER")
        self.assertEqual(policy["automaticActor"], "SYSTEM_UNIT_GATE")
        self.assertEqual(manifest["authorization"]["policyVersion"], policy["policyVersion"])
        self.assertEqual(ledger["summary"]["activeIndexEligibleCount"], 0)
        self.assertEqual(len(self.documents), 17)
        self.assertEqual(self.activation_manifest["schemaVersion"], ACTIVATION_SCHEMA_VERSION)
        self.assertEqual(set(REQUIRED_TEST_IDS), set(UNIT_TEST_IDS))

    def test_activation_manifest_and_sql_are_deterministic(self) -> None:
        second_manifest, second_sql, second_rollback = build_activation()
        self.assertEqual(canonical_json(self.activation_manifest), canonical_json(second_manifest))
        self.assertEqual(self.activation_sql, second_sql)
        self.assertEqual(self.rollback_sql, second_rollback)
        self.assertRegex(self.activation_manifest["integrity"]["activationManifestHash"], r"^sha256:[0-9a-f]{64}$")

    def test_conflicted_and_personal_content_is_not_in_public_chunks_or_facts(self) -> None:
        self.assertNotIn("081-6823355", self.activation_sql)
        self.assertNotIn("QR พ่นยุง", self.activation_sql)
        self.assertNotIn("ดอกเบี้ย", self.activation_sql)
        executive = next(document for document in self.documents if document["filename"] == "คณะผู้บริหาร.txt")
        self.assertEqual(executive["chunkCount"], 1)
        self.assertTrue(all("ดอกเบี้ย" not in fact["factKey"] for fact in self.activation_manifest["safeFacts"]))
        excluded_reasons = {item["reason"] for item in self.activation_manifest["excluded"]}
        for reason in ("CR-001_MISMATCHED_DEATH_FAQ", "CR-005_AMBIGUOUS_INTEREST", "CR-011_UNDECODED_QR", "CR-012_PERSONAL_CONTACT_SOURCE", "CR-014_MEDICAL_GUIDANCE"):
            self.assertIn(reason, excluded_reasons)

    def test_exact_comparator_and_safe_fact_anchors_survive_screening(self) -> None:
        self.assertIn("≤ 6", self.activation_sql)
        safe_fact_ids = {fact["factKey"] for fact in self.activation_manifest["safeFacts"]}
        self.assertEqual(len(safe_fact_ids), len(self.activation_manifest["safeFacts"]))
        self.assertGreaterEqual(len(safe_fact_ids), 6)
        self.assertIn("fitness-single-visit-fee", " ".join(safe_fact_ids))
        self.assertIn("kcc-weekday-hours", " ".join(safe_fact_ids))

    def test_generated_sql_is_idempotent_auditable_and_machine_gated(self) -> None:
        self.assertIn("on conflict (tenant_id, source_key) do nothing", self.activation_sql)
        self.assertIn("on conflict (tenant_id, id) do nothing", self.activation_sql)
        self.assertIn("private.activate_knowledge_document_version_unit_gated", self.activation_sql)
        self.assertIn("private.activate_knowledge_index_generation_unit_gated", self.activation_sql)
        self.assertIn("Repeat with the same machine receipt is idempotent", self.activation_sql)
        self.assertIn("has a different receipt", self.activation_sql)
        self.assertIn("SYSTEM_UNIT_GATE", self.activation_sql)
        self.assertIn(TARGET_TENANT_SLUG, self.activation_sql)
        self.assertNotIn("service_role", self.activation_sql.lower())
        self.assertNotIn("sk-or-v1-", self.activation_sql)

    def test_generated_rollback_is_narrow_and_retains_history(self) -> None:
        self.assertIn(TARGET_TENANT_SLUG, self.rollback_sql)
        self.assertIn("state = 'RETIRED'", self.rollback_sql)
        self.assertIn("id = any(array[", self.rollback_sql.lower())
        self.assertNotIn("delete from", self.rollback_sql.lower())
        self.assertNotIn("truncate", self.rollback_sql.lower())

    def test_additive_database_migration_has_parallel_index_receipt_guard(self) -> None:
        migration = (ROOT / "supabase" / "migrations" / "20260813030000_authorized_corpus_index_unit_gate.sql").read_text(encoding="utf-8").lower()
        for marker in (
            "activation_status", "unit_gate_report_hash", "system_unit_gate",
            "activate_knowledge_index_generation_unit_gated", "security definer",
            "all index facts require unit-gated review before activation",
        ):
            self.assertIn(marker, migration)
        self.assertNotIn("drop table", migration)
def verify_sql_contract() -> None:
    manifest, activation_sql, rollback_sql = build_activation()
    if manifest["schemaVersion"] != ACTIVATION_SCHEMA_VERSION:
        raise AssertionError("activation manifest schema mismatch")
    if TARGET_TENANT_SLUG not in activation_sql or "private.activate_knowledge_index_generation_unit_gated" not in activation_sql:
        raise AssertionError("activation SQL contract missing")
    if "delete from" in rollback_sql.lower() or "id = any(array[" not in rollback_sql.lower():
        raise AssertionError("rollback SQL is not retained-history and tenant-scoped")


if __name__ == "__main__":
    if "--verify-sql" in sys.argv:
        verify_sql_contract()
        print("AUTHORIZED_CORPUS_SQL_CONTRACT_VERIFIED")
    else:
        unittest.main(verbosity=2)
