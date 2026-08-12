# Autonomous change request template

This template records a versioned change without creating a human approval
state. `SYSTEM_UNIT_GATE` validates the change, selects the highest-precedence
policy, writes an evidence event, and queues the next executable task.

```yaml
schemaVersion: 1
changeId: CR-AUTO-<uuid>
kind: REQUIREMENT_CHANGE | CONTRACT_CONFLICT | SECURITY_EXCEPTION
source: fullspec.md | plan.md | implementation | test
affectedTaskIds: []
affectedRequirementIds: []
safeAction: <deterministic action from decision-precedence.json>
featureState: UNIT_GATE_PENDING | HANDOFF_ONLY | FAIL_CLOSED
systemActor: SYSTEM_UNIT_GATE
revision: <git sha>
reportHash: <sha256>
rollbackRevision: <last known-good sha>
```

Unknown or unsafe changes are quarantined and sent to the encoded system queue;
the production request path never waits for or accepts an approval flag.
