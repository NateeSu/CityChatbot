"""Static contract checks for staff reply to LINE delivery orchestration."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "packages" / "support-delivery" / "src" / "delivery.ts"
PACKAGE_TEST = ROOT / "packages" / "support-delivery" / "src" / "delivery.test.ts"
REPLY_ROUTE = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "support-tickets" / "[id]" / "reply" / "route.ts"
DETAIL = ROOT / "apps" / "web" / "app" / "admin" / "support-tickets" / "[id]" / "SupportTicketDetail.tsx"


class SupportDeliveryContractTests(unittest.TestCase):
    def test_delivery_boundary_reuses_line_dispatcher_and_support_message_scope(self) -> None:
        source = PACKAGE.read_text(encoding="utf-8")
        self.assertIn("LineMessagingDispatcher", source)
        self.assertIn("message.authorType !== \"STAFF\"", source)
        self.assertIn("message.visibility !== \"PUBLIC\"", source)
        self.assertIn("message.isAiDraft", source)
        self.assertIn("getByMessage", source)

    def test_delivery_view_does_not_expose_raw_recipient_or_content(self) -> None:
        source = PACKAGE.read_text(encoding="utf-8")
        view = source.split("export type SupportLineDeliveryView", 1)[1].split("export type SupportLineDeliveryInput", 1)[0]
        self.assertNotIn("recipientId", view)
        self.assertNotIn("replyToken", view)
        self.assertNotIn("text:", view)
        self.assertIn("deepLink", view)
        self.assertIn("status", view)

    def test_retry_and_dlq_contract_is_covered(self) -> None:
        source = PACKAGE_TEST.read_text(encoding="utf-8")
        for state in ("API_ACCEPTED", "RETRY_WAIT", "DLQ"):
            self.assertIn(state, source)
        self.assertIn("outOfHours", source)
        self.assertIn("idempotencyKey", source)

    def test_canonical_reply_route_exposes_delivery_option_without_new_wildcard(self) -> None:
        route = REPLY_ROUTE.read_text(encoding="utf-8")
        detail = DETAIL.read_text(encoding="utf-8")
        for field in ("sendToLine", "outOfHours", "supportLineDelivery", "localSupportLineProvider"):
            self.assertIn(field, route)
        for field in ("LINE delivery", "ส่ง public reply + LINE", "tracking"):
            self.assertIn(field, detail)


if __name__ == "__main__":
    unittest.main(verbosity=2)

