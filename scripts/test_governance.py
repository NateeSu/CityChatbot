import json
import tempfile
import unittest
from pathlib import Path

from scripts.governance import CASE_TYPES, GovernanceError, decide, load_and_validate, validate_responsibility_map


UNIT_TEST_IDS = (
    "P0-GOV-RESPONSIBILITY-MAP",
    "P0-GOV-REQUIREMENT-CHANGE",
    "P0-GOV-CONTRACT-CONFLICT",
    "P0-GOV-SECURITY-EXCEPTION",
    "P0-GOV-NO-APPROVAL-STATE",
)


class GovernanceTests(unittest.TestCase):
    def test_responsibility_map_covers_every_requirement_family_once(self) -> None:
        responsibilities, _ = load_and_validate()
        self.assertEqual(set(responsibilities["roles"]), {f"RF-{index:02d}" for index in range(1, 19)})
        self.assertFalse(responsibilities["humanApprovalDependency"])
        duplicate = json.loads(json.dumps(responsibilities, ensure_ascii=False))
        duplicate["roles"]["RF-18"] = ""
        with self.assertRaises(GovernanceError):
            validate_responsibility_map(duplicate)

    def test_requirement_change_creates_versioned_safe_queue(self) -> None:
        result = decide("REQUIREMENT_CHANGE", affected_task_ids=["P0-GOV-002"])
        self.assertEqual(result["action"], "CREATE_VERSIONED_BASELINE")
        self.assertEqual(result["queue"], "P0-GOV-002")
        self.assertEqual(result["featureState"], "UNIT_GATE_PENDING")

    def test_contract_conflict_is_quarantined(self) -> None:
        result = decide("CONTRACT_CONFLICT")
        self.assertEqual(result["action"], "QUARANTINE_AFFECTED_SCOPE")
        self.assertEqual(result["featureState"], "HANDOFF_ONLY")

    def test_security_exception_disables_and_rolls_back(self) -> None:
        result = decide("SECURITY_EXCEPTION")
        self.assertEqual(result["action"], "DISABLE_AND_ROLLBACK_AFFECTED_SCOPE")
        self.assertEqual(result["featureState"], "FAIL_CLOSED")

    def test_unknown_case_does_not_create_an_approval_state(self) -> None:
        self.assertEqual(set(CASE_TYPES), {"REQUIREMENT_CHANGE", "CONTRACT_CONFLICT", "SECURITY_EXCEPTION"})
        with self.assertRaises(GovernanceError):
            decide("APPROVAL_REQUEST")
        serialized = json.dumps(load_and_validate(), ensure_ascii=False).upper()
        self.assertNotIn("WAITING_FOR_APPROVAL", serialized)
        self.assertNotIn("GO_NO_GO_PENDING", serialized)


if __name__ == "__main__":
    unittest.main(verbosity=2)
