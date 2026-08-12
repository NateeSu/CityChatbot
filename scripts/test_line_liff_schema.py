"""Static contract tests for the durable LINE/LIFF schema."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260812120000_line_liff_schema.sql"
TENANT_TABLES = {
    "line_channels",
    "liff_apps",
    "line_users",
    "line_webhook_inbox",
    "line_messages",
    "consent_events",
}


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).lower()


def table_body(sql: str, table: str) -> str:
    match = re.search(
        rf"create\s+table\s+if\s+not\s+exists\s+public\.{table}\s*\((.*?)\n\);",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise AssertionError(f"missing table declaration: {table}")
    return normalized(match.group(1))


class LineLiffSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = MIGRATION.read_text(encoding="utf-8")
        cls.normalized = normalized(cls.sql)

    def test_canonical_tables_are_tenant_owned_and_mutable_rows_are_versioned(self) -> None:
        for table in TENANT_TABLES:
            body = table_body(self.sql, table)
            self.assertRegex(body, r"\btenant_id uuid not null")
            self.assertIn("unique (tenant_id, id)", body)
            self.assertRegex(body, r"\bcreated_at timestamptz not null")
            self.assertRegex(body, r"\bupdated_at timestamptz not null")
            self.assertRegex(body, r"\brow_version integer not null")

    def test_child_relations_use_composite_tenant_foreign_keys(self) -> None:
        expected = {
            ("liff_apps", "line_channels"),
            ("line_users", "line_channels"),
            ("line_webhook_inbox", "line_channels"),
            ("line_messages", "line_channels"),
            ("line_messages", "line_users"),
            ("line_messages", "line_webhook_inbox"),
            ("consent_events", "line_users"),
            ("consent_events", "liff_apps"),
        }
        for child, parent in expected:
            self.assertRegex(
                table_body(self.sql, child),
                rf"foreign key \(tenant_id, [a-z_]+\) references public\.{parent} \(tenant_id, id\)",
                msg=f"missing composite tenant FK {child} -> {parent}",
            )

    def test_rls_is_enabled_and_forced_and_browser_writes_are_denied(self) -> None:
        self.assertIn("enable row level security", self.normalized)
        self.assertIn("force row level security", self.normalized)
        for table in TENANT_TABLES:
            self.assertIn(f"'{table}'", self.normalized)
        self.assertIn("revoke insert, update, delete, truncate", self.normalized)
        self.assertNotRegex(self.normalized, r"create policy [^;]+ for all to authenticated")

    def test_secrets_and_pii_are_ciphertext_or_hash_only(self) -> None:
        channels = table_body(self.sql, "line_channels")
        inbox = table_body(self.sql, "line_webhook_inbox")
        messages = table_body(self.sql, "line_messages")
        self.assertIn("encrypted_channel_secret", channels)
        self.assertIn("encrypted_access_token", channels)
        self.assertIn("webhook_key_hash", channels)
        self.assertIn("payload_ciphertext", inbox)
        self.assertIn("content_ciphertext", messages)
        self.assertNotRegex(self.sql, r"sk-or-v1-[A-Za-z0-9_-]+")
        for forbidden in ("channel_secret", "access_token", "webhook_key", "recipient_id", "content_text"):
            self.assertNotRegex(self.normalized, rf"(?<![a-z0-9_]){forbidden}\s+text")

    def test_webhook_and_delivery_invariants_are_durable(self) -> None:
        inbox = table_body(self.sql, "line_webhook_inbox")
        messages = table_body(self.sql, "line_messages")
        self.assertIn("unique (tenant_id, line_channel_record_id, webhook_event_id)", inbox)
        self.assertIn("unique (tenant_id, idempotency_key)", messages)
        self.assertIn("'api_accepted'", messages)
        self.assertIn("line_webhook_inbox_claim_idx", self.normalized)
        self.assertIn("line_messages_claim_idx", self.normalized)

    def test_migration_is_additive(self) -> None:
        self.assertNotRegex(self.normalized, r"\bdrop\s+(table|schema)\b")
        self.assertIn("create table if not exists", self.normalized)


if __name__ == "__main__":
    unittest.main(verbosity=2)
