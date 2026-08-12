import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from scripts.unit_gate import UnitGateError, run_task_gate, validate_manifest


UNIT_TEST_IDS = (
    "AUTO-GATE-UNIT-MANIFEST",
    "AUTO-GATE-UNIT-PASS-CLOSE-QUEUE",
    "AUTO-GATE-UNIT-IDEMPOTENCY",
    "AUTO-GATE-UNIT-FAIL-CLOSED",
    "AUTO-GATE-UNIT-NO-APPROVAL",
)


def _manifest(*, command: str = "python -c \"print('PASS')\"") -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "manifestVersion": "task-unit-gates.v1",
        "tasks": [
            {
                "taskId": "TASK-001",
                "state": "ready",
                "requiredCommands": [command],
                "requiredTestIds": list(UNIT_TEST_IDS),
                "onPass": ["CLOSE_TASK", "QUEUE_NEXT_TASK"],
            },
            {
                "taskId": "TASK-002",
                "state": "planned",
                "requiredCommands": [],
                "requiredTestIds": [],
                "onPass": [],
            },
        ],
    }


class UnitGateTests(unittest.TestCase):
    def test_manifest_validation_requires_exact_plan_coverage(self) -> None:
        document = _manifest()
        entries = validate_manifest(document, ["TASK-001", "TASK-002"])
        self.assertEqual(set(entries), {"TASK-001", "TASK-002"})
        with self.assertRaises(UnitGateError):
            validate_manifest(document, ["TASK-001"])

    def test_manifest_rejects_duplicate_or_unknown_actions(self) -> None:
        document = _manifest()
        document["tasks"][0]["requiredTestIds"] = ["DUPLICATE", "DUPLICATE"]
        with self.assertRaises(UnitGateError):
            validate_manifest(document, ["TASK-001", "TASK-002"])
        document = _manifest()
        document["tasks"][0]["onPass"] = ["APPROVE"]
        with self.assertRaises(UnitGateError):
            validate_manifest(document, ["TASK-001", "TASK-002"])

    def test_pass_closes_task_writes_hash_and_queues_next(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "evidence").mkdir()
            plan = root / "plan.md"
            plan.write_text("- [ ] `TASK-001` first\n  - สถานะ: IN_PROGRESS\n- [ ] `TASK-002` next\n  - สถานะ: TODO\n", encoding="utf-8")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps(_manifest(), ensure_ascii=False), encoding="utf-8")
            result = run_task_gate(
                root,
                manifest,
                plan,
                "TASK-001",
                revision="revision-1",
                command_runner=lambda _command: SimpleNamespace(returncode=0, stdout="PASS\n", stderr=""),
            )
            self.assertEqual(result["status"], "PASSED")
            self.assertEqual(result["passCount"], len(UNIT_TEST_IDS))
            self.assertEqual(len(result["reportHash"]), 64)
            self.assertIn("- [x] `TASK-001`", plan.read_text(encoding="utf-8"))
            self.assertIn("AUTO_CLOSED_UNIT_GREEN", plan.read_text(encoding="utf-8"))
            queue = json.loads((root / "evidence" / "automation-queue.json").read_text(encoding="utf-8"))
            self.assertEqual(queue["nextTaskId"], "TASK-002")
            event = (root / "evidence" / "automation-events.jsonl").read_text(encoding="utf-8")
            self.assertIn("task.unit_gate_passed", event)
            report = json.loads((root / "evidence" / "TASK-001" / "unit-gate-report.json").read_text(encoding="utf-8"))
            self.assertEqual(report["reportHash"], result["reportHash"])

    def test_second_run_is_idempotent_without_duplicate_side_effects(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "evidence").mkdir()
            plan = root / "plan.md"
            plan.write_text("- [ ] `TASK-001` first\n  - สถานะ: TODO\n", encoding="utf-8")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps(_manifest().copy() | {"tasks": [_manifest()["tasks"][0]]}, ensure_ascii=False), encoding="utf-8")
            calls = 0

            def command(_command: str) -> SimpleNamespace:
                nonlocal calls
                calls += 1
                return SimpleNamespace(returncode=0, stdout="PASS\n", stderr="")

            first = run_task_gate(root, manifest, plan, "TASK-001", revision="revision-1", command_runner=command)
            second = run_task_gate(root, manifest, plan, "TASK-001", revision="revision-1", command_runner=command)
            self.assertEqual(first["status"], "PASSED")
            self.assertEqual(second["status"], "ALREADY_PASSED")
            self.assertEqual(calls, 1)
            self.assertEqual(len((root / "evidence" / "automation-events.jsonl").read_text(encoding="utf-8").splitlines()), 1)

    def test_failure_is_fail_closed_and_detects_skipped_marker(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "evidence").mkdir()
            plan = root / "plan.md"
            plan.write_text("- [ ] `TASK-001` first\n  - สถานะ: IN_PROGRESS\n- [ ] `TASK-002` next\n  - สถานะ: TODO\n", encoding="utf-8")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps(_manifest(), ensure_ascii=False), encoding="utf-8")
            result = run_task_gate(
                root,
                manifest,
                plan,
                "TASK-001",
                revision="revision-1",
                command_runner=lambda _command: SimpleNamespace(returncode=0, stdout="skipped 1\n", stderr=""),
            )
            self.assertEqual(result["status"], "FAILED")
            self.assertIn("- [ ] `TASK-001`", plan.read_text(encoding="utf-8"))
            self.assertNotIn("AUTO_CLOSED_UNIT_GREEN", plan.read_text(encoding="utf-8"))

    def test_external_actions_are_deferred_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "evidence").mkdir()
            plan = root / "plan.md"
            plan.write_text("- [ ] `TASK-001` first\n  - สถานะ: TODO\n- [ ] `TASK-002` next\n  - สถานะ: TODO\n", encoding="utf-8")
            document = _manifest()
            document["tasks"][0]["onPass"] = ["CLOSE_TASK", "ENABLE_CHAT", "DEPLOY_PRODUCTION", "QUEUE_NEXT_TASK"]
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
            result = run_task_gate(
                root,
                manifest,
                plan,
                "TASK-001",
                revision="revision-1",
                command_runner=lambda _command: SimpleNamespace(returncode=0, stdout="PASS\n", stderr=""),
            )
            actions = {action["action"]: action for action in result["actions"]}
            self.assertEqual(actions["ENABLE_CHAT"]["status"], "DEFERRED_FAIL_CLOSED")
            self.assertEqual(actions["DEPLOY_PRODUCTION"]["status"], "DEFERRED_FAIL_CLOSED")
            self.assertEqual(json.loads(manifest.read_text(encoding="utf-8"))["tasks"][0]["state"], "completed")


if __name__ == "__main__":
    unittest.main()
