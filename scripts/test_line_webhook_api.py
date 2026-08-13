"""Static contract tests for the production LINE webhook route."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = (ROOT / "apps" / "web" / "app" / "api" / "v1" / "line" / "webhooks" / "[webhookKey]" / "route.ts").read_text(encoding="utf-8")
STORE = (ROOT / "apps" / "web" / "app" / "api" / "v1" / "line" / "webhooks" / "[webhookKey]" / "store.ts").read_text(encoding="utf-8")
WORKER_ROUTE = (ROOT / "apps" / "web" / "app" / "api" / "v1" / "line" / "worker" / "route.ts").read_text(encoding="utf-8")
WORKER_RUNTIME = (ROOT / "apps" / "app" / "api" / "v1" / "line" / "worker" / "runtime.ts").read_text(encoding="utf-8") if (ROOT / "apps" / "app").exists() else (ROOT / "apps" / "web" / "app" / "api" / "v1" / "line" / "worker" / "runtime.ts").read_text(encoding="utf-8")
RUNTIME_SQL = (ROOT / "supabase" / "migrations" / "20260813010000_line_chat_runtime.sql").read_text(encoding="utf-8")

UNIT_TEST_IDS = [
    "P9-CAN-LINE-INBOX-DELIVERY",
    "P9-CAN-LIFF-SESSION",
    "P9-CAN-COMPLAINT-CREATE",
    "P9-CAN-IDEMPOTENCY",
    "P9-CAN-CLEANUP",
]


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

    def test_durable_consumer_and_provider_delivery_contract_is_wired(self) -> None:
        for marker in ("runLineWorkerBatch", "LINE_CHAT_RUNTIME_ENABLED", "workerStatus"):
            self.assertIn(marker, ROUTE)
        for marker in ("private.claim_line_webhook_job", "private.enqueue_line_chat_response", "private.complete_line_webhook_job", "private.fail_line_webhook_job", "private.claim_line_message_job", "private.complete_line_message_job", "private.fail_line_message_job"):
            self.assertIn(marker, WORKER_RUNTIME + RUNTIME_SQL)
        for marker in ("https://api.line.me/v2/bot/message/", "providerForClaim", "createDurableLineIdempotencyKey"):
            self.assertIn(marker, WORKER_RUNTIME)

    def test_webhook_ack_is_not_blocked_by_worker_processing(self) -> None:
        self.assertIn('import { after, NextResponse } from "next/server"', ROUTE)
        self.assertIn("after(async () =>", ROUTE)
        self.assertIn('workerStatus = "DEFERRED"', ROUTE)
        self.assertNotIn("workerStatus = (await runLineWorkerBatch", ROUTE)

    def test_grounding_and_fail_closed_boundaries_are_explicit(self) -> None:
        for marker in ("ai_chat_enabled", "PUBLIC", "ACTIVE", "effective", "retrieve", "decideAnswerability", "DEPENDENCY_NOT_READY"):
            self.assertIn(marker.lower(), (WORKER_RUNTIME + RUNTIME_SQL + WORKER_ROUTE).lower())
        self.assertIn('process.env.LINE_CHAT_RUNTIME_ENABLED !== "true"', WORKER_RUNTIME)
        self.assertIn('process.env.LINE_WORKER_SECRET', WORKER_ROUTE)

    def test_idempotency_and_secret_boundary_are_preserved(self) -> None:
        self.assertIn("on conflict (tenant_id, idempotency_key)", RUNTIME_SQL.lower())
        self.assertIn("createDurableLineIdempotencyKey", WORKER_RUNTIME)
        self.assertIn("encryptEnvelope", WORKER_RUNTIME)
        self.assertIn("decryptEnvelope", WORKER_RUNTIME)
        self.assertNotIn("console.log", WORKER_RUNTIME.lower())
        self.assertNotIn("service_role", WORKER_RUNTIME.lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
