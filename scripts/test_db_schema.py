"""Static contract tests for the core Supabase migration and synthetic seed."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810000000_core_schema.sql"
SEED = ROOT / "supabase" / "seed.sql"
CONTRACT = ROOT / "supabase" / "tests" / "core_schema_contract.sql"
RLS_CONTRACT = ROOT / "supabase" / "tests" / "core_rls_contract.sql"

TENANT_TABLES = {
    "tenant_settings",
    "feature_flag_versions",
    "tenant_memberships",
    "departments",
    "department_memberships",
    "department_work_scope_versions",
    "roles",
    "role_permissions",
    "membership_roles",
    "support_access_grants",
    "sla_rule_versions",
    "department_contacts",
    "idempotency_records",
    "domain_outbox",
    "jobs",
    "audit_logs",
}

REQUIRED_TABLES = {
    "tenants",
    "user_accounts",
    *TENANT_TABLES,
}

COMPOSITE_PARENT_PAIRS = {
    ("department_memberships", "tenant_memberships"),
    ("department_memberships", "departments"),
    ("department_work_scope_versions", "departments"),
    ("role_permissions", "roles"),
    ("membership_roles", "tenant_memberships"),
    ("membership_roles", "roles"),
    ("support_access_grants", "tenant_memberships"),
    ("sla_rule_versions", "departments"),
    ("department_contacts", "departments"),
    ("audit_logs", "tenant_memberships"),
    ("audit_logs", "support_access_grants"),
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


class CoreSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration = MIGRATION.read_text(encoding="utf-8")
        cls.seed = SEED.read_text(encoding="utf-8")
        cls.contract = CONTRACT.read_text(encoding="utf-8")
        cls.rls_contract = RLS_CONTRACT.read_text(encoding="utf-8")
        cls.migration_normalized = normalized(cls.migration)

    def test_required_core_tables_and_tenant_columns_exist(self) -> None:
        for table in REQUIRED_TABLES:
            body = table_body(self.migration, table).lower()
            self.assertRegex(body, r"\bid\s+uuid\s+primary\s+key")
            if table in TENANT_TABLES:
                self.assertRegex(body, r"\btenant_id\s+uuid\s+not\s+null")
                self.assertRegex(body, rf"unique \(tenant_id, id\)")
        self.assertRegex(table_body(self.migration, "user_accounts").lower(), r"\bsystem_role\s+text\s+not\s+null")

    def test_composite_tenant_foreign_keys_are_declared(self) -> None:
        for child, parent in COMPOSITE_PARENT_PAIRS:
            child_body = normalized(table_body(self.migration, child))
            pattern = rf"foreign key \(tenant_id, [a-z_]+\) references public\.{parent} \(tenant_id, id\)"
            self.assertRegex(child_body, pattern, msg=f"missing composite FK {child} -> {parent}")

    def test_rls_is_forced_and_write_policy_is_deny_by_default(self) -> None:
        self.assertIn("enable row level security", self.migration_normalized)
        self.assertIn("force row level security", self.migration_normalized)
        self.assertIn("mutation policies are intentionally absent", self.migration.lower())
        self.assertIn("for select to authenticated", self.migration_normalized)
        self.assertNotRegex(self.migration_normalized, r"create policy [^;]+ for all to authenticated")

    def test_required_operational_indexes_and_invariants_exist(self) -> None:
        for index_name in (
            "tenant_memberships_account_idx",
            "department_memberships_department_idx",
            "role_permissions_permission_idx",
            "membership_roles_role_idx",
            "idempotency_expiry_idx",
            "outbox_claim_idx",
            "jobs_claim_idx",
            "jobs_lease_idx",
            "audit_logs_tenant_created_idx",
        ):
            self.assertRegex(self.migration_normalized, rf"create (?:unique )?index if not exists {index_name}")
        self.assertIn("set timezone = 'utc'", self.migration_normalized)
        self.assertIn("for update skip locked", self.contract.lower() + self.migration.lower())
        self.assertIn("append-only", self.migration.lower())

    def test_seed_is_deterministic_synthetic_and_fail_closed(self) -> None:
        for marker in (
            "synthetic-tenant-a",
            "synthetic-tenant-b",
            "Synthetic Department A1",
            "Synthetic Department A2",
            "Synthetic Department B1",
            "DEPARTMENT_HEAD",
            "PR_STAFF",
            "KNOWLEDGE_STAFF",
            "EXECUTIVE",
            "support.access.system",
            "example.invalid",
            "ai_chat_enabled",
            "complaint_ai_routing_enabled",
        ):
            self.assertIn(marker, self.seed)
        self.assertIn("false, false", self.seed)
        self.assertNotRegex(self.seed, r"sk-or-v1-[A-Za-z0-9_-]+")
        self.assertNotIn("citizen_phone", self.seed.lower())

    def test_sql_artifacts_are_additive_and_contract_is_present(self) -> None:
        self.assertNotRegex(self.migration_normalized, r"\bdrop\s+(table|schema)\b")
        self.assertIn("on conflict do nothing", normalized(self.seed))
        self.assertIn("on_error_stop", self.contract.lower().replace(" ", "_"))
        self.assertIn("Asia/Bangkok", self.contract)
        self.assertIn("tenant A must not see tenant B", self.rls_contract)
        self.assertIn("authenticated write unexpectedly succeeded", self.rls_contract)


if __name__ == "__main__":
    unittest.main(verbosity=2)
