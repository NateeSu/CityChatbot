"""Fail-closed repository scan for committed provider credentials."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IGNORED_DIRS = {".git", ".next", "dist", "node_modules", "__pycache__", "coverage"}
TOKEN_PREFIX = "".join(("sk", "-", "or", "-", "v1", "-"))
SERVICE_ROLE_KEY = "_".join(("SUPABASE", "SERVICE", "ROLE", "KEY"))

PATTERNS = (
    ("openrouter-token", re.compile(re.escape(TOKEN_PREFIX) + r"[A-Za-z0-9]{20,}")),
    (
        "supabase-service-role-assignment",
        re.compile(re.escape(SERVICE_ROLE_KEY) + r"\s*=\s*\S+"),
    ),
)


def iter_source_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        if not path.is_file():
            continue
        if path.suffix.lower() in {".md", ".json", ".js", ".mjs", ".ts", ".tsx", ".py", ".sql", ".yml", ".yaml", ".env"}:
            files.append(path)
    return files


def main() -> int:
    findings: list[tuple[str, str, int]] = []
    for path in iter_source_files():
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for line_number, line in enumerate(lines, start=1):
            for label, pattern in PATTERNS:
                if pattern.search(line):
                    findings.append((label, str(path.relative_to(ROOT)), line_number))
    if findings:
        for label, path, line_number in findings:
            print(f"SECRET_SCAN_FAIL {label} {path}:{line_number}")
        return 1
    print("SECRET_SCAN_CLEAN")
    return 0


if __name__ == "__main__":
    sys.exit(main())
