"""Static contract tests for P4 document governance and ingestion schema."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810060000_knowledge_document_schema.sql"
SEED = ROOT / "supabase" / "seed.sql"
CONTRACT = ROOT / "supabase" / "tests" / "knowledge_schema_contract.sql"

TABLES = {
    "knowledge_categories",
    "knowledge_documents",
    "knowledge_document_versions",
    "knowledge_artifacts",
    "knowledge_chunks",
    "knowledge_approvals",
    "ingestion_runs",
}

COMPOSITE_FKS = {
    ("knowledge_documents", "departments"),
    ("knowledge_documents", "knowledge_categories"),
    ("knowledge_document_versions", "knowledge_documents"),
    ("knowledge_document_versions", "departments"),
    ("knowledge_document_versions", "knowledge_categories"),
    ("knowledge_document_versions", "knowledge_document_versions"),
    ("knowledge_artifacts", "knowledge_document_versions"),
    ("knowledge_chunks", "knowledge_document_versions"),
    ("knowledge_chunks", "knowledge_chunks"),
    ("knowledge_approvals", "knowledge_document_versions"),
    ("ingestion_runs", "knowledge_document_versions"),
    ("ingestion_runs", "jobs"),
}


def table_body(sql: str, table: str) -> str:
    match = re.search(
        rf"create\s+table\s+if\s+not\s+exists\s+public\.{table}\s*\((.*?)\n\);",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise AssertionError(f"missing table declaration: {table}")
    return match.group(1)


def normalized(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).lower()


class KnowledgeSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration = MIGRATION.read_text(encoding="utf-8")
        cls.seed = SEED.read_text(encoding="utf-8")
        cls.contract = CONTRACT.read_text(encoding="utf-8")
        cls.normalized_migration = normalized(cls.migration)

    def test_required_tables_are_tenant_owned_and_versioned(self) -> None:
        for table in TABLES:
            body = table_body(self.migration, table).lower()
            self.assertRegex(body, r"\bid\s+uuid\s+primary\s+key")
            self.assertRegex(body, r"\btenant_id\s+uuid\s+not\s+null")
            self.assertRegex(body, rf"unique \(tenant_id, id\)")
        versions = table_body(self.migration, "knowledge_document_versions").lower()
        for field in (
            "checksum_sha256",
            "owner_department_id",
            "knowledge_category_id",
            "effective_from",
            "effective_until",
            "effective_date_unknown",
            "approval_status",
            "approved_by",
            "review_due_at",
        ):
            self.assertIn(field, versions)

    def test_composite_tenant_foreign_keys_are_present(self) -> None:
        for child, parent in COMPOSITE_FKS:
            child_body = normalized(table_body(self.migration, child))
            self.assertRegex(
                child_body,
                rf"foreign key \(tenant_id, [a-z_]+\) references public\.{parent} \(tenant_id, id\)",
                msg=f"missing composite FK {child} -> {parent}",
            )

    def test_canonical_state_and_publish_guards_are_fail_closed(self) -> None:
        canonical = (
            "quarantined", "validating", "malware_scanning", "parsing", "normalizing",
            "extracting_facts", "needs_review", "conflict_check", "indexing", "evaluating",
            "approved", "active", "failed", "retired",
        )
        for state in canonical:
            self.assertIn(state, self.normalized_migration)
        for forbidden in ("'ready'", "'expired'", "'disabled'", "'testing'"):
            self.assertNotIn(forbidden, self.normalized_migration)
        for marker in (
            "knowledge_versions_active_uq",
            "knowledge_versions_checksum_uq",
            "uploads must start in quarantined",
            "active requires atomic approved publish",
            "knowledge document versions are immutable after upload",
            "private.approve_knowledge_document_version",
            "private.activate_knowledge_document_version",
            "private.rollback_knowledge_document_version",
        ):
            self.assertIn(marker, self.normalized_migration)

    def test_rls_and_explicit_policy_boundaries_exist(self) -> None:
        for table in TABLES:
            self.assertIn(f"'{table}'", self.normalized_migration)
        self.assertIn("enable row level security", self.normalized_migration)
        self.assertIn("force row level security", self.normalized_migration)
        self.assertIn("for insert to authenticated", self.normalized_migration)
        self.assertIn("with check", self.normalized_migration)
        self.assertNotRegex(self.normalized_migration, r"create policy [^;]+ for all to authenticated")
        self.assertIn("knowledge.manage.tenant", self.seed)
        self.assertIn("knowledge_categories", self.seed)

    def test_contract_is_real_and_sql_is_additive(self) -> None:
        self.assertIn("on_error_stop", self.contract.lower().replace(" ", "_"))
        self.assertIn("forced RLS", self.contract)
        self.assertIn("tenant A must not see tenant B", self.contract)
        self.assertNotRegex(self.normalized_migration, r"\bdrop\s+(table|schema)\b")
        self.assertNotRegex(self.migration, r"sk-or-v1-[A-Za-z0-9]{20,}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
