"""Static contract tests for the approved AI provider/model route registry."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810090000_ai_model_registry_schema.sql"
CONTRACT = ROOT / "supabase" / "tests" / "ai_model_registry_schema_contract.sql"


def normalized(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).lower()


class AiModelRegistrySchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration = MIGRATION.read_text(encoding="utf-8")
        cls.contract = CONTRACT.read_text(encoding="utf-8")
        cls.sql = normalized(cls.migration)

    def test_route_identity_privacy_and_external_secret_reference_exist(self) -> None:
        for field in (
            "tenant_id", "route_key", "purpose", "provider_id", "provider_kind", "endpoint",
            "model_id", "model_revision", "state", "privacy_profile", "api_key_env",
            "supported_parameters", "config_json", "config_hash",
        ):
            self.assertIn(field, self.sql)
        self.assertIn("api_key_env ~", self.sql)
        self.assertIn("never a provider secret", self.sql)
        self.assertNotRegex(self.migration, r"sk-or-v1-[a-z0-9]{20,}")

    def test_route_state_and_immutability_guards_are_fail_closed(self) -> None:
        for state in ("draft", "unit_approved", "certified", "retired"):
            self.assertIn(state, self.sql)
        for marker in (
            "ai_model_registry_route_active_uq",
            "ai_model_registry_approval_ck",
            "ai_model_registry_certification_ck",
            "approved ai model route configuration is immutable",
            "private.approve_ai_model_route",
            "private.retire_ai_model_route",
        ):
            self.assertIn(marker, self.sql)

    def test_forced_rls_and_no_authenticated_writes(self) -> None:
        self.assertIn("enable row level security", self.sql)
        self.assertIn("force row level security", self.sql)
        self.assertIn("ai_model_registry_read_approved", self.sql)
        self.assertIn("revoke insert, update, delete, truncate", self.sql)
        self.assertNotRegex(self.sql, r"create policy [^;]+ for all to authenticated")

    def test_route_lifecycle_is_permission_aware_and_tenant_scoped(self) -> None:
        self.assertIn("foreign key (tenant_id) references public.tenants (id)", self.sql)
        self.assertIn("private.current_account_id()", self.sql)
        self.assertIn("private.has_tenant_permission", self.sql)
        self.assertIn("knowledge.manage.tenant", self.sql)
        self.assertIn("effective_from", self.sql)
        self.assertIn("effective_until", self.sql)

    def test_contract_is_additive_and_has_no_provider_credential(self) -> None:
        self.assertNotRegex(self.sql, r"\bdrop\s+(table|schema)\b")
        self.assertIn("on_error_stop", self.contract.lower().replace(" ", "_"))
        self.assertIn("tenant A must not see tenant B", self.contract)


if __name__ == "__main__":
    unittest.main(verbosity=2)
