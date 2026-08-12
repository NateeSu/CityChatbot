import json
import tempfile
import unittest
from pathlib import Path

try:
    from e2e_certification import E2ECertificationError, canonical_json, write_report
except ModuleNotFoundError:
    from scripts.e2e_certification import E2ECertificationError, canonical_json, write_report


class E2ECertificationTests(unittest.TestCase):
    def test_canonical_json_is_stable(self) -> None:
        self.assertEqual(canonical_json({"b": 2, "a": 1}), canonical_json({"a": 1, "b": 2}))

    def test_report_write_is_immutable(self) -> None:
        report = {"schemaVersion": 1, "taskId": "P8-E2E-001", "reportSha256": "abc"}
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "e2e.json"
            write_report(path, report)
            write_report(path, report)
            altered = dict(report, reportSha256="changed")
            with self.assertRaisesRegex(E2ECertificationError, "immutable"):
                write_report(path, altered)

    def test_report_is_json_object(self) -> None:
        report = {"schemaVersion": 1, "taskId": "P8-E2E-001", "reportSha256": "abc"}
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "e2e.json"
            write_report(path, report)
            self.assertIsInstance(json.loads(path.read_text(encoding="utf-8")), dict)


if __name__ == "__main__":
    unittest.main()

