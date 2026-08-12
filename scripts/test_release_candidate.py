import json
import tempfile
import unittest
from pathlib import Path

try:
    from release_candidate import ReleaseCandidateError, build_candidate, canonical_json, verify_candidate, write_candidate
except ModuleNotFoundError:
    from scripts.release_candidate import ReleaseCandidateError, build_candidate, canonical_json, verify_candidate, write_candidate


class ReleaseCandidateTests(unittest.TestCase):
    def test_current_workspace_builds_metadata_only_candidate(self) -> None:
        root = Path(__file__).resolve().parents[1]
        candidate = build_candidate(root, rc_date="2026-08-12", source_commit=None, staging_status="NOT_AVAILABLE")

        self.assertEqual(candidate["schemaVersion"], 1)
        self.assertTrue(str(candidate["rcId"]).startswith("citychatbot-rc-2026-08-12-"))
        self.assertEqual(verify_candidate(root, candidate), candidate["rcSha256"])
        source_commit = candidate["source"]["commit"]
        source_state = candidate["source"]["state"]
        if source_commit is None:
            self.assertEqual(source_state, "workspace-snapshot")
        else:
            self.assertRegex(str(source_commit), r"^[0-9a-f]{7,64}$")
            self.assertEqual(source_state, "commit-pinned")
        self.assertFalse(candidate["environmentSchema"]["valuesIncluded"])
        self.assertNotIn("sk-or-v1-", json.dumps(candidate))

    def test_require_staging_is_fail_closed(self) -> None:
        root = Path(__file__).resolve().parents[1]
        candidate = build_candidate(root, rc_date="2026-08-12", staging_status="NOT_AVAILABLE")

        with self.assertRaisesRegex(ReleaseCandidateError, "staging artifact is not verified"):
            verify_candidate(root, candidate, require_staging=True)

    def test_tamper_and_immutable_write_are_rejected(self) -> None:
        root = Path(__file__).resolve().parents[1]
        candidate = build_candidate(root, rc_date="2026-08-12", staging_status="NOT_AVAILABLE")
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "release-candidate.json"
            write_candidate(output, candidate)
            write_candidate(output, candidate)
            altered = dict(candidate)
            altered["flags"] = dict(candidate["flags"], productionTraffic="enabled")
            with self.assertRaisesRegex(ReleaseCandidateError, "immutable"):
                write_candidate(output, altered)
        altered = dict(candidate)
        altered["rcSha256"] = "0" * 64
        with self.assertRaisesRegex(ReleaseCandidateError, "digest mismatch"):
            verify_candidate(root, altered)

    def test_canonical_digest_is_order_independent(self) -> None:
        self.assertEqual(canonical_json({"b": 2, "a": 1}), canonical_json({"a": 1, "b": 2}))


if __name__ == "__main__":
    unittest.main()
