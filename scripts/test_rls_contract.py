"""Static contract tests for permission-aware RLS hardening."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810010000_rls_policy_hardening.sql"
CONTRACT = ROOT / "supabase" / "tests" / "rls_policy_contract.sql"


class RlsContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration = MIGRATION.read_text(encoding="utf-8")
        cls.contract = CONTRACT.read_text(encoding="utf-8")
        cls.normalized = re.sub(r"\s+", " ", cls.migration).lower()

    def test_permission_aware_helpers_are_security_definer_and_private(self) -> None:
        for function_name in ("private.has_tenant_permission", "private.can_read_department", "private.can_manage_support_access"):
            self.assertIn(f"create or replace function {function_name}", self.normalized)
        self.assertGreaterEqual(self.normalized.count("security definer"), 3)
        self.assertIn("set search_path = pg_catalog, public", self.normalized)

    def test_mutation_policies_have_explicit_using_and_with_check(self) -> None:
        self.assertGreaterEqual(self.normalized.count("with check"), 15)
        self.assertIn("for update to authenticated using", self.normalized)
        self.assertNotRegex(self.normalized, r"create policy [^;]+ for all to authenticated")
        self.assertIn("delete remains denied", self.migration.lower())

    def test_sensitive_paths_and_boundary_fixture_are_present(self) -> None:
        for marker in (
            "domain_outbox",
            "audit_logs",
            "jobs",
            "revoke insert, update, delete, truncate",
            "staff.manage.tenant",
            "support.access.tenant",
        ):
            self.assertIn(marker, self.normalized)
        for marker in (
            "staff A1 department isolation",
            "department_work_scope_versions",
            "00000000-0000-4000-8000-000000000001",
            "00000000-0000-4000-8000-000000000002",
            "30000000-0000-4000-8000-000000000003",
            "staff insert unexpectedly succeeded",
        ):
            self.assertIn(marker, self.contract)

    def test_no_secret_or_destructive_table_operation(self) -> None:
        self.assertNotRegex(self.normalized, r"\bdrop\s+(table|schema)\b")
        self.assertNotRegex(self.migration, r"sk-or-v1-[A-Za-z0-9]{20,}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
