"""Static contract tests for P4-AISEC prompt, privacy and abuse controls."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SAFETY = ROOT / "packages" / "security" / "src" / "ai-safety.ts"


class AiSafetyContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = SAFETY.read_text(encoding="utf-8")
        cls.normalized = re.sub(r"\s+", " ", cls.source).lower()

    def test_prompt_segments_are_delimited_and_untrusted_context_is_marked(self) -> None:
        for marker in (
            "system_policy",
            "tenant_policy",
            "evidence",
            "user_query",
            "delimiter_prefix",
            "untrusted_data",
            "escapeDelimiterMarkers",
            "guardPromptContext",
        ):
            self.assertIn(marker.lower(), self.normalized)

    def test_injection_classes_and_fail_closed_security_outcome_exist(self) -> None:
        for marker in (
            "override_policy",
            "system_prompt_extraction",
            "tool_action",
            "encoded_instruction",
            "exfiltration",
            "cross_tenant",
            'reasonCode: "SECURITY"',
            "high_risk_codes",
        ):
            self.assertIn(marker.lower(), self.normalized)

    def test_tool_authorization_is_allowlist_and_server_authorized(self) -> None:
        for marker in (
            "allowedtools",
            "serverauthorize",
            "not_allowlisted",
            "tenant_mismatch",
            "server_denied",
        ):
            self.assertIn(marker.lower(), self.normalized)
        self.assertIn("if (!input.serverauthorize)", self.normalized)

    def test_privacy_and_output_controls_redact_and_validate_urls(self) -> None:
        for marker in (
            "redactSensitiveText",
            "redacted_secret",
            "redacted_personal_id",
            "redacted_phone",
            "redacted_email",
            "allowedurlhosts",
            "dangerous_markup",
            "markdown_link_blocked",
        ):
            self.assertIn(marker.lower(), self.normalized)
        self.assertIn('url.protocol !== "https:"', self.normalized)
        self.assertIn('url.protocol !== "http:"', self.normalized)

    def test_abuse_control_uses_tenant_actor_ip_and_feature_key(self) -> None:
        for marker in ("createRateLimitKey", "tenantId", "actorId", "ipHash", "feature", "AiAbuseGuard"):
            self.assertIn(marker.lower(), self.normalized)
        self.assertIn("inmemoryratelimiter", self.normalized)


if __name__ == "__main__":
    unittest.main(verbosity=2)
