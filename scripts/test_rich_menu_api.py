"""Static API/UI boundary checks for the Rich Menu builder slice."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTE_ROOT = ROOT / "apps" / "web" / "app" / "api" / "v1" / "admin" / "rich-menu-versions"
BUILDER = ROOT / "apps" / "web" / "app" / "admin" / "settings" / "rich-menu" / "RichMenuBuilder.tsx"
PAGE = ROOT / "apps" / "web" / "app" / "admin" / "settings" / "rich-menu" / "page.tsx"


class RichMenuApiContractTests(unittest.TestCase):
    def test_canonical_routes_are_present(self) -> None:
        expected = {
            "route.ts",
            "[id]/route.ts",
            "[id]/validate/route.ts",
            "[id]/publish/route.ts",
            "[id]/rollback/route.ts",
        }
        actual = {path.relative_to(ROUTE_ROOT).as_posix() for path in ROUTE_ROOT.rglob("route.ts")}
        self.assertTrue(expected.issubset(actual))

    def test_routes_are_local_synthetic_only_until_provider_configuration_exists(self) -> None:
        for path in ROUTE_ROOT.rglob("route.ts"):
            source = path.read_text(encoding="utf-8")
            self.assertIn("isLocalSyntheticEnvironment", source)
            self.assertIn('"CONFIGURATION_UNAVAILABLE"', source)

    def test_mutations_require_idempotency_and_expected_version(self) -> None:
        for name in ("route.ts", "[id]/route.ts", "[id]/validate/route.ts", "[id]/publish/route.ts", "[id]/rollback/route.ts"):
            source = (ROUTE_ROOT / name).read_text(encoding="utf-8")
            if "POST" in source or "PATCH" in source:
                self.assertIn('request.headers.get("idempotency-key")', source)
                if name != "route.ts":
                    self.assertIn("expectedVersion", source)

    def test_builder_uses_canonical_states_and_real_api_endpoints(self) -> None:
        source = BUILDER.read_text(encoding="utf-8")
        for state in ("DRAFT", "VALIDATED", "PUBLISHING", "PUBLISHED", "FAILED", "SUPERSEDED"):
            self.assertIn(state, source)
        for suffix in ("/validate", "/publish", "/rollback"):
            self.assertIn(f"{suffix}`", source)
        self.assertIn("/api/v1/admin/rich-menu-versions", source)

    def test_production_page_does_not_render_synthetic_builder(self) -> None:
        page = PAGE.read_text(encoding="utf-8")
        self.assertIn('environment !== "local" && environment !== "test"', page)
        self.assertIn("FeatureDisabledState", page)


if __name__ == "__main__":
    unittest.main(verbosity=2)
