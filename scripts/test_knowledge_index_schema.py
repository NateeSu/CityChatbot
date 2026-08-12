"""Static contract tests for the P4 semantic index and exact-fact schema."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
UNIT_TEST_IDS = (
    "P6-KB-DOCUMENT-LIFECYCLE",
    "P6-KB-UNIT-GATED-ACTIVATION",
    "P6-KB-REPROCESS-FAIL-CLOSED",
    "P6-KB-TENANT-SCOPE",
)
MIGRATION = ROOT / "supabase" / "migrations" / "20260810070000_knowledge_index_schema.sql"
CONTRACT = ROOT / "supabase" / "tests" / "knowledge_index_schema_contract.sql"


def normalized(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).lower()


def table_body(sql: str, table: str) -> str:
    match = re.search(
        rf"create\s+table\s+if\s+not\s+exists\s+public\.{table}\s*\((.*?)\n\);",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise AssertionError(f"missing table declaration: {table}")
    return match.group(1)


class KnowledgeIndexSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration = MIGRATION.read_text(encoding="utf-8")
        cls.contract = CONTRACT.read_text(encoding="utf-8")
        cls.sql = normalized(cls.migration)

    def test_generation_and_fact_tables_are_tenant_owned_and_lineaged(self) -> None:
        generation = table_body(self.migration, "knowledge_index_generations").lower()
        fact = table_body(self.migration, "knowledge_facts").lower()
        for body in (generation, fact):
            body = normalized(body)
            self.assertRegex(body, r"\bid\s+uuid\s+primary\s+key")
            self.assertRegex(body, r"\btenant_id\s+uuid\s+not\s+null")
            self.assertRegex(body, r"unique \(tenant_id, id\)")
            self.assertRegex(body, r"foreign key \(tenant_id, [a-z_]+\) references public\.")
        for field in (
            "document_version_id", "generation", "namespace", "config_hash", "state",
            "chunk_count", "fact_count", "row_version",
        ):
            self.assertIn(field, generation)
        for field in (
            "entity_type", "entity_key", "fact_type", "fact_key", "value_json",
            "normalized_value", "authority_level", "visibility", "source_chunk_id",
            "source_locator_json", "source_quote", "extraction_method", "review_status",
        ):
            self.assertIn(field, fact)

    def test_canonical_chunk_and_fact_guards_are_fail_closed(self) -> None:
        for marker in (
            "knowledge_chunks_generation_fk",
            "knowledge_chunks_generation_index_ck",
            "knowledge_chunks_embedding_ck",
            "knowledge_chunks_search_terms_ck",
            "knowledge_facts_review_ck",
            "knowledge_facts_source_chunk_fk",
            "knowledge_chunks_generation_index_uq",
            "knowledge_facts_key_uq",
            "knowledge_index_generations_active_uq",
        ):
            self.assertIn(marker, self.sql)
        for state in ("building", "ready", "active", "retired", "failed"):
            self.assertIn(state, self.sql)
        for status in ("pending", "approved", "rejected"):
            self.assertIn(status, self.sql)
        self.assertIn("embedding_json", self.sql)
        self.assertIn("pg_trgm", self.sql)

    def test_database_policy_is_scoped_to_active_effective_approved_data(self) -> None:
        self.assertIn("force row level security", self.sql)
        self.assertIn("knowledge_chunks_read_scoped", self.sql)
        self.assertIn("knowledge_facts_read_scoped", self.sql)
        self.assertIn("review_status = 'approved'", self.sql)
        self.assertIn("version.state = 'active'", self.sql)
        self.assertIn("version.effective_from", self.sql)
        self.assertIn("version.effective_until", self.sql)
        self.assertNotRegex(self.sql, r"create policy [^;]+ for all to authenticated")
        self.assertIn("knowledge.manage.tenant", self.sql)

    def test_atomic_activation_and_rollback_are_privileged_and_review_gated(self) -> None:
        for marker in (
            "private.activate_knowledge_index_generation",
            "private.rollback_knowledge_index_generation",
            "all index facts require review before activation",
            "rollback target has unreviewed facts",
            "state = 'retired'",
            "state = 'active'",
        ):
            self.assertIn(marker, self.sql)
        self.assertIn("security definer", self.sql)
        self.assertIn("grant execute on function private.activate_knowledge_index_generation", self.sql)
        self.assertIn("grant execute on function private.rollback_knowledge_index_generation", self.sql)

    def test_contract_is_additive_and_does_not_contain_credentials(self) -> None:
        self.assertNotRegex(self.sql, r"\bdrop\s+(table|schema)\b")
        self.assertNotRegex(self.migration, r"sk-or-v1-[a-z0-9]{20,}")
        self.assertIn("on_error_stop", self.contract.lower().replace(" ", "_"))
        self.assertIn("forced RLS", self.contract)
        self.assertIn("tenant A must not see tenant B", self.contract)


if __name__ == "__main__":
    unittest.main(verbosity=2)
