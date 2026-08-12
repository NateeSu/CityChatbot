"""Create and verify a deterministic release manifest for the web artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "artifacts" / "release-manifest.json"
DEFAULT_PATHS = (
    Path("package.json"),
    Path("pnpm-lock.yaml"),
    Path("apps/web/package.json"),
    Path("apps/web/.next/BUILD_ID"),
    Path("artifacts/sbom.cdx.json"),
)


class ReleaseManifestError(ValueError):
    pass


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_relative_path(root: Path, candidate: Path) -> Path:
    absolute = (root / candidate).resolve()
    try:
        relative = absolute.relative_to(root.resolve())
    except ValueError as error:
        raise ReleaseManifestError(f"artifact path escapes repository: {candidate}") from error
    if ".." in relative.parts:
        raise ReleaseManifestError(f"artifact path traversal: {candidate}")
    return relative


def build_manifest(root: Path, paths: Iterable[Path]) -> dict[str, object]:
    root = root.resolve()
    entries: list[dict[str, object]] = []
    for candidate in paths:
        relative = safe_relative_path(root, candidate)
        path = root / relative
        if not path.is_file():
            raise ReleaseManifestError(f"required release artifact is missing: {relative.as_posix()}")
        entries.append({
            "path": relative.as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        })
    entries.sort(key=lambda item: str(item["path"]))
    if len({str(item["path"]) for item in entries}) != len(entries):
        raise ReleaseManifestError("release artifact paths must be unique")
    document: dict[str, object] = {
        "schemaVersion": 1,
        "artifact": "citychatbot-web",
        "files": entries,
    }
    canonical = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    document["manifestSha256"] = hashlib.sha256(canonical).hexdigest()
    return document


def write_manifest(path: Path, document: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def verify_manifest(root: Path, document: dict[str, object]) -> str:
    if document.get("schemaVersion") != 1 or document.get("artifact") != "citychatbot-web":
        raise ReleaseManifestError("unsupported release manifest")
    files = document.get("files")
    recorded_digest = document.get("manifestSha256")
    if not isinstance(files, list) or not isinstance(recorded_digest, str):
        raise ReleaseManifestError("release manifest is incomplete")
    without_digest = {key: value for key, value in document.items() if key != "manifestSha256"}
    canonical = json.dumps(without_digest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    expected_digest = hashlib.sha256(canonical).hexdigest()
    if recorded_digest != expected_digest:
        raise ReleaseManifestError("release manifest digest mismatch")
    seen: set[str] = set()
    for entry in files:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str) or not isinstance(entry.get("sha256"), str):
            raise ReleaseManifestError("release manifest file entry is invalid")
        relative = safe_relative_path(root, Path(entry["path"]))
        if relative.as_posix() in seen:
            raise ReleaseManifestError("release manifest contains duplicate paths")
        seen.add(relative.as_posix())
        path = root / relative
        if not path.is_file() or sha256_file(path) != entry["sha256"] or path.stat().st_size != entry.get("bytes"):
            raise ReleaseManifestError(f"release artifact changed: {relative.as_posix()}")
    return recorded_digest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", metavar="MANIFEST", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--path", action="append", type=Path, dest="paths")
    args = parser.parse_args()
    try:
        if args.verify:
            manifest_path = args.verify.resolve()
            document = json.loads(manifest_path.read_text(encoding="utf-8"))
            digest = verify_manifest(ROOT, document)
            print(f"RELEASE_MANIFEST_VERIFIED {manifest_path.relative_to(ROOT)} digest={digest}")
            return 0
        paths = args.paths or DEFAULT_PATHS
        document = build_manifest(ROOT, paths)
        write_manifest(args.output, document)
        print(f"RELEASE_MANIFEST_WRITTEN {args.output.relative_to(ROOT)} files={len(document['files'])} digest={document['manifestSha256']}")
        return 0
    except (OSError, ReleaseManifestError, json.JSONDecodeError) as error:
        print(f"RELEASE_MANIFEST_FAILED {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
