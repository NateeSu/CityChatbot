"""Static contract tests for the complaint schema and state-machine boundary."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810020000_complaint_schema.sql"
SEED = ROOT / "supabase" / "seed.sql"

TENANT_TABLES = {
    "complaint_categories",
    "intake_queues",
    "complaint_number_allocations",
    "complaints",
    "complaint_attachments",
    "complaint_assignments",
    "complaint_status_logs",
    "complaint_comments",
    "complaint_routing_runs",
    "complaint_duplicate_links",
    "complaint_surveys",
}

COMPOSITE_PARENT_PAIRS = {
    ("intake_queues", "departments"),
    ("complaints", "complaint_categories"),
    ("complaints", "intake_queues"),
    ("complaints", "departments"),
    ("complaints", "tenant_memberships"),
    ("complaints", "complaint_number_allocations"),
    ("complaint_attachments", "complaints"),
    ("complaint_assignments", "complaints"),
    ("complaint_assignments", "departments"),
    ("complaint_assignments", "tenant_memberships"),
    ("complaint_status_logs", "complaints"),
    ("complaint_status_logs", "tenant_memberships"),
    ("complaint_comments", "complaints"),
    ("complaint_comments", "tenant_memberships"),
    ("complaint_routing_runs", "complaints"),
    ("complaint_routing_runs", "departments"),
    ("complaint_duplicate_links", "complaints"),
    ("complaint_surveys", "complaints"),
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


class ComplaintSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration = MIGRATION.read_text(encoding="utf-8")
        cls.seed = SEED.read_text(encoding="utf-8")
        cls.normalized = normalized(cls.migration)

    def test_required_tables_are_tenant_owned_and_versioned(self) -> None:
        for table in TENANT_TABLES:
            body = table_body(self.migration, table).lower()
            self.assertRegex(body, r"\bid\s+uuid\s+primary\s+key")
            self.assertRegex(body, r"\btenant_id\s+uuid\s+not\s+null")
            self.assertRegex(body, rf"unique \(tenant_id, id\)")
            if table not in {"complaint_status_logs", "complaint_routing_runs", "complaint_surveys", "complaint_number_allocations"}:
                self.assertRegex(body, r"\brow_version\s+(?:integer|bigint)\s+not\s+null")

    def test_composite_tenant_foreign_keys_and_invariants_are_present(self) -> None:
        for child, parent in COMPOSITE_PARENT_PAIRS:
            child_body = normalized(table_body(self.migration, child))
            if parent == "complaint_number_allocations":
                pattern = rf"foreign key \(tenant_id, complaint_year, [a-z_]+\) references public\.{parent} \(tenant_id, complaint_year, allocation_sequence\)"
            else:
                pattern = rf"foreign key \(tenant_id, [a-z_]+\) references public\.{parent} \(tenant_id, id\)"
            self.assertRegex(child_body, pattern, msg=f"missing composite FK {child} -> {parent}")
        self.assertIn("complaints_category_xor_ck", self.normalized)
        self.assertIn("complaints_location_pair_ck", self.normalized)
        self.assertIn("complaints_number_fk", self.normalized)
        self.assertIn("complaint_duplicate_links_pair_uq", self.normalized)

    def test_numbering_and_database_state_machine_boundaries_exist(self) -> None:
        for marker in (
            "generated always as identity",
            "private.reserve_complaint_number",
            "complaint_number_prefix",
            "private.validate_complaint_transition",
            "invalid_state_transition",
            "complaint.created",
            "complaint.status_changed",
            "complaints_domain_events",
            "complaint_status_logs_append_only",
        ):
            self.assertIn(marker, self.normalized)
        self.assertIn("complaint_ai_routing_enabled", self.seed)
        self.assertIn("a1_general", self.seed.lower())

    def test_rls_is_forced_and_no_broad_policy_exists(self) -> None:
        self.assertGreaterEqual(self.normalized.count("enable row level security"), 1)
        self.assertGreaterEqual(self.normalized.count("force row level security"), 1)
        self.assertNotRegex(self.normalized, r"create policy [^;]+ for all to authenticated")
        self.assertIn("complaints_insert_citizen", self.normalized)
        self.assertIn("complaints_update_staff", self.normalized)
        self.assertIn("with check", self.normalized)

    def test_migration_is_additive_and_seed_is_synthetic(self) -> None:
        self.assertNotRegex(self.normalized, r"\bdrop\s+(table|schema)\b")
        self.assertNotRegex(self.seed, r"sk-or-v1-[A-Za-z0-9_-]+")
        self.assertIn("synthetic", self.seed.lower())
        self.assertNotIn("citizen_phone", self.seed.lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
