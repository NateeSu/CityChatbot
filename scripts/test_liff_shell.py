"""Static contract checks for the C-01 LIFF citizen shell."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LIFF = ROOT / "apps" / "web" / "app" / "liff"
HOME = (LIFF / "LiffHome.tsx").read_text(encoding="utf-8")
HOME_PAGE = (LIFF / "page.tsx").read_text(encoding="utf-8")
CSS = (LIFF / "liff.css").read_text(encoding="utf-8")


class LiffShellContractTests(unittest.TestCase):
    def test_canonical_citizen_entry_and_safe_landing_routes_exist(self) -> None:
        for route in ("page.tsx", "services/page.tsx", "news/page.tsx", "contact/page.tsx", "help/page.tsx"):
            self.assertTrue((LIFF / route).exists(), route)

    def test_home_reads_recent_data_from_server_identity_scoped_endpoint(self) -> None:
        self.assertIn("/api/v1/citizen/complaints", HOME)
        self.assertIn("tenantId: identity.tenantId", HOME)
        self.assertIn("lineUserId: identity.lineUserId", HOME)
        self.assertIn("LiffCitizenIdentity", HOME)

    def test_resilient_states_and_recovery_actions_are_present(self) -> None:
        for state in ("LoadingState", "EmptyState", "ErrorState", "OfflineState", "PermissionDeniedState", "ExpiredSessionState", "StaleState", "FeatureDisabledState"):
            self.assertIn(state, HOME)
        self.assertIn("ลองใหม่", HOME)
        self.assertIn("เริ่มเซสชันใหม่", HOME)

    def test_navigation_is_not_a_dead_end(self) -> None:
        for href in ('/liff/complaints/new', '/liff/complaints', '/liff/news', '/liff/services', '/liff/contact', '/liff/help'):
            self.assertIn(href, HOME)
        self.assertIn('href="/liff"', HOME)

    def test_production_fails_closed_and_mobile_contract_is_explicit(self) -> None:
        self.assertIn('environment !== "local" && environment !== "test"', HOME_PAGE)
        self.assertIn("FeatureDisabledState", HOME_PAGE)
        self.assertIn("overflow-x: hidden", CSS)
        self.assertIn("max-width: 360px", CSS)
        self.assertIn("max-width: 480px", CSS)
        self.assertIn("min-width: 768px", CSS)
        self.assertIn("min-height: 44px", CSS)


if __name__ == "__main__":
    unittest.main(verbosity=2)
