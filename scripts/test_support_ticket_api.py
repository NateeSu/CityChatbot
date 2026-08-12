"""Static API/UI boundary checks for the staff support ticket workflow."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTE_ROOT = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "support-tickets"
INBOX = ROOT / "apps" / "web" / "app" / "admin" / "support-tickets" / "SupportTicketInbox.tsx"
DETAIL = ROOT / "apps" / "web" / "app" / "admin" / "support-tickets" / "[id]" / "SupportTicketDetail.tsx"
REPOSITORY = ROUTE_ROOT / "repository.ts"


class SupportTicketContractTests(unittest.TestCase):
    def test_canonical_admin_routes_are_present(self) -> None:
        expected = {
            "route.ts",
            "[id]/route.ts",
            "[id]/assign/route.ts",
            "[id]/reply/route.ts",
            "[id]/transitions/route.ts",
            "[id]/faq-candidates/route.ts",
        }
        actual = {path.relative_to(ROUTE_ROOT).as_posix() for path in ROUTE_ROOT.rglob("route.ts")}
        self.assertTrue(expected.issubset(actual))

    def test_every_route_fails_closed_outside_synthetic_environment(self) -> None:
        for path in ROUTE_ROOT.rglob("route.ts"):
            source = path.read_text(encoding="utf-8")
            self.assertIn("isSupportLocalEnvironment", source)
            self.assertIn('"CONFIGURATION_UNAVAILABLE"', source)

    def test_mutations_require_version_and_idempotency(self) -> None:
        for name in ("[id]/assign/route.ts", "[id]/reply/route.ts", "[id]/transitions/route.ts", "[id]/faq-candidates/route.ts"):
            source = (ROUTE_ROOT / name).read_text(encoding="utf-8")
            self.assertIn("readSupportExpectedVersion", source)
            self.assertIn("readSupportIdempotencyKey", source)
            if name != "[id]/faq-candidates/route.ts":
                self.assertIn("supportService", source)
        faq_route = (ROUTE_ROOT / "[id]" / "faq-candidates" / "route.ts").read_text(encoding="utf-8")
        for marker in ("faqService", "sourceMessageId", 'action === "REVIEW"', 'action === "APPROVE"', 'action === "PUBLISH"', "isSupportLocalEnvironment"):
            self.assertIn(marker, faq_route)

    def test_reply_contract_separates_public_preview_and_internal_ai_draft(self) -> None:
        route = (ROUTE_ROOT / "[id]" / "reply" / "route.ts").read_text(encoding="utf-8")
        detail = DETAIL.read_text(encoding="utf-8")
        self.assertIn('visibility === "PUBLIC"', route)
        self.assertIn("previewConfirmed", route)
        self.assertIn("isAiDraft", route)
        self.assertIn("PUBLIC — แสดงประชาชน", detail)
        self.assertIn("INTERNAL — เจ้าหน้าที่เท่านั้น", detail)
        self.assertIn("AI draft", detail)

    def test_ui_covers_queue_filters_states_and_accessibility(self) -> None:
        inbox = INBOX.read_text(encoding="utf-8")
        detail = DETAIL.read_text(encoding="utf-8")
        for text in (inbox, detail):
            for state in ("กำลังโหลด", "ไม่มีสิทธิ์เข้าถึง", "ออฟไลน์อยู่", "เซสชันหมดอายุ", "ลองใหม่"):
                self.assertIn(state, text)
            self.assertIn("aria-label", text)
        for field in ("status", "priority", "queue", "sla", "sort"):
            self.assertIn(f'updateFilter("{field}"', inbox)
        for field in ("conversation", "เหตุผลและหลักฐาน", "Timeline สถานะ", "Audit trail", "มอบหมาย", "เปลี่ยนสถานะ"):
            self.assertIn(field, detail)

    def test_faq_approval_is_a_separate_governed_surface(self) -> None:
        queue = ROOT / "apps" / "web" / "app" / "admin" / "faq-candidates" / "FaqCandidateQueue.tsx"
        page = ROOT / "apps" / "web" / "app" / "admin" / "faq-candidates" / "page.tsx"
        queue_source = queue.read_text(encoding="utf-8")
        page_source = page.read_text(encoding="utf-8")
        for marker in ("PENDING_OWNER_REVIEW", "PENDING_COORDINATOR_APPROVAL", "PUBLISHED", "ROLLBACK"):
            self.assertIn(marker, queue_source)
        self.assertIn("force-dynamic", page_source)
        detail = DETAIL.read_text(encoding="utf-8")
        for marker in ("faqCandidates", "faqSourceMessageId", "faqPrivacyReviewed", "mutateFaq"):
            self.assertIn(marker, detail)

    def test_repository_does_not_expose_raw_citizen_identity(self) -> None:
        source = REPOSITORY.read_text(encoding="utf-8")
        self.assertNotIn("citizenIdentityHash", source.split("export type SupportAdminDetail", 1)[1])
        self.assertIn("retrievedPublicSources", source)
        self.assertIn("canSeeTicket", source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
