"""Validate the deterministic P0 threat, privacy and data-classification baseline."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
THREAT_MODEL = ROOT / "docs" / "security" / "threat-model.json"
DATA_CLASSIFICATION = ROOT / "docs" / "security" / "data-classification.json"
UNIT_TEST_IDS = (
    "P0-SEC-LINE-SPOOF-REPLAY",
    "P0-SEC-LIFF-TOKEN",
    "P0-SEC-IDOR-RLS",
    "P0-SEC-SIGNED-URL",
    "P0-SEC-UPLOAD-QUARANTINE",
    "P0-SEC-PROMPT-INJECTION",
    "P0-SEC-TENANT-ISOLATION",
    "P0-SEC-SECRET-LEAKAGE",
    "P0-SEC-PRIVILEGED-EXPORT",
    "P8-SEC-SECRET-SCAN",
    "P8-SEC-TENANT-ISOLATION",
    "P8-SEC-REDTEAM-CONTRACT",
)
THREAT_IDS = tuple(f"SEC-THREAT-{index:03d}" for index in range(1, 11))
DATA_CLASSES = ("PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED")
SEVERITIES = ("S0", "S1", "S2", "S3")
FORBIDDEN_APPROVAL = re.compile(r"(?i)(WAITING_FOR_APPROVAL|PENDING_(?:USER|PO|QA|CO)|GO_NO_GO_PENDING|human approval|approver)")
SECRET_PATTERN = re.compile(r"(?i)(sk-or-v1-[A-Za-z0-9_-]{20,}|SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+)")


class SecurityBaselineError(ValueError):
    pass


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SecurityBaselineError(f"cannot read {path}: {error}") from error
    if not isinstance(value, dict):
        raise SecurityBaselineError(f"{path} must contain a JSON object")
    return value


def validate_no_approval_or_secret(value: Any, path: str = "root") -> None:
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    if FORBIDDEN_APPROVAL.search(text):
        raise SecurityBaselineError(f"{path} contains a human approval dependency")
    if SECRET_PATTERN.search(text):
        raise SecurityBaselineError(f"{path} contains a credential-like value")


def validate_threat_model(document: dict[str, Any]) -> None:
    if document.get("schemaVersion") != "security-threat-model.v1":
        raise SecurityBaselineError("unsupported threat-model schema")
    if document.get("actor") != "SYSTEM_UNIT_GATE":
        raise SecurityBaselineError("threat model must be machine-owned by SYSTEM_UNIT_GATE")
    boundaries = document.get("trustBoundaries")
    if not isinstance(boundaries, list) or {item.get("id") for item in boundaries} != {"TB-UNTRUSTED-EDGE", "TB-APPLICATION", "TB-DATA", "TB-PROVIDER"}:
        raise SecurityBaselineError("trust boundary inventory is incomplete")
    flows = document.get("dataFlows")
    if not isinstance(flows, list) or len(flows) < 6 or any(not item.get("then") for item in flows):
        raise SecurityBaselineError("data-flow inventory is incomplete")
    threats = document.get("threats")
    if not isinstance(threats, list) or tuple(item.get("id") for item in threats) != THREAT_IDS:
        raise SecurityBaselineError("threat inventory must contain SEC-THREAT-001..010 in order")
    declared_test_ids: set[str] = set()
    for threat in threats:
        if threat.get("severity") not in SEVERITIES or threat.get("trustBoundary") not in {item["id"] for item in boundaries}:
            raise SecurityBaselineError(f"invalid severity or boundary for {threat.get('id')}")
        for key in ("preventiveControls", "detectiveControls", "requiredUnitTestIds"):
            if not isinstance(threat.get(key), list) or not threat[key]:
                raise SecurityBaselineError(f"{threat.get('id')} requires {key}")
        if not isinstance(threat.get("automaticMitigation"), str) or not threat["automaticMitigation"]:
            raise SecurityBaselineError(f"{threat.get('id')} requires automatic mitigation")
        declared_test_ids.update(threat["requiredUnitTestIds"])
    if not declared_test_ids.issubset(set(UNIT_TEST_IDS)):
        raise SecurityBaselineError("threat map references undeclared unit test ID")
    matrix = document.get("severityMatrix")
    if not isinstance(matrix, dict) or set(matrix) != set(SEVERITIES) or any(not matrix[level].get("automaticResponse") for level in SEVERITIES):
        raise SecurityBaselineError("severity matrix is incomplete")
    privacy = document.get("privacyImpact")
    if not isinstance(privacy, list) or {item.get("dataClass") for item in privacy} != set(DATA_CLASSES):
        raise SecurityBaselineError("privacy impact must cover all data classes")
    rollback = document.get("rollback")
    if not isinstance(rollback, dict) or rollback.get("humanApprovalDependency") is not False or not rollback.get("action"):
        raise SecurityBaselineError("rollback must be automatic and explicit")
    validate_no_approval_or_secret(document, "threat-model")


def validate_data_classification(document: dict[str, Any]) -> None:
    if document.get("schemaVersion") != "data-classification.v1" or document.get("actor") != "SYSTEM_UNIT_GATE":
        raise SecurityBaselineError("unsupported data-classification schema or actor")
    classes = document.get("classes")
    if not isinstance(classes, dict) or set(classes) != set(DATA_CLASSES):
        raise SecurityBaselineError("data classes must be PUBLIC, INTERNAL, CONFIDENTIAL and RESTRICTED")
    if classes["RESTRICTED"].get("aiPolicy") != "NEVER_SEND_TO_AI":
        raise SecurityBaselineError("restricted data must never be sent to AI")
    inventory = document.get("inventory")
    if not isinstance(inventory, list) or len(inventory) < 8:
        raise SecurityBaselineError("PII/data inventory is incomplete")
    fields = set()
    for item in inventory:
        if item.get("field") in fields or item.get("class") not in DATA_CLASSES:
            raise SecurityBaselineError("invalid or duplicate data inventory field")
        fields.add(item["field"])
        for key in ("purpose", "consent", "retentionPolicyRef", "devTestRule"):
            if not isinstance(item.get(key), str) or not item[key].strip():
                raise SecurityBaselineError(f"{item.get('field')} missing {key}")
    rules = document.get("rules")
    if not isinstance(rules, list) or not any("Production PII" in rule for rule in rules) or not any("fail" in rule.lower() and "closed" in rule.lower() for rule in rules):
        raise SecurityBaselineError("privacy operating rules are incomplete")
    validate_no_approval_or_secret(document, "data-classification")


def verify() -> str:
    threat_model = load_json(THREAT_MODEL)
    classification = load_json(DATA_CLASSIFICATION)
    validate_threat_model(threat_model)
    validate_data_classification(classification)
    digest = hashlib.sha256(canonical_json({"threatModel": threat_model, "dataClassification": classification})).hexdigest()
    return f"sha256:{digest}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args(argv)
    try:
        digest = verify()
        print(f"SECURITY_BASELINE_VERIFIED {digest}")
        return 0
    except (OSError, SecurityBaselineError, json.JSONDecodeError) as error:
        print(f"SECURITY_BASELINE_FAILED {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
