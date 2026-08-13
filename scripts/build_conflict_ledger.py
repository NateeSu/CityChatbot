"""Build and verify deterministic CR-001..CR-015 segment-safety rules.

The project owner has authorised the corpus as an authentic source bundle.
That authority resolves OD-001, not the underlying factual ambiguities.  Each
conflict is therefore converted to an explicit machine-enforced exclusion,
clarification, or entity-separation policy; no conflicted fact is promoted to
the public answerable set.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FULLSPEC = ROOT / "fullspec.md"
CORPUS_MANIFEST = ROOT / "docs" / "corpus" / "corpus-manifest.json"
DEFAULT_OUTPUT = ROOT / "docs" / "corpus" / "conflict-ledger.json"
CR_IDS = tuple(f"CR-{index:03d}" for index in range(1, 16))
ROW_PATTERN = re.compile(r"^\|\s*`(CR-\d{3})`\s*\|(.+)\|\s*$", re.MULTILINE)

CONFLICT_POLICIES: dict[str, dict[str, str]] = {
    "CR-001": {"answerPolicy": "EXCLUDE_AFFECTED_FAQ", "resolution": "Exclude the mismatched FAQ pair; only separately supported registration facts may be retrieved."},
    "CR-002": {"answerPolicy": "HANDOFF_AFFECTED_CONTACT", "resolution": "Keep source provenance but do not publish a definitive education-department phone fact."},
    "CR-003": {"answerPolicy": "HANDOFF_FEE_BOUNDARY", "resolution": "Exclude the overlapping 50-square-metre fee rows from exact facts."},
    "CR-004": {"answerPolicy": "PARSER_VERIFIED_SENSITIVE_HANDOFF", "resolution": "Preserve the ≤ comparator in audited text; sensitive eligibility remains handoff-only."},
    "CR-005": {"answerPolicy": "EXCLUDE_UNNORMALIZED_INTEREST", "resolution": "Do not normalize ambiguous pawn interest wording into a percentage or time basis."},
    "CR-006": {"answerPolicy": "HANDOFF_AMBIGUOUS_AGE", "resolution": "Exclude the ambiguous 2.8–3.11 age range from eligibility facts."},
    "CR-007": {"answerPolicy": "HANDOFF_AFFECTED_SCHOOL_FACTS", "resolution": "Keep unrelated source text; exclude uncertain language, URL, cost, and eligibility claims."},
    "CR-008": {"answerPolicy": "HANDOFF_AFFECTED_ELIGIBILITY", "resolution": "Do not publish a definitive child-attendance requirement."},
    "CR-009": {"answerPolicy": "HANDOFF_AMBIGUOUS_WASTE_RANGE", "resolution": "Exclude the affected waste-fee range until its units and boundaries are explicit."},
    "CR-010": {"answerPolicy": "EXCLUDE_TEMPLATE_PII_SCREENSHOT", "resolution": "Exclude template text, expired deadlines, personal phone numbers, and screenshots."},
    "CR-011": {"answerPolicy": "EXCLUDE_UNDECODED_QR", "resolution": "Do not index or follow a QR destination without a decoded, allowlisted URL."},
    "CR-012": {"answerPolicy": "EXCLUDE_PERSONAL_CONTACT", "resolution": "Exclude executive personal mobile numbers and volatile person-specific contact claims."},
    "CR-013": {"answerPolicy": "MISSING_TIME_FOR_STATIC_SCHEDULE", "resolution": "Static transport schedule text cannot answer a question framed as today/current."},
    "CR-014": {"answerPolicy": "MEDICAL_HANDOFF", "resolution": "Do not turn fitness guidance into medical advice or a definitive exercise clearance."},
    "CR-015": {"answerPolicy": "SEPARATE_SERVICE_ENTITIES", "resolution": "Model KCC centre hours and meeting-room hours as separate service scopes; do not merge them."},
}


class ConflictLedgerError(ValueError):
    pass


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def parse_rows(fullspec_text: str) -> dict[str, dict[str, str]]:
    rows: dict[str, dict[str, str]] = {}
    for match in ROW_PATTERN.finditer(fullspec_text):
        conflict_id, remainder = match.groups()
        columns = [column.strip() for column in remainder.split("|")]
        if len(columns) < 2:
            raise ConflictLedgerError(f"{conflict_id}: conflict row must have source and disposition columns")
        if conflict_id in rows:
            raise ConflictLedgerError(f"duplicate conflict ID in fullspec: {conflict_id}")
        rows[conflict_id] = {
            "sourceSummary": columns[0],
            "requiredDisposition": columns[1],
        }
    missing = sorted(set(CR_IDS) - set(rows))
    if missing:
        raise ConflictLedgerError(f"fullspec conflict ledger is missing: {', '.join(missing)}")
    return rows


def build_ledger(fullspec_text: str, manifest: dict[str, Any]) -> dict[str, Any]:
    rows = parse_rows(fullspec_text)
    source_files: dict[str, list[str]] = {conflict_id: [] for conflict_id in CR_IDS}
    for record in manifest.get("files", []):
        governance = record.get("governance", {})
        for conflict_id in governance.get("blockedBy", []):
            if conflict_id in source_files:
                source_files[conflict_id].append(record["filename"])
    entries: list[dict[str, Any]] = []
    for conflict_id in CR_IDS:
        if not source_files[conflict_id]:
            raise ConflictLedgerError(f"{conflict_id}: no corpus source is attached")
        row = rows[conflict_id]
        policy = CONFLICT_POLICIES[conflict_id]
        entries.append({
            "conflictId": conflict_id,
            "sourceSummary": row["sourceSummary"],
            "requiredDisposition": row["requiredDisposition"],
            "sourceFiles": sorted(source_files[conflict_id]),
            "state": "RESOLVED_BY_SEGMENT_POLICY",
            "answerPolicy": policy["answerPolicy"],
            "resolution": policy["resolution"],
            "activeIndexEligible": False,
            "facts": [],
        })
    document: dict[str, Any] = {
        "schemaVersion": "conflict-ledger.v1",
        "revision": "corpus-conflicts-2026-08-13",
        "systemActor": "SYSTEM_UNIT_GATE",
        "source": "fullspec.md §2.4 + docs/corpus/corpus-manifest.json",
        "summary": {
            "conflictCount": len(entries),
            "quarantinedCount": 0,
            "resolvedBySegmentPolicyCount": len(entries),
            "activeIndexEligibleCount": 0,
            "inventoriedFactCount": 0,
            "evaluationOnlyOrExcludedCount": sum(1 for entry in entries if "EXCLUDED" in entry["requiredDisposition"] or "EVALUATION_ONLY" in entry["requiredDisposition"]),
        },
        "conflicts": entries,
    }
    document["integrity"] = {"ledgerSha256": digest(document)}
    return document


def verify_ledger(document: dict[str, Any], fullspec_text: str, manifest: dict[str, Any]) -> str:
    if document.get("schemaVersion") != "conflict-ledger.v1" or document.get("systemActor") != "SYSTEM_UNIT_GATE":
        raise ConflictLedgerError("ledger metadata is invalid")
    expected = build_ledger(fullspec_text, manifest)
    recorded = document.get("integrity", {}).get("ledgerSha256")
    without_integrity = {key: value for key, value in document.items() if key != "integrity"}
    expected_digest = digest(without_integrity)
    if recorded != expected_digest:
        raise ConflictLedgerError("ledger integrity hash mismatch")
    if canonical_json(document) != canonical_json(expected):
        raise ConflictLedgerError("ledger does not match current fullspec/manifest inputs")
    entries = document.get("conflicts")
    if not isinstance(entries, list) or len(entries) != len(CR_IDS):
        raise ConflictLedgerError("ledger must contain exactly CR-001..CR-015")
    for entry in entries:
        if entry.get("state") != "RESOLVED_BY_SEGMENT_POLICY" or entry.get("activeIndexEligible") is not False:
            raise ConflictLedgerError(f"{entry.get('conflictId')}: unsafe conflict state")
        if entry.get("answerPolicy") != CONFLICT_POLICIES.get(entry.get("conflictId"), {}).get("answerPolicy"):
            raise ConflictLedgerError(f"{entry.get('conflictId')}: incorrect answer policy")
        if not entry.get("resolution"):
            raise ConflictLedgerError(f"{entry.get('conflictId')}: missing deterministic resolution")
        if entry.get("facts") != [] or not entry.get("sourceFiles"):
            raise ConflictLedgerError(f"{entry.get('conflictId')}: facts must remain empty and source attachment required")
    return recorded


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--verify", type=Path)
    args = parser.parse_args(argv)
    try:
        fullspec_text = FULLSPEC.read_text(encoding="utf-8")
        manifest = json.loads(CORPUS_MANIFEST.read_text(encoding="utf-8"))
        output = args.verify or DEFAULT_OUTPUT
        output = output if output.is_absolute() else ROOT / output
        if args.verify:
            document = json.loads(output.read_text(encoding="utf-8"))
            print(f"CONFLICT_LEDGER_VERIFIED {output.relative_to(ROOT)} sha256={verify_ledger(document, fullspec_text, manifest)}")
            return 0
        document = build_ledger(fullspec_text, manifest)
        if args.write:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"CONFLICT_LEDGER_WRITTEN {output.relative_to(ROOT)} conflicts={len(document['conflicts'])} sha256={verify_ledger(document, fullspec_text, manifest)}")
            return 0
        print(f"CONFLICT_LEDGER_BUILT conflicts={len(document['conflicts'])} sha256={verify_ledger(document, fullspec_text, manifest)}")
        return 0
    except (OSError, json.JSONDecodeError, ConflictLedgerError) as error:
        print(f"CONFLICT_LEDGER_FAILED {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
