"""Static contract checks for P6-AUD-001 audit, notification and export controls."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin"
DOMAIN = ROOT / "packages" / "audit-observability" / "src" / "audit-operations.ts"
MIGRATION = ROOT / "supabase" / "migrations" / "20260811210000_audit_operations_schema.sql"
SQL_CONTRACT = ROOT / "supabase" / "tests" / "audit_operations_schema_contract.sql"


class AuditOperationsContractTests(unittest.TestCase):
    def test_canonical_routes_are_explicit_and_fail_closed(self) -> None:
        routes = (
            API / "audit-logs" / "route.ts",
            API / "audit-logs" / "[id]" / "route.ts",
            API / "audit-log-exports" / "route.ts",
            API / "exports" / "route.ts",
            API / "exports" / "[id]" / "route.ts",
            API / "jobs" / "route.ts",
            API / "jobs" / "[id]" / "route.ts",
        )
        for route in routes:
            source = route.read_text(encoding="utf-8")
            self.assertIn("CONFIGURATION_UNAVAILABLE", source, route.as_posix())
            self.assertIn("localAuditContext", source, route.as_posix())
        self.assertNotIn("[...", "\n".join(path.as_posix() for path in API.rglob("route.ts")))

    def test_domain_enforces_redaction_visibility_async_export_and_signed_lifecycle(self) -> None:
        source = DOMAIN.read_text(encoding="utf-8")
        for marker in (
            "redactAuditJson",
            "verifyAuditChain",
            "actorCanReadAll",
            "LARGE_EXPORT_THRESHOLD",
            "EXPORT_REQUESTED",
            "EXPORT_APPROVED",
            "EXPORT_QUEUED",
            "signedUrlDigest",
            "DEFAULT_EXPORT_TTL_MS",
            "safeCsvCell",
            "runPendingExportJobs",
            "revokeExport",
        ):
            self.assertIn(marker, source)
        self.assertIsNone(re.search(r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-v1-", source, re.IGNORECASE))

    def test_schema_has_tenant_composite_fks_forced_rls_and_server_only_export(self) -> None:
        source = MIGRATION.read_text(encoding="utf-8").lower()
        for marker in (
            "create table if not exists public.exports",
            "exports_requested_membership_fk",
            "exports_approved_membership_fk",
            "exports_job_fk",
            "alter table public.exports force row level security",
            "revoke all on table public.exports from anon, authenticated",
            "private.mark_staff_notification_read",
            "private.revoke_export",
            "integrity_hash",
            "previous_hash",
        ):
            self.assertIn(marker.lower(), source)
        self.assertNotRegex(source, r"drop\s+(table|schema)\b")

    def test_ui_contains_a97_states_and_safe_export_copy(self) -> None:
        page = (ROOT / "apps" / "web" / "app" / "admin" / "audit" / "page.tsx").read_text(encoding="utf-8")
        console = (ROOT / "apps" / "web" / "app" / "admin" / "audit" / "AuditConsole.tsx").read_text(encoding="utf-8")
        css = (ROOT / "apps" / "web" / "app" / "admin" / "audit" / "audit.css").read_text(encoding="utf-8")
        for marker in ("A-97", "LoadingState", "EmptyState", "ErrorState", "OfflineState", "PermissionDeniedState", "ExpiredSessionState", "StaleState", "notifications", "export", "jobs"):
            self.assertIn(marker, page + console)
        for breakpoint in ("max-width: 1023px", "max-width: 767px", "max-width: 480px", "max-width: 320px"):
            self.assertIn(breakpoint, css)
        self.assertNotRegex(console, r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-v1-")

    def test_sql_contract_is_present(self) -> None:
        source = SQL_CONTRACT.read_text(encoding="utf-8").lower()
        for marker in ("on_error_stop", "exports", "relforcerowsecurity", "authenticated export mutation privilege unexpectedly exists"):
            self.assertIn(marker, source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
