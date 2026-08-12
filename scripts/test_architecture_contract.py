import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FULLSPEC = ROOT / "fullspec.md"
ARCHITECTURE = ROOT / "docs" / "architecture" / "architecture-boundaries.md"
ROUTES = ROOT / "apps" / "web" / "app" / "api"


UNIT_TEST_IDS = (
    "P0-ARCH-REQUEST-BACKGROUND",
    "P0-ARCH-OUTBOX-ATOMICITY",
    "P0-ARCH-TENANT-SERVICE-ROLE",
    "P0-ARCH-EXPLICIT-ROUTES",
    "P0-ARCH-FAIL-CLOSED-ROLLBACK",
)


class ArchitectureContractTests(unittest.TestCase):
    def test_request_background_and_outbox_contract_is_recorded(self) -> None:
        spec = FULLSPEC.read_text(encoding="utf-8")
        architecture = ARCHITECTURE.read_text(encoding="utf-8")
        for marker in ("ARCH-ASYNC-001", "domain_outbox", "atomic\nbusiness transaction", "Worker", "FOR UPDATE SKIP LOCKED"):
            self.assertIn(marker, spec if marker in {"ARCH-ASYNC-001", "domain_outbox", "FOR UPDATE SKIP LOCKED"} else architecture)
        for marker in ("Request and background boundaries", "transactional outbox", "idempotency", "fail-closed", "rollback"):
            self.assertIn(marker.lower(), architecture.lower())

    def test_route_contract_has_no_wildcard_route(self) -> None:
        route_files = list(ROUTES.rglob("route.ts"))
        self.assertGreater(len(route_files), 0)
        for route in route_files:
            source = route.read_text(encoding="utf-8")
            self.assertNotRegex(source, r"/\*|\*\/", str(route))
        self.assertTrue((ROUTES / "v1" / "line" / "webhooks" / "[webhookKey]" / "route.ts").is_file())

    def test_tenant_and_secret_boundary_is_explicit(self) -> None:
        architecture = ARCHITECTURE.read_text(encoding="utf-8")
        for marker in ("tenant scope", "private database wrappers", "Service-role", "browser", "normal request path"):
            self.assertIn(marker.lower(), architecture.lower())
        self.assertNotRegex(architecture, r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-v1-", re.IGNORECASE)

    def test_webhook_ack_does_not_claim_direct_chat_delivery(self) -> None:
        architecture = ARCHITECTURE.read_text(encoding="utf-8")
        for marker in ("acknowledgement-only ingestion boundary", "durable consumer", "Direct LINE\ntext chat", "disabled"):
            self.assertIn(marker, architecture)

    def test_explicit_rollback_and_failure_isolation(self) -> None:
        architecture = ARCHITECTURE.read_text(encoding="utf-8")
        for marker in ("previous immutable revision", "feature flag", "append-only audit/outbox", "replay"):
            self.assertIn(marker, architecture)


if __name__ == "__main__":
    unittest.main(verbosity=2)
