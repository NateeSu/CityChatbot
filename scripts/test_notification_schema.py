"""Static contract tests for versioned notification templates and deliveries."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810040000_notification_schema.sql"

TABLES = {"notification_template_versions", "notification_deliveries", "staff_notifications"}


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


class NotificationSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration = MIGRATION.read_text(encoding="utf-8")
        cls.normalized = normalized(cls.migration)

    def test_notification_tables_are_tenant_owned_and_versioned(self) -> None:
        for table in TABLES:
            body = table_body(self.migration, table).lower()
            self.assertRegex(body, r"\bid\s+uuid\s+primary\s+key")
            self.assertRegex(body, r"\btenant_id\s+uuid\s+not\s+null")
            self.assertRegex(body, r"unique \(tenant_id, id\)")
            self.assertRegex(body, r"\brow_version\s+integer\s+not\s+null")

    def test_template_delivery_and_staff_composite_fks_exist(self) -> None:
        for marker in (
            "notification_deliveries_outbox_fk",
            "notification_deliveries_template_fk",
            "staff_notifications_membership_fk",
            "staff_notifications_outbox_fk",
            "notification_deliveries_idempotency_uq",
        ):
            self.assertIn(marker, self.normalized)
        self.assertRegex(
            normalized(table_body(self.migration, "notification_deliveries")),
            r"foreign key \(tenant_id, outbox_id\) references public\.domain_outbox \(tenant_id, id\)",
        )

    def test_event_status_template_and_retry_invariants_are_explicit(self) -> None:
        for marker in (
            "notification_templates_variables_ck",
            "notification_templates_state_ck",
            "notification_deliveries_status_ck",
            "notification_deliveries_attempts_ck",
            "notification_deliveries_max_attempts_ck",
            "notification_deliveries_provider_status_ck",
            "notification_deliveries_claim_idx",
            "notification_deliveries_event_idx",
            "retry_wait",
            "dlq",
        ):
            self.assertIn(marker, self.normalized)

    def test_rls_is_forced_and_authenticated_writes_are_minimal(self) -> None:
        self.assertIn("enable row level security", self.normalized)
        self.assertIn("force row level security", self.normalized)
        for marker in (
            "notification_templates_read_scoped",
            "notification_deliveries_read_scoped",
            "staff_notifications_read_self",
            "staff_notifications_update_self",
            "settings.manage.tenant",
            "revoke insert, update, delete, truncate on table public.notification_deliveries",
        ):
            self.assertIn(marker, self.normalized)
        self.assertNotRegex(self.normalized, r"create policy [^;]+ for all to authenticated")
        self.assertNotRegex(self.normalized, r"\bdrop\s+(table|schema)\b")


if __name__ == "__main__":
    unittest.main(verbosity=2)
