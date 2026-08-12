"""Static contract tests for the P5-OPS-001 durable alert boundary."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810130000_support_ops_alerts.sql"
CONTRACT = ROOT / "supabase" / "tests" / "support_ops_alerts_contract.sql"


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).lower()


def table_body(sql: str) -> str:
    match = re.search(
        r"create\s+table\s+if\s+not\s+exists\s+public\.support_ops_alerts\s*\((.*?)\n\);",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise AssertionError("missing support_ops_alerts table declaration")
    return match.group(1)


class SupportOpsAlertsSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = MIGRATION.read_text(encoding="utf-8")
        cls.contract = CONTRACT.read_text(encoding="utf-8")
        cls.normalized = normalized(cls.sql)
        cls.table = normalized(table_body(cls.sql))

    def test_alert_table_is_tenant_owned_with_composite_references(self) -> None:
        self.assertRegex(self.table, r"tenant_id\s+uuid\s+not\s+null")
        self.assertIn("unique (tenant_id, id)", self.table)
        for marker in (
            "support_ops_alerts_ticket_fk",
            "support_ops_alerts_department_fk",
            "support_ops_alerts_key_uq",
            "support_ops_alerts_kind_ck",
            "support_ops_alerts_status_ck",
            "support_ops_alerts_recipient_ck",
        ):
            self.assertIn(marker, self.normalized)

    def test_alert_kinds_and_no_raw_content_boundary_are_closed(self) -> None:
        for kind in (
            "unassigned",
            "stale",
            "response_sla_warning",
            "response_sla_breached",
            "resolution_sla_warning",
            "resolution_sla_breached",
            "orphan_conversation",
        ):
            self.assertIn(kind, self.table)
        self.assertNotRegex(self.table, r"\bbody\s+text")
        self.assertNotRegex(self.table, r"\bline_user_id\s+text")
        self.assertNotRegex(self.table, r"\bsystem_prompt\s+text")

    def test_forced_rls_and_authenticated_writes_are_denied(self) -> None:
        self.assertIn("enable row level security", self.normalized)
        self.assertIn("force row level security", self.normalized)
        self.assertIn("for select to authenticated", self.normalized)
        self.assertNotRegex(self.normalized, r"create policy [^;]+ for all to authenticated")
        self.assertIn("revoke insert, update, delete, truncate on table public.support_ops_alerts from authenticated", self.normalized)

    def test_alert_indexes_and_mutable_version_trigger_exist(self) -> None:
        for index_name in (
            "support_ops_alerts_key_uq",
            "support_ops_alerts_queue_idx",
            "support_ops_alerts_ticket_idx",
            "support_ops_alerts_department_idx",
        ):
            self.assertIn(index_name, self.normalized)
        self.assertIn("support_ops_alerts_touch_updated_at", self.normalized)
        self.assertIn("row_version := old.row_version + 1", self.normalized)

    def test_sql_contract_is_additive_and_present(self) -> None:
        self.assertNotRegex(self.normalized, r"\bdrop\s+(table|schema)\b")
        self.assertIn("support_ops_alerts_sql_contract_pass", self.contract.lower())
        self.assertIn("on_error_stop", self.contract.lower().replace(" ", "_"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
