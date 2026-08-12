"""Static contract checks for Super Admin tenant provisioning and limits."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SYSTEM = ROOT / "apps" / "web" / "app" / "api" / "v1" / "system" / "tenants"
DOMAIN = ROOT / "packages" / "tenant-provisioning" / "src" / "tenant-provisioning.ts"
MIGRATION = ROOT / "supabase" / "migrations" / "20260811200000_tenant_provisioning_schema.sql"


class TenantProvisioningContractTests(unittest.TestCase):
    def test_system_routes_are_explicit_and_fail_closed(self) -> None:
        routes = (
            SYSTEM / "route.ts",
            SYSTEM / "[id]" / "route.ts",
            SYSTEM / "[id]" / "resume" / "route.ts",
            SYSTEM / "[id]" / "suspend" / "route.ts",
            SYSTEM / "[id]" / "reactivate" / "route.ts",
            SYSTEM / "[id]" / "archive" / "route.ts",
            SYSTEM / "[id]" / "feature-flags" / "route.ts",
            SYSTEM / "[id]" / "usage-limits" / "route.ts",
        )
        for route in routes:
            source = route.read_text(encoding="utf-8")
            self.assertIn("CONFIGURATION_UNAVAILABLE", source, route.as_posix())
            self.assertIn("localSystemContext", source, route.as_posix())
        self.assertNotIn("[...", "\n".join(path.as_posix() for path in SYSTEM.rglob("route.ts")))

    def test_domain_covers_resume_flags_limits_suspend_reactivate_and_no_impersonation(self) -> None:
        source = DOMAIN.read_text(encoding="utf-8")
        for marker in ("PROVISIONING_STEP_KEYS", "PARTIAL", "resumeProvisioning", "FEATURE_DEPENDENCIES", "assertFeatureEnabled", "USAGE_LIMIT_EXCEEDED", "consumeUsage", "suspendTenant", "reactivateTenant", "archiveTestTenant", "isTestTenant", "mfaVerified", "reauthenticatedAt"):
            self.assertIn(marker, source)
        self.assertIsNone(re.search(r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-", source, re.IGNORECASE))
        self.assertNotIn("impersonateTenant", source)

    def test_schema_has_composite_tenant_integrity_forced_rls_and_server_functions(self) -> None:
        source = MIGRATION.read_text(encoding="utf-8")
        for marker in ("tenant_provisioning_runs", "tenant_provisioning_steps", "tenant_usage_limit_versions", "tenant_usage_counters", "tenant_provisioning_steps_run_fk", "tenant_provisioning_step_guard", "private.provision_tenant_step", "private.suspend_tenant", "private.reactivate_tenant", "private.consume_tenant_usage"):
            self.assertIn(marker, source)
        for table in ("tenant_provisioning_runs", "tenant_provisioning_steps", "tenant_usage_limit_versions", "tenant_usage_counters"):
            self.assertIn(f"alter table public.{table} force row level security", source)
            self.assertIn(f"revoke all on table public.{table} from anon, authenticated", source)
        self.assertIn("credential values", source)

    def test_screens_s01_s02_are_real_responsive_surfaces_without_secret_fields(self) -> None:
        list_page = (ROOT / "apps" / "web" / "app" / "system" / "tenants" / "page.tsx").read_text(encoding="utf-8")
        new_page = (ROOT / "apps" / "web" / "app" / "system" / "tenants" / "new" / "page.tsx").read_text(encoding="utf-8")
        console = (ROOT / "apps" / "web" / "app" / "system" / "tenants" / "SystemTenantConsole.tsx").read_text(encoding="utf-8")
        css = (ROOT / "apps" / "web" / "app" / "system" / "tenants" / "system.css").read_text(encoding="utf-8")
        for source in (list_page, new_page):
            self.assertIn("FeatureDisabledState", source)
            self.assertIn("localSystemContext", source)
        for marker in ("S-01", "S-02", "resume", "Suspend", "Reactivate", "usage", "no impersonation", "LoadingState", "EmptyState", "OfflineState", "StaleState"):
            self.assertIn(marker, console)
        self.assertNotIn("channelSecret", console)
        for breakpoint in ("max-width: 1023px", "max-width: 767px", "max-width: 480px", "max-width: 320px"):
            self.assertIn(breakpoint, css)


if __name__ == "__main__":
    unittest.main(verbosity=2)
