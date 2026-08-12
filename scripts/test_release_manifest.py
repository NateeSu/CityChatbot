import json
import tempfile
import unittest
from pathlib import Path

from scripts.release_manifest import ReleaseManifestError, build_manifest, verify_manifest, write_manifest


class ReleaseManifestTests(unittest.TestCase):
    def test_manifest_is_deterministic_and_detects_changed_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "dist").mkdir()
            (root / "dist/app.js").write_text("immutable", encoding="utf-8")
            first = build_manifest(root, [Path("dist/app.js")])
            second = build_manifest(root, [Path("dist/app.js")])
            self.assertEqual(first, second)
            manifest_path = root / "manifest.json"
            write_manifest(manifest_path, first)
            self.assertEqual(verify_manifest(root, json.loads(manifest_path.read_text(encoding="utf-8"))), first["manifestSha256"])
            (root / "dist/app.js").write_text("changed", encoding="utf-8")
            with self.assertRaises(ReleaseManifestError):
                verify_manifest(root, first)

    def test_manifest_rejects_missing_or_outside_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(ReleaseManifestError):
                build_manifest(root, [Path("missing.js")])
            with self.assertRaises(ReleaseManifestError):
                build_manifest(root, [Path("../outside.js")])


if __name__ == "__main__":
    unittest.main()
