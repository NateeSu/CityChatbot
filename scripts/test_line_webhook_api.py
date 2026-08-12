"""Static contract tests for the production LINE webhook route."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = (ROOT / "apps" / "web" / "app" / "api" / "v1" / "line" / "webhooks" / "[webhookKey]" / "route.ts").read_text(encoding="utf-8")
STORE = (ROOT / "apps" / "web" / "app" / "api" / "v1" / "line" / "webhooks" / "[webhookKey]" / "store.ts").read_text(encoding="utf-8")


class LineWebhookApiContractTests(unittest.TestCase):
    def test_canonical_explicit_route_uses_raw_body_and_signature(self) -> None:
        self.assertIn('request.headers.get("x-line-signature")', ROUTE)
        self.assertIn("request.arrayBuffer()", ROUTE)
        self.assertIn("processDurableLineWebhook", ROUTE)

    def test_route_fails_closed_without_server_dependencies(self) -> None:
        for key in ("LINE_WEBHOOK_HASH_SECRET", "DATABASE_URL", "TENANT_CREDENTIAL_KEY"):
            self.assertIn(key, ROUTE)
        self.assertIn('reasonCode: "DEPENDENCY_NOT_READY"', ROUTE)

    def test_database_access_is_function_only_and_payload_is_encrypted(self) -> None:
        self.assertIn("private.resolve_line_webhook", STORE)
        self.assertIn("private.ingest_line_webhook", STORE)
        self.assertNotIn("insert into public.", STORE.lower())
        self.assertIn('createCipheriv("aes-256-gcm"', STORE)
        self.assertIn("decryptSecret", STORE)

    def test_no_provider_or_database_secret_is_browser_visible(self) -> None:
        self.assertNotIn("NEXT_PUBLIC_DATABASE", ROUTE + STORE)
        self.assertNotIn("service_role", (ROUTE + STORE).lower())
        self.assertNotRegex(ROUTE + STORE, r"sk-or-v1-[A-Za-z0-9_-]+")


if __name__ == "__main__":
    unittest.main(verbosity=2)
