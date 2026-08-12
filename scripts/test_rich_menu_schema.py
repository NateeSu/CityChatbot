"""Static contract checks for the Rich Menu schema boundary."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = (ROOT / "supabase" / "migrations" / "20260810140000_rich_menu_schema.sql").read_text(encoding="utf-8")
CONTRACT = (ROOT / "supabase" / "tests" / "rich_menu_schema_contract.sql").read_text(encoding="utf-8")


class RichMenuSchemaContractTests(unittest.TestCase):
    def test_tables_are_tenant_owned_and_composite_related(self) -> None:
        self.assertIn("create table if not exists public.rich_menu_versions", MIGRATION)
        self.assertIn("create table if not exists public.rich_menu_areas", MIGRATION)
        self.assertIn("constraint rich_menu_versions_tenant_id_uq unique (tenant_id, id)", MIGRATION)
        self.assertIn("foreign key (tenant_id, rich_menu_version_id)", MIGRATION)

    def test_geometry_asset_and_action_guards_are_closed(self) -> None:
        for fragment in ("image_width between 800 and 2500", "image_size_bytes between 1 and 1000000", "image_sha256 ~", "action_type in ('URI', 'POSTBACK', 'MESSAGE')", "action_payload_ck"):
            self.assertIn(fragment, MIGRATION)

    def test_lifecycle_and_outbox_are_explicit(self) -> None:
        self.assertIn("enforce_rich_menu_state_transition", MIGRATION)
        self.assertIn("rich_menu_versions_publish_outbox", MIGRATION)
        self.assertIn("'rich_menu.published'", MIGRATION)
        self.assertIn("rich_menu_versions_state_transition", CONTRACT)

    def test_rls_and_browser_write_denial_are_forced(self) -> None:
        self.assertIn("alter table public.rich_menu_versions force row level security", MIGRATION)
        self.assertIn("alter table public.rich_menu_areas force row level security", MIGRATION)
        self.assertIn("revoke insert, update, delete, truncate on public.rich_menu_versions from anon, authenticated", MIGRATION)
        self.assertIn("rich_menu_versions_read_current_tenant", MIGRATION)

    def test_contract_is_present_and_additive(self) -> None:
        self.assertIn("RICH_MENU_SCHEMA_SQL_CONTRACT_PASS", CONTRACT)
        self.assertNotIn("drop table", MIGRATION.lower())
        self.assertNotIn("api_key", MIGRATION.lower())


if __name__ == "__main__":
    unittest.main()
