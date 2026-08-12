"""Static contract checks for P7-KPI-001 deterministic SQL truth."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOMAIN = ROOT / "packages" / "reports-kpi" / "src" / "kpi.ts"
TESTS = ROOT / "packages" / "reports-kpi" / "src" / "kpi.test.ts"
MIGRATION = ROOT / "supabase" / "migrations" / "20260811220000_kpi_metric_dictionary.sql"
SEED = ROOT / "supabase" / "seed.sql"
SQL_CONTRACT = ROOT / "supabase" / "tests" / "kpi_metric_schema_contract.sql"


class KpiMetricContractTests(unittest.TestCase):
    def test_dictionary_contains_versioned_definitions_and_fixture_oracle(self) -> None:
        source = DOMAIN.read_text(encoding="utf-8")
        test_source = TESTS.read_text(encoding="utf-8")
        for marker in (
            "KPI_DEFINITION_VERSION",
            "KPI_DEFINITIONS",
            "COMPLAINT_RECEIVED_VOLUME",
            "COMPLAINT_OPEN_BACKLOG",
            "COMPLAINT_REOPENED_VOLUME",
            "FIRST_RESPONSE_SLA_RATE",
            "RESOLUTION_SLA_RATE",
            "OUT_OF_JURISDICTION_RATE",
            "SUPPORT_TICKET_CLOSED_RATE",
            "calculateKpiSet",
            "APPROVED_SQL_DEFINITION",
            "pending",
            "excluded",
        ):
            self.assertIn(marker, source, marker)
        for marker in ("half-open period", "tenant", "department", "paused", "reopened", "cancelled", "out-of-jurisdiction"):
            self.assertIn(marker.lower(), test_source.lower(), marker)
        self.assertNotRegex(source, r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-v1-", re.IGNORECASE)

    def test_migration_is_tenant_scoped_forced_rls_and_version_immutable(self) -> None:
        source = MIGRATION.read_text(encoding="utf-8").lower()
        for marker in (
            "create table if not exists public.kpi_metric_definitions",
            "kpi_metric_definitions_tenant_id_uq",
            "kpi_metric_definitions_key_version_uq",
            "alter table public.kpi_metric_definitions enable row level security",
            "alter table public.kpi_metric_definitions force row level security",
            "kpi_metric_definitions_read_approved",
            "approved kpi definition is immutable",
            "private.calculate_kpi",
            "private.complaint_status_at",
            "private.support_ticket_status_at",
            "kpi_metric_catalog",
        ):
            self.assertIn(marker, source, marker)
        self.assertNotRegex(source, r"drop\s+(table|schema)\b")

    def test_seed_has_only_synthetic_approved_definitions(self) -> None:
        source = SEED.read_text(encoding="utf-8")
        self.assertIn("P7-KPI-001 synthetic approved dictionary", source)
        self.assertIn("on conflict (tenant_id, metric_key, version) do nothing", source)
        self.assertNotRegex(source, r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-v1-", re.IGNORECASE)

    def test_sql_contract_checks_reconciliation_and_no_browser_write(self) -> None:
        source = SQL_CONTRACT.read_text(encoding="utf-8").lower()
        for marker in (
            "on_error_stop",
            "calculate_kpi",
            "approved_sql_definition",
            "tenant b",
            "authenticated kpi dictionary mutation privilege unexpectedly exists",
        ):
            self.assertIn(marker, source, marker)

    def test_no_ai_numeric_truth_path_exists(self) -> None:
        source = "\n".join((DOMAIN.read_text(encoding="utf-8"), MIGRATION.read_text(encoding="utf-8")))
        self.assertNotRegex(source, r"\b(llm|openrouter|prompt|embedding)\b|ai computes", re.IGNORECASE)


if __name__ == "__main__":
    unittest.main(verbosity=2)
