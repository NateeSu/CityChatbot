"""Static contract tests for least-privilege LINE runtime SQL functions."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "supabase" / "migrations" / "20260812130000_line_runtime_functions.sql").read_text(encoding="utf-8")
NORMALIZED = re.sub(r"\s+", " ", SQL).lower()
CLAIM_FIX_SQL = (ROOT / "supabase" / "migrations" / "20260813020000_fix_line_runtime_claim_qualification.sql").read_text(encoding="utf-8")
CLAIM_FIX_NORMALIZED = re.sub(r"\s+", " ", CLAIM_FIX_SQL).lower()
CLOCK_FIX_SQL = (ROOT / "supabase" / "migrations" / "20260814010000_fix_line_delivery_clock_skew.sql").read_text(encoding="utf-8")
CLOCK_FIX_NORMALIZED = re.sub(r"\s+", " ", CLOCK_FIX_SQL).lower()


class LineRuntimeSchemaTests(unittest.TestCase):
    def test_runtime_role_is_nologin_and_has_function_only_access(self) -> None:
        self.assertIn("create role citychatbot_runtime nologin nosuperuser nocreatedb nocreaterole noinherit", NORMALIZED)
        self.assertIn("revoke all on all tables in schema public from citychatbot_runtime", NORMALIZED)
        self.assertIn("revoke all on all tables in schema public from citychatbot_app", NORMALIZED)
        self.assertEqual(NORMALIZED.count("grant execute on function private."), 4)
        self.assertEqual(NORMALIZED.count("to citychatbot_runtime"), 3)
        self.assertEqual(NORMALIZED.count("to citychatbot_app"), 3)

    def test_functions_are_security_definer_with_fixed_search_path(self) -> None:
        self.assertEqual(NORMALIZED.count("security definer"), 2)
        self.assertEqual(NORMALIZED.count("set search_path = pg_catalog, public"), 2)
        self.assertIn("private.resolve_line_webhook", NORMALIZED)
        self.assertIn("private.ingest_line_webhook", NORMALIZED)

    def test_ingest_derives_tenant_from_hash_and_is_transactional_idempotent(self) -> None:
        self.assertIn("where webhook_key_hash = p_webhook_key_hash and state = 'active'", NORMALIZED)
        self.assertIn("on conflict (tenant_id, line_channel_record_id, webhook_event_id) do nothing", NORMALIZED)
        self.assertIn("on conflict (tenant_id, job_type, dedupe_key) do nothing", NORMALIZED)
        self.assertNotRegex(NORMALIZED, r"p_tenant_id")

    def test_browser_roles_cannot_execute_runtime_functions(self) -> None:
        self.assertIn("from public, anon, authenticated", NORMALIZED)
        self.assertNotRegex(SQL, r"sk-or-v1-[A-Za-z0-9_-]+")

    def test_migration_is_additive(self) -> None:
        self.assertNotRegex(NORMALIZED, r"\bdrop\s+(table|schema|role)\b")

    def test_line_worker_claim_fix_qualifies_tenant_and_row_references(self) -> None:
        self.assertIn("create or replace function private.claim_line_webhook_job", CLAIM_FIX_NORMALIZED)
        self.assertIn("create or replace function private.claim_line_message_job", CLAIM_FIX_NORMALIZED)
        for marker in (
            "from public.line_webhook_inbox as inbox",
            "where inbox.tenant_id = selected_job.tenant_id",
            "update public.jobs as job",
            "update public.line_webhook_inbox as inbox",
            "from public.line_messages as line_message",
            "where line_message.tenant_id = selected_job.tenant_id",
            "from public.line_channels as channel",
            "from public.line_users as line_user",
        ):
            self.assertIn(marker, CLAIM_FIX_NORMALIZED)
        for ambiguous in (
            "where tenant_id = selected_job.tenant_id",
            "where tenant_id = selected_message.tenant_id",
        ):
            self.assertNotIn(ambiguous, CLAIM_FIX_NORMALIZED)

    def test_line_delivery_claim_uses_database_bounded_clock(self) -> None:
        self.assertIn("create or replace function private.claim_line_webhook_job", CLOCK_FIX_NORMALIZED)
        self.assertIn("create or replace function private.claim_line_message_job", CLOCK_FIX_NORMALIZED)
        self.assertEqual(CLOCK_FIX_NORMALIZED.count("claim_at := greatest(p_now, statement_timestamp())"), 2)
        self.assertEqual(CLOCK_FIX_NORMALIZED.count("j.next_attempt_at <= claim_at"), 2)
        self.assertEqual(CLOCK_FIX_NORMALIZED.count("j.lease_expires_at < claim_at"), 2)
        self.assertEqual(CLOCK_FIX_NORMALIZED.count("lease_until := claim_at + make_interval"), 2)
        self.assertIn("inbox.lease_expires_at < claim_at", CLOCK_FIX_NORMALIZED)
        self.assertNotIn("j.next_attempt_at <= p_now", CLOCK_FIX_NORMALIZED)
        self.assertNotIn("j.lease_expires_at < p_now", CLOCK_FIX_NORMALIZED)
        self.assertNotRegex(CLOCK_FIX_SQL, r"sk-or-v1-[A-Za-z0-9_-]+")


if __name__ == "__main__":
    unittest.main(verbosity=2)
