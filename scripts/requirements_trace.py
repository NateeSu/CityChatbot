"""Build and verify the machine-readable fullspec-to-plan traceability catalog."""

from __future__ import annotations

import argparse
import csv
import hashlib
import re
import sys
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
FULLSPEC = ROOT / "fullspec.md"
PLAN = ROOT / "plan.md"
OUTPUT = ROOT / "evidence" / "traceability.csv"
CANONICAL_PREFIXES = ("SPEC-", "INV-", "RAG-", "SEC-", "NFR-", "ARCH-")
ID_PATTERN = re.compile(r"`((?:SPEC|INV|RAG|SEC|NFR|ARCH)-[A-Z0-9]+(?:-[A-Z0-9]+)*)`")
TASK_PATTERN = re.compile(r"^- \[[ x]\] `([^`]+)`", re.MULTILINE)
CSV_FIELDS = ("requirementId", "rfFamily", "taskId", "testId", "evidencePath", "source")


class TraceabilityError(ValueError):
    pass


def canonical_ids(fullspec_text: str) -> list[str]:
    return sorted(set(ID_PATTERN.findall(fullspec_text)))


def task_ids(plan_text: str) -> set[str]:
    return set(TASK_PATTERN.findall(plan_text))


def source_locations(fullspec_text: str) -> dict[str, int]:
    locations: dict[str, int] = {}
    for line_number, line in enumerate(fullspec_text.splitlines(), start=1):
        for requirement_id in ID_PATTERN.findall(line):
            locations.setdefault(requirement_id, line_number)
    return locations


def family_for(requirement_id: str) -> str:
    if requirement_id.startswith("SPEC-") or requirement_id.startswith("INV-AUTO"):
        return "RF-18"
    if requirement_id in {"INV-TENANT-001"}:
        return "RF-03"
    if requirement_id in {"INV-AI-001", "INV-ANSWER-001", "INV-CLAIM-001"}:
        return "RF-08"
    if requirement_id == "INV-HANDOFF-001":
        return "RF-09"
    if requirement_id == "INV-COMPLAINT-001":
        return "RF-06"
    if requirement_id == "INV-CORE-001":
        return "RF-15"
    if requirement_id in {"INV-AUDIT-001", "INV-DELETE-001", "INV-VERSION-001"}:
        return "RF-10"
    if requirement_id.startswith("RAG-"):
        return "RF-07"
    if requirement_id.startswith("SEC-"):
        return "RF-13"
    if requirement_id.startswith("NFR-LIFF") or requirement_id.startswith("NFR-LINE"):
        return "RF-05"
    if requirement_id.startswith("NFR-NOTIFY"):
        return "RF-09"
    if requirement_id.startswith("NFR-RAG"):
        return "RF-07"
    if requirement_id.startswith("NFR-API"):
        return "RF-17"
    if requirement_id.startswith("NFR-ADMIN"):
        return "RF-10"
    if requirement_id.startswith(("NFR-AVAIL", "NFR-DR")):
        return "RF-15"
    if requirement_id.startswith("ARCH-"):
        return "RF-17"
    raise TraceabilityError(f"no RF mapping for requirement {requirement_id}")


def task_for(requirement_id: str) -> str:
    if requirement_id.startswith("SPEC-") or requirement_id.startswith("INV-AUTO"):
        return "AUTO-GATE-001"
    if requirement_id == "INV-TENANT-001":
        return "P1-RLS-001"
    if requirement_id in {"INV-AI-001", "INV-ANSWER-001", "INV-CLAIM-001"}:
        return "P4-CHAT-001"
    if requirement_id == "INV-HANDOFF-001":
        return "P5-HO-001"
    if requirement_id == "INV-COMPLAINT-001":
        return "P3-CMP-001"
    if requirement_id == "INV-CORE-001":
        return "P3-RES-001"
    if requirement_id == "INV-AUDIT-001":
        return "P1-OBS-001"
    if requirement_id == "INV-DELETE-001":
        return "P7-PRIV-001"
    if requirement_id == "INV-VERSION-001":
        return "P4-DOC-001"
    if requirement_id.startswith("RAG-CORPUS-"):
        return "P0-COR-001"
    if requirement_id.startswith("RAG-ACCURACY-"):
        return "P4-QA-001"
    if requirement_id.startswith("SEC-"):
        return "P1-SEC-001"
    if requirement_id.startswith("NFR-LIFF"):
        return "P2-LIFF-001"
    if requirement_id.startswith("NFR-LINE"):
        return "P2-LINE-002"
    if requirement_id.startswith("NFR-NOTIFY"):
        return "P3-NOTIF-001"
    if requirement_id.startswith("NFR-RAG"):
        return "P4-QA-001"
    if requirement_id.startswith("NFR-API"):
        return "P0-ARCH-001"
    if requirement_id.startswith("NFR-ADMIN"):
        return "P6-ADM-001"
    if requirement_id.startswith("NFR-AVAIL"):
        return "P7-SLO-001"
    if requirement_id.startswith("NFR-DR"):
        return "P7-DR-001"
    if requirement_id.startswith("ARCH-"):
        return "P0-ARCH-001"
    raise TraceabilityError(f"no task mapping for requirement {requirement_id}")


def build_catalog(fullspec_text: str, plan_text: str) -> list[dict[str, str]]:
    locations = source_locations(fullspec_text)
    available_tasks = task_ids(plan_text)
    rows: list[dict[str, str]] = []
    for requirement_id in canonical_ids(fullspec_text):
        task_id = task_for(requirement_id)
        if task_id not in available_tasks:
            raise TraceabilityError(f"{requirement_id}: mapped task not present in plan: {task_id}")
        rows.append({
            "requirementId": requirement_id,
            "rfFamily": family_for(requirement_id),
            "taskId": task_id,
            "testId": f"TRACE-{requirement_id}",
            "evidencePath": f"./evidence/{task_id}/index.md",
            "source": f"fullspec.md:{locations[requirement_id]}",
        })
    if not rows:
        raise TraceabilityError("no canonical requirement IDs found")
    return rows


def canonical_csv(rows: Iterable[dict[str, str]]) -> str:
    output = []
    from io import StringIO

    buffer = StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=CSV_FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def verify_catalog(rows: list[dict[str, str]], fullspec_text: str, plan_text: str, root: Path = ROOT) -> str:
    expected_ids = set(canonical_ids(fullspec_text))
    actual_ids = [row.get("requirementId", "") for row in rows]
    if set(actual_ids) != expected_ids:
        raise TraceabilityError(f"catalog ID mismatch: expected={len(expected_ids)} actual={len(set(actual_ids))}")
    if len(actual_ids) != len(set(actual_ids)):
        raise TraceabilityError("catalog contains duplicate requirement IDs")
    available_tasks = task_ids(plan_text)
    required_keys = set(CSV_FIELDS)
    for row in rows:
        if set(row) != required_keys or any(not row[key] for key in required_keys):
            raise TraceabilityError(f"catalog row is incomplete: {row}")
        if row["taskId"] not in available_tasks:
            raise TraceabilityError(f"orphan task link: {row['taskId']}")
        if not row["testId"].startswith("TRACE-"):
            raise TraceabilityError(f"invalid trace test ID: {row['testId']}")
        evidence_path = (root / row["evidencePath"]).resolve()
        if not evidence_path.is_file():
            raise TraceabilityError(f"missing evidence link target: {row['evidencePath']}")
        match = re.fullmatch(r"fullspec\.md:(\d+)", row["source"])
        if not match or not (1 <= int(match.group(1)) <= len(fullspec_text.splitlines())):
            raise TraceabilityError(f"invalid source locator: {row['source']}")
    return hashlib.sha256(canonical_csv(rows).encode("utf-8")).hexdigest()


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--verify", type=Path)
    args = parser.parse_args(argv)
    try:
        fullspec_text = FULLSPEC.read_text(encoding="utf-8")
        plan_text = PLAN.read_text(encoding="utf-8")
        if args.verify:
            path = args.verify if args.verify.is_absolute() else ROOT / args.verify
            rows = read_rows(path)
            digest = verify_catalog(rows, fullspec_text, plan_text)
            print(f"TRACEABILITY_VERIFIED {path.relative_to(ROOT)} rows={len(rows)} sha256={digest}")
            return 0
        rows = build_catalog(fullspec_text, plan_text)
        if args.write:
            OUTPUT.parent.mkdir(parents=True, exist_ok=True)
            OUTPUT.write_text(canonical_csv(rows), encoding="utf-8", newline="")
            print(f"TRACEABILITY_WRITTEN {OUTPUT.relative_to(ROOT)} rows={len(rows)} sha256={verify_catalog(rows, fullspec_text, plan_text)}")
            return 0
        print(f"TRACEABILITY_BUILT rows={len(rows)} sha256={verify_catalog(rows, fullspec_text, plan_text)}")
        return 0
    except (OSError, TraceabilityError, csv.Error) as error:
        print(f"TRACEABILITY_FAILED {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
