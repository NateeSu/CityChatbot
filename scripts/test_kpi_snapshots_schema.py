"""Static contract checks for P7-KPI-002 snapshot and job boundaries."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOMAIN = ROOT / "packages" / "reports-kpi" / "src" / "snapshots.ts"
TESTS = ROOT / "packages" / "reports-kpi" / "src" / "snapshots.test.ts"
MIGRATION = ROOT / "supabase" / "migrations" / "20260811230000_kpi_snapshot_jobs_schema.sql"
SQL_CONTRACT = ROOT / "supabase" / "tests" / "kpi_snapshot_schema_contract.sql"


class KpiSnapshotContractTests(unittest.TestCase):
    def test_domain_covers_idempotency_resume_watermark_correction_and_reconciliation(self) -> None:
        source = DOMAIN.read_text(encoding="utf-8")
        tests = TESTS.read_text(encoding="utf-8")
        for marker in (
            "KpiSnapshotRepository",
            "KpiSnapshotJobRunner",
            "idempotency",
            "sourceWatermark",
            "advanceWatermark",
            "SUPERSEDED",
            "archiveExpiredSuperseded",
            "reconcile",
            "failureAfter",
            "cursor",
        ):
            self.assertIn(marker, source, marker)
        for marker in ("partial", "late", "tenant", "watermark", "reconciliation", "retention"):
            self.assertIn(marker.lower(), tests.lower(), marker)
        self.assertNotRegex(source, r"OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE|sk-or-v1-", re.IGNORECASE)

    def test_schema_is_tenant_scoped_forced_rls_append_only_and_server_mutated(self) -> None:
        source = MIGRATION.read_text(encoding="utf-8").lower()
        for marker in (
            "create table if not exists public.kpi_snapshot_runs",
            "create table if not exists public.kpi_snapshots",
            "create table if not exists public.kpi_snapshot_watermarks",
            "create table if not exists public.kpi_snapshot_reconciliations",
            "kpi_snapshots_department_fk",
            "kpi_snapshots_run_fk",
            "kpi_snapshots_current_uq",
            "reject_kpi_snapshot_mutation",
            "append-only revisions",
            "force row level security",
            "revoke all on table public.kpi_snapshot_runs, public.kpi_snapshot_watermarks, public.kpi_snapshot_reconciliations",
            "private.materialize_kpi_snapshot",
            "private.advance_kpi_snapshot_watermark",
            "private.reconcile_kpi_snapshot",
        ):
            self.assertIn(marker, source, marker)
        self.assertNotRegex(source, r"drop\s+(table|schema)\b")

    def test_sql_contract_contains_transactional_late_data_and_no_rewind_assertions(self) -> None:
        source = SQL_CONTRACT.read_text(encoding="utf-8").lower()
        for marker in (
            "on_error_stop",
            "idempotent_replay",
            "late-data correction",
            "raw-vs-snapshot reconciliation",
            "partial snapshot run",
            "out-of-order watermark",
            "rollback",
        ):
            self.assertIn(marker, source, marker)


if __name__ == "__main__":
    unittest.main(verbosity=2)
