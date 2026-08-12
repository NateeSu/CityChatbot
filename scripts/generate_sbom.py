"""Generate a deterministic CycloneDX npm SBOM from the workspace dependency tree."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts" / "sbom.cdx.json"


def walk_dependencies(node: dict[str, Any], components: dict[str, dict[str, str]], fallback_name: str | None = None) -> None:
    name = node.get("name") or fallback_name
    version = node.get("version")
    if isinstance(name, str) and isinstance(version, str) and not node.get("private") and not name.startswith("@citychatbot/"):
        purl = f"pkg:npm/{name}@{version}"
        components[purl] = {"type": "library", "name": name, "version": version, "purl": purl}
    for dependency_name, dependency in node.get("dependencies", {}).items():
        if isinstance(dependency, dict):
            walk_dependencies(dependency, components, dependency_name)


def main() -> int:
    pnpm_command = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
    result = subprocess.run(
        [pnpm_command, "-r", "list", "--json", "--prod", "--depth=10"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    trees = json.loads(result.stdout)
    components: dict[str, dict[str, str]] = {}
    for tree in trees if isinstance(trees, list) else [trees]:
        if isinstance(tree, dict):
            walk_dependencies(tree, components)
    ordered = [components[key] for key in sorted(components)]
    digest = hashlib.sha256(json.dumps(ordered, sort_keys=True).encode("utf-8")).hexdigest()
    serial = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, digest)}"
    document = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": serial,
        "version": 1,
        "metadata": {
            "tools": [{"vendor": "CityChatbot", "name": "generate_sbom.py", "version": "1"}],
            "component": {"type": "application", "name": "citychatbot", "version": "0.1.0"},
        },
        "components": ordered,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"SBOM_WRITTEN {OUTPUT.relative_to(ROOT)} components={len(ordered)} digest={digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
