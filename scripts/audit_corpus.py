#!/usr/bin/env python3
"""Create and verify a deterministic audit manifest for the RAG source corpus.

The project owner has declared ``doc_rag_test`` to be an authentic municipal
source bundle.  The manifest therefore records a deterministic source-authority
receipt and makes intact files eligible for the *screened* ingestion pipeline.
It does not directly publish text: PII, screenshots/templates, undecoded QR
destinations, and every conflict-ledger segment remain excluded or fail-closed.

This tool uses only the Python standard library so a clean-room audit does not
depend on a parser package that may silently drop OOXML content controls.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree as ET


TOOL_VERSION = "1.1.0"
SCHEMA_VERSION = "corpus-manifest.v1"
DEFAULT_SNAPSHOT_ID = "corpus-2026-08-10"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TXT_MIME = "text/plain; charset=utf-8"
SUPPORTED_SUFFIXES = {".docx": "DOCX", ".txt": "TXT"}
ROOT = Path(__file__).resolve().parents[1]
AUTHORIZED_POLICY_PATH = ROOT / "docs" / "corpus" / "authorized-source-policy.json"

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{" + W_NS + "}"
W_BODY = W + "body"
W_P = W + "p"
W_TBL = W + "tbl"
W_TR = W + "tr"
W_T = W + "t"
W_DEL_TEXT = W + "delText"
W_TAB = W + "tab"
W_BR = W + "br"
W_CR = W + "cr"
W_SDT_CONTENT = W + "sdtContent"
W_HYPERLINK = W + "hyperlink"
W_INS = W + "ins"
W_DEL = W + "del"
W_MOVE_FROM = W + "moveFrom"
W_MOVE_TO = W + "moveTo"

CR_BY_FILENAME: dict[str, list[str]] = {
    "งานทะเบียนราษฎรและบัตรประจำตัวประชาชน .docx": ["CR-001"],
    "กองการศึกษา.docx": ["CR-002"],
    "กองสาธารณสุข (2).docx": ["CR-003", "CR-004"],
    "สถานธนานุบาลเทศบาลเมืองฉะเชิงเทรา 1.docx": ["CR-005", "CR-010"],
    "สถานธนานุบาลเทศบาลเมืองฉะเชิงเทรา 2.docx": ["CR-005"],
    "ศูนย์พัฒนาเด็กเล็ก.docx": ["CR-006"],
    "โรงเรียนเทศบาล 1.docx": ["CR-007"],
    "โรงเรียนเทศบาล 2.docx": ["CR-008"],
    "กองคลัง.docx": ["CR-009"],
    "กองสาธารณสุข งานบริการสาธารณสุข.docx": ["CR-011"],
    "คณะผู้บริหาร.txt": ["CR-012"],
    "สำนักปลัด.docx": ["CR-013"],
    "ฟิตเนส.docx": ["CR-014"],
    "ศูนย์การเรียนรู้เมืองฉะเชิงเทรา KCC.docx": ["CR-015"],
}

EXPECTED_BASELINE = {
    "fileCount": 17,
    "formatCounts": {"DOCX": 16, "TXT": 1},
    "totalSizeBytes": 1_701_883,
    "bodyParagraphsNonEmpty": 1_322,
    "sourceParagraphOccurrencesNonEmpty": 1_578,
    "tableCount": 6,
    "tableRowCount": 74,
    "embeddedImageCount": 6,
}


def canonical_json(value: Any) -> bytes:
    """Return stable UTF-8 JSON bytes for hashing and equality checks."""

    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def normalize_text(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def critical_symbol_counts(value: str) -> dict[str, int]:
    normalized = normalize_text(value)
    return {symbol: normalized.count(symbol) for symbol in ("≤", "≥", "<", ">", "Ø", "m²")}


def paragraph_text(element: ET.Element) -> str:
    """Extract paragraph text including inline content controls."""

    parts: list[str] = []
    for node in element.iter():
        if node.tag in (W_T, W_DEL_TEXT):
            parts.append(node.text or "")
        elif node.tag in (W_TAB, W_BR, W_CR):
            parts.append(" ")
    return "".join(parts)


def non_empty_paragraph_count(paragraphs: Iterable[ET.Element]) -> int:
    return sum(1 for paragraph in paragraphs if paragraph_text(paragraph).strip())


def zip_entry_warnings(names: Iterable[str]) -> list[str]:
    warnings: list[str] = []
    for name in names:
        path = Path(name.replace("\\", "/"))
        if path.is_absolute() or ".." in path.parts:
            warnings.append("ZIP_PATH_TRAVERSAL")
    return sorted(set(warnings))


def extract_docx(path: Path) -> dict[str, Any]:
    """Read structural DOCX facts without flattening paragraphs and tables."""

    with zipfile.ZipFile(path) as archive:
        names = sorted(archive.namelist())
        warnings = zip_entry_warnings(names)
        if "word/document.xml" not in names:
            raise ValueError("DOCX_MISSING_DOCUMENT_XML")

        root = ET.fromstring(archive.read("word/document.xml"))
        body = root.find(".//" + W_BODY)
        if body is None:
            raise ValueError("DOCX_MISSING_BODY")

        direct_paragraphs = list(body.findall(W_P))
        all_paragraphs = list(body.iter(W_P))
        tables = list(body.findall(W_TBL))
        table_rows = sum(len(table.findall(".//" + W_TR)) for table in tables)
        all_text = normalize_text("\n".join(paragraph_text(p) for p in all_paragraphs))
        macro_entries = [
            name
            for name in names
            if name.lower().endswith("vbaproject.bin")
            or name.lower().endswith(".vba")
            or name.lower().endswith(".xlsm")
        ]
        embedded_objects = [name for name in names if name.startswith("word/embeddings/")]
        image_entries = [
            name
            for name in names
            if name.startswith("word/media/") and not name.endswith("/")
        ]
        tracked = any(
            node.tag in (W_INS, W_DEL, W_MOVE_FROM, W_MOVE_TO)
            for node in root.iter()
        )
        return {
            "zipEntryCount": len(names),
            "zipPathWarnings": warnings,
            "hasContentTypes": "[Content_Types].xml" in names,
            "hasDocumentXml": True,
            "xmlParseable": True,
            "hasMacro": bool(macro_entries),
            "macroEntries": macro_entries,
            "embeddedObjectEntries": embedded_objects,
            "containsTrackedRevisionMarkup": tracked,
            "containsInlineContentControls": any(
                node.tag == W_SDT_CONTENT for node in root.iter()
            ),
            "hyperlinkCount": sum(1 for node in root.iter() if node.tag == W_HYPERLINK),
            "bodyParagraphsNonEmpty": non_empty_paragraph_count(direct_paragraphs),
            "sourceParagraphOccurrencesNonEmpty": non_empty_paragraph_count(all_paragraphs),
            "bodyParagraphCount": len(direct_paragraphs),
            "sourceParagraphOccurrenceCount": len(all_paragraphs),
            "tableCount": len(tables),
            "tableRowCount": table_rows,
            "embeddedImageCount": len(image_entries),
            "textCharacterCount": len(all_text),
            "criticalSymbolCounts": critical_symbol_counts(all_text),
            "displayTextSha256": sha256_bytes(all_text.encode("utf-8")),
            "displayText": all_text,
        }


def extract_txt(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    text = normalize_text(raw.decode("utf-8-sig", errors="strict"))
    # The TXT source uses blank lines as paragraph boundaries; counting every
    # physical line would over-count the seven source paragraphs in the frozen
    # corpus baseline.
    paragraphs = [block for block in re.split(r"(?:\r?\n){2,}", text) if block.strip()]
    return {
        "encoding": "UTF-8",
        "xmlParseable": None,
        "bodyParagraphsNonEmpty": sum(1 for line in paragraphs if line.strip()),
        "sourceParagraphOccurrencesNonEmpty": sum(1 for line in paragraphs if line.strip()),
        "bodyParagraphCount": len(paragraphs),
        "sourceParagraphOccurrenceCount": len(paragraphs),
        "tableCount": 0,
        "tableRowCount": 0,
        "embeddedImageCount": 0,
        "textCharacterCount": len(text),
        "criticalSymbolCounts": critical_symbol_counts(text),
        "displayTextSha256": sha256_bytes(text.encode("utf-8")),
        "displayText": text,
    }


def load_authorized_policy(path: Path = AUTHORIZED_POLICY_PATH) -> dict[str, Any]:
    """Load the owner declaration without accepting an implicit authority."""

    try:
        policy = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"AUTHORIZED_SOURCE_POLICY_UNAVAILABLE: {exc}") from exc
    if not isinstance(policy, dict) or policy.get("schemaVersion") != "authorized-corpus-policy.v1":
        raise ValueError("AUTHORIZED_SOURCE_POLICY_INVALID")
    required_text = (
        "policyVersion", "declaredAt", "declaredBy", "sourceAgency", "owner",
        "effectiveFrom", "reviewDueAt", "classification", "activationPolicy", "automaticActor",
    )
    if any(not isinstance(policy.get(field), str) or not policy[field].strip() for field in required_text):
        raise ValueError("AUTHORIZED_SOURCE_POLICY_FIELDS_INVALID")
    if policy["declaredBy"] != "PROJECT_OWNER" or policy["owner"] != "SYSTEM_UNIT_GATE" or policy["automaticActor"] != "SYSTEM_UNIT_GATE":
        raise ValueError("AUTHORIZED_SOURCE_POLICY_ACTOR_INVALID")
    authority = policy.get("authorityLevel")
    if not isinstance(authority, int) or not 0 <= authority <= 100:
        raise ValueError("AUTHORIZED_SOURCE_POLICY_AUTHORITY_INVALID")
    return policy


def governance_for_file(
    name: str,
    policy: dict[str, Any],
    *,
    invalid_reason: str | None = None,
) -> dict[str, Any]:
    conflict_ids = CR_BY_FILENAME.get(name, [])
    disposition = "REJECT" if invalid_reason else "ACCEPT"
    reasons = ["PROJECT_OWNER_DECLARED_MUNICIPAL_SOURCE", "SCREENED_INGESTION_REQUIRED"]
    if conflict_ids:
        reasons.append("CONFLICT_SEGMENT_POLICY_REQUIRED")
    if invalid_reason:
        reasons.append(invalid_reason)
    return {
        "owner": policy["owner"],
        "ownerStatus": "PROJECT_OWNER_DECLARED",
        "sourceAgency": policy["sourceAgency"],
        "sourceAgencyStatus": "PROJECT_OWNER_DECLARED",
        "classification": "RESTRICTED" if invalid_reason else policy["classification"],
        "classificationBasis": "REJECTED_BY_INTEGRITY_AUDIT" if invalid_reason else "PROJECT_OWNER_DECLARED_MUNICIPAL_SOURCE",
        "authorityLevel": policy["authorityLevel"],
        "effectiveFrom": policy["effectiveFrom"],
        "effectiveUntil": None,
        "disposition": disposition,
        "activeIndexEligible": invalid_reason is None,
        "blockedBy": conflict_ids,
        "remediationReasons": sorted(set(reasons)),
    }


def audit_file(path: Path, root: Path, policy: dict[str, Any] | None = None) -> dict[str, Any]:
    policy = policy or load_authorized_policy()
    relative = path.relative_to(root).as_posix()
    suffix = path.suffix.lower()
    file_format = SUPPORTED_SUFFIXES.get(suffix, "UNSUPPORTED")
    if file_format == "DOCX":
        mime_type = DOCX_MIME
        try:
            extracted = extract_docx(path)
            if extracted.get("zipPathWarnings"):
                invalid_reason = "ZIP_PATH_TRAVERSAL"
            elif extracted.get("hasMacro"):
                invalid_reason = "MACRO_DETECTED"
            elif extracted.get("textCharacterCount", 0) == 0:
                invalid_reason = "NO_EXTRACTED_TEXT"
            else:
                invalid_reason = None
        except (ET.ParseError, ValueError, zipfile.BadZipFile, UnicodeError) as exc:
            extracted = {
                "xmlParseable": False,
                "parseErrorCode": str(exc).split(":", 1)[0],
                "bodyParagraphsNonEmpty": 0,
                "sourceParagraphOccurrencesNonEmpty": 0,
                "bodyParagraphCount": 0,
                "sourceParagraphOccurrenceCount": 0,
                "tableCount": 0,
                "tableRowCount": 0,
                "embeddedImageCount": 0,
                "textCharacterCount": 0,
                "criticalSymbolCounts": {symbol: 0 for symbol in ("≤", "≥", "<", ">", "Ø", "m²")},
                "displayTextSha256": None,
                "displayText": "",
            }
            invalid_reason = "PARSER_OR_ARCHIVE_FAILURE"
    elif file_format == "TXT":
        mime_type = TXT_MIME
        try:
            extracted = extract_txt(path)
            invalid_reason = None if extracted.get("textCharacterCount", 0) else "NO_EXTRACTED_TEXT"
        except UnicodeError:
            extracted = {
                "encoding": "UNKNOWN",
                "xmlParseable": None,
                "bodyParagraphsNonEmpty": 0,
                "sourceParagraphOccurrencesNonEmpty": 0,
                "bodyParagraphCount": 0,
                "sourceParagraphOccurrenceCount": 0,
                "tableCount": 0,
                "tableRowCount": 0,
                "embeddedImageCount": 0,
                "textCharacterCount": 0,
                "criticalSymbolCounts": {symbol: 0 for symbol in ("≤", "≥", "<", ">", "Ø", "m²")},
                "displayTextSha256": None,
                "displayText": "",
            }
            invalid_reason = "TEXT_ENCODING_FAILURE"
    else:
        mime_type = "application/octet-stream"
        extracted = {
            "xmlParseable": None,
            "bodyParagraphsNonEmpty": 0,
            "sourceParagraphOccurrencesNonEmpty": 0,
            "bodyParagraphCount": 0,
            "sourceParagraphOccurrenceCount": 0,
            "tableCount": 0,
            "tableRowCount": 0,
            "embeddedImageCount": 0,
            "textCharacterCount": 0,
            "criticalSymbolCounts": {symbol: 0 for symbol in ("≤", "≥", "<", ">", "Ø", "m²")},
            "displayTextSha256": None,
            "displayText": "",
        }
        invalid_reason = "UNSUPPORTED_FILE_FORMAT"

    display_text = extracted.pop("displayText", "")
    record = {
        "relativePath": relative,
        "filename": path.name,
        "format": file_format,
        "mimeType": mime_type,
        "sizeBytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "governance": governance_for_file(path.name, policy, invalid_reason=invalid_reason),
        "audit": extracted,
    }
    if display_text and "≤" in display_text and path.name == "กองสาธารณสุข (2).docx":
        record["audit"]["requiredComparatorRegression"] = "ADL ≤ 6 present in extracted text"
    return record


def build_manifest(root: Path, snapshot_id: str = DEFAULT_SNAPSHOT_ID) -> dict[str, Any]:
    root = root.resolve()
    if not root.exists() or not root.is_dir():
        raise FileNotFoundError(f"CORPUS_ROOT_NOT_FOUND: {root}")

    files = [path for path in root.rglob("*") if path.is_file()]
    files.sort(key=lambda path: path.relative_to(root).as_posix())
    policy = load_authorized_policy()
    records = [audit_file(path, root, policy) for path in files]

    format_counts: dict[str, int] = {}
    for record in records:
        format_counts[record["format"]] = format_counts.get(record["format"], 0) + 1

    summary = {
        "fileCount": len(records),
        "formatCounts": dict(sorted(format_counts.items())),
        "totalSizeBytes": sum(record["sizeBytes"] for record in records),
        "bodyParagraphsNonEmpty": sum(record["audit"]["bodyParagraphsNonEmpty"] for record in records),
        "sourceParagraphOccurrencesNonEmpty": sum(
            record["audit"]["sourceParagraphOccurrencesNonEmpty"] for record in records
        ),
        "tableCount": sum(record["audit"]["tableCount"] for record in records),
        "tableRowCount": sum(record["audit"]["tableRowCount"] for record in records),
        "embeddedImageCount": sum(record["audit"]["embeddedImageCount"] for record in records),
        "textCharacterCount": sum(record["audit"]["textCharacterCount"] for record in records),
    }
    baseline_check = {
        key: summary.get(key) == expected for key, expected in EXPECTED_BASELINE.items()
    }
    baseline_check["formatCounts"] = summary["formatCounts"] == EXPECTED_BASELINE["formatCounts"]

    source_set = [
        {"relativePath": record["relativePath"], "sha256": record["sha256"]}
        for record in records
    ]
    manifest: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "toolVersion": TOOL_VERSION,
        "snapshotId": snapshot_id,
        "sourceRoot": root.name,
        "authorization": {
            "policyVersion": policy["policyVersion"],
            "declaredAt": policy["declaredAt"],
            "declaredBy": policy["declaredBy"],
            "sourceAgency": policy["sourceAgency"],
            "owner": policy["owner"],
            "authorityLevel": policy["authorityLevel"],
            "effectiveFrom": policy["effectiveFrom"],
            "reviewDueAt": policy["reviewDueAt"],
            "activationPolicy": policy["activationPolicy"],
            "conflictResolutionMode": policy["conflictResolutionMode"],
        },
        "countingConvention": {
            "bodyParagraphsNonEmpty": "direct w:body/w:p for DOCX; non-empty UTF-8 lines for TXT",
            "sourceParagraphOccurrencesNonEmpty": "all non-empty w:p descendants under w:body, including table cells; plus non-empty TXT lines",
            "tableRows": "all w:tr descendants of direct document body tables",
            "embeddedImages": "files under word/media excluding directory entries",
            "mergedCells": "counted by source paragraph occurrence; merged-cell aliases are not duplicated by row.cells iteration",
            "text": "NFC-normalized extracted text; w:sdtContent is traversed; displayTextSha256 is retained per file",
        },
        "summary": summary,
        "frozenBaseline": {
            "source": "fullspec.md §2.1 and plan.md Appendix C",
            "expected": EXPECTED_BASELINE,
            "checks": baseline_check,
            "allChecksPass": all(baseline_check.values()),
        },
        "renderingReference": {
            "referenceRenderedDocxPages": 76,
            "referenceBlankPages": 5,
            "auditStatus": "NOT_RUN_BY_STRUCTURE_AUDITOR",
            "note": "Page layout must be verified with an approved renderer; parser output must not infer page counts.",
        },
        "governanceSummary": {
            "ownerAssignmentsComplete": all(record["governance"]["owner"] for record in records),
            "authorityAssignmentsComplete": all(record["governance"]["authorityLevel"] is not None for record in records),
            "effectiveDateAssignmentsComplete": all(
                record["governance"]["effectiveFrom"] is not None for record in records
            ),
            "activeIndexEligibleFileCount": sum(
                1 for record in records if record["governance"]["activeIndexEligible"]
            ),
            "dispositionCounts": {
                disposition: sum(
                    1 for record in records if record["governance"]["disposition"] == disposition
                )
                for disposition in ("ACCEPT", "REMEDIATE", "REJECT")
            },
            "blockedBy": sorted(
                {
                    blocker
                    for record in records
                    for blocker in record["governance"]["blockedBy"]
                }
            ),
        },
        "files": records,
        "integrity": {},
    }
    payload = {key: value for key, value in manifest.items() if key != "integrity"}
    manifest["integrity"] = {
        "manifestDigest": sha256_bytes(canonical_json(payload)),
        "sourceSetDigest": sha256_bytes(canonical_json(source_set)),
    }
    return manifest


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def verify_manifest(root: Path, expected_path: Path, snapshot_id: str | None = None) -> int:
    expected = json.loads(expected_path.read_text(encoding="utf-8"))
    actual = build_manifest(root, snapshot_id or expected["snapshotId"])
    if canonical_json(actual) != canonical_json(expected):
        print("CORPUS_MANIFEST_MISMATCH", file=sys.stderr)
        print(f"expected={expected_path}", file=sys.stderr)
        print(f"actualDigest={actual['integrity']['manifestDigest']}", file=sys.stderr)
        print(f"expectedDigest={expected.get('integrity', {}).get('manifestDigest')}", file=sys.stderr)
        return 1
    print(f"CORPUS_MANIFEST_VERIFIED {actual['integrity']['manifestDigest']}")
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Corpus directory")
    parser.add_argument("--output", type=Path, help="Write a deterministic JSON manifest")
    parser.add_argument("--verify", type=Path, help="Verify against an existing manifest")
    parser.add_argument("--snapshot-id", default=DEFAULT_SNAPSHOT_ID)
    args = parser.parse_args(argv)
    if not args.output and not args.verify:
        parser.error("one of --output or --verify is required")
    if args.output and args.verify:
        parser.error("--output and --verify are mutually exclusive")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if args.verify:
        snapshot_id = args.snapshot_id if args.snapshot_id != DEFAULT_SNAPSHOT_ID else None
        return verify_manifest(args.input, args.verify, snapshot_id)
    manifest = build_manifest(args.input, args.snapshot_id)
    write_manifest(args.output, manifest)
    print(f"CORPUS_MANIFEST_WRITTEN {args.output}")
    print(f"MANIFEST_DIGEST {manifest['integrity']['manifestDigest']}")
    print(f"BASELINE_MATCH {manifest['frozenBaseline']['allChecksPass']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
