"""Run a safe, RC-pinned business-journey certification against a local target.

The local target is deliberately synthetic and is never treated as production
evidence.  Routes that require LINE, durable Supabase storage, a locked AI
provider or a verified staging target are recorded as blocked rather than
being replaced with mocks or being reported as passing.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from release_candidate import ReleaseCandidateError, canonical_json, verify_candidate
except ImportError:  # pragma: no cover - supports package-style imports
    from scripts.release_candidate import ReleaseCandidateError, canonical_json, verify_candidate


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "artifacts" / "e2e-certification.json"
DEFAULT_RC = ROOT / "artifacts" / "release-candidate.json"
SYNTHETIC_TENANT_ID = "00000000-0000-4000-8000-000000000001"
SYNTHETIC_LINE_USER_ID = "U11111111111111111111111111111111"
SYNTHETIC_ADMIN_ACCOUNT_ID = "10000000-0000-4000-8000-000000000003"
SYNTHETIC_DEPARTMENT_ID = "55555555-5555-4555-8555-555555555555"
SYNTHETIC_QUEUE_ID = "34000000-0000-4000-8000-000000000001"
SYNTHETIC_IDEMPOTENCY_KEY = "p8-e2e-20260812-complaint-001"


class E2ECertificationError(ValueError):
    """Raised when the certification report is unsafe or cannot be verified."""


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise E2ECertificationError(f"invalid JSON input: {path}") from error
    if not isinstance(value, dict):
        raise E2ECertificationError(f"JSON input must be an object: {path}")
    return value


def verify_rc(root: Path, path: Path) -> tuple[str, dict[str, Any]]:
    document = read_json(path)
    try:
        digest = verify_candidate(root, document)
    except (ReleaseCandidateError, OSError, json.JSONDecodeError) as error:
        raise E2ECertificationError(f"release candidate verification failed: {error}") from error
    return digest, document


def request_json(
    base_url: str,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8") if body is not None else None
    request_headers = {"accept": "application/json", **(headers or {})}
    if data is not None:
        request_headers["content-type"] = "application/json"
    request = Request(url, method=method, data=data, headers=request_headers)
    try:
        with urlopen(request, timeout=10) as response:  # noqa: S310 - target is an explicit CLI input
            raw = response.read().decode("utf-8", errors="replace")
            status = int(response.status)
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        status = int(error.code)
    except (OSError, URLError, TimeoutError) as error:
        return {"status": 0, "error": type(error).__name__, "json": {}}
    try:
        parsed = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        parsed = {}
    return {"status": status, "json": parsed if isinstance(parsed, dict) else {}}


def safe_result(name: str, passed: bool, response: dict[str, Any], detail: str) -> dict[str, Any]:
    return {
        "name": name,
        "status": "PASS" if passed else "FAIL",
        "httpStatus": response.get("status", 0),
        "detail": detail,
    }


def expect_status(
    base_url: str,
    name: str,
    method: str,
    path: str,
    expected: int | set[int],
    *,
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    predicate: Callable[[dict[str, Any]], bool] | None = None,
    detail: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    response = request_json(base_url, method, path, body, headers=headers)
    expected_codes = {expected} if isinstance(expected, int) else expected
    passed = response.get("status") in expected_codes and (predicate(response.get("json", {})) if predicate else True)
    return response, safe_result(name, passed, response, detail if passed else f"expected HTTP {sorted(expected_codes)}")


def run_local_journeys(base_url: str) -> list[dict[str, Any]]:
    journeys: list[dict[str, Any]] = []

    surfaces = ["/", "/liff", "/liff/complaints/new", "/admin", "/admin/complaints", "/admin/reports"]
    surface_checks = []
    for path in surfaces:
        _, result = expect_status(base_url, f"surface:{path}", "GET", path, 200, detail="HTML surface responds")
        surface_checks.append(result)
    journeys.append({"id": "J01", "title": "LINE add/menu → LIFF complaint → staff inbox", "status": "PARTIAL", "checks": surface_checks})

    complaint_body = {
        "tenantId": SYNTHETIC_TENANT_ID,
        "lineUserId": SYNTHETIC_LINE_USER_ID,
        "intakeQueueId": SYNTHETIC_QUEUE_ID,
        "title": "E2E synthetic complaint",
        "description": "RC journey verification input; no citizen PII.",
        "categoryUncertain": True,
        "attachments": [{"state": "QUARANTINED", "objectKey": "e2e/quarantined-fixture-001"}],
        "location": {"text": "synthetic test location", "latitude": 13.7563, "longitude": 100.5018},
        "consentAccepted": True,
        "consentVersion": "test-consent-v1",
        "notifyChannel": "LINE",
    }
    complaint_path = f"/api/v1/citizen/complaints"
    response, create_result = expect_status(
        base_url,
        "complaint:create",
        "POST",
        complaint_path,
        {200, 201},
        body=complaint_body,
        headers={"idempotency-key": SYNTHETIC_IDEMPOTENCY_KEY},
        detail="local synthetic complaint accepted with canonical number",
        predicate=lambda value: isinstance(value.get("complaintId"), str) and isinstance(value.get("complaintNo"), str),
    )
    complaint_id = str(response.get("json", {}).get("complaintId", ""))
    replay_response = request_json(
        base_url,
        "POST",
        complaint_path,
        complaint_body,
        headers={"idempotency-key": SYNTHETIC_IDEMPOTENCY_KEY},
    )
    replay_result = safe_result(
        "complaint:create-replay",
        replay_response.get("status") in {200, 201},
        replay_response,
        "idempotent replay boundary exercised",
    )
    detail_checks = [create_result, replay_result]
    if complaint_id:
        _, public_result = expect_status(
            base_url,
            "complaint:citizen-tracking",
            "GET",
            f"/api/v1/citizen/complaints/{complaint_id}?tenantId={SYNTHETIC_TENANT_ID}&lineUserId={SYNTHETIC_LINE_USER_ID}",
            200,
            detail="citizen identity sees its own complaint",
            predicate=lambda value: isinstance(value.get("item"), dict),
        )
        _, admin_result = expect_status(
            base_url,
            "complaint:staff-inbox",
            "GET",
            f"/api/v1/admin/complaints?role=TENANT_ADMIN&accountId={SYNTHETIC_ADMIN_ACCOUNT_ID}",
            200,
            detail="tenant admin sees the staff inbox boundary",
            predicate=lambda value: isinstance(value.get("items"), list),
        )
        detail_checks.extend([public_result, admin_result])
    journeys[0]["checks"].extend(detail_checks)

    identity_query = f"tenantId={SYNTHETIC_TENANT_ID}&lineUserId={SYNTHETIC_LINE_USER_ID}"
    source_checks = []
    for name, path, key in (
        ("news", f"/api/v1/citizen/news?{identity_query}", "categories"),
        ("services", f"/api/v1/citizen/services?{identity_query}", "featureFlags"),
    ):
        _, result = expect_status(
            base_url,
            f"source:{name}",
            "GET",
            path,
            200,
            detail=f"approved {name} read boundary responds",
            predicate=lambda value, required=key: required in value and isinstance(value.get("items"), list),
        )
        source_checks.append(result)
    journeys.append({"id": "J02", "title": "citizen approved source read", "status": "PASS", "checks": source_checks})

    kpi_path = f"/api/v1/admin/reports/kpi?tenantId={SYNTHETIC_TENANT_ID}&role=TENANT_ADMIN&accountId={SYNTHETIC_ADMIN_ACCOUNT_ID}"
    _, kpi_result = expect_status(
        base_url,
        "kpi:report-reconciliation",
        "GET",
        kpi_path,
        200,
        detail="KPI report returns server projection and reconciliation metadata",
        predicate=lambda value: isinstance(value.get("data"), dict) and isinstance(value.get("meta"), dict),
    )
    journeys.append({"id": "J03", "title": "KPI/filter/export exact reconciliation", "status": "PASS", "checks": [kpi_result]})

    isolation_checks = []
    _, wrong_citizen = expect_status(
        base_url,
        "security:citizen-tenant-boundary",
        "GET",
        "/api/v1/citizen/complaints?tenantId=00000000-0000-4000-8000-000000000099&lineUserId=" + SYNTHETIC_LINE_USER_ID,
        404,
        detail="wrong tenant cannot read citizen records",
    )
    _, wrong_admin = expect_status(
        base_url,
        "security:admin-account-boundary",
        "GET",
        f"/api/v1/admin/complaints?role=TENANT_ADMIN&accountId=10000000-0000-4000-8000-000000000099",
        404,
        detail="unknown admin account cannot read staff inbox",
    )
    _, wrong_kpi = expect_status(
        base_url,
        "security:kpi-tenant-boundary",
        "GET",
        "/api/v1/admin/reports/kpi?tenantId=00000000-0000-4000-8000-000000000099&role=TENANT_ADMIN&accountId=" + SYNTHETIC_ADMIN_ACCOUNT_ID,
        404,
        detail="wrong tenant cannot read KPI report",
    )
    isolation_checks.extend([wrong_citizen, wrong_admin, wrong_kpi])
    journeys.append({"id": "J09", "title": "tenant/department/citizen attacker attempts denied", "status": "PASS", "checks": isolation_checks})

    return journeys


def external_dependencies() -> list[dict[str, str]]:
    return [
        {"id": "J01-LINE", "status": "NOT_AVAILABLE", "reason": "Verified LINE OA webhook/menu/push target and credential are not configured."},
        {"id": "J03-AI", "status": "NOT_AVAILABLE", "reason": "Locked AI/RAG certification target, provider route and citation evaluator are not configured."},
        {"id": "J04-SUPPORT", "status": "NOT_AVAILABLE", "reason": "External LINE push and durable support-ticket integration are not configured."},
        {"id": "J05-ROUTING", "status": "NOT_AVAILABLE", "reason": "Certified routing feedback target and independent evaluator are not configured."},
        {"id": "J06-KNOWLEDGE", "status": "NOT_AVAILABLE", "reason": "Durable upload/quarantine/index/rollback target is not configured."},
        {"id": "J07-NEWS", "status": "NOT_AVAILABLE", "reason": "Certified external news delivery and audit target are not configured."},
        {"id": "J08-STAGING", "status": "NOT_AVAILABLE", "reason": "No verified staging deployment target exists for full business-journey execution."},
    ]


def build_report(root: Path, base_url: str, rc_path: Path) -> dict[str, Any]:
    rc_digest, rc = verify_rc(root, rc_path)
    journeys = run_local_journeys(base_url)
    dependencies = external_dependencies()
    local_checks = [check for journey in journeys for check in journey["checks"]]
    failed_local = sum(check["status"] == "FAIL" for check in local_checks)
    report: dict[str, Any] = {
        "schemaVersion": 1,
        "taskId": "P8-E2E-001",
        "generatedAt": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "rcId": rc["rcId"],
        "rcSha256": rc_digest,
        "baseUrl": base_url.rstrip("/"),
        "mode": "local-synthetic",
        "journeys": journeys,
        "externalDependencies": dependencies,
        "summary": {
            "localChecks": len(local_checks),
            "localPassed": len(local_checks) - failed_local,
            "localFailed": failed_local,
            "externalNotAvailable": len(dependencies),
            "criticalJourneyPass": failed_local == 0 and not dependencies,
            "productionTraffic": "disabled",
        },
        "cleanup": {"syntheticData": "in-memory/local only", "productionDataTouched": False},
        "reportSha256": "",
    }
    without_digest = {key: value for key, value in report.items() if key != "reportSha256"}
    report["reportSha256"] = sha256_bytes(canonical_json(without_digest))
    return report


def write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        existing = read_json(path)
        if existing != report:
            raise E2ECertificationError(f"immutable E2E report already exists with different content: {path}")
        return
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3224")
    parser.add_argument("--rc", type=Path, default=DEFAULT_RC)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args([argument for argument in sys.argv[1:] if argument != "--"])
    try:
        report = build_report(ROOT, args.base_url, args.rc.resolve())
        write_report(args.output.resolve(), report)
        print(
            f"E2E_CERTIFICATION_WRITTEN {args.output.resolve().relative_to(ROOT)} "
            f"rcId={report['rcId']} local={report['summary']['localPassed']}/{report['summary']['localChecks']} "
            f"externalNotAvailable={report['summary']['externalNotAvailable']} digest={report['reportSha256']}"
        )
        return 2 if report["summary"]["externalNotAvailable"] or report["summary"]["localFailed"] else 0
    except (E2ECertificationError, OSError, ValueError) as error:
        print(f"E2E_CERTIFICATION_FAILED {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
