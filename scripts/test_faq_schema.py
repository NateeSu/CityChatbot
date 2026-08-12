"""Static contract tests for governed FAQ candidates and their tenant boundary."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260811100000_faq_candidate_schema.sql"
CONTRACT = ROOT / "supabase" / "tests" / "faq_candidate_schema_contract.sql"


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).lower()


def table_body(sql: str, table: str) -> str:
    match = re.search(rf"create\s+table\s+if\s+not\s+exists\s+public\.{table}\s*\((.*?)\n\);", sql, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        raise AssertionError(f"missing table declaration: {table}")
    return match.group(1)


class FaqCandidateSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration = MIGRATION.read_text(encoding="utf-8")
        cls.sql = normalized(cls.migration)
        cls.contract = CONTRACT.read_text(encoding="utf-8")

    def test_candidate_is_tenant_owned_and_has_source_version_lineage(self) -> None:
        body = normalized(table_body(self.migration, "faq_candidates"))
        self.assertRegex(body, r"\bid uuid primary key")
        self.assertRegex(body, r"\btenant_id uuid not null")
        self.assertIn("unique (tenant_id, id)", body)
        for field in (
            "ticket_id", "source_message_id", "source_type", "source_event_id", "retrieval_trace_id",
            "evidence_ids", "source_hash", "question", "answer", "department_id", "knowledge_category_id",
            "effective_from", "effective_until", "effective_date_unknown", "duplicate_status", "duplicate_check",
            "canonical_status", "owner_reviewed_by", "owner_reviewed_at", "coordinator_approved_by",
            "coordinator_approved_at", "knowledge_document_version_id", "published_index_snapshot_id",
            "row_version",
        ):
            self.assertIn(field, body)
        for parent in ("support_tickets", "support_ticket_messages", "departments", "knowledge_categories", "knowledge_documents", "knowledge_document_versions"):
            self.assertRegex(body, rf"foreign key \(tenant_id, [a-z_]+\) references public\.{parent} \(tenant_id, id\)")

    def test_workflow_and_publish_guards_are_fail_closed(self) -> None:
        for state in ("draft", "pending_owner_review", "pending_coordinator_approval", "approved", "published", "conflict", "rejected", "revoked"):
            self.assertIn(state, self.sql)
        for marker in (
            "validate_faq_candidate_transition", "invalid_faq_state_transition", "published_faq_is_immutable_until_revoked",
            "published_faq_requires_approved_document_and_index", "faq_candidates_published_lineage_ck",
            "faq_candidates_source_fields_ck", "faq_candidates_evidence_ck", "faq_candidates_effective_ck",
        ):
            self.assertIn(marker, self.sql)
        self.assertNotRegex(self.sql, r"create policy [^;]+ for all to authenticated")

    def test_rls_and_audit_boundaries_are_explicit(self) -> None:
        self.assertIn("alter table public.faq_candidates enable row level security", self.sql)
        self.assertIn("alter table public.faq_candidates force row level security", self.sql)
        for policy in ("faq_candidates_read_scoped", "faq_candidates_insert_scoped", "faq_candidates_update_scoped"):
            self.assertIn(policy, self.sql)
        self.assertIn("knowledge.manage.tenant", self.sql)
        for action in ("faq_candidate_created", "faq_candidate_owner_reviewed", "faq_candidate_approved", "faq_candidate_published", "faq_candidate_revoked"):
            self.assertIn(action, self.sql)
        self.assertIn("faq_candidates_audit_insert", self.sql)
        self.assertIn("faq_candidates_audit_update", self.sql)

    def test_contract_is_additive_and_contains_no_secret_or_auto_learning_path(self) -> None:
        self.assertNotRegex(self.sql, r"\bdrop\s+(table|schema)\b")
        self.assertNotRegex(self.migration, r"sk-or-v1-[a-z0-9]{20,}")
        self.assertIn("on_error_stop", self.contract.lower().replace(" ", "_"))
        self.assertIn("forced RLS", self.contract)
        self.assertIn("staff replies are never auto-learned", self.migration.lower())
        self.assertIn("source_message_id", self.contract)


if __name__ == "__main__":
    unittest.main(verbosity=2)

