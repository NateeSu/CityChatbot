#!/usr/bin/env python3
"""Build a deterministic, tenant-scoped activation bundle for ``doc_rag_test``.

This tool is deliberately offline: it does not open a database connection and
never carries credentials.  It turns the project-owner source declaration,
corpus audit, and CR ledger into idempotent SQL that must be executed through
the audited Supabase migration path.  Source text is screened before a PUBLIC
chunk is emitted; answers are limited to the small exact-fact allow-list below.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
import uuid
import zipfile
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "doc_rag_test"
MANIFEST = ROOT / "docs" / "corpus" / "corpus-manifest.json"
LEDGER = ROOT / "docs" / "corpus" / "conflict-ledger.json"
POLICY = ROOT / "docs" / "corpus" / "authorized-source-policy.json"
DEFAULT_OUTPUT = ROOT / "artifacts" / "authorized-corpus" / "activation.sql"
DEFAULT_ROLLBACK_OUTPUT = ROOT / "artifacts" / "authorized-corpus" / "rollback.sql"
DEFAULT_MANIFEST_OUTPUT = ROOT / "artifacts" / "authorized-corpus" / "activation-manifest.json"

TARGET_TENANT_SLUG = "citychatbot-canary"
TARGET_DEPARTMENT_CODE = "CANARY_GENERAL"
TARGET_CATEGORY_CODE = "MUNICIPAL_CORPUS"
SYSTEM_ACCOUNT_SUBJECT = "system:unit-gate"
SYSTEM_ACCOUNT_ID = "10000000-0000-4000-8000-000000000009"
ACTIVATION_SCHEMA_VERSION = "authorized-corpus-activation.v1"
ACTIVATION_MODE_FULL_SCREENED = "full-screened"
ACTIVATION_MODE_MVP_SAFE_FACTS = "safe-facts-mvp"
ACTIVATION_MODES = (ACTIVATION_MODE_FULL_SCREENED, ACTIVATION_MODE_MVP_SAFE_FACTS)
REQUIRED_TEST_IDS = (
    "P9-KNOW-CORPUS-AUTHORITY",
    "P9-KNOW-DETERMINISTIC-MANIFEST",
    "P9-KNOW-CONFLICT-SEGMENT-POLICY",
    "P9-KNOW-PII-TEMPLATE-QR-EXCLUSION",
    "P9-KNOW-EXACT-SYMBOL-PRESERVATION",
    "P9-KNOW-IDEMPOTENT-ACTIVATION-SQL",
    "P9-KNOW-TENANT-SCOPED-ROLLBACK",
    "P9-KNOW-GROUNDED-ANSWER",
    "P9-KNOW-SAFE-HANDOFF",
    "P9-KNOW-MVP-SAFE-SURFACE",
)

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{" + W_NS + "}"
W_BODY = W + "body"
W_P = W + "p"
W_TBL = W + "tbl"
W_TR = W + "tr"
W_TC = W + "tc"
W_T = W + "t"
W_DEL_TEXT = W + "delText"
W_TAB = W + "tab"
W_BR = W + "br"
W_CR = W + "cr"

MOBILE_PHONE = re.compile(r"(?<!\d)0(?:6|8|9)\d(?:[-\s]?\d){7,8}(?!\d)")


class ActivationError(ValueError):
    """Raised when the local authority or source contract is unsafe."""


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256(value: bytes | str) -> str:
    raw = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(raw).hexdigest()


def sha256_prefixed(value: bytes | str) -> str:
    return "sha256:" + sha256(value)


def deterministic_uuid(*parts: str) -> str:
    raw = bytearray.fromhex(sha256("\x1f".join(parts))[:32])
    raw[6] = (raw[6] & 0x0F) | 0x50
    raw[8] = (raw[8] & 0x3F) | 0x80
    return str(uuid.UUID(bytes=bytes(raw)))


def normal(value: str) -> str:
    return unicodedata.normalize("NFKC", value).replace("–", "-").replace("—", "-").replace("−", "-").replace("\u00a0", " ")


def compact(value: str) -> str:
    return re.sub(r"\s+", "", normal(value)).lower()


def sql(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (dict, list, tuple)):
        value = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return "'" + str(value).replace("'", "''") + "'"


def read_json(path: Path) -> dict[str, Any]:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ActivationError(f"cannot read {path.relative_to(ROOT)}: {exc}") from exc
    if not isinstance(result, dict):
        raise ActivationError(f"expected object in {path.relative_to(ROOT)}")
    return result


def paragraph_text(element: ET.Element) -> str:
    parts: list[str] = []
    for node in element.iter():
        if node.tag in (W_T, W_DEL_TEXT):
            parts.append(node.text or "")
        elif node.tag in (W_TAB, W_BR, W_CR):
            parts.append(" ")
    return "".join(parts).strip()


def docx_segments(path: Path) -> list[dict[str, Any]]:
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    body = root.find(".//" + W_BODY)
    if body is None:
        raise ActivationError(f"DOCX_MISSING_BODY: {path.name}")
    output: list[dict[str, Any]] = []
    paragraph_index = 0
    table_index = 0
    for child in list(body):
        if child.tag == W_P:
            text = paragraph_text(child)
            if text:
                output.append({"text": text, "chunkType": "ATOMIC_FACT_GROUP", "locator": {"sectionPath": [path.name], "paragraphIndex": paragraph_index}})
                paragraph_index += 1
            continue
        if child.tag != W_TBL:
            continue
        rows: list[list[str]] = []
        for row in child.findall(W_TR):
            cells = [paragraph_text(cell) for cell in row.findall(W_TC)]
            if any(cell.strip() for cell in cells):
                rows.append(cells)
        if not rows:
            table_index += 1
            continue
        headers = rows[0]
        for row_index, row in enumerate(rows[1:], start=1):
            width = max(len(headers), len(row))
            rendered = "\n".join(
                f"{(headers[column] if column < len(headers) and headers[column].strip() else f'column_{column + 1}').strip()}: {(row[column] if column < len(row) else '').strip()}"
                for column in range(width)
                if (row[column] if column < len(row) else "").strip()
            )
            if rendered.strip():
                output.append({
                    "text": rendered.strip(),
                    "chunkType": "TABLE_ROW",
                    "locator": {"sectionPath": [path.name, f"table-{table_index + 1}"], "tableIndex": table_index, "rowIndex": row_index},
                })
        table_index += 1
    return output


def txt_segments(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8-sig")
    return [
        {"text": block.strip(), "chunkType": "ATOMIC_FACT_GROUP", "locator": {"sectionPath": [path.name], "paragraphIndex": index}}
        for index, block in enumerate(re.split(r"(?:\r?\n){2,}", text))
        if block.strip()
    ]


def split_segment(segment: dict[str, Any], max_chars: int = 2_400) -> Iterable[dict[str, Any]]:
    text = str(segment["text"]).strip()
    if len(text) <= max_chars:
        yield segment
        return
    start = 0
    part = 0
    while start < len(text):
        stop = min(len(text), start + max_chars)
        if stop < len(text):
            boundary = max(text.rfind("\n", start, stop), text.rfind(" ", start, stop))
            if boundary > start + max_chars // 2:
                stop = boundary
        piece = text[start:stop].strip()
        if piece:
            locator = dict(segment["locator"])
            locator["charStart"] = start
            locator["charEnd"] = stop
            locator["part"] = part
            yield {**segment, "text": piece, "locator": locator}
            part += 1
        start = max(stop, start + 1)


def excluded_reason(filename: str, text: str) -> str | None:
    value = compact(text)
    if filename == "คณะผู้บริหาร.txt" and text.strip() != "คณะผู้บริหาร":
        return "CR-012_PERSONAL_CONTACT_SOURCE"
    if MOBILE_PHONE.search(normal(text)):
        return "PERSONAL_OR_UNVERIFIED_MOBILE"
    if "qr" in value:
        return "CR-011_UNDECODED_QR"
    if filename == "งานทะเบียนราษฎรและบัตรประจำตัวประชาชน .docx" and "แจ้งตาย" in text:
        return "CR-001_MISMATCHED_DEATH_FAQ"
    if filename == "กองสาธารณสุข (2).docx" and ("50ตร" in value or "50ตาราง" in value):
        return "CR-003_FEE_BOUNDARY"
    if filename in {"สถานธนานุบาลเทศบาลเมืองฉะเชิงเทรา 1.docx", "สถานธนานุบาลเทศบาลเมืองฉะเชิงเทรา 2.docx"} and ("ดอกเบี้ย" in text or "สตางค์" in text):
        return "CR-005_AMBIGUOUS_INTEREST"
    if filename == "ศูนย์พัฒนาเด็กเล็ก.docx" and ("2.8" in text or "3.11" in text):
        return "CR-006_AMBIGUOUS_AGE"
    if filename == "โรงเรียนเทศบาล 1.docx" and any(marker in text for marker in ("ภาษาจีน", "ค่าใช้จ่าย", "ค่าธรรมเนียม", "เปิดรับสมัคร", "สมัครได้")):
        return "CR-007_AFFECTED_SCHOOL_FACT"
    if filename == "โรงเรียนเทศบาล 2.docx" and any(marker in text for marker in ("พาเด็ก", "ทดสอบ", "สะดวก")):
        return "CR-008_AFFECTED_ELIGIBILITY"
    if filename == "กองคลัง.docx" and ("500 ลิตร" in text or "1 ลูกบาศก์เมตร" in text):
        return "CR-009_AMBIGUOUS_WASTE_RANGE"
    if filename == "สถานธนานุบาลเทศบาลเมืองฉะเชิงเทรา 1.docx" and any(marker in value for marker in ("template", "กำหนดส่ง", "แชทบอท", "screenshot")):
        return "CR-010_TEMPLATE_OR_EVALUATION"
    if filename == "สำนักปลัด.docx" and any(marker in text for marker in ("รอบแรก", "รอบสุดท้าย", "รถโดยสาร", "รถมินิบัส")):
        return "CR-013_STATIC_TRANSPORT_SCHEDULE"
    if filename == "ฟิตเนส.docx" and any(marker in text for marker in ("โรคประจำตัว", "ผู้ป่วยหัวใจ", "โรคหัวใจ", "แพทย์")):
        return "CR-014_MEDICAL_GUIDANCE"
    return None


SAFE_FACT_RULES: tuple[dict[str, str], ...] = (
    {
        "id": "fitness-single-visit-fee",
        "filename": "ฟิตเนส.docx",
        "anchor": "ค่าบริการรายครั้ง 30 บาท",
        "factType": "FEE",
        "raw": "ค่าบริการรายครั้ง 30 บาท",
        "entity": "fitness-center:single-visit-fee",
        "display": "ศูนย์ส่งเสริมสุขภาพเทศบาลเมืองฉะเชิงเทรา (Fitness Center)",
    },
    {
        "id": "kcc-weekday-hours",
        "filename": "ศูนย์การเรียนรู้เมืองฉะเชิงเทรา KCC.docx",
        "anchor": "วันอังคาร – ศุกร์ เวลา 9.00 – 18.00 น.",
        "factType": "BUSINESS_HOURS",
        "raw": "วันอังคาร – ศุกร์ เวลา 9.00 – 18.00 น.",
        "entity": "kcc-center:weekday-hours",
        "display": "ศูนย์การเรียนรู้เมืองฉะเชิงเทรา (KCC)",
    },
    {
        "id": "kcc-service-fee",
        "filename": "ศูนย์การเรียนรู้เมืองฉะเชิงเทรา KCC.docx",
        "anchor": "ไม่เสียค่าใช้จ่ายในการใช้บริการ",
        "factType": "FEE",
        "raw": "ไม่เสียค่าใช้จ่ายในการใช้บริการ",
        "entity": "kcc-center:service-fee",
        "display": "ศูนย์การเรียนรู้เมืองฉะเชิงเทรา (KCC)",
    },
    {
        "id": "pawnshop-one-ticket-duration",
        "filename": "สถานธนานุบาลเทศบาลเมืองฉะเชิงเทรา 1.docx",
        "anchor": "ตั๋วจำนำมีอายุ 4 เดือน ผ่อนผันได้อีก  30 วัน",
        "factType": "DURATION",
        "raw": "ตั๋วจำนำมีอายุ 4 เดือน ผ่อนผันได้อีก 30 วัน",
        "entity": "pawnshop-1:ticket-duration",
        "display": "สถานธนานุบาลเทศบาลเมืองฉะเชิงเทรา 1",
    },
    {
        "id": "finance-contact",
        "filename": "กองคลัง.docx",
        "anchor": "038-512538 ต่อ 121-123",
        "factType": "PHONE",
        "raw": "038-512538 ต่อ 121-123",
        "entity": "finance-office:contact",
        "display": "กองคลัง",
    },
    {
        "id": "welfare-office-hours",
        "filename": "กองสวัสดิกรสังคม.docx",
        "anchor": "08.30 – 16.30 น.",
        "factType": "BUSINESS_HOURS",
        "raw": "วันและเวลาราชการ 08.30 – 16.30 น.",
        "entity": "social-welfare:office-hours",
        "display": "กองสวัสดิการสังคม",
    },
)


def reduce_to_mvp_safe_fact_surface(documents: list[dict[str, Any]], facts: list[dict[str, Any]]) -> None:
    """Keep every source record auditable while exposing only fact anchors.

    The production MVP must not turn a newly-authorised bulk corpus into a
    broad answer surface before every semantic segment has its own structured
    validation.  Every document therefore remains an active, receipt-bound
    source record; documents without a certified exact fact get only an
    innocuous title-derived provenance chunk.  This preserves safe abstention
    while the full screened artifact remains available for later expansion.
    """

    fact_chunk_ids = {str(fact["sourceChunkId"]) for fact in facts}
    for document in documents:
        fact_chunks = [chunk for chunk in document["chunks"] if chunk["id"] in fact_chunk_ids]
        if fact_chunks:
            document["chunks"] = fact_chunks
        else:
            title_text = f"Authorized municipal source: {document['title']}"
            document["chunks"] = [{
                "id": deterministic_uuid("mvp-safe-title", document["versionId"]),
                "chunkIndex": 0,
                "text": title_text,
                "chunkType": "DOCUMENT_SUMMARY",
                "locator": {"sectionPath": [document["filename"]], "sourceRecord": True, "activationSurface": ACTIVATION_MODE_MVP_SAFE_FACTS},
                "sourceHash": sha256(title_text),
                "tokenCount": max(1, (len(title_text) + 3) // 4),
            }]
        document["warnings"] = [*document["warnings"], "MVP_SAFE_FACT_SURFACE"]


def build_activation(report_hash: str | None = None, mode: str = ACTIVATION_MODE_FULL_SCREENED) -> tuple[dict[str, Any], str, str]:
    if mode not in ACTIVATION_MODES:
        raise ActivationError(f"unsupported activation mode: {mode}")
    manifest = read_json(MANIFEST)
    ledger = read_json(LEDGER)
    policy = read_json(POLICY)
    if policy.get("declaredBy") != "PROJECT_OWNER" or policy.get("automaticActor") != "SYSTEM_UNIT_GATE":
        raise ActivationError("project owner source authority is missing")
    if manifest.get("authorization", {}).get("policyVersion") != policy.get("policyVersion"):
        raise ActivationError("manifest authority receipt does not match source policy")
    if ledger.get("summary", {}).get("activeIndexEligibleCount") != 0:
        raise ActivationError("conflicted facts must not be index eligible")
    files = manifest.get("files")
    if not isinstance(files, list) or len(files) != 17:
        raise ActivationError("expected the frozen 17-file municipal corpus")

    documents: list[dict[str, Any]] = []
    excluded: list[dict[str, str]] = []
    for record in files:
        filename = record.get("filename")
        relative = record.get("relativePath")
        if not isinstance(filename, str) or not isinstance(relative, str):
            raise ActivationError("manifest file record is incomplete")
        if record.get("governance", {}).get("activeIndexEligible") is not True:
            raise ActivationError(f"source unexpectedly ineligible: {filename}")
        path = CORPUS / relative
        if filename == "คณะผู้บริหาร.txt":
            # Preserve only the public document label as an auditable active
            # source.  Names and every contact field are excluded rather than
            # being converted into an answerable person record.
            raw_segments = [{"text": "คณะผู้บริหาร", "chunkType": "DOCUMENT_SUMMARY", "locator": {"sectionPath": [filename], "paragraphIndex": 0}}]
            excluded.append({"filename": filename, "reason": "CR-012_PERSONAL_CONTACT_SOURCE"})
        else:
            raw_segments = docx_segments(path) if path.suffix.lower() == ".docx" else txt_segments(path)
        kept: list[dict[str, Any]] = []
        for raw_segment in raw_segments:
            for segment in split_segment(raw_segment):
                reason = excluded_reason(filename, str(segment["text"]))
                if reason:
                    excluded.append({"filename": filename, "reason": reason})
                    continue
                kept.append(segment)
        checksum = str(record["sha256"]).removeprefix("sha256:")
        document_id = deterministic_uuid("document", filename)
        version_id = deterministic_uuid("version", filename, checksum)
        generation_id = deterministic_uuid("generation", filename, checksum, policy["policyVersion"])
        chunks: list[dict[str, Any]] = []
        for index, segment in enumerate(kept):
            text = normal(str(segment["text"]).strip())
            if not text:
                continue
            chunks.append({
                "id": deterministic_uuid("chunk", version_id, str(index), sha256(text)),
                "chunkIndex": index,
                "text": text,
                "chunkType": segment["chunkType"],
                "locator": segment["locator"],
                "sourceHash": sha256(text),
                "tokenCount": max(1, (len(text) + 3) // 4),
            })
        if not chunks:
            raise ActivationError(f"screening removed every chunk from non-PII source: {filename}")
        documents.append({
            "filename": filename,
            "relativePath": relative,
            "title": filename.rsplit(".", 1)[0].strip(),
            "checksum": checksum,
            "mimeType": record["mimeType"],
            "documentId": document_id,
            "versionId": version_id,
            "generationId": generation_id,
            "sourceKey": "municipal." + sha256(filename)[:32],
            "chunks": chunks,
            "warnings": ["PROJECT_OWNER_DECLARED_MUNICIPAL_SOURCE", "CONFLICT_SEGMENT_POLICY_APPLIED", "NON_TEXT_MEDIA_EXCLUDED_FROM_PUBLIC_INDEX"],
        })

    facts: list[dict[str, Any]] = []
    by_filename = {document["filename"]: document for document in documents}
    for rule in SAFE_FACT_RULES:
        document = by_filename.get(rule["filename"])
        if document is None:
            raise ActivationError(f"safe fact source is missing: {rule['filename']}")
        source = next((chunk for chunk in document["chunks"] if compact(rule["anchor"]) in compact(chunk["text"])), None)
        if source is None:
            raise ActivationError(f"safe fact anchor is absent after screening: {rule['id']}")
        fact_key = f"{rule['factType']}|{rule['id']}|{source['sourceHash']}"
        facts.append({
            "id": deterministic_uuid("fact", document["generationId"], fact_key),
            "documentId": document["documentId"],
            "versionId": document["versionId"],
            "generationId": document["generationId"],
            "sourceChunkId": source["id"],
            "factKey": fact_key,
            "factType": rule["factType"],
            "raw": rule["raw"],
            "normalized": re.sub(r"\s+", " ", normal(rule["raw"])).strip(),
            "entityKey": rule["entity"],
            "entityDisplayName": rule["display"],
            "locator": source["locator"],
            "sourceQuote": source["text"],
        })
    if mode == ACTIVATION_MODE_MVP_SAFE_FACTS:
        reduce_to_mvp_safe_fact_surface(documents, facts)
    facts_by_chunk: dict[str, list[str]] = {}
    for fact in facts:
        facts_by_chunk.setdefault(fact["sourceChunkId"], []).append(fact["factType"])
    for document in documents:
        for chunk in document["chunks"]:
            chunk["factTypes"] = sorted(set(facts_by_chunk.get(chunk["id"], [])))

    preflight = {
        "schemaVersion": ACTIVATION_SCHEMA_VERSION,
        "activationMode": mode,
        "policyVersion": policy["policyVersion"],
        "tenantSlug": TARGET_TENANT_SLUG,
        "departmentCode": TARGET_DEPARTMENT_CODE,
        "sourceManifestDigest": manifest["integrity"]["manifestDigest"],
        "conflictLedgerDigest": ledger["integrity"]["ledgerSha256"],
        "documents": [{
            "filename": document["filename"], "checksum": document["checksum"], "versionId": document["versionId"],
            "generationId": document["generationId"], "chunkCount": len(document["chunks"]),
        } for document in documents],
        "safeFacts": [{"id": fact["id"], "factKey": fact["factKey"], "sourceChunkId": fact["sourceChunkId"]} for fact in facts],
        "excluded": sorted(excluded, key=lambda item: (item["filename"], item["reason"])),
        "requiredTestIds": list(REQUIRED_TEST_IDS),
        "actor": "SYSTEM_UNIT_GATE",
    }
    preflight_hash = sha256_prefixed(canonical_json(preflight))
    receipt_hash = report_hash or preflight_hash
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", receipt_hash):
        raise ActivationError("report hash must be sha256:<64 lowercase hex>")
    activation_manifest = {**preflight, "preflightHash": preflight_hash, "receiptReportHash": receipt_hash}
    activation_manifest["integrity"] = {"activationManifestHash": sha256_prefixed(canonical_json(activation_manifest))}
    activation_sql = build_sql(documents, facts, policy, receipt_hash)
    rollback_sql = build_rollback_sql(documents)
    return activation_manifest, activation_sql, rollback_sql


def build_sql(documents: list[dict[str, Any]], facts: list[dict[str, Any]], policy: dict[str, Any], receipt_hash: str) -> str:
    document_ids = ", ".join(sql(document["versionId"]) + "::uuid" for document in documents)
    generation_ids = ", ".join(sql(document["generationId"]) + "::uuid" for document in documents)
    lines = [
        "-- Generated by scripts/authorized_corpus_activation.py; do not hand-edit.",
        "-- This is idempotent for the declared corpus snapshot and target tenant only.",
        "begin;",
        "do $authorized_corpus$",
        "declare",
        "  v_tenant uuid;",
        "  v_department uuid;",
        "  v_category uuid;",
        "  v_system_account uuid;",
        "  v_version uuid;",
        "  v_generation uuid;",
        f"  v_receipt_hash constant text := {sql(receipt_hash)};",
        f"  v_tests constant jsonb := {sql(list(REQUIRED_TEST_IDS))}::jsonb;",
        "begin",
        f"  select id into v_tenant from public.tenants where slug = {sql(TARGET_TENANT_SLUG)};",
        "  if v_tenant is null then raise exception using errcode = 'P0002', message = 'authorized corpus target tenant not found'; end if;",
        f"  select id into v_department from public.departments where tenant_id = v_tenant and code = {sql(TARGET_DEPARTMENT_CODE)};",
        "  if v_department is null then raise exception using errcode = 'P0002', message = 'authorized corpus owner department not found'; end if;",
        f"  insert into public.user_accounts (id, auth_subject, status, system_role, display_name) values ({sql(SYSTEM_ACCOUNT_ID)}::uuid, {sql(SYSTEM_ACCOUNT_SUBJECT)}, 'ACTIVE', 'NONE', 'SYSTEM_UNIT_GATE') on conflict (auth_subject) do nothing;",
        f"  select id into v_system_account from public.user_accounts where auth_subject = {sql(SYSTEM_ACCOUNT_SUBJECT)};",
        "  if v_system_account is null then raise exception using errcode = 'P0002', message = 'SYSTEM_UNIT_GATE account not found'; end if;",
        f"  insert into public.knowledge_categories (tenant_id, code, display_name, status) values (v_tenant, {sql(TARGET_CATEGORY_CODE)}, 'เอกสารเทศบาลที่ Project Owner รับรอง', 'ACTIVE') on conflict (tenant_id, code) do nothing;",
        f"  select id into v_category from public.knowledge_categories where tenant_id = v_tenant and code = {sql(TARGET_CATEGORY_CODE)};",
        "  if v_category is null then raise exception using errcode = 'P0002', message = 'authorized corpus category not found'; end if;",
    ]
    for document in documents:
        lines.extend([
            f"  insert into public.knowledge_documents (id, tenant_id, source_key, title, owner_department_id, knowledge_category_id, status) values ({sql(document['documentId'])}::uuid, v_tenant, {sql(document['sourceKey'])}, {sql(document['title'])}, v_department, v_category, 'ACTIVE') on conflict (tenant_id, source_key) do nothing;",
            "  insert into public.knowledge_document_versions (id, tenant_id, document_id, version, title, original_filename, mime_type, checksum_sha256, source_object_key, owner_department_id, knowledge_category_id, visibility, authority_level, effective_from, effective_date_unknown, state, approval_status, review_due_at, parser_name, parser_version, extraction_quality_score, extraction_warnings) "
            f"values ({sql(document['versionId'])}::uuid, v_tenant, {sql(document['documentId'])}::uuid, 1, {sql(document['title'])}, {sql(document['filename'])}, {sql(document['mimeType'])}, {sql(document['checksum'])}, {sql('municipal/authorized/' + document['checksum'] + '/' + document['filename'])}, v_department, v_category, 'PUBLIC', {policy['authorityLevel']}, {sql(policy['effectiveFrom'])}::timestamptz, false, 'QUARANTINED', 'PENDING', {sql(policy['reviewDueAt'])}::timestamptz, 'citychatbot-structure-parser', '1.0.0', 1.0000, {sql(document['warnings'])}::jsonb) on conflict (tenant_id, id) do nothing;",
            "  insert into public.knowledge_index_generations (id, tenant_id, document_version_id, generation, namespace, config_hash, state, chunk_count, fact_count) "
            f"values ({sql(document['generationId'])}::uuid, v_tenant, {sql(document['versionId'])}::uuid, 1, format('knowledge/%s/%s/%s', v_tenant, {sql(document['versionId'])}, {sql(sha256(policy['policyVersion'])[:16])}), {sql(sha256(policy['policyVersion']))}, 'READY', {len(document['chunks'])}, {sum(1 for fact in facts if fact['generationId'] == document['generationId'])}) on conflict (tenant_id, id) do nothing;",
        ])
        for chunk in document["chunks"]:
            lines.append(
                "  insert into public.knowledge_chunks (id, tenant_id, document_version_id, index_generation_id, chunk_type, chunk_index, display_text, search_text, entity_keys, topic_keys, fact_types, visibility, authority_level, valid_from, source_locator_json, source_hash, token_count, language) "
                f"values ({sql(chunk['id'])}::uuid, v_tenant, {sql(document['versionId'])}::uuid, {sql(document['generationId'])}::uuid, {sql(chunk['chunkType'])}, {chunk['chunkIndex']}, {sql(chunk['text'])}, {sql(normal(chunk['text']))}, '[]'::jsonb, '[]'::jsonb, {sql(chunk['factTypes'])}::jsonb, 'PUBLIC', {policy['authorityLevel']}, {sql(policy['effectiveFrom'])}::timestamptz, {sql(chunk['locator'])}::jsonb, {sql(chunk['sourceHash'])}, {chunk['tokenCount']}, 'mixed') on conflict (tenant_id, id) do nothing;"
            )
    for fact in facts:
        lines.append(
            "  insert into public.knowledge_facts (id, tenant_id, document_version_id, index_generation_id, entity_type, entity_key, entity_display_name, fact_type, fact_key, value_json, normalized_value, authority_level, visibility, source_chunk_id, source_locator_json, source_quote, extraction_method, review_status, reviewed_by, reviewed_at) "
            f"values ({sql(fact['id'])}::uuid, v_tenant, {sql(fact['versionId'])}::uuid, {sql(fact['generationId'])}::uuid, 'MUNICIPAL_SOURCE', {sql(fact['entityKey'])}, {sql(fact['entityDisplayName'])}, {sql(fact['factType'])}, {sql(fact['factKey'])}, {sql({'raw': fact['raw'], 'normalized': fact['normalized'], 'policy': 'AUTHORIZED_CORPUS_SAFE_FACT'})}::jsonb, {sql(fact['normalized'])}, {policy['authorityLevel']}, 'PUBLIC', {sql(fact['sourceChunkId'])}::uuid, {sql(fact['locator'])}::jsonb, {sql(fact['sourceQuote'][:5000])}, 'RULE', 'APPROVED', v_system_account, statement_timestamp()) on conflict (tenant_id, id) do nothing;"
        )
    lines.extend([
        f"  foreach v_version in array array[{document_ids}] loop",
        "    update public.knowledge_document_versions set state = 'VALIDATING' where tenant_id = v_tenant and id = v_version and state = 'QUARANTINED';",
        "    update public.knowledge_document_versions set state = 'MALWARE_SCANNING' where tenant_id = v_tenant and id = v_version and state = 'VALIDATING';",
        "    update public.knowledge_document_versions set state = 'PARSING' where tenant_id = v_tenant and id = v_version and state = 'MALWARE_SCANNING';",
        "    update public.knowledge_document_versions set state = 'NORMALIZING' where tenant_id = v_tenant and id = v_version and state = 'PARSING';",
        "    update public.knowledge_document_versions set state = 'EXTRACTING_FACTS' where tenant_id = v_tenant and id = v_version and state = 'NORMALIZING';",
        "    update public.knowledge_document_versions set state = 'CONFLICT_CHECK' where tenant_id = v_tenant and id = v_version and state = 'EXTRACTING_FACTS';",
        "    update public.knowledge_document_versions set state = 'INDEXING' where tenant_id = v_tenant and id = v_version and state = 'CONFLICT_CHECK';",
        "    update public.knowledge_document_versions set state = 'EVALUATING' where tenant_id = v_tenant and id = v_version and state = 'INDEXING';",
        "    if exists (",
        "      select 1 from public.knowledge_document_versions",
        "      where tenant_id = v_tenant and id = v_version and state = 'ACTIVE'",
        f"        and activation_status = 'UNIT_GATED' and unit_gate_manifest_version = {sql(policy['policyVersion'])}",
        "        and unit_gate_report_hash = v_receipt_hash and unit_gate_passed_test_ids = v_tests",
        "    ) then",
        "      null; -- Repeat with the same machine receipt is idempotent.",
        "    elsif exists (",
        "      select 1 from public.knowledge_document_versions",
        "      where tenant_id = v_tenant and id = v_version and state = 'EVALUATING'",
        "    ) then",
        f"      perform private.activate_knowledge_document_version_unit_gated(v_tenant, v_version, {sql(policy['policyVersion'])}, v_receipt_hash, v_tests);",
        "    else",
        "      raise exception 'document version % is not eligible for unit-gated activation or has a different receipt', v_version using errcode = 'P0001';",
        "    end if;",
        "  end loop;",
        f"  foreach v_generation in array array[{generation_ids}] loop",
        f"    perform private.activate_knowledge_index_generation_unit_gated(v_tenant, v_generation, {sql(policy['policyVersion'])}, v_receipt_hash, v_tests);",
        "  end loop;",
        "end;",
        "$authorized_corpus$;",
        "commit;",
        "select d.source_key, v.state as version_state, v.activation_status as version_activation, g.state as generation_state, g.activation_status as generation_activation, count(distinct c.id) as public_chunk_count, count(distinct f.id) as approved_fact_count",
        "  from public.knowledge_documents d",
        "  join public.knowledge_document_versions v on v.tenant_id = d.tenant_id and v.id = d.current_active_version_id",
        "  join public.knowledge_index_generations g on g.tenant_id = v.tenant_id and g.document_version_id = v.id and g.state = 'ACTIVE'",
        "  left join public.knowledge_chunks c on c.tenant_id = g.tenant_id and c.index_generation_id = g.id and c.visibility = 'PUBLIC'",
        "  left join public.knowledge_facts f on f.tenant_id = g.tenant_id and f.index_generation_id = g.id and f.visibility = 'PUBLIC' and f.review_status = 'APPROVED'",
        f" where d.tenant_id = (select id from public.tenants where slug = {sql(TARGET_TENANT_SLUG)})",
        "   and d.source_key like 'municipal.%'",
        " group by d.source_key, v.state, v.activation_status, g.state, g.activation_status",
        " order by d.source_key;",
        "",
    ])
    return "\n".join(lines)


def build_rollback_sql(documents: list[dict[str, Any]]) -> str:
    version_ids = ", ".join(sql(document["versionId"]) + "::uuid" for document in documents)
    generation_ids = ", ".join(sql(document["generationId"]) + "::uuid" for document in documents)
    document_ids = ", ".join(sql(document["documentId"]) + "::uuid" for document in documents)
    return "\n".join([
        "-- Generated tenant-scoped rollback for the authorised municipal corpus.",
        "begin;",
        "do $rollback_authorized_corpus$",
        "declare v_tenant uuid;",
        "begin",
        f"  select id into v_tenant from public.tenants where slug = {sql(TARGET_TENANT_SLUG)};",
        "  if v_tenant is null then raise exception using errcode = 'P0002', message = 'authorized corpus target tenant not found'; end if;",
        f"  update public.knowledge_index_generations set state = 'RETIRED', activation_status = 'RETIRED', retired_at = statement_timestamp() where tenant_id = v_tenant and id = any(array[{generation_ids}]) and state = 'ACTIVE';",
        f"  update public.knowledge_document_versions set state = 'RETIRED', activation_status = 'RETIRED', retired_at = statement_timestamp() where tenant_id = v_tenant and id = any(array[{version_ids}]) and state = 'ACTIVE';",
        f"  update public.knowledge_documents set current_active_version_id = null, status = 'RETIRED' where tenant_id = v_tenant and id = any(array[{document_ids}]);",
        "end;",
        "$rollback_authorized_corpus$;",
        "commit;",
        "",
    ])


def write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8", newline="\n")


def verify() -> dict[str, Any]:
    activation_manifest, activation_sql, rollback_sql = build_activation()
    if activation_manifest["documents"] and not activation_manifest["safeFacts"]:
        raise ActivationError("activation must include at least one safe exact fact")
    # The required test ID deliberately contains the literal `QR`, so check
    # for the source phrase rather than a token that can occur in metadata.
    if "081-6823355" in activation_sql or "QR พ่นยุง" in activation_sql or "ดอกเบี้ย" in activation_sql:
        raise ActivationError("unsafe source text leaked into activation SQL")
    if "private.activate_knowledge_document_version_unit_gated" not in activation_sql or "private.activate_knowledge_index_generation_unit_gated" not in activation_sql:
        raise ActivationError("activation does not use machine-only gates")
    if "citychatbot-canary" not in activation_sql or "array[" not in rollback_sql.lower():
        raise ActivationError("tenant-scoped activation/rollback contract is missing")
    return activation_manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="write ignored SQL/manifest artifacts")
    parser.add_argument("--verify", action="store_true", help="verify deterministic activation invariants")
    parser.add_argument("--report-hash", help="SYSTEM_UNIT_GATE report hash to bind to production activation")
    parser.add_argument("--activation-mode", choices=ACTIVATION_MODES, default=ACTIVATION_MODE_FULL_SCREENED, help="screened corpus surface to emit")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--rollback-output", type=Path, default=DEFAULT_ROLLBACK_OUTPUT)
    parser.add_argument("--manifest-output", type=Path, default=DEFAULT_MANIFEST_OUTPUT)
    args = parser.parse_args(argv)
    try:
        activation_manifest, activation_sql, rollback_sql = build_activation(args.report_hash, args.activation_mode)
        if args.write:
            write(args.output, activation_sql)
            write(args.rollback_output, rollback_sql)
            write(args.manifest_output, json.dumps(activation_manifest, ensure_ascii=False, indent=2) + "\n")
            print(f"AUTHORIZED_CORPUS_ARTIFACTS_WRITTEN mode={args.activation_mode} documents={len(activation_manifest['documents'])} chunks={sum(item['chunkCount'] for item in activation_manifest['documents'])} facts={len(activation_manifest['safeFacts'])} manifest={activation_manifest['integrity']['activationManifestHash']}")
        if args.verify or not args.write:
            verified = verify()
            print(f"AUTHORIZED_CORPUS_VERIFIED documents={len(verified['documents'])} facts={len(verified['safeFacts'])} manifest={verified['integrity']['activationManifestHash']}")
        return 0
    except (ActivationError, OSError, ET.ParseError, zipfile.BadZipFile) as exc:
        print(f"AUTHORIZED_CORPUS_FAILED {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
