"""Static contract checks for the tenant-safe news/editor slice."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API_ADMIN = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "news"
API_CITIZEN = ROOT / "apps" / "web" / "app" / "api" / "v1" / "citizen" / "news"
UI_ADMIN = ROOT / "apps" / "web" / "app" / "admin" / "news"
UI_CITIZEN = ROOT / "apps" / "web" / "app" / "liff" / "news"
DOMAIN = ROOT / "packages" / "news" / "src" / "news.ts"
MIGRATION = ROOT / "supabase" / "migrations" / "20260811170000_news_schema.sql"


class NewsContractTests(unittest.TestCase):
    def test_canonical_admin_and_citizen_routes_are_explicit_and_fail_closed(self) -> None:
        routes = (
            API_ADMIN / "route.ts",
            API_ADMIN / "[id]" / "route.ts",
            API_ADMIN / "[id]" / "submit-review" / "route.ts",
            API_ADMIN / "[id]" / "approve" / "route.ts",
            API_ADMIN / "[id]" / "publish" / "route.ts",
            API_ADMIN / "[id]" / "archive" / "route.ts",
            API_ADMIN / "[id]" / "broadcasts" / "route.ts",
            API_CITIZEN / "route.ts",
            API_CITIZEN / "[slug]" / "route.ts",
        )
        for route in routes:
            source = route.read_text(encoding="utf-8")
            self.assertIn("CONFIGURATION_UNAVAILABLE", source, route.as_posix())
            self.assertIn("local", source.lower(), route.as_posix())
        all_routes = "\n".join(path.as_posix() for path in API_ADMIN.rglob("route.ts"))
        self.assertNotIn("[...slug]", all_routes)

    def test_domain_covers_workflow_sanitization_schedule_delivery_and_isolation(self) -> None:
        source = DOMAIN.read_text(encoding="utf-8")
        for marker in (
            "DRAFT",
            "IN_REVIEW",
            "APPROVED",
            "SCHEDULED",
            "PUBLISHED",
            "ARCHIVED",
            "sanitizeRichText",
            "Asia/Bangkok",
            "aiDraft",
            "previewBroadcast",
            "queueBroadcast",
            "IDEMPOTENCY_CONFLICT",
            "tenantId",
            "immutable",
        ):
            self.assertIn(marker, source)
        self.assertIsNone(re.search(r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-", source, re.IGNORECASE))

    def test_schema_has_tenant_integrity_forced_rls_immutable_revision_and_delivery_guard(self) -> None:
        source = MIGRATION.read_text(encoding="utf-8")
        for marker in (
            "create table if not exists public.news_categories",
            "create table if not exists public.news_posts",
            "create table if not exists public.news_revisions",
            "create table if not exists public.news_revision_categories",
            "create table if not exists public.news_delivery_runs",
            "news_revisions_post_fk",
            "news_revision_categories_category_fk",
            "news_delivery_runs_revision_fk",
            "news_posts_published_slug_uq",
            "alter table public.news_posts force row level security",
            "alter table public.news_revisions force row level security",
            "news_revisions_guard",
            "private.publish_news_revision",
            "private.archive_news_post",
        ):
            self.assertIn(marker, source)
        self.assertIn("revoke insert, update, delete, truncate on public.news_categories", source)

    def test_admin_and_citizen_surfaces_have_required_states_and_no_mock_content(self) -> None:
        page = (UI_ADMIN / "page.tsx").read_text(encoding="utf-8")
        console = (UI_ADMIN / "NewsConsole.tsx").read_text(encoding="utf-8")
        css = (UI_ADMIN / "news.css").read_text(encoding="utf-8")
        citizen = (UI_CITIZEN / "page.tsx").read_text(encoding="utf-8")
        detail = (UI_CITIZEN / "[slug]" / "page.tsx").read_text(encoding="utf-8")
        for marker in ("PermissionDeniedState", "FeatureDisabledState", "newsRepository", "NewsConsole", "initialSnapshot"):
            self.assertIn(marker, page)
        for marker in ("DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "SCHEDULED", "ARCHIVED", "OfflineState", "ExpiredSessionState", "ConflictState", "StaleState", "previewBroadcast", "queueBroadcast", "aiDraft", "Asia/Bangkok"):
            self.assertIn(marker, console)
        for breakpoint in ("max-width: 1023px", "max-width: 767px", "max-width: 480px", "max-width: 320px"):
            self.assertIn(breakpoint, css)
        self.assertIn("newsRepository.listPublished", citizen)
        self.assertIn("newsRepository.getPublishedBySlug", detail)
        for source in (console, citizen, detail):
            self.assertNotIn("gui-prototype", source)
            self.assertIsNone(re.search(r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-", source, re.IGNORECASE))

    def test_navigation_and_a61_route_are_traced(self) -> None:
        navigation = (ROOT / "apps" / "web" / "app" / "admin" / "admin-navigation.ts").read_text(encoding="utf-8")
        shell = (ROOT / "apps" / "web" / "app" / "admin" / "AdminShell.tsx").read_text(encoding="utf-8")
        self.assertIn('href: "/admin/news"', navigation)
        self.assertIn('id: "news"', navigation)
        self.assertIn('item.id === "news"', shell)
        self.assertTrue((UI_ADMIN / "[id]" / "edit" / "page.tsx").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
