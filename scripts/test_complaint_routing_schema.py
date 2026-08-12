"""Static contract tests for P4-ROUTE-001 routing-log hardening."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260810110000_complaint_routing_hardening.sql"


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).lower()


class ComplaintRoutingSchemaContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = MIGRATION.read_text(encoding="utf-8")
        cls.normalized = normalized(cls.sql)

    def test_migration_is_additive_and_targets_only_the_routing_log(self) -> None:
        self.assertIn("alter table public.complaint_routing_runs", self.normalized)
        self.assertIn("add column if not exists original_output jsonb", self.normalized)
        self.assertIn("add column if not exists evidence jsonb", self.normalized)
        self.assertNotRegex(self.normalized, r"\bdrop\s+(table|schema)\b")
        self.assertNotRegex(
            self.normalized,
            r"(insert|update|delete)\s+.*complaints.*assigned_department_id",
        )

    def test_versioned_trace_and_correction_relationships_are_present(self) -> None:
        for marker in (
            "request_key",
            "request_hash",
            "run_type",
            "source_run_id",
            "complaint_routing_runs_source_fk",
            "complaint_routing_runs_recommended_department_fk",
            "complaint_routing_runs_request_uq",
            "complaint_routing_runs_source_idx",
        ):
            self.assertIn(marker, self.normalized)
        self.assertIn("foreign key (tenant_id, source_run_id)", self.normalized)
        self.assertIn("foreign key (tenant_id, recommended_department_id)", self.normalized)

    def test_structured_output_and_decision_checks_are_closed(self) -> None:
        for marker in (
            "complaint_routing_runs_output_ck",
            "complaint_routing_runs_evidence_ck",
            "complaint_routing_runs_decision_ck",
            "complaint_routing_runs_confidence_ck",
            "complaint_routing_runs_duplicate_ids_ck",
            "complaint_routing_runs_priority_ck",
            "complaint_routing_runs_risk_ck",
            "decision in ('suggestion', 'default_intake', 'corrected')",
            "run_type in ('suggestion', 'correction')",
        ):
            self.assertIn(marker, self.normalized)

    def test_correction_cannot_be_detached_from_a_source_run(self) -> None:
        self.assertIn(
            "(run_type = 'suggestion' and source_run_id is null) or (run_type = 'correction' and source_run_id is not null)",
            self.normalized,
        )
        self.assertIn("before update or delete on public.complaint_routing_runs", normalized(
            (ROOT / "supabase" / "migrations" / "20260810020000_complaint_schema.sql").read_text(encoding="utf-8"),
        ))


if __name__ == "__main__":
    unittest.main(verbosity=2)
