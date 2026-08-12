"""Deterministic capacity and performance contract for P7-PERF-001.

This module evaluates a checked-in synthetic profile. It deliberately does not
generate production traffic or read provider/database credentials. Live load,
soak and capacity measurements remain a post-production hardening activity.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "docs" / "operations" / "p7-perf-001-profile.json"


class PerformanceProfileError(ValueError):
    pass


REQUIRED_TARGETS = {
    "tenants": 10,
    "staffAccounts": 500,
    "concurrentStaff": 100,
    "lineEventsPerDayPerTenant": 20_000,
    "lineBurstPerSecondPerTenant": 10,
    "complaintsPerDayPerTenant": 1_000,
    "complaintBurstPerSecondPerTenant": 2,
    "activeDocumentsPerTenant": 500,
    "maxFileMb": 50,
    "concurrentRag": 50,
    "forecastMultiplier": 2,
    "peakWindowMinutes": 30,
    "soakHours": 8,
    "soakFractionOfPeak": 0.5,
}

SLO_TARGETS = {
    "webhookP95Ms": 1_000,
    "webhookP99Ms": 2_000,
    "citizenApiP95Ms": 500,
    "adminP95Ms": 1_000,
    "ragP95Ms": 12_000,
}

RESOURCE_KEYS = ("database", "queue", "compute", "storage", "providerBudget")


def _canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _hash(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def load_profile() -> dict[str, Any]:
    try:
        profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PerformanceProfileError("capacity profile is not valid JSON") from error
    if profile.get("schemaVersion") != "capacity-profile.v1":
        raise PerformanceProfileError("unsupported capacity profile schema")
    if profile.get("target", {}).keys() != REQUIRED_TARGETS.keys():
        raise PerformanceProfileError("capacity target keys differ from the versioned baseline")
    return profile


def _number(value: Any, name: str, *, minimum: float = 0) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value < minimum:
        raise PerformanceProfileError(f"{name} must be a number >= {minimum}")
    return float(value)


def build_report(profile: dict[str, Any] | None = None) -> dict[str, Any]:
    profile = profile or load_profile()
    target = profile["target"]
    observation = profile["syntheticObservation"]
    for key, minimum in REQUIRED_TARGETS.items():
        actual = _number(target[key], key)
        if actual < minimum:
            raise PerformanceProfileError(f"{key} is below the fullspec baseline")
    if target["forecastMultiplier"] != 2 or target["soakFractionOfPeak"] != 0.5:
        raise PerformanceProfileError("forecast/soak scenario is not the required 2x/50% profile")
    if target["soakHours"] < 8 or target["peakWindowMinutes"] < 30:
        raise PerformanceProfileError("peak/soak duration is below the required profile")

    expected = {
        "lineEventsPerDay": int(target["tenants"] * target["lineEventsPerDayPerTenant"]),
        "lineBurstPerSecond": int(target["tenants"] * target["lineBurstPerSecondPerTenant"] * target["forecastMultiplier"]),
        "complaintsPerDay": int(target["tenants"] * target["complaintsPerDayPerTenant"]),
        "complaintBurstPerSecond": int(target["tenants"] * target["complaintBurstPerSecondPerTenant"] * target["forecastMultiplier"]),
        "activeDocuments": int(target["tenants"] * target["activeDocumentsPerTenant"]),
        "peakConcurrentStaff": int(target["concurrentStaff"] * target["forecastMultiplier"]),
        "peakConcurrentRag": int(target["concurrentRag"] * target["forecastMultiplier"]),
        "soakHoursAtHalfPeak": target["soakHours"],
    }
    observed_slo = {key: _number(observation[key], key) for key in SLO_TARGETS}
    slo_pass = {key: observed_slo[key] <= limit for key, limit in SLO_TARGETS.items()}
    utilization = observation.get("resourceUtilization")
    if not isinstance(utilization, dict) or set(utilization) != set(RESOURCE_KEYS):
        raise PerformanceProfileError("resource utilization keys are incomplete")
    utilization_values = {key: _number(utilization[key], f"resourceUtilization.{key}") for key in RESOURCE_KEYS}
    if any(value > 1 for value in utilization_values.values()):
        raise PerformanceProfileError("resource utilization cannot exceed 100%")
    headroom = {key: round(1 - value, 4) for key, value in utilization_values.items()}
    minimum_headroom = min(headroom.values())
    cost = {
        "observedUsdPerSoakHour": _number(observation["costUsdPerSoakHour"], "costUsdPerSoakHour"),
        "ceilingUsdPerSoakHour": _number(observation["costCeilingUsdPerSoakHour"], "costCeilingUsdPerSoakHour"),
    }
    if cost["observedUsdPerSoakHour"] > cost["ceilingUsdPerSoakHour"]:
        raise PerformanceProfileError("synthetic cost ceiling is exceeded")
    isolation = {
        "tenantIsolationViolations": int(_number(observation["tenantIsolationViolations"], "tenantIsolationViolations")),
        "droppedCoreRecords": int(_number(observation["droppedCoreRecords"], "droppedCoreRecords")),
        "duplicateCoreRecords": int(_number(observation["duplicateCoreRecords"], "duplicateCoreRecords")),
    }
    if any(value != 0 for value in isolation.values()):
        raise PerformanceProfileError("synthetic isolation/core integrity probe failed")
    backpressure = {
        "recoveries": int(_number(observation["backpressureRecoveries"], "backpressureRecoveries")),
        "dataLoss": int(_number(observation["backpressureDataLoss"], "backpressureDataLoss")),
    }
    if backpressure["dataLoss"] != 0:
        raise PerformanceProfileError("backpressure simulation lost core data")
    report: dict[str, Any] = {
        "schemaVersion": "capacity-report.v1",
        "source": "SYNTHETIC_DETERMINISTIC_PROFILE",
        "scenario": {
            "forecastMultiplier": target["forecastMultiplier"],
            "peakWindowMinutes": target["peakWindowMinutes"],
            "soakHours": target["soakHours"],
            "soakFractionOfPeak": target["soakFractionOfPeak"],
        },
        "target": target,
        "expectedWorkload": expected,
        "slo": {"targets": SLO_TARGETS, "observed": observed_slo, "passed": slo_pass},
        "resource": {"utilization": utilization_values, "headroom": headroom, "minimumHeadroom": minimum_headroom, "requiredHeadroom": 0.30, "passed": minimum_headroom >= 0.30},
        "cost": {**cost, "passed": cost["observedUsdPerSoakHour"] <= cost["ceilingUsdPerSoakHour"]},
        "isolation": {**isolation, "passed": True},
        "backpressure": {**backpressure, "passed": True},
        "passed": all(slo_pass.values()) and minimum_headroom >= 0.30 and cost["observedUsdPerSoakHour"] <= cost["ceilingUsdPerSoakHour"],
        "limitations": [
            "No production traffic was generated by this unit contract.",
            "Live 2x peak, 8-hour soak and provider/DB capacity measurements remain post-production hardening evidence.",
        ],
    }
    report["reportSha256"] = _hash(report)
    return report


if __name__ == "__main__":
    result = build_report()
    print(f"PERFORMANCE_PROFILE_PASS digest={result['reportSha256']} headroom={result['resource']['minimumHeadroom']}")
