"""Static contract tests for P3-DUP-001 duplicate isolation and safety."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810050000_duplicate_candidates.sql"


class DuplicateSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = re.sub(r"\s+", " ", MIGRATION.read_text(encoding="utf-8")).lower()

    def test_decision_idempotency_and_candidate_indexes_exist(self) -> None:
        for marker in (
            "add column if not exists idempotency_key",
            "complaint_duplicate_links_idempotency_ck",
            "length(idempotency_key) between 8 and 255",
            "complaint_duplicate_links_idempotency_uq",
            "complaints_duplicate_candidate_idx",
            "complaints_duplicate_unresolved_time_idx",
        ):
            self.assertIn(marker, self.sql)

    def test_database_candidate_function_is_tenant_and_unresolved_scoped(self) -> None:
        for marker in (
            "private.find_complaint_duplicate_candidates",
            "candidate.tenant_id = source.tenant_id",
            "candidate.canonical_status not in ('resolved', 'closed', 'out_of_jurisdiction', 'cancelled')",
            "candidate.category_id is not distinct from source.category_id",
            "p_window_hours",
            "p_radius_meters",
            "limit least(greatest(p_limit, 1), 50)",
        ):
            self.assertIn(marker, self.sql)
        self.assertNotRegex(self.sql, r"drop\s+(table|schema)")

    def test_no_automatic_merge_or_close_is_present(self) -> None:
        self.assertIn("human decision is required", self.sql)
        self.assertNotRegex(self.sql, r"update\s+public\.complaints\s+set\s+canonical_status")


if __name__ == "__main__":
    unittest.main(verbosity=2)
