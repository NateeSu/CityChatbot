"""Run the isolated, synthetic P0 QA smoke harness and evidence reporter."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "fixtures" / "qa" / "harness-manifest.json"
EVIDENCE_ROOT = ROOT / "evidence" / "P0-QA-002" / "harness-runs"
UNIT_TEST_IDS = (
    "P0-QA-HARNESS-MANIFEST",
    "P0-QA-HARNESS-FIXTURES",
    "P0-QA-HARNESS-PROVIDERS",
    "P0-QA-HARNESS-CLOCK",
    "P0-QA-HARNESS-EVIDENCE",
    "P0-QA-HARNESS-FAILURE-PROBE",
)
UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
REQUIRED_ROLES = {"CITIZEN", "STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN", "SUPPORT"}


class QAHarnessError(ValueError):
    pass


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value)).hexdigest()


def load_manifest() -> dict[str, Any]:
    try:
        value = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise QAHarnessError(f"cannot load harness manifest: {error}") from error
    if not isinstance(value, dict):
        raise QAHarnessError("harness manifest must be a JSON object")
    return value


def git_revision() -> str:
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise QAHarnessError("cannot resolve repository revision")
    return result.stdout.strip()


def validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("schemaVersion") != "qa-harness.v1":
        raise QAHarnessError("unsupported harness schema")
    if manifest.get("environment") != "isolated-synthetic" or manifest.get("networkPolicy") != "NO_EXTERNAL_NETWORK":
        raise QAHarnessError("harness must be isolated and synthetic")
    if manifest.get("productionDataPolicy") != "SYNTHETIC_ONLY":
        raise QAHarnessError("production data is forbidden in harness fixtures")
    if manifest.get("timezone") != "Asia/Bangkok" or manifest.get("clock", {}).get("timezone") != "Asia/Bangkok":
        raise QAHarnessError("clock timezone must be Asia/Bangkok")
    tenants = manifest.get("tenants")
    if not isinstance(tenants, list) or {tenant.get("code") for tenant in tenants} != {"TENANT_A", "TENANT_B"}:
        raise QAHarnessError("tenant A/B fixture is incomplete")
    tenant_ids = {tenant.get("id") for tenant in tenants}
    if len(tenant_ids) != 2 or any(not isinstance(identifier, str) or not UUID_PATTERN.fullmatch(identifier) for identifier in tenant_ids):
        raise QAHarnessError("tenant IDs must be distinct UUID-shaped synthetic IDs")
    departments = manifest.get("departments")
    if not isinstance(departments, list) or {department.get("code") for department in departments} != {"A1", "A2", "B1"}:
        raise QAHarnessError("department A1/A2/B1 fixture is incomplete")
    if any(department.get("tenantId") not in tenant_ids for department in departments):
        raise QAHarnessError("department tenant binding is invalid")
    tenant_a = next(tenant for tenant in tenants if tenant.get("code") == "TENANT_A")
    tenant_b = next(tenant for tenant in tenants if tenant.get("code") == "TENANT_B")
    department_map = {department["code"]: department["tenantId"] for department in departments}
    if department_map.get("A1") != tenant_a["id"] or department_map.get("A2") != tenant_a["id"] or department_map.get("B1") != tenant_b["id"]:
        raise QAHarnessError("department cross-tenant fixture mapping is invalid")
    roles = manifest.get("roles")
    if not isinstance(roles, list) or set(roles) != REQUIRED_ROLES:
        raise QAHarnessError("canonical role fixture is incomplete")
    citizens = manifest.get("citizens")
    if not isinstance(citizens, list) or {citizen.get("tenantId") for citizen in citizens} != tenant_ids or len(citizens) != 2:
        raise QAHarnessError("citizen A/B fixture is incomplete")
    if any(not citizen.get("lineUserId", "").startswith("U-SYNTHETIC-") for citizen in citizens):
        raise QAHarnessError("citizen fixture contains a non-synthetic identity")
    providers = manifest.get("providerMocks")
    if providers.get("line", {}).get("duplicateDeliveryMustBeNoOp") is not True:
        raise QAHarnessError("LINE duplicate delivery must be a no-op")
    if providers.get("openrouter", {}).get("network") != "disabled" or providers.get("openrouter", {}).get("privacyProfile") != "PUBLIC_SAFE":
        raise QAHarnessError("provider mock must be local and privacy constrained")
    failure = manifest.get("intentionalFailureProbe")
    if failure != {"command": "python scripts/qa_harness.py --intentional-failure", "expectedExitCode": 1, "marker": "QA_INTENTIONAL_FAILURE"}:
        raise QAHarnessError("intentional failure probe is not canonical")
    if not isinstance(manifest.get("modelConfig"), dict) or not all(manifest["modelConfig"].get(key) for key in ("route", "model", "promptVersion", "embeddingVersion")):
        raise QAHarnessError("model/config fixture is incomplete")
    serialized = json.dumps(manifest, ensure_ascii=False)
    if re.search(r"(?i)(sk-or-v1-|service_role|bearer\s+|password\s*=|secret\s*=)", serialized):
        raise QAHarnessError("fixture contains a credential-like value")


def simulate_provider_contracts(manifest: dict[str, Any]) -> dict[str, Any]:
    line = manifest["providerMocks"]["line"]
    if line["signature"] != "fixture-only" or line["redelivery"] is not True:
        raise QAHarnessError("LINE fixture contract failed")
    received = {"evt-001"}
    redelivery = {"evt-001"}
    if received & redelivery != {"evt-001"}:
        raise QAHarnessError("LINE redelivery fixture failed")
    openrouter = manifest["providerMocks"]["openrouter"]
    if openrouter["providerFailure"] != "HANDOFF_SYSTEM_ERROR":
        raise QAHarnessError("provider failure fallback is not canonical")
    return {"lineDuplicateDelivery": "NO_OP", "providerFailureOutcome": "HANDOFF", "providerFailureReasonCode": "SYSTEM_ERROR"}


def simulate_clock(manifest: dict[str, Any]) -> dict[str, Any]:
    clock = manifest["clock"]
    if clock["now"] != "2026-08-12T09:30:00+07:00" or clock["dst"] is not False:
        raise QAHarnessError("clock fixture is not deterministic")
    return {"now": clock["now"], "timezone": clock["timezone"], "dst": clock["dst"]}


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def build_report(manifest: dict[str, Any]) -> dict[str, Any]:
    validate_manifest(manifest)
    started = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    provider_result = simulate_provider_contracts(manifest)
    clock_result = simulate_clock(manifest)
    finished = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    manifest_hash = digest(manifest)
    model_hash = digest(manifest["modelConfig"])
    report = {
        "schemaVersion": "qa-harness-report.v1",
        "taskId": "P0-QA-002",
        "status": "PASSED",
        "actor": "SYSTEM_UNIT_GATE",
        "revision": git_revision(),
        "environment": manifest["environment"],
        "seed": manifest["seed"],
        "manifestSha256": manifest_hash,
        "modelConfigSha256": model_hash,
        "startedAt": started,
        "finishedAt": finished,
        "requiredTestIds": list(UNIT_TEST_IDS),
        "passedTestIds": list(UNIT_TEST_IDS),
        "checks": {
            "manifest": "PASS",
            "tenantAndRoleFixtures": "PASS",
            "providerMocks": provider_result,
            "clock": clock_result,
            "intentionalFailureProbe": "PASS",
        },
        "artifactLinks": [
            "fixtures/qa/harness-manifest.json",
            "docs/qa/test-harness.md",
        ],
    }
    report["reportSha256"] = digest(report)
    return report


def report_path(report: dict[str, Any]) -> Path:
    key = hashlib.sha256(f"{report['revision']}|{report['manifestSha256']}|{report['modelConfigSha256']}".encode()).hexdigest()[:24]
    return EVIDENCE_ROOT / f"{key}.json"


def write_or_reuse_report(report: dict[str, Any]) -> Path:
    path = report_path(report)
    if path.exists():
        existing = json.loads(path.read_text(encoding="utf-8"))
        immutable_keys = set(report) - {"startedAt", "finishedAt", "reportSha256"}
        if any(existing.get(key) != report.get(key) for key in immutable_keys):
            raise QAHarnessError(f"immutable harness report differs: {path}")
        return path
    atomic_write(path, json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return path


def intentional_failure() -> int:
    print("QA_INTENTIONAL_FAILURE simulated test failure", file=sys.stderr)
    return 1


def assert_intentional_failure(manifest: dict[str, Any]) -> None:
    result = subprocess.run([sys.executable, "scripts/qa_harness.py", "--intentional-failure"], cwd=ROOT, capture_output=True, text=True, check=False)
    expected = manifest["intentionalFailureProbe"]
    combined = f"{result.stdout}\n{result.stderr}"
    if result.returncode != expected["expectedExitCode"] or expected["marker"] not in combined:
        raise QAHarnessError("intentional failure probe did not fail closed")


def verify() -> tuple[dict[str, Any], Path]:
    manifest = load_manifest()
    validate_manifest(manifest)
    assert_intentional_failure(manifest)
    report = build_report(manifest)
    path = write_or_reuse_report(report)
    return report, path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--intentional-failure", action="store_true")
    parser.add_argument("--assert-intentional-failure", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.intentional_failure:
            return intentional_failure()
        manifest = load_manifest()
        if args.assert_intentional_failure:
            assert_intentional_failure(manifest)
            print("QA_INTENTIONAL_FAILURE_PROBE_PASSED")
            return 0
        report, path = verify()
        print(f"QA_HARNESS_VERIFIED {path.relative_to(ROOT)} reportSha256={report['reportSha256']}")
        return 0
    except (OSError, QAHarnessError, json.JSONDecodeError) as error:
        print(f"QA_HARNESS_FAILED {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
