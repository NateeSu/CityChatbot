"""Static contract checks for the P9-KT-001 operations handoff."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "packages" / "job-ops" / "src" / "operations-handoff.ts").read_text(encoding="utf-8")
TEST_SOURCE = (ROOT / "packages" / "job-ops" / "src" / "operations-handoff.test.ts").read_text(encoding="utf-8")
INVENTORY = json.loads((ROOT / "docs" / "operations" / "production-asset-inventory.json").read_text(encoding="utf-8"))

UNIT_TEST_IDS = [
    "P9-KT-DOCS",
    "P9-KT-RUNBOOK",
    "P9-KT-INVENTORY",
]


class OperationsHandoffContractTests(unittest.TestCase):
    def test_docs_and_link_checker(self) -> None:
        for marker in ("validateDocuments", "DOCUMENT_MISSING", "DOCUMENT_LINK_MISSING", "DOCUMENT_SECRET_LINK"):
            self.assertIn(marker, SOURCE)
        self.assertTrue((ROOT / "docs" / "operations" / "p9-kt-001.md").is_file())
        self.assertIn("rejects broken documentation links and missing rollback steps", TEST_SOURCE)

    def test_runbook_commands_require_safe_rollback(self) -> None:
        for marker in ("validateRunbooks", "RUNBOOK_ROLLBACK_MISSING", "RUNBOOK_DESTRUCTIVE_COMMAND", "RUNBOOK_SECRET_LITERAL"):
            self.assertIn(marker, SOURCE)
        self.assertIn("line-runtime", TEST_SOURCE)

    def test_inventory_and_config_are_complete_without_secrets(self) -> None:
        self.assertEqual(INVENTORY["environment"], "production")
        self.assertEqual({asset["category"] for asset in INVENTORY["assets"]}, {"DATABASE", "HOSTING", "LINE_CHANNEL", "WEBHOOK", "MIGRATION", "ROLLBACK", "OBSERVABILITY"})
        self.assertNotIn("sk-or-v1-", json.dumps(INVENTORY).lower())
        for marker in ("REQUIRED_ASSET_CATEGORIES", "CONFIG_REQUIRED_KEY_MISSING", "CONFIG_AI_CHAT_MUST_DEFAULT_OFF"):
            self.assertIn(marker, SOURCE)


if __name__ == "__main__":
    unittest.main()

