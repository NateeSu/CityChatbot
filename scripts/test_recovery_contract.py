"""Recovery, backup and privacy contract checks used by DR unit gates."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

try:
    from performance_profile import build_report as build_performance_report, load_profile
except ModuleNotFoundError:  # pragma: no cover - supports package-style imports
    from scripts.performance_profile import build_report as build_performance_report, load_profile


ROOT = Path(__file__).resolve().parents[1]
RECOVERY = ROOT / "packages" / "complaints" / "src" / "recovery.ts"
RUNBOOK = ROOT / "docs" / "operations" / "p3-res-001.md"
DR_RUNBOOK = ROOT / "docs" / "operations" / "p7-dr-001.md"
PRIVACY_MIGRATION = ROOT / "supabase" / "migrations" / "20260812210000_privacy_lifecycle.sql"
PRIVACY_SERVICE = ROOT / "packages" / "security" / "src" / "privacy.ts"
PRIVACY_TEST = ROOT / "packages" / "security" / "src" / "privacy.test.ts"
GO_READINESS = ROOT / "docs" / "qa" / "p8-go-001-readiness.json"
GO_RUNBOOK = ROOT / "docs" / "operations" / "p8-go-001.md"

UNIT_TEST_IDS = (
    "P7-DR-BACKUP-CONTRACT",
    "P7-DR-PITR-CONTRACT",
    "P7-DR-RESTORE-ISOLATION",
    "P7-PRIV-RETENTION-CONTRACT",
    "P7-PRIV-DSAR-CONTRACT",
    "P7-PRIV-LEGAL-HOLD-CONTRACT",
    "P8-RES-FAILURE-MATRIX",
    "P8-RES-DR",
    "P8-RES-PERFORMANCE",
    "P8-RES-ROLLBACK",
    "P8-GO-MIGRATION-REHEARSAL",
    "P8-GO-BACKUP-READINESS",
    "P8-GO-ROLLBACK",
)


class RecoveryContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.recovery = RECOVERY.read_text(encoding="utf-8")
        cls.runbook = RUNBOOK.read_text(encoding="utf-8")
        cls.dr = DR_RUNBOOK.read_text(encoding="utf-8")
        cls.privacy_migration = PRIVACY_MIGRATION.read_text(encoding="utf-8")
        cls.privacy_service = PRIVACY_SERVICE.read_text(encoding="utf-8")
        cls.privacy_test = PRIVACY_TEST.read_text(encoding="utf-8")

    def test_failure_classes_and_safe_commit_boundary_are_implemented(self) -> None:
        for marker in (
            '"OPENROUTER"', '"EMBEDDING"', '"LINE_PUSH"', '"MAP"', '"REVERSE_GEOCODE"',
            "coreCommitted: true", "defaultIntakeQueueForTenant", "reconciliation.enqueue",
            "runReconciliationOnce", "reclaimExpired", 'outcome: "HANDOFF"', 'reasonCode: "SYSTEM_ERROR"',
        ):
            self.assertIn(marker, self.recovery)

    def test_retry_jobs_are_deduplicated_and_raw_provider_errors_are_not_persisted(self) -> None:
        for marker in ("dedupe", "leaseOwner", "attemptCount", "RETRY_WAIT", "DEAD", "EXTERNAL_DEPENDENCY_FAILED"):
            self.assertIn(marker, self.recovery)
        self.assertNotIn("JSON.stringify(error)", self.recovery)
        self.assertNotIn("errorDetailRedacted", self.recovery)

    def test_runbook_covers_every_required_failure_and_rollback(self) -> None:
        for marker in ("OpenRouter", "Embedding", "LINE push", "Map", "Reverse geocode", "Worker crash", "Rollback / feature flags", "manual address"):
            self.assertIn(marker, self.runbook)

    def test_backup_manifest_and_pitr_target_are_versioned(self) -> None:
        for marker in ("RPO", "15m", "RTO", "4h", "PITR", "checksum", "secret key-version", "tenant scope", "legal-hold", "isolated target"):
            self.assertIn(marker.lower(), self.dr.lower(), marker)
        self.assertRegex(self.dr, r"production restore:.*overwrite production", re.IGNORECASE | re.DOTALL)
        self.assertNotRegex(self.dr, r"sk-or-v1-[A-Za-z0-9]{20,}|SUPABASE_SERVICE_ROLE\s*[:=]\s*[^`\s]+", re.IGNORECASE)

    def test_restore_reconciliation_checks_integrity_and_access_boundaries(self) -> None:
        for marker in ("checksum", "composite tenant links", "FK links", "RLS/forced-RLS", "append-only audit", "citation/document versions", "object permissions", "corrupt", "fail-closed"):
            self.assertIn(marker.lower(), self.dr.lower(), marker)
        self.assertIn("discard only the isolated restore target", self.dr.lower())

    def test_manifest_example_is_json_safe_when_present(self) -> None:
        manifest_path = ROOT / "docs" / "operations" / "p7-dr-001-manifest.example.json"
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["schemaVersion"], "backup-restore-manifest.v1")
        self.assertEqual(payload["target"]["environment"], "isolated-synthetic")
        self.assertEqual(payload["rpoMinutes"], 15)
        self.assertEqual(payload["rtoMinutes"], 240)
        self.assertFalse(payload["productionMutationAllowed"])
        self.assertNotRegex(manifest_path.read_text(encoding="utf-8"), r"sk-or-v1-[A-Za-z0-9]{20,}|secretValue|passwordValue", re.IGNORECASE)

    def test_retention_policy_is_versioned_and_fail_closed(self) -> None:
        for marker in (
            "retention_policy_versions",
            "retention_policy_version_uq",
            "retention_policy_key_ck",
            "activated_by text",
            "SYSTEM_UNIT_GATE",
            "private.retention_purge_allowed",
            "if not found then return false",
            "revoke all on function",
        ):
            self.assertIn(marker.lower(), self.privacy_migration.lower(), marker)
        self.assertIn("NO_ACTIVE_POLICY", self.privacy_service)
        self.assertIn("PURGE_ALLOWED", self.privacy_service)
        self.assertIn("safe-denies missing policy", self.privacy_test)

    def test_dsar_is_pseudonymous_idempotent_and_tenant_scoped(self) -> None:
        for marker in (
            "data_subject_requests",
            "subject_hash text not null",
            "^sha256:[a-f0-9]{64}$",
            "data_subject_request_key_uq",
            "result_redacted_json",
            "TENANT_SCOPE",
            "createDataSubjectRequest",
            "subjectHashForTest",
        ):
            haystack = f"{self.privacy_migration}\n{self.privacy_service}\n{self.privacy_test}"
            self.assertIn(marker, haystack, marker)
        self.assertNotRegex(self.privacy_service, r"(phone|email|citizenName|rawPii)\s*[:=]", re.IGNORECASE)

    def test_legal_hold_blocks_matching_scope_and_is_reversible(self) -> None:
        for marker in (
            "legal_holds",
            "legal_hold_scope_ck",
            "legal_hold_release_ck",
            "hold.scope_keys ? 'ALL'",
            "hold.scope_keys ? p_policy_key",
            "HOLD_ACTIVE",
            "placeLegalHold",
            "releaseLegalHold",
        ):
            haystack = f"{self.privacy_migration}\n{self.privacy_service}\n{self.privacy_test}"
            self.assertIn(marker, haystack, marker)
        self.assertIn("force row level security", self.privacy_migration.lower())
        self.assertIn("tenant_id uuid not null", self.privacy_migration.lower())

    def test_p8_res_failure_matrix_preserves_core_intake_and_retries_safely(self) -> None:
        for marker in (
            "OpenRouter",
            "Embedding",
            "LINE push",
            "Map",
            "Reverse geocode",
            "Worker crash",
            "coreCommitted: true",
            "RETRY_WAIT",
            "DEAD",
            "dedupe",
            "leaseOwner",
            "manual address",
        ):
            self.assertIn(marker.lower(), f"{self.runbook}\n{self.recovery}".lower(), marker)
        self.assertIn("do not create a second business event", self.runbook.lower())
        self.assertIn("never make map availability a submission prerequisite", self.runbook.lower())

    def test_p8_res_dr_isolated_restore_and_fail_closed(self) -> None:
        manifest_path = ROOT / "docs" / "operations" / "p7-dr-001-manifest.example.json"
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["target"]["environment"], "isolated-synthetic")
        self.assertFalse(payload["productionMutationAllowed"])
        self.assertEqual(payload["rpoMinutes"], 15)
        self.assertEqual(payload["rtoMinutes"], 240)
        for marker in (
            "checksum",
            "isolated target",
            "composite tenant links",
            "RLS/forced-RLS",
            "fail-closed",
            "discard isolated target",
            "do not delete or rewrite production data",
        ):
            self.assertIn(marker.lower(), self.dr.lower(), marker)

    def test_p8_res_performance_contract_passes_the_versioned_two_x_soak_profile(self) -> None:
        report = build_performance_report(load_profile())
        self.assertTrue(report["passed"])
        self.assertEqual(report["scenario"]["forecastMultiplier"], 2)
        self.assertEqual(report["scenario"]["soakHours"], 8)
        self.assertEqual(report["isolation"]["tenantIsolationViolations"], 0)
        self.assertEqual(report["isolation"]["droppedCoreRecords"], 0)
        self.assertEqual(report["isolation"]["duplicateCoreRecords"], 0)
        self.assertEqual(report["backpressure"]["dataLoss"], 0)
        self.assertGreaterEqual(report["resource"]["minimumHeadroom"], 0.30)
        self.assertEqual(len(report["limitations"]), 2)

    def test_p8_res_rollback_is_artifact_based_and_preserves_production_schema(self) -> None:
        release = (ROOT / "docs" / "operations" / "release.md").read_text(encoding="utf-8")
        for marker in (
            "disable the feature flag",
            "last verified manifest",
            "backward",
            "compatible",
            "health/smoke checks",
            "never\nedit production schema",
        ):
            self.assertIn(marker.lower(), release.lower(), marker)
        self.assertIn("disable optional ai, map and notification consumers independently", self.runbook.lower())
        self.assertIn("keep complaint intake and the default queue enabled", self.runbook.lower())

    def test_p8_go_migration_rehearsal_is_ordered_isolated_and_non_destructive(self) -> None:
        readiness = json.loads(GO_READINESS.read_text(encoding="utf-8"))
        self.assertEqual(readiness["schemaVersion"], "production-readiness.v1")
        self.assertEqual(readiness["taskId"], "P8-GO-001")
        self.assertFalse(readiness["productionMutationAllowed"])
        self.assertEqual(readiness["migration"]["rehearsalTarget"], "isolated-synthetic")
        migration_paths = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
        self.assertGreaterEqual(len(migration_paths), 1)
        self.assertEqual([path.name for path in migration_paths], sorted(path.name for path in migration_paths))
        self.assertTrue(all(re.match(r"^\d{14}_[a-z0-9_]+\.sql$", path.name) for path in migration_paths))
        migration_text = "\n".join(path.read_text(encoding="utf-8") for path in migration_paths)
        self.assertNotRegex(migration_text, r"(?im)^\s*drop\s+(?:table|column)\b")
        self.assertNotRegex(migration_text, r"(?im)^\s*truncate\b")
        self.assertIn("expand-contract-or-forward-fix", json.dumps(readiness))

    def test_p8_go_backup_readiness_reuses_versioned_pitr_contract(self) -> None:
        readiness = json.loads(GO_READINESS.read_text(encoding="utf-8"))
        backup = readiness["backup"]
        self.assertEqual(backup["manifest"], "docs/operations/p7-dr-001-manifest.example.json")
        self.assertEqual(backup["rpoMinutes"], 15)
        self.assertEqual(backup["rtoMinutes"], 240)
        self.assertFalse(backup["productionOverwrite"])
        manifest = json.loads((ROOT / backup["manifest"]).read_text(encoding="utf-8"))
        self.assertEqual(manifest["target"]["environment"], "isolated-synthetic")
        self.assertFalse(manifest["productionMutationAllowed"])
        self.assertIn("isolated restore", self.dr.lower())

    def test_p8_go_rollback_sequence_is_executable_and_fail_closed(self) -> None:
        readiness = json.loads(GO_READINESS.read_text(encoding="utf-8"))
        runbook = GO_RUNBOOK.read_text(encoding="utf-8")
        for marker in (
            "last verified signed artifact",
            "disable only the affected feature flag",
            "forward fix",
            "preserve complaint",
            "health and synthetic smoke checks",
            "productionMutationAllowed: false",
            "execution dependency",
            "fail-closed",
        ):
            self.assertIn(marker.lower(), f"{runbook}\n{json.dumps(readiness)}".lower(), marker)
        self.assertEqual(readiness["rollback"]["verification"], "health and synthetic smoke before traffic restoration")


if __name__ == "__main__":
    unittest.main(verbosity=2)
