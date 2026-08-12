"""Static contract checks for the department/work-scope/SLA configuration slice."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin"
PACKAGE = ROOT / "packages" / "org-config" / "src"
UI = ROOT / "apps" / "web" / "app" / "admin" / "departments"


class OrganizationConfigContractTests(unittest.TestCase):
    def test_canonical_admin_routes_and_fail_closed_environment_guard_exist(self) -> None:
        routes = (
            API / "departments" / "route.ts",
            API / "departments" / "[id]" / "route.ts",
            API / "departments" / "[id]" / "work-scope-versions" / "route.ts",
            API / "departments" / "[id]" / "work-scope-versions" / "[versionId]" / "publish" / "route.ts",
            API / "sla-rule-versions" / "route.ts",
            API / "sla-rule-versions" / "[id]" / "publish" / "route.ts",
        )
        for route in routes:
            source = route.read_text(encoding="utf-8")
            self.assertIn("isOrganizationLocalEnvironment", source, route.as_posix())
            self.assertIn('"CONFIGURATION_UNAVAILABLE"', source, route.as_posix())
            self.assertIn("localOrganizationContext", source, route.as_posix())

    def test_domain_closes_versioning_idempotency_validation_audit_and_tenant_scope(self) -> None:
        source = (PACKAGE / "organization.ts").read_text(encoding="utf-8")
        for marker in (
            "rowVersion",
            "IDEMPOTENCY_CONFLICT",
            "recordAudit",
            "effectiveUntil",
            "IN_USE",
            "validateContact",
            "windowsOverlap",
            "tenantId",
            "departmentIds",
        ):
            self.assertIn(marker, source)
        core = (ROOT / "supabase" / "migrations" / "20260810000000_core_schema.sql").read_text(encoding="utf-8")
        self.assertIn("department_scopes_department_fk", core)
        self.assertIn("department_contacts_department_fk", core)
        self.assertIn("departments_tenant_id_uq", core)

    def test_ui_a70_has_preview_and_resilient_states_without_mock_import(self) -> None:
        page = (UI / "page.tsx").read_text(encoding="utf-8")
        console = (UI / "OrganizationConfigConsole.tsx").read_text(encoding="utf-8")
        css = (UI / "organization.css").read_text(encoding="utf-8")
        for marker in ("PermissionDeniedState", "FeatureDisabledState", "localOperationalIdentity", "organizationConfigRepository"):
            self.assertIn(marker, page)
        for marker in ("Routing sandbox", "createScopeDraft", "publishScope", "addContact", "OfflineState", "ErrorState", "LoadingState", "role=\"alert\""):
            self.assertIn(marker, console)
        for breakpoint in ("max-width: 900px", "max-width: 560px", "max-width: 320px"):
            self.assertIn(breakpoint, css)
        self.assertNotIn("gui-prototype", console)

    def test_no_wildcard_route_or_production_browser_secret_boundary_is_added(self) -> None:
        for path in (API / "organization" / "context.ts", API / "organization" / "errors.ts"):
            source = path.read_text(encoding="utf-8")
            self.assertNotIn("SUPABASE_SERVICE_ROLE", source)
            self.assertNotIn("OPENROUTER_API_KEY", source)
        self.assertNotIn("[...slug]", "\n".join(path.as_posix() for path in (API / "departments").rglob("*")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
