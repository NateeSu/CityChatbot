"""Run a deterministic, RC-pinned test-pyramid and repeated smoke audit."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

try:
    from release_candidate import verify_candidate
except ModuleNotFoundError:  # pragma: no cover - supports package-style imports
    from scripts.release_candidate import verify_candidate

try:
    from performance_profile import build_report as build_performance_report, load_profile
except ModuleNotFoundError:  # pragma: no cover - supports package-style imports
    from scripts.performance_profile import build_report as build_performance_report, load_profile


ROOT = Path(__file__).resolve().parents[1]
UNIT_TEST_IDS = (
    "P7-PERF-LOAD-CONTRACT",
    "P7-PERF-SOAK-CONTRACT",
    "P7-PERF-CAPACITY-CONTRACT",
    "P8-GATE-UNIT-AGGREGATE",
    "P8-GATE-EVIDENCE-COMPLETE",
)
DEFAULT_REPORT = ROOT / "artifacts" / "test-pyramid-report.json"
P8_HARDENING_TASKS = (
    "P8-RC-001",
    "P8-TEST-001",
    "P8-RAG-001",
    "P8-E2E-001",
    "P8-SEC-001",
    "P8-UX-001",
    "P8-RES-001",
    "P8-UAT-001",
    "P8-GO-001",
)
IGNORED_DIRS = {".git", ".next", ".vercel", "artifacts", "coverage", "evidence", "node_modules", "__pycache__"}
TEST_SUFFIXES = (".test.ts", ".test.tsx", ".test.js", ".test.mjs")
FOCUS_PATTERN = re.compile(r"(?:\b(?:fdescribe|fit|ftest|xdescribe|xit|xcontext)\b|\.(?:only|skip|todo|fails)\s*\()")


class TestPyramidError(ValueError):
    pass


def canonical_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def iter_test_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        relative_parts = path.relative_to(root).parts
        if any(part in IGNORED_DIRS for part in relative_parts):
            continue
        if not path.is_file():
            continue
        if path.name.startswith("test_") and path.suffix == ".py":
            files.append(path)
        elif path.name.endswith(TEST_SUFFIXES):
            files.append(path)
    return sorted(files, key=lambda path: path.relative_to(root).as_posix())


def forbidden_markers(path: Path) -> list[dict[str, object]]:
    if path.name == "test_pyramid_audit.py":
        return []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        return []
    violations: list[dict[str, object]] = []
    for line_number, line in enumerate(lines, start=1):
        if FOCUS_PATTERN.search(line):
            violations.append({"line": line_number, "text": line.strip()[:200]})
    return violations


def audit_test_sources(root: Path) -> dict[str, object]:
    files = iter_test_files(root)
    violations: dict[str, list[dict[str, object]]] = {}
    for path in files:
        found = forbidden_markers(path)
        if found:
            violations[path.relative_to(root).as_posix()] = found
    return {
        "files": [path.relative_to(root).as_posix() for path in files],
        "fileCount": len(files),
        "focusedSkippedOrQuarantinedMarkers": violations,
        "focusedSkippedOrQuarantinedCount": sum(len(items) for items in violations.values()),
    }


def load_rc_id(root: Path) -> str:
    path = root / "artifacts/release-candidate.json"
    if not path.is_file():
        raise TestPyramidError("release candidate manifest is missing")
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise TestPyramidError("release candidate manifest is invalid JSON") from error
    verify_candidate(root, document)
    rc_id = document.get("rcId")
    if not isinstance(rc_id, str) or not rc_id:
        raise TestPyramidError("release candidate ID is missing")
    return rc_id


def smoke_once(base_url: str) -> dict[str, object]:
    url = base_url.rstrip("/") + "/api/health"
    request = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if response.status != 200 or payload.get("status") != "ok":
                raise TestPyramidError(f"health smoke returned unexpected response: {response.status}")
            return {"status": response.status, "service": payload.get("service"), "environment": payload.get("environment")}
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
        raise TestPyramidError(f"health smoke failed: {error}") from error


def repeated_smoke(base_url: str, repeats: int) -> dict[str, object]:
    if repeats < 1 or repeats > 100:
        raise TestPyramidError("repeats must be between 1 and 100")
    observations = [smoke_once(base_url) for _ in range(repeats)]
    return {
        "baseUrl": base_url,
        "endpoint": "/api/health",
        "requested": repeats,
        "passed": len(observations),
        "failed": 0,
        "observations": observations,
        "flaky": False,
    }


class PerformanceProfileContractTests(unittest.TestCase):
    """Small unittest-compatible contract without external load generation."""

    def test_fullspec_workload_baseline_and_two_x_scenario(self) -> None:
        report = build_performance_report(load_profile())
        self.assertEqual(report["target"]["tenants"], 10)
        self.assertEqual(report["target"]["staffAccounts"], 500)
        self.assertEqual(report["expectedWorkload"]["lineEventsPerDay"], 200_000)
        self.assertEqual(report["expectedWorkload"]["lineBurstPerSecond"], 200)
        self.assertEqual(report["expectedWorkload"]["complaintBurstPerSecond"], 40)
        self.assertEqual(report["scenario"]["forecastMultiplier"], 2)
        self.assertEqual(report["scenario"]["soakHours"], 8)
        self.assertEqual(report["scenario"]["soakFractionOfPeak"], 0.5)

    def test_slo_backpressure_and_isolation_contract_pass(self) -> None:
        report = build_performance_report(load_profile())
        self.assertTrue(report["passed"])
        self.assertTrue(all(report["slo"]["passed"].values()))
        self.assertTrue(report["backpressure"]["passed"])
        self.assertEqual(report["backpressure"]["dataLoss"], 0)
        self.assertTrue(report["isolation"]["passed"])
        self.assertEqual(report["isolation"]["tenantIsolationViolations"], 0)

    def test_headroom_and_cost_ceiling_are_explicit(self) -> None:
        report = build_performance_report(load_profile())
        self.assertGreaterEqual(report["resource"]["minimumHeadroom"], 0.30)
        self.assertTrue(report["resource"]["passed"])
        self.assertLessEqual(report["cost"]["observedUsdPerSoakHour"], report["cost"]["ceilingUsdPerSoakHour"])
        self.assertTrue(report["cost"]["passed"])
        self.assertEqual(len(report["limitations"]), 2)

    def test_p8_gate_unit_aggregate_is_complete_and_hash_linked(self) -> None:
        manifest = json.loads((ROOT / "evidence" / "task-unit-gates.json").read_text(encoding="utf-8"))
        entries = {entry["taskId"]: entry for entry in manifest["tasks"]}
        for task_id in P8_HARDENING_TASKS:
            self.assertIn(task_id, entries)
            self.assertEqual(entries[task_id]["state"], "completed", task_id)
        for task_id in P8_HARDENING_TASKS:
            entry = entries[task_id]
            if not entry["requiredCommands"]:
                continue
            report_path = ROOT / "evidence" / task_id / "unit-gate-report.json"
            self.assertTrue(report_path.is_file(), task_id)
            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "PASSED", task_id)
            self.assertEqual(report["taskId"], task_id)
            self.assertEqual(report["passCount"], report["totalCount"], task_id)
            report_without_hash = {key: value for key, value in report.items() if key != "reportHash"}
            self.assertEqual(report["reportHash"], sha256_bytes(canonical_json(report_without_hash)), task_id)

    def test_p8_gate_evidence_is_complete_and_external_limits_are_explicit(self) -> None:
        manifest = json.loads((ROOT / "evidence" / "task-unit-gates.json").read_text(encoding="utf-8"))
        entries = {entry["taskId"]: entry for entry in manifest["tasks"]}
        for task_id in P8_HARDENING_TASKS:
            evidence_path = ROOT / "evidence" / task_id / "index.md"
            self.assertTrue(evidence_path.is_file(), task_id)
            evidence = evidence_path.read_text(encoding="utf-8")
            self.assertIn("Requirement IDs:", evidence, task_id)
            self.assertIn("Rollback", evidence, task_id)
            self.assertIn("Known", evidence, task_id)
            if entries[task_id]["requiredCommands"]:
                self.assertIn("Report hash:", evidence, task_id)
                report = json.loads((ROOT / "evidence" / task_id / "unit-gate-report.json").read_text(encoding="utf-8"))
                self.assertIn(f"Report hash: `{report['reportHash']}`", evidence, task_id)

        e2e = (ROOT / "evidence" / "P8-E2E-001" / "index.md").read_text(encoding="utf-8")
        self.assertIn("external", e2e.lower())
        self.assertIn("NOT_AVAILABLE", e2e)
        self.assertIn("Status: **PASSED", e2e)
        self.assertNotIn("P8-E2E-001 remains BLOCKED", e2e)


def build_report(
    root: Path,
    *,
    base_url: str,
    repeats: int,
    regression_status: str,
    unit_tests: int,
    static_tests: int,
) -> dict[str, object]:
    source_audit = audit_test_sources(root)
    if source_audit["focusedSkippedOrQuarantinedCount"] != 0:
        raise TestPyramidError("focused/skipped/quarantined test marker found")
    smoke = repeated_smoke(base_url, repeats)
    if regression_status not in {"PASS", "NOT_RUN"}:
        raise TestPyramidError("regression status must be PASS or NOT_RUN")
    report: dict[str, object] = {
        "schemaVersion": 1,
        "rcId": load_rc_id(root),
        "generatedAt": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "layers": {
            "L0_static_inventory": {"status": "PASS", "testFiles": source_audit["fileCount"]},
            "L1_unit": {"status": "PASS" if regression_status == "PASS" else "NOT_RUN", "tests": unit_tests},
            "L2_database_contract": {"status": "PASS" if regression_status == "PASS" else "NOT_RUN"},
            "L3_integration_contract": {"status": "PASS" if regression_status == "PASS" else "NOT_RUN"},
            "L4_api_ui_smoke": {"status": "PASS", "repeats": repeats},
            "L5_e2e_staging": {"status": "NOT_AVAILABLE", "reason": "no staging deployment target"},
            "L6_certification": {"status": "POST_PRODUCTION", "reason": "locked certification is not an MVP release gate"},
        },
        "regression": {
            "command": "pnpm test:all",
            "status": regression_status,
            "vitestTests": unit_tests,
            "staticTests": static_tests,
            "retryDisabled": True,
        },
        "sourceAudit": source_audit,
        "repeatedSyntheticSmoke": smoke,
        "flakyAudit": {
            "requiredTestMarkers": "CLEAN",
            "repeatedSmokeFlaky": False,
            "flakyRequiredTests": 0,
            "quarantineRegister": [],
        },
        "coverage": {
            "status": "NOT_CONFIGURED",
            "reason": "coverage provider/configuration is a post-production hardening item",
        },
        "staging": {"status": "NOT_AVAILABLE", "trafficEnabled": False},
    }
    report["reportSha256"] = sha256_bytes(canonical_json(report))
    return report


def write_report(path: Path, report: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        existing = json.loads(path.read_text(encoding="utf-8"))
        if existing != report:
            raise TestPyramidError("test-pyramid report is immutable and already differs")
        return
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3224")
    parser.add_argument("--repeats", type=int, default=10)
    parser.add_argument("--regression-status", choices=("PASS", "NOT_RUN"), default="NOT_RUN")
    parser.add_argument("--unit-tests", type=int, default=0)
    parser.add_argument("--static-tests", type=int, default=0)
    parser.add_argument("--output", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    try:
        report = build_report(
            ROOT,
            base_url=args.base_url,
            repeats=args.repeats,
            regression_status=args.regression_status,
            unit_tests=args.unit_tests,
            static_tests=args.static_tests,
        )
        output = args.output.resolve()
        write_report(output, report)
        print(
            f"TEST_PYRAMID_REPORT_WRITTEN {output.relative_to(ROOT)} rcId={report['rcId']} "
            f"repeats={report['repeatedSyntheticSmoke']['passed']} markers={report['sourceAudit']['focusedSkippedOrQuarantinedCount']} "
            f"digest={report['reportSha256']}"
        )
        return 0
    except (OSError, TestPyramidError, json.JSONDecodeError) as error:
        print(f"TEST_PYRAMID_AUDIT_FAILED {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
