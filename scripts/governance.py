"""Deterministic governance decisions used by the autonomous unit gate."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ROLE_MAP_PATH = ROOT / "docs" / "governance" / "automation-responsibility-map.json"
DECISION_PATH = ROOT / "docs" / "governance" / "decision-precedence.json"
RF_IDS = tuple(f"RF-{index:02d}" for index in range(1, 19))
CASE_TYPES = ("REQUIREMENT_CHANGE", "CONTRACT_CONFLICT", "SECURITY_EXCEPTION")


class GovernanceError(ValueError):
    pass


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise GovernanceError(f"expected JSON object: {path}")
    return value


def validate_responsibility_map(document: dict[str, Any]) -> None:
    if document.get("schemaVersion") != 1 or document.get("actor") != "SYSTEM_UNIT_GATE":
        raise GovernanceError("responsibility map metadata is invalid")
    if document.get("humanApprovalDependency") is not False:
        raise GovernanceError("responsibility map must be autonomous")
    roles = document.get("roles")
    if not isinstance(roles, dict) or set(roles) != set(RF_IDS):
        raise GovernanceError("every RF-01..RF-18 needs exactly one accountable role")
    if any(not isinstance(value, str) or not value for value in roles.values()):
        raise GovernanceError("accountable role must be a non-empty role name")
    if len(set(roles.values())) < 2:
        raise GovernanceError("responsibility map must preserve role separation")


def validate_decision_precedence(document: dict[str, Any]) -> None:
    if document.get("schemaVersion") != 1 or document.get("actor") != "SYSTEM_UNIT_GATE":
        raise GovernanceError("decision precedence metadata is invalid")
    precedence = document.get("precedence")
    if not isinstance(precedence, list) or len(precedence) < 3 or len(precedence) != len(set(precedence)):
        raise GovernanceError("precedence must be a unique ordered list")
    cases = document.get("cases")
    if not isinstance(cases, dict) or set(cases) != set(CASE_TYPES):
        raise GovernanceError("all autonomous governance case types must be present")
    for case_type, case in cases.items():
        if not isinstance(case, dict) or not all(isinstance(case.get(key), str) and case[key] for key in ("action", "queue", "featureState")):
            raise GovernanceError(f"case {case_type} is incomplete")
        if "APPROV" in json.dumps(case, ensure_ascii=False).upper():
            raise GovernanceError(f"case {case_type} contains a forbidden approval action")


def load_and_validate() -> tuple[dict[str, Any], dict[str, Any]]:
    responsibilities = load_json(ROLE_MAP_PATH)
    decisions = load_json(DECISION_PATH)
    validate_responsibility_map(responsibilities)
    validate_decision_precedence(decisions)
    return responsibilities, decisions


def decide(case_type: str, *, affected_task_ids: list[str] | None = None) -> dict[str, Any]:
    _, decisions = load_and_validate()
    if case_type not in CASE_TYPES:
        raise GovernanceError(f"unsupported governance case: {case_type}")
    selected = decisions["cases"][case_type]
    return {
        "caseType": case_type,
        "action": selected["action"],
        "queue": selected["queue"],
        "featureState": selected["featureState"],
        "affectedTaskIds": list(affected_task_ids or []),
        "actor": "SYSTEM_UNIT_GATE",
        "humanApprovalDependency": False,
    }

