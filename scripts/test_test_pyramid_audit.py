import tempfile
import unittest
from pathlib import Path

try:
    from test_pyramid_audit import audit_test_sources, canonical_json, forbidden_markers
except ModuleNotFoundError:
    from scripts.test_pyramid_audit import audit_test_sources, canonical_json, forbidden_markers


class TestPyramidAuditTests(unittest.TestCase):
    def test_clean_test_source_has_no_forbidden_markers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "sample.test.ts"
            path.write_text('describe("sample", () => { it("works", () => {}) });\n', encoding="utf-8")
            self.assertEqual(forbidden_markers(path), [])

    def test_forbidden_marker_is_reported_with_line(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "sample.test.ts"
            path.write_text('describe' + '.only' + '("focused", () => {})\n', encoding="utf-8")
            self.assertEqual(forbidden_markers(path)[0]["line"], 1)

    def test_repository_inventory_is_clean(self) -> None:
        root = Path(__file__).resolve().parents[1]
        report = audit_test_sources(root)
        self.assertGreater(report["fileCount"], 0)
        self.assertEqual(report["focusedSkippedOrQuarantinedCount"], 0)

    def test_canonical_json_is_stable(self) -> None:
        self.assertEqual(canonical_json({"b": 2, "a": 1}), canonical_json({"a": 1, "b": 2}))


if __name__ == "__main__":
    unittest.main()
