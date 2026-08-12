"""Static contract tests for P4-CHAT-002 chat state and trace schema."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810100000_ai_chat_schema.sql"
CONTRACT = ROOT / "supabase" / "tests" / "ai_chat_schema_contract.sql"


class AiChatSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration = MIGRATION.read_text(encoding="utf-8")
        cls.contract = CONTRACT.read_text(encoding="utf-8")
        cls.sql = re.sub(r"\s+", " ", cls.migration).lower()

    def test_required_chat_tables_and_privacy_minimized_identity_exist(self) -> None:
        for table_name in (
            "ai_chat_sessions",
            "ai_chat_messages",
            "ai_runs",
            "ai_claims",
            "ai_citations",
            "ai_feedback",
        ):
            self.assertIn("create table if not exists public." + table_name, self.sql)
        for marker in ("external_user_hash", "content_redacted", "error_detail_redacted", "comment_redacted"):
            self.assertIn(marker, self.sql)
        self.assertNotIn("line_user_id text", self.sql)

    def test_tenant_composite_relationships_and_indexes_exist(self) -> None:
        for marker in (
            "foreign key (tenant_id, session_id)",
            "foreign key (tenant_id, message_id)",
            "foreign key (tenant_id, run_id)",
            "foreign key (tenant_id, claim_id)",
            "foreign key (tenant_id, document_version_id)",
            "ai_chat_messages_session_idx",
            "ai_runs_session_idx",
            "ai_feedback_session_idx",
        ):
            self.assertIn(marker, self.sql)

    def test_canonical_outcomes_reason_codes_and_session_states_are_constrained(self) -> None:
        for marker in (
            "'answer', 'clarify', 'handoff'",
            "'answerable', 'ambiguous_entity', 'missing_time', 'ambiguous_intent'",
            "'no_evidence', 'conflicting_evidence', 'low_evidence', 'sensitive'",
            "'person_specific', 'policy_refusal', 'security', 'staff_requested', 'system_error'",
            "'active', 'handoff', 'closed', 'expired', 'cancelled'",
        ):
            self.assertIn(marker, self.sql)

    def test_rls_is_forced_and_authenticated_writes_are_denied(self) -> None:
        self.assertIn("foreach table_name in array", self.sql)
        self.assertIn("alter table public.%i force row level security", self.sql)
        self.assertIn("private.can_read_tenant(tenant_id)", self.sql)
        self.assertGreaterEqual(self.sql.count("revoke insert, update, delete, truncate"), 1)
        self.assertIn("append_only", self.sql)

    def test_idempotency_and_append_only_invariants_exist(self) -> None:
        for marker in (
            "ai_chat_sessions_active_identity_uq",
            "ai_chat_messages_event_kind_uq",
            "reject_ai_chat_mutation",
            "create trigger %i_append_only",
            "ai_chat_messages', 'ai_runs', 'ai_claims', 'ai_citations', 'ai_feedback",
        ):
            self.assertIn(marker, self.sql)

    def test_contract_is_real_additive_and_has_no_provider_credential(self) -> None:
        self.assertIn("on_error_stop", self.contract.lower().replace(" ", "_"))
        self.assertIn("ai_chat_schema_sql_contract_pass", self.contract.lower())
        self.assertNotRegex(self.sql, r"\bdrop\s+(table|schema)\b")
        self.assertNotRegex(self.migration, r"sk-or-v1-[A-Za-z0-9]{20,}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
