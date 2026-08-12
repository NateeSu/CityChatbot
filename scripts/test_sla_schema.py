"""Static contract tests for SLA calendars, rule versions and complaint snapshots."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810030000_sla_schema.sql"
SEED = ROOT / "supabase" / "seed.sql"

SLA_TABLES = {
    "business_calendars",
    "business_calendar_days",
    "complaint_sla_snapshots",
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


class SlaSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration = MIGRATION.read_text(encoding="utf-8")
        cls.seed = SEED.read_text(encoding="utf-8")
        cls.normalized = normalized(cls.migration)

    def test_calendar_and_snapshot_tables_are_tenant_owned_and_versioned(self) -> None:
        for table in SLA_TABLES:
            body = table_body(self.migration, table).lower()
            self.assertRegex(body, r"\bid\s+uuid\s+primary\s+key")
            self.assertRegex(body, r"\btenant_id\s+uuid\s+not\s+null")
            self.assertRegex(body, rf"unique \(tenant_id, id\)")
            self.assertRegex(body, r"\brow_version\s+(?:integer|bigint)\s+not\s+null")

    def test_composite_tenant_foreign_keys_keep_calendar_and_snapshot_scope(self) -> None:
        for child, parent, column in (
            ("business_calendar_days", "business_calendars", "calendar_id"),
            ("complaint_sla_snapshots", "complaints", "complaint_id"),
            ("complaint_sla_snapshots", "sla_rule_versions", "sla_rule_version_id"),
            ("complaint_sla_snapshots", "business_calendars", "calendar_id"),
            ("complaint_sla_snapshots", "departments", "department_id"),
            ("complaint_sla_snapshots", "complaint_categories", "category_id"),
        ):
            body = normalized(table_body(self.migration, child))
            self.assertRegex(
                body,
                rf"foreign key \(tenant_id, {column}\) references public\.{parent} \(tenant_id, id\)",
                msg=f"missing composite FK {child} -> {parent}",
            )
        self.assertIn("complaints_sla_snapshot_fk", self.normalized)

    def test_rule_precedence_snapshot_fields_and_calendar_invariants_exist(self) -> None:
        for marker in (
            "alter column department_id drop not null",
            "category_id uuid",
            "priority text",
            "calendar_id uuid",
            "pause_statuses jsonb",
            "warning_ratio numeric",
            "sla_rules_scope_version_uq",
            "response_warning_at",
            "response_due_at",
            "resolution_warning_at",
            "resolution_due_at",
            "paused_business_seconds",
            "business_calendars_timezone_ck",
            "business_calendars_weekdays_ck",
            "complaint_sla_snapshots_rule_version_ck",
            "complaint_sla_snapshots_warning_ratio_ck",
        ):
            self.assertIn(marker, self.normalized)

    def test_rls_is_forced_and_snapshot_writes_are_trusted_only(self) -> None:
        self.assertGreaterEqual(self.normalized.count("enable row level security"), 1)
        self.assertGreaterEqual(self.normalized.count("force row level security"), 1)
        for marker in (
            "business_calendars_read_scoped",
            "business_calendar_days_read_scoped",
            "sla_rules_read_scoped",
            "complaint_sla_snapshots_read_staff",
            "settings.manage.tenant",
            "revoke insert, update, delete, truncate on table public.complaint_sla_snapshots",
        ):
            self.assertIn(marker, self.normalized)
        self.assertNotRegex(self.normalized, r"create policy [^;]+ for all to authenticated")

    def test_migration_is_additive_and_seed_is_synthetic(self) -> None:
        self.assertNotRegex(self.normalized, r"\bdrop\s+(table|schema)\b")
        self.assertNotRegex(self.seed, r"sk-or-v1-[A-Za-z0-9_-]+")
        for marker in ("business_calendars", "synthetic_bkk", "Asia/Bangkok", "WAITING_FOR_CITIZEN"):
            self.assertIn(marker, self.seed)


if __name__ == "__main__":
    unittest.main(verbosity=2)
