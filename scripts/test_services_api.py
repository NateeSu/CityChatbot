"""Static contract checks for structured service/contact content."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "services"
CITIZEN = ROOT / "apps" / "web" / "app" / "api" / "v1" / "citizen" / "services"
DOMAIN = ROOT / "packages" / "services" / "src" / "services.ts"
MIGRATION = ROOT / "supabase" / "migrations" / "20260811180000_services_schema.sql"


class ServicesContractTests(unittest.TestCase):
    def test_canonical_routes_are_explicit_and_fail_closed(self) -> None:
        routes = (
            ADMIN / "route.ts",
            ADMIN / "[id]" / "route.ts",
            ADMIN / "[id]" / "submit-review" / "route.ts",
            ADMIN / "[id]" / "approve" / "route.ts",
            ADMIN / "[id]" / "publish" / "route.ts",
            ADMIN / "[id]" / "archive" / "route.ts",
            CITIZEN / "route.ts",
            CITIZEN / "[slug]" / "route.ts",
        )
        for route in routes:
            source = route.read_text(encoding="utf-8")
            self.assertIn("CONFIGURATION_UNAVAILABLE", source, route.as_posix())
            self.assertIn("local", source.lower(), route.as_posix())
        self.assertNotIn("[...slug]", "\n".join(path.as_posix() for path in ADMIN.rglob("route.ts")))

    def test_domain_has_structured_facts_effective_dates_feature_flags_and_no_ai_price_truth(self) -> None:
        source = DOMAIN.read_text(encoding="utf-8")
        for marker in ("steps", "documents", "fee", "hours", "location", "contact", "source", "effectiveFrom", "expiresAt", "goldPriceEnabled", "pawnshopEnabled", "staleWarning", "immutable", "IDEMPOTENCY_CONFLICT"):
            self.assertIn(marker, source)
        self.assertIsNone(re.search(r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-|aiGeneratedFee", source, re.IGNORECASE))

    def test_schema_has_tenant_integrity_forced_rls_and_publish_guard(self) -> None:
        source = MIGRATION.read_text(encoding="utf-8")
        for marker in ("service_feature_flags", "service_posts", "service_revisions", "service_posts_department_fk", "service_revisions_service_fk", "service_revisions_source_ck", "service_revisions_guard", "private.publish_service_revision", "private.archive_service"):
            self.assertIn(marker, source)
        self.assertIn("alter table public.service_posts force row level security", source)
        self.assertIn("alter table public.service_revisions force row level security", source)
        self.assertIn("revoke insert, update, delete, truncate on public.service_posts", source)
        self.assertIn("Asia/Bangkok", source)

    def test_citizen_ui_reads_published_service_facts_without_mock_content(self) -> None:
        page = (ROOT / "apps" / "web" / "app" / "liff" / "services" / "page.tsx").read_text(encoding="utf-8")
        detail = (ROOT / "apps" / "web" / "app" / "liff" / "services" / "[slug]" / "page.tsx").read_text(encoding="utf-8")
        contact = (ROOT / "apps" / "web" / "app" / "liff" / "contact" / "page.tsx").read_text(encoding="utf-8")
        for source in (page, detail, contact):
            self.assertIn("servicesRepository", source)
            self.assertNotIn("LiffInfoPage", source)
            self.assertIsNone(re.search(r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-", source, re.IGNORECASE))
        for marker in ("C-15", "EmptyState", "searchParams", "listPublished"):
            self.assertIn(marker, page)
        for marker in ("C-16", "steps", "documents", "fee", "source", "tel:", "mapUrl"):
            self.assertIn(marker, detail)

    def test_admin_ui_has_source_effective_workflow_and_resilient_states(self) -> None:
        page = (ROOT / "apps" / "web" / "app" / "admin" / "services" / "page.tsx").read_text(encoding="utf-8")
        console = (ROOT / "apps" / "web" / "app" / "admin" / "services" / "ServiceConsole.tsx").read_text(encoding="utf-8")
        css = (ROOT / "apps" / "web" / "app" / "admin" / "services" / "services.css").read_text(encoding="utf-8")
        for marker in ("PermissionDeniedState", "FeatureDisabledState", "ServiceConsole", "query.role"):
            self.assertIn(marker, page)
        for marker in ("steps", "documents", "fee", "sourceReference", "effectiveFrom", "submit-review", "approve", "publish", "archive", "OfflineState", "ExpiredSessionState", "StaleState", "featureFlags"):
            self.assertIn(marker, console)
        for breakpoint in ("max-width: 1023px", "max-width: 767px", "max-width: 480px", "max-width: 320px"):
            self.assertIn(breakpoint, css)


if __name__ == "__main__":
    unittest.main(verbosity=2)
