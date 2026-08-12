"""Static contract tests for versioned, tenant-scoped retrieval policy config."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810080000_retrieval_policy_schema.sql"
CONTRACT = ROOT / "supabase" / "tests" / "retrieval_policy_schema_contract.sql"


def normalized(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).lower()


def table_body(sql: str) -> str:
    match = re.search(
        r"create\s+table\s+if\s+not\s+exists\s+public\.retrieval_policy_versions\s*\((.*?)\n\);",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise AssertionError("missing retrieval_policy_versions table")
    return match.group(1)


class RetrievalPolicySchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration = MIGRATION.read_text(encoding="utf-8")
        cls.contract = CONTRACT.read_text(encoding="utf-8")
        cls.sql = normalized(cls.migration)
        cls.table = normalized(table_body(cls.migration))

    def test_policy_is_tenant_owned_and_versioned(self) -> None:
        self.assertRegex(self.table, r"\bid\s+uuid\s+primary\s+key")
        self.assertRegex(self.table, r"\btenant_id\s+uuid\s+not\s+null")
        self.assertIn("unique (tenant_id, id)", self.table)
        self.assertIn("foreign key (tenant_id) references public.tenants (id)", self.table)
        for field in (
            "policy_key", "version", "policy_hash", "rrf_k", "dense_candidate_k",
            "lexical_candidate_k", "rerank_k", "evidence_k", "context_budget_tokens",
            "min_calibrated_score", "config_json", "effective_from", "effective_until",
        ):
            self.assertIn(field, self.table)

    def test_top_k_and_score_invariants_are_database_checked(self) -> None:
        for marker in (
            "retrieval_policy_versions_positive_ck",
            "retrieval_policy_versions_score_ck",
            "retrieval_policy_versions_weight_ck",
            "retrieval_policy_versions_window_ck",
            "retrieval_policy_versions_approval_ck",
            "retrieval_policy_versions_active_uq",
        ):
            self.assertIn(marker, self.sql)
        for state in ("draft", "approved", "active", "retired"):
            self.assertIn(state, self.sql)

    def test_rls_and_atomic_policy_lifecycle_are_fail_closed(self) -> None:
        self.assertIn("enable row level security", self.sql)
        self.assertIn("force row level security", self.sql)
        self.assertIn("retrieval_policy_versions_read_active", self.sql)
        self.assertIn("retrieval_policy_activation", self.sql)
        self.assertIn("private.approve_retrieval_policy_version", self.sql)
        self.assertIn("private.activate_retrieval_policy_version", self.sql)
        self.assertIn("private.rollback_retrieval_policy_version", self.sql)
        self.assertIn("private.get_active_retrieval_policy", self.sql)
        self.assertNotRegex(self.sql, r"create policy [^;]+ for all to authenticated")
        self.assertIn("knowledge.manage.tenant", self.sql)

    def test_policy_configuration_is_immutable_after_approval(self) -> None:
        self.assertIn("approved retrieval policy configuration is immutable", self.sql)
        self.assertIn("activation must use atomic function", self.sql)
        self.assertIn("state = 'retired'", self.sql)
        self.assertIn("state = 'active'", self.sql)

    def test_contract_is_additive_and_contains_no_credentials(self) -> None:
        self.assertNotRegex(self.sql, r"\bdrop\s+(table|schema)\b")
        self.assertNotRegex(self.migration, r"sk-or-v1-[a-z0-9]{20,}")
        self.assertIn("on_error_stop", self.contract.lower().replace(" ", "_"))
        self.assertIn("tenant A must not see tenant B", self.contract)


if __name__ == "__main__":
    unittest.main(verbosity=2)
