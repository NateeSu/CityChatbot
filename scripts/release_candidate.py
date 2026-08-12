"""Build and verify an immutable, metadata-only release-candidate manifest.

The manifest pins the local artifact and all release inputs without copying
secrets, PII, prompts, or corpus contents into the manifest.  Provider target,
staging and signing state are explicit values so an incomplete external setup
cannot be mistaken for a production-ready release.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable, Sequence

try:
    from release_manifest import ReleaseManifestError, verify_manifest
except ImportError:  # pragma: no cover - supports package-style imports
    from scripts.release_manifest import ReleaseManifestError, verify_manifest


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "artifacts" / "release-candidate.json"
EXCLUDED_DIRS = {".git", ".next", ".vercel", "artifacts", "coverage", "evidence", "node_modules", "__pycache__"}
_service_role_assignment = "_".join(("SUPABASE", "SERVICE", "ROLE", "KEY")) + "="
SECRET_VALUE_RE = re.compile(
    r"(?:sk-or-v1-|Bearer\s+|" + re.escape(_service_role_assignment) + r"|LINE_CHANNEL_SECRET=)",
    re.IGNORECASE,
)
HEX_COMMIT_RE = re.compile(r"^[0-9a-f]{7,64}$", re.IGNORECASE)
ENV_KEY_RE = re.compile(r"^([A-Z][A-Z0-9_]*)=")
ENV_SCHEMA_KEY_RE = re.compile(r"\b([A-Z][A-Z0-9_]+)\s*:")


class ReleaseCandidateError(ValueError):
    """Raised when the candidate is incomplete, unsafe or tampered with."""


def canonical_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_relative_path(root: Path, candidate: Path) -> Path:
    root = root.resolve()
    absolute = (root / candidate).resolve()
    try:
        relative = absolute.relative_to(root)
    except ValueError as error:
        raise ReleaseCandidateError(f"release candidate path escapes repository: {candidate}") from error
    if ".." in relative.parts:
        raise ReleaseCandidateError(f"release candidate path traversal: {candidate}")
    return relative


def file_entry(root: Path, candidate: Path) -> dict[str, object]:
    relative = safe_relative_path(root, candidate)
    path = root / relative
    if not path.is_file():
        raise ReleaseCandidateError(f"release candidate input is missing: {relative.as_posix()}")
    return {"path": relative.as_posix(), "bytes": path.stat().st_size, "sha256": sha256_file(path)}


def unique_files(root: Path, candidates: Iterable[Path]) -> list[Path]:
    seen: set[str] = set()
    paths: list[Path] = []
    for candidate in candidates:
        relative = safe_relative_path(root, candidate)
        key = relative.as_posix()
        if key in seen:
            continue
        seen.add(key)
        paths.append(root / relative)
    return paths


def directory_files(root: Path, directory: Path) -> list[Path]:
    base = (root / directory).resolve()
    if not base.exists():
        return []
    if not base.is_dir():
        raise ReleaseCandidateError(f"release candidate input is not a directory: {directory}")
    files: list[Path] = []
    for path in base.rglob("*"):
        relative_parts = path.relative_to(root).parts
        if any(part in EXCLUDED_DIRS for part in relative_parts):
            continue
        if path.name.endswith(".tsbuildinfo") or path.name.endswith(".log"):
            continue
        try:
            if path.is_file():
                files.append(path)
        except OSError as error:
            raise ReleaseCandidateError(f"cannot inspect release candidate input: {path}") from error
    return files


def hash_group(root: Path, paths: Iterable[Path]) -> dict[str, object]:
    entries = [file_entry(root, path) for path in unique_files(root, paths)]
    entries.sort(key=lambda entry: str(entry["path"]))
    return {"files": entries, "sha256": sha256_bytes(canonical_json(entries))}


def read_text(root: Path, relative: str) -> str:
    path = root / safe_relative_path(root, Path(relative))
    if not path.is_file():
        raise ReleaseCandidateError(f"release candidate input is missing: {relative}")
    return path.read_text(encoding="utf-8")


def detect_source_commit(root: Path, explicit: str | None) -> str | None:
    candidate = explicit or os.environ.get("SOURCE_COMMIT")
    if candidate:
        if not HEX_COMMIT_RE.fullmatch(candidate):
            raise ReleaseCandidateError("SOURCE_COMMIT must be a hexadecimal commit identifier")
        return candidate.lower()
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    value = result.stdout.strip()
    return value.lower() if HEX_COMMIT_RE.fullmatch(value) else None


def env_schema(root: Path) -> dict[str, object]:
    example = read_text(root, ".env.example")
    schema = read_text(root, "packages/config/src/env.ts")
    example_keys = sorted({match.group(1) for match in map(ENV_KEY_RE.match, example.splitlines()) if match})
    schema_keys = sorted({match.group(1) for match in ENV_SCHEMA_KEY_RE.finditer(schema)})
    return {
        "files": hash_group(root, [root / ".env.example", root / "packages/config/src/env.ts"]),
        "serverAndPublicKeys": sorted(set(example_keys) | set(schema_keys)),
        "valuesIncluded": False,
        "productionMinimum": ["CITYCHATBOT_ENV", "APP_BASE_URL"],
    }


def release_manifest_metadata(root: Path) -> dict[str, object]:
    manifest_path = root / "artifacts/release-manifest.json"
    if not manifest_path.is_file():
        raise ReleaseCandidateError("release manifest is missing; run pnpm release:manifest first")
    try:
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ReleaseCandidateError("release manifest is not valid JSON") from error
    try:
        digest = verify_manifest(root, document)
    except ReleaseManifestError as error:
        raise ReleaseCandidateError(f"release manifest cannot be verified: {error}") from error
    sbom_path = root / "artifacts/sbom.cdx.json"
    if not sbom_path.is_file():
        raise ReleaseCandidateError("SBOM is missing")
    return {
        "path": "artifacts/release-manifest.json",
        "sha256": sha256_file(manifest_path),
        "manifestSha256": digest,
        "sbomPath": "artifacts/sbom.cdx.json",
        "sbomSha256": sha256_file(sbom_path),
    }


def source_group(root: Path) -> dict[str, object]:
    roots = [".github", "apps", "docs", "packages", "scripts", "supabase"]
    paths: list[Path] = []
    for directory in roots:
        paths.extend(directory_files(root, Path(directory)))
    paths.extend(
        root / name
        for name in (
            ".env.example",
            "fullspec.md",
            "package.json",
            "pnpm-lock.yaml",
            "pnpm-workspace.yaml",
            "tsconfig.base.json",
            "vitest.config.ts",
        )
    )
    return hash_group(root, paths)


def provider_versions(root: Path) -> dict[str, object]:
    package = json.loads(read_text(root, "package.json"))
    web_package = json.loads(read_text(root, "apps/web/package.json"))
    return {
        "node": read_text(root, ".node-version").strip(),
        "pnpm": package.get("packageManager", "external-config"),
        "next": web_package.get("dependencies", {}).get("next", "external-config"),
        "openrouter": "external-configured-provider",
        "line": "external-configured-provider",
        "supabase": "external-configured-provider",
    }


def build_candidate(
    root: Path,
    *,
    rc_date: str | None = None,
    source_commit: str | None = None,
    staging_status: str | None = None,
) -> dict[str, object]:
    root = root.resolve()
    date_value = rc_date or os.environ.get("CITYCHATBOT_RC_DATE") or dt.datetime.now(dt.UTC).date().isoformat()
    try:
        parsed_date = dt.date.fromisoformat(date_value)
    except ValueError as error:
        raise ReleaseCandidateError("rc date must be YYYY-MM-DD") from error

    release = release_manifest_metadata(root)
    source = source_group(root)
    migrations = hash_group(root, sorted((root / "supabase/migrations").glob("*.sql")))
    corpus = hash_group(root, directory_files(root, Path("doc_rag_test")))
    prompt = hash_group(root, list((root / "supabase/migrations").glob("*prompt*")) + directory_files(root, Path("packages/chat")))
    retrieval = hash_group(
        root,
        list((root / "supabase/migrations").glob("*retrieval*"))
        + list((root / "supabase/migrations").glob("*knowledge_index*"))
        + directory_files(root, Path("packages/knowledge")),
    )
    model = hash_group(
        root,
        list((root / "supabase/migrations").glob("*ai_model*"))
        + list((root / "supabase/migrations").glob("*ai_chat*"))
        + directory_files(root, Path("packages/ai-gateway")),
    )
    changelog = hash_group(root, directory_files(root, Path("docs/operations")))
    build_id = read_text(root, "apps/web/.next/BUILD_ID").strip()
    commit = detect_source_commit(root, source_commit)
    status = staging_status or os.environ.get("CITYCHATBOT_RC_STAGING_STATUS") or "NOT_AVAILABLE"
    if status not in {"MATCH", "MISMATCH", "PENDING", "NOT_AVAILABLE"}:
        raise ReleaseCandidateError("staging status must be MATCH, MISMATCH, PENDING or NOT_AVAILABLE")

    candidate: dict[str, object] = {
        "schemaVersion": 1,
        "rcId": f"citychatbot-rc-{parsed_date.isoformat()}-{str(release['manifestSha256'])[:8]}-{str(source['sha256'])[:8]}",
        "createdDate": parsed_date.isoformat(),
        "source": {
            "commit": commit,
            "state": "commit-pinned" if commit else "workspace-snapshot",
            "sha256": source["sha256"],
            "workspaceTreeSha256": source["sha256"],
            "files": source["files"],
        },
        "artifact": {
            "name": "citychatbot-web",
            "buildId": build_id,
            "releaseManifest": release,
        },
        "sbom": {"path": release["sbomPath"], "sha256": release["sbomSha256"]},
        "migrations": migrations,
        "environmentSchema": env_schema(root),
        "flags": {
            "productionTraffic": "disabled-until-verified-deployment",
            "aiWithoutTrustedProviderConfig": "safe-handoff",
            "allowedEnvironments": ["local", "test", "staging", "production"],
        },
        "corpus": corpus,
        "index": retrieval,
        "model": model,
        "prompt": prompt,
        "retrieval": retrieval,
        "providerVersions": provider_versions(root),
        "changeLog": {
            "source": "plan.md and evidence/progress metadata",
            "inputs": changelog,
        },
        "provenance": {
            "buildCommand": "pnpm test:all",
            "buildArtifactPresent": True,
            "releaseManifestVerified": True,
            "stagingVerification": {"status": status, "externalTargetRequired": status != "MATCH"},
        },
        "signature": {
            "type": "detached-content-integrity",
            "algorithm": "SHA-256",
            "status": "UNSIGNED_EXTERNAL_SIGNING_REQUIRED",
            "keyMaterialIncluded": False,
        },
    }
    if any(SECRET_VALUE_RE.search(value) for value in _string_values(candidate)):
        raise ReleaseCandidateError("release candidate metadata contains a secret-like value")
    candidate["rcSha256"] = sha256_bytes(canonical_json(candidate))
    return candidate


def _string_values(value: object) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _string_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from _string_values(item)


def verify_group(root: Path, group: object, label: str) -> None:
    if not isinstance(group, dict) or not isinstance(group.get("files"), list) or not isinstance(group.get("sha256"), str):
        raise ReleaseCandidateError(f"{label} group is incomplete")
    entries = group["files"]
    expected_group_digest = sha256_bytes(canonical_json(entries))
    if expected_group_digest != group["sha256"]:
        raise ReleaseCandidateError(f"{label} group digest mismatch")
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str) or not isinstance(entry.get("sha256"), str):
            raise ReleaseCandidateError(f"{label} file entry is invalid")
        relative = safe_relative_path(root, Path(entry["path"]))
        path = root / relative
        if not path.is_file() or path.stat().st_size != entry.get("bytes") or sha256_file(path) != entry["sha256"]:
            raise ReleaseCandidateError(f"{label} input changed: {relative.as_posix()}")


def verify_candidate(root: Path, document: dict[str, object], *, require_staging: bool = False) -> str:
    if document.get("schemaVersion") != 1 or not isinstance(document.get("rcId"), str):
        raise ReleaseCandidateError("unsupported release candidate manifest")
    recorded = document.get("rcSha256")
    if not isinstance(recorded, str):
        raise ReleaseCandidateError("release candidate digest is missing")
    without_digest = {key: value for key, value in document.items() if key != "rcSha256"}
    if sha256_bytes(canonical_json(without_digest)) != recorded:
        raise ReleaseCandidateError("release candidate digest mismatch")
    source = document.get("source")
    artifact = document.get("artifact")
    if not isinstance(source, dict) or not isinstance(artifact, dict):
        raise ReleaseCandidateError("release candidate source/artifact metadata is incomplete")
    for label in ("source", "migrations", "corpus", "index", "model", "prompt", "retrieval"):
        verify_group(root, document.get(label), label)
    release = artifact.get("releaseManifest")
    if not isinstance(release, dict) or not isinstance(release.get("path"), str):
        raise ReleaseCandidateError("release manifest reference is incomplete")
    manifest_path = root / safe_relative_path(root, Path(release["path"]))
    if not manifest_path.is_file():
        raise ReleaseCandidateError("referenced release manifest is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    actual_manifest_digest = verify_manifest(root, manifest)
    if actual_manifest_digest != release.get("manifestSha256") or sha256_file(manifest_path) != release.get("sha256"):
        raise ReleaseCandidateError("referenced release manifest changed")
    sbom = document.get("sbom")
    if not isinstance(sbom, dict) or not isinstance(sbom.get("path"), str):
        raise ReleaseCandidateError("SBOM reference is incomplete")
    sbom_path = root / safe_relative_path(root, Path(sbom["path"]))
    if not sbom_path.is_file() or sha256_file(sbom_path) != sbom.get("sha256"):
        raise ReleaseCandidateError("referenced SBOM changed")
    staging = document.get("provenance")
    staging_verification = staging.get("stagingVerification") if isinstance(staging, dict) else None
    status = staging_verification.get("status") if isinstance(staging_verification, dict) else None
    if status not in {"MATCH", "MISMATCH", "PENDING", "NOT_AVAILABLE"}:
        raise ReleaseCandidateError("staging verification status is invalid")
    if require_staging and status != "MATCH":
        raise ReleaseCandidateError(f"staging artifact is not verified: {status}")
    if any(SECRET_VALUE_RE.search(value) for value in _string_values(document)):
        raise ReleaseCandidateError("release candidate contains a secret-like value")
    return recorded


def write_candidate(path: Path, document: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ReleaseCandidateError("existing release candidate is unreadable; refusing overwrite") from error
        if existing != document:
            raise ReleaseCandidateError("release candidate already exists and is immutable")
        return
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", metavar="MANIFEST", type=Path)
    parser.add_argument("--require-staging", action="store_true")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--rc-date")
    parser.add_argument("--source-commit")
    args = parser.parse_args()
    try:
        if args.verify:
            path = args.verify.resolve()
            document = json.loads(path.read_text(encoding="utf-8"))
            digest = verify_candidate(ROOT, document, require_staging=args.require_staging)
            print(f"RELEASE_CANDIDATE_VERIFIED {path.relative_to(ROOT)} rcId={document['rcId']} digest={digest}")
            return 0
        document = build_candidate(ROOT, rc_date=args.rc_date, source_commit=args.source_commit)
        output = args.output.resolve()
        write_candidate(output, document)
        print(f"RELEASE_CANDIDATE_WRITTEN {output.relative_to(ROOT)} rcId={document['rcId']} digest={document['rcSha256']}")
        return 0
    except (OSError, ReleaseCandidateError, ReleaseManifestError, json.JSONDecodeError) as error:
        print(f"RELEASE_CANDIDATE_FAILED {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
