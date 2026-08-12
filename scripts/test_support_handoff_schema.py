"""Static contract tests for the P5-HO-001 support handoff schema."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810120000_support_handoff_schema.sql"
CONTRACT = ROOT / "supabase" / "tests" / "support_handoff_schema_contract.sql"

TABLES = (
    "support_tickets",
    "support_ticket_messages",
    "support_ticket_assignments",
    "support_ticket_status_logs",
    "support_ticket_audit",
)


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).lower()


def table_body(sql: str, table: str) -> str:
    match = re.search(
        rf"create\s+table\s+if\s+not\s+exists\s+public\.{table}\s*\((.*?)\n\);",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise AssertionError(f"missing support table declaration: {table}")
    return match.group(1)


class SupportHandoffSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = MIGRATION.read_text(encoding="utf-8")
        cls.contract = CONTRACT.read_text(encoding="utf-8")
        cls.normalized = normalized(cls.sql)

    def test_all_tenant_support_tables_have_composite_identity(self) -> None:
        for table in TABLES:
            body = normalized(table_body(self.sql, table))
            self.assertRegex(body, r"\btenant_id\s+uuid\s+not\s+null")
            self.assertRegex(body, rf"unique \(tenant_id, id\)")
            self.assertIn("foreign key (tenant_id)", body)

    def test_ticket_contract_closes_status_reason_and_sensitive_trace(self) -> None:
        ticket = normalized(table_body(self.sql, "support_tickets"))
        for marker in (
            "support_tickets_reason_ck",
            "support_tickets_confirmation_ck",
            "support_tickets_status_ck",
            "support_tickets_source_trace_ck",
            "support_tickets_sla_snapshot_ck",
            "support_tickets_request_uq",
            "support_tickets_source_event_uq",
            "support_tickets_intake_queue_fk",
            "support_tickets_assigned_department_fk",
            "support_tickets_assigned_membership_fk",
        ):
            self.assertIn(marker, self.normalized)
        for reason in (
            "no_evidence",
            "conflicting_evidence",
            "low_evidence",
            "sensitive",
            "person_specific",
            "policy_refusal",
            "security",
            "staff_requested",
            "system_error",
        ):
            self.assertIn(reason, ticket)
        self.assertNotRegex(ticket, r"\bline_user_id\s+text")
        self.assertNotRegex(ticket, r"\bsystem_prompt\s+text")

    def test_rls_is_forced_and_browser_writes_are_denied(self) -> None:
        self.assertIn("enable row level security", self.normalized)
        self.assertIn("force row level security", self.normalized)
        self.assertIn("for select to authenticated", self.normalized)
        self.assertNotRegex(self.normalized, r"create policy [^;]+ for all to authenticated")
        self.assertRegex(
            self.normalized,
            r"revoke insert, update, delete, truncate on table\s+public\.support_tickets",
        )

    def test_idempotency_dedupe_sla_and_append_only_boundaries_exist(self) -> None:
        for marker in (
            "support_tickets_citizen_topic_idx",
            "support_ticket_messages_event_uq",
            "support_ticket_messages_sequence_uq",
            "support_tickets_transition",
            "%i_append_only",
            "append_only before update or delete",
            "support_ticket_messages",
            "support_ticket_assignments",
            "support_ticket_status_logs",
            "support_ticket_audit",
            "support.created",
            "support.assigned",
            "invalid_state_transition",
        ):
            self.assertIn(marker, self.normalized)

    def test_sql_contract_and_additive_rollback_boundary_are_present(self) -> None:
        self.assertNotRegex(self.normalized, r"\bdrop\s+(table|schema)\b")
        self.assertIn("support_handoff_sql_contract_pass", self.contract.lower())
        self.assertIn("on_error_stop", self.contract.lower().replace(" ", "_"))
        self.assertIn("current_citizen_identity_hash", self.normalized)


if __name__ == "__main__":
    unittest.main(verbosity=2)
