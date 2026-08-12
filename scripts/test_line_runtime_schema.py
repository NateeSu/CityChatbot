"""Static contract tests for least-privilege LINE runtime SQL functions."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "supabase" / "migrations" / "20260812130000_line_runtime_functions.sql").read_text(encoding="utf-8")
NORMALIZED = re.sub(r"\s+", " ", SQL).lower()


class LineRuntimeSchemaTests(unittest.TestCase):
    def test_runtime_role_is_nologin_and_has_function_only_access(self) -> None:
        self.assertIn("create role citychatbot_runtime nologin nosuperuser nocreatedb nocreaterole noinherit", NORMALIZED)
        self.assertIn("revoke all on all tables in schema public from citychatbot_runtime", NORMALIZED)
        self.assertIn("revoke all on all tables in schema public from citychatbot_app", NORMALIZED)
        self.assertEqual(NORMALIZED.count("grant execute on function private."), 2)

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
