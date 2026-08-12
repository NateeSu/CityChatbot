"""Static contract tests for the production citizen complaint boundary."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260812150000_citizen_complaint_runtime.sql"


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).lower()


class CitizenRuntimeSchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = MIGRATION.read_text(encoding="utf-8")
        cls.normalized = normalized(cls.sql)

    def test_runtime_columns_and_idempotency_indexes_are_present(self) -> None:
        for column in (
            "citizen_idempotency_key text",
            "citizen_request_hash text",
            "citizen_line_user_id text",
        ):
            self.assertIn(column, self.normalized)
        self.assertIn("complaints_citizen_idempotency_uq", self.normalized)
        self.assertIn("complaint_comments_citizen_idempotency_uq", self.normalized)
        self.assertIn("complaint_surveys_citizen_idempotency_uq", self.normalized)

    def test_private_functions_are_fixed_search_path_and_function_only(self) -> None:
        self.assertIn("private.create_citizen_complaint", self.normalized)
        self.assertIn("private.list_citizen_complaints", self.normalized)
        self.assertIn("private.get_citizen_complaint", self.normalized)
        self.assertIn("private.add_citizen_comment", self.normalized)
        self.assertIn("private.submit_citizen_survey", self.normalized)
        self.assertGreaterEqual(self.normalized.count("security definer"), 5)
        self.assertIn("revoke all on table public.complaints, public.complaint_comments, public.complaint_surveys from citychatbot_app", self.normalized)
        self.assertIn("grant execute on function private.create_citizen_complaint", self.normalized)
        self.assertIn("grant execute on function private.submit_citizen_survey", self.normalized)
        self.assertNotIn("grant select on table public.complaints", self.normalized)

    def test_identity_tenant_feature_and_consent_boundaries_are_fail_closed(self) -> None:
        self.assertIn("app.enabled", self.normalized)
        self.assertIn("tenant.status = 'active'", self.normalized)
        self.assertIn("channel.state = 'active'", self.normalized)
        self.assertIn("line_user.status = 'active'", self.normalized)
        self.assertIn("p_line_user_id !~ '^u[0-9a-fa-f]{8,64}$'", self.normalized)
        self.assertIn("(p_category_id is null) <> coalesce(p_category_uncertain, false)", self.normalized)
        self.assertIn("p_idempotency_key", self.normalized)
        self.assertIn("idempotency_conflict", self.normalized)
        self.assertNotRegex(self.sql, r"sk-or-v1-[A-Za-z0-9_-]+")

    def test_public_projection_excludes_private_fields_and_attachments_are_quarantined(self) -> None:
        self.assertIn("private.citizen_public_view", self.normalized)
        self.assertIn("publiccomments", self.normalized)
        self.assertIn("publictimeline", self.normalized)
        self.assertIn("publicattachments", self.normalized)
        self.assertNotIn("storage_attachments", self.normalized)
        self.assertNotIn("citizen_phone_encrypted", self.normalized.split("create or replace function private.citizen_public_view", 1)[-1].split("create or replace function private.create_citizen_complaint", 1)[0])

    def test_migration_is_additive(self) -> None:
        self.assertNotRegex(self.normalized, r"\bdrop\s+(table|schema|role)\b")


if __name__ == "__main__":
    unittest.main(verbosity=2)
