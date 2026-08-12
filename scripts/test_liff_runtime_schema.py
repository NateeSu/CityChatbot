"""Static contract tests for the durable production LIFF runtime functions."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE_MIGRATION = ROOT / "supabase" / "migrations" / "20260812140000_liff_production_runtime.sql"
FIX_MIGRATION = ROOT / "supabase" / "migrations" / "20260812170000_fix_liff_identity_return.sql"


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).lower()


class LiffRuntimeSchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.base_sql = normalized(BASE_MIGRATION.read_text(encoding="utf-8"))
        cls.fix_sql = normalized(FIX_MIGRATION.read_text(encoding="utf-8"))

    def test_base_runtime_functions_are_security_definer_and_least_privilege(self) -> None:
        for function_name in (
            "private.resolve_liff_app",
            "private.persist_liff_identity",
            "private.resolve_liff_bootstrap",
        ):
            self.assertIn(function_name, self.base_sql)
        self.assertGreaterEqual(self.base_sql.count("security definer"), 3)
        self.assertIn("revoke all on function private.persist_liff_identity", self.base_sql)
        self.assertIn("grant execute on function private.persist_liff_identity", self.base_sql)

    def test_forward_fix_qualifies_return_values_and_preserves_grants(self) -> None:
        self.assertIn("create or replace function private.persist_liff_identity", self.fix_sql)
        self.assertIn("return query select app_record.tenant_id", self.fix_sql)
        self.assertIn("tenant_record.display_name", self.fix_sql)
        self.assertIn("user_record.id", self.fix_sql)
        self.assertIn("insert into public.line_users as target_user", self.fix_sql)
        self.assertIn("row_version = target_user.row_version + 1", self.fix_sql)
        self.assertIn("on conflict on constraint line_users_identity_uq", self.fix_sql)
        self.assertIn("revoke all on function private.persist_liff_identity", self.fix_sql)
        self.assertIn("grant execute on function private.persist_liff_identity", self.fix_sql)
        self.assertNotRegex(self.fix_sql, r"\bdrop\s+(table|schema|role)\b")

    def test_fix_does_not_introduce_raw_provider_credentials(self) -> None:
        self.assertNotRegex(self.fix_sql, r"sk-or-v1-[a-z0-9_-]+")
        self.assertNotRegex(self.fix_sql, r"\b(channel_secret|access_token|webhook_key)\s+text\b")


if __name__ == "__main__":
    unittest.main(verbosity=2)
