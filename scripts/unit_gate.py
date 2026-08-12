"""Deterministic, fail-closed automation runner for task unit gates.

The runner is intentionally repository-local.  A unit gate can close work and
queue the next task only after the declared commands pass; it never introduces
an approval state and never treats a missing external provider as a reason to
claim that an unimplemented feature passed.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "evidence" / "task-unit-gates.json"
DEFAULT_PLAN = ROOT / "plan.md"
MANIFEST_VERSION = "task-unit-gates.v1"
ALLOWED_STATES = {"planned", "ready", "completed"}
ALLOWED_ACTIONS = {
    "CLOSE_TASK",
    "CLOSE_PHASE",
    "ENABLE_CHAT",
    "DEPLOY_PRODUCTION",
    "QUEUE_NEXT_TASK",
}
TASK_LINE = re.compile(r"^- \[([ x])\] `([^`]+)`")
STATUS_LINE = re.compile(r"^(\s*-\s*สถานะ:) .*", re.MULTILINE)
FORBIDDEN_OUTPUT = re.compile(r"^\s*(?:skip|skipped|only|focused|flaky)\b", re.IGNORECASE)


class UnitGateError(ValueError):
    """Raised when a manifest, test command, or state transition is invalid."""


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value))


def execution_manifest_hash(document: dict[str, Any], task_id: str) -> str:
    """Hash immutable task gate inputs, excluding mutable lifecycle state."""
    for entry in document.get("tasks", []):
        if isinstance(entry, dict) and entry.get("taskId") == task_id:
            immutable_entry = {key: value for key, value in entry.items() if key != "state"}
            return sha256_json({"manifestVersion": document.get("manifestVersion"), "task": immutable_entry})
    raise UnitGateError(f"task ID not found while hashing manifest: {task_id}")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_text(path: Path) -> str:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return handle.read()


def write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8", newline="") as handle:
            handle.write(content)
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def update_manifest_state(document: dict[str, Any], task_id: str, state: str) -> dict[str, Any]:
    updated = json.loads(json.dumps(document, ensure_ascii=False))
    for entry in updated["tasks"]:
        if entry.get("taskId") == task_id:
            entry["state"] = state
            return updated
    raise UnitGateError(f"task ID not found while updating manifest: {task_id}")


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(read_text(path))
    except (OSError, json.JSONDecodeError) as error:
        raise UnitGateError(f"cannot read JSON artifact {path}: {error}") from error
    if not isinstance(value, dict):
        raise UnitGateError(f"JSON artifact must be an object: {path}")
    return value


def extract_plan_task_ids(plan_text: str) -> list[str]:
    task_ids: list[str] = []
    for line in plan_text.splitlines():
        match = TASK_LINE.match(line)
        if match:
            task_ids.append(match.group(2))
    if len(task_ids) != len(set(task_ids)):
        duplicates = sorted({task_id for task_id in task_ids if task_ids.count(task_id) > 1})
        raise UnitGateError(f"plan contains duplicate task IDs: {', '.join(duplicates)}")
    if not task_ids:
        raise UnitGateError("plan contains no task checklist IDs")
    return task_ids


def _require_list(entry: dict[str, Any], key: str, task_id: str) -> list[Any]:
    value = entry.get(key)
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise UnitGateError(f"{task_id}: {key} must be an array of strings")
    return value


def validate_manifest(document: dict[str, Any], plan_task_ids: Iterable[str]) -> dict[str, dict[str, Any]]:
    if document.get("manifestVersion") != MANIFEST_VERSION:
        raise UnitGateError(f"unsupported manifestVersion: {document.get('manifestVersion')!r}")
    if document.get("schemaVersion") != 1:
        raise UnitGateError("unsupported task-unit-gates schemaVersion")
    tasks = document.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise UnitGateError("manifest.tasks must be a non-empty array")

    entries: dict[str, dict[str, Any]] = {}
    for raw_entry in tasks:
        if not isinstance(raw_entry, dict):
            raise UnitGateError("every manifest task entry must be an object")
        task_id = raw_entry.get("taskId")
        if not isinstance(task_id, str) or not task_id.strip():
            raise UnitGateError("every manifest task entry needs a non-empty taskId")
        if task_id in entries:
            raise UnitGateError(f"manifest contains duplicate task ID: {task_id}")
        state = raw_entry.get("state", "planned")
        if state not in ALLOWED_STATES:
            raise UnitGateError(f"{task_id}: invalid state {state!r}")
        commands = _require_list(raw_entry, "requiredCommands", task_id)
        test_ids = _require_list(raw_entry, "requiredTestIds", task_id)
        actions = _require_list(raw_entry, "onPass", task_id)
        if len(test_ids) != len(set(test_ids)):
            raise UnitGateError(f"{task_id}: requiredTestIds must be unique")
        if len(actions) != len(set(actions)):
            raise UnitGateError(f"{task_id}: onPass actions must be unique")
        unknown_actions = sorted(set(actions) - ALLOWED_ACTIONS)
        if unknown_actions:
            raise UnitGateError(f"{task_id}: unknown onPass action(s): {', '.join(unknown_actions)}")
        if any("approval" in action.lower() or "approve" in action.lower() for action in actions):
            raise UnitGateError(f"{task_id}: approval is not a unit-gate action")
        if bool(commands) != bool(test_ids):
            raise UnitGateError(f"{task_id}: requiredCommands and requiredTestIds must be both empty or both populated")
        if state == "ready" and (not commands or not test_ids):
            raise UnitGateError(f"{task_id}: ready task must declare commands and required test IDs")
        entries[task_id] = raw_entry

    expected = list(plan_task_ids)
    actual = list(entries)
    missing = sorted(set(expected) - set(actual))
    unexpected = sorted(set(actual) - set(expected))
    if missing:
        raise UnitGateError(f"manifest is missing plan task ID(s): {', '.join(missing)}")
    if unexpected:
        raise UnitGateError(f"manifest contains task ID(s) not present in plan: {', '.join(unexpected)}")
    return entries


def validate_manifest_test_ids(document: dict[str, Any], root: Path) -> None:
    """Validate every declared test ID against its optional source list.

    Ready tasks must identify an executable source of truth. Planned and
    completed historical tasks may carry an empty command/test list until their
    own gate is scheduled, but every non-empty declaration is still checked.
    """
    tasks = document["tasks"]
    for entry in tasks:
        source = entry.get("testIdSource")
        required_test_ids = entry["requiredTestIds"]
        if entry.get("state") != "ready" and not source:
            continue
        if required_test_ids and not source:
            raise UnitGateError(f"{entry['taskId']}: requiredTestIds needs testIdSource")
        if source:
            declared = load_declared_test_ids(root, source)
            missing = sorted(set(required_test_ids) - declared)
            if missing:
                raise UnitGateError(f"{entry['taskId']}: testIdSource is missing: {', '.join(missing)}")


def _safe_source_path(root: Path, relative: str) -> Path:
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as error:
        raise UnitGateError(f"testIdSource escapes repository: {relative}") from error
    if not candidate.is_file():
        raise UnitGateError(f"testIdSource file does not exist: {relative}")
    return candidate


def load_declared_test_ids(root: Path, source: str) -> set[str]:
    if ":" not in source:
        raise UnitGateError("testIdSource must use 'relative/path.py:NAME'")
    relative_path, symbol = source.rsplit(":", 1)
    if not symbol.isidentifier():
        raise UnitGateError(f"invalid testIdSource symbol: {symbol}")
    module = ast.parse(read_text(_safe_source_path(root, relative_path)), filename=relative_path)
    for node in module.body:
        targets: list[ast.expr] = []
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AnnAssign):
            targets = [node.target]
        if any(isinstance(target, ast.Name) and target.id == symbol for target in targets):
            try:
                value = ast.literal_eval(node.value)
            except (ValueError, SyntaxError) as error:
                raise UnitGateError(f"testIdSource {source} must be a literal sequence") from error
            if not isinstance(value, (list, tuple)) or any(not isinstance(item, str) for item in value):
                raise UnitGateError(f"testIdSource {source} must be a string sequence")
            return set(value)
    raise UnitGateError(f"testIdSource symbol not found: {source}")


def get_revision(root: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if result.returncode != 0:
        raise UnitGateError(f"cannot resolve git revision: {result.stderr.strip()}")
    return result.stdout.strip()


def redact_output(value: str) -> str:
    redacted = re.sub(r"sk-or-v1-[A-Za-z0-9_-]+", "[REDACTED_OPENROUTER_KEY]", value)
    redacted = re.sub(r"(?i)(bearer\s+)[^\s]+", r"\1[REDACTED_TOKEN]", redacted)
    redacted = re.sub(r"(?i)(password|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+", r"\1=[REDACTED]", redacted)
    return redacted[-4000:]


def execute_command(command: str, root: Path) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "1"
    return subprocess.run(
        command,
        cwd=root,
        shell=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=environment,
    )


def has_forbidden_test_marker(output: str) -> bool:
    return any(FORBIDDEN_OUTPUT.search(line) for line in output.splitlines())


def _task_block_end(lines: list[str], start: int) -> int:
    for index in range(start + 1, len(lines)):
        if TASK_LINE.match(lines[index]):
            return index
    return len(lines)


def close_task_in_plan(plan_text: str, task_id: str, report_hash: str, revision: str) -> str:
    newline = "\r\n" if "\r\n" in plan_text else "\n"
    lines = plan_text.splitlines()
    for index, line in enumerate(lines):
        match = TASK_LINE.match(line)
        if not match or match.group(2) != task_id:
            continue
        lines[index] = line.replace("- [ ]", "- [x]", 1)
        end = _task_block_end(lines, index)
        status_index = next((candidate for candidate in range(index + 1, end) if re.match(r"^\s*-\s*สถานะ:", lines[candidate])), None)
        status = f"DONE (AUTO_CLOSED_UNIT_GREEN; reportHash={report_hash}; revision={revision})"
        if status_index is None:
            lines.insert(index + 1, f"  - สถานะ: {status}")
        else:
            prefix = re.match(r"^(\s*-\s*สถานะ:)\s*", lines[status_index])
            if prefix is None:
                raise UnitGateError(f"cannot update status line for {task_id}")
            lines[status_index] = f"{prefix.group(1)} {status}"
        return newline.join(lines) + (newline if plan_text.endswith(("\n", "\r")) else "")
    raise UnitGateError(f"task ID not found in plan: {task_id}")


def find_next_open_task(plan_text: str, current_task_id: str) -> str | None:
    for line in plan_text.splitlines():
        match = TASK_LINE.match(line)
        if match and match.group(1) == " " and match.group(2) != current_task_id:
            return match.group(2)
    return None


def mark_task_in_progress(plan_text: str, task_id: str) -> str:
    newline = "\r\n" if "\r\n" in plan_text else "\n"
    lines = plan_text.splitlines()
    for index, line in enumerate(lines):
        match = TASK_LINE.match(line)
        if not match or match.group(2) != task_id:
            continue
        end = _task_block_end(lines, index)
        status_index = next((candidate for candidate in range(index + 1, end) if re.match(r"^\s*-\s*สถานะ:", lines[candidate])), None)
        if status_index is not None and "DONE" not in lines[status_index]:
            prefix = re.match(r"^(\s*- *สถานะ:)\s*", lines[status_index])
            if prefix is not None:
                lines[status_index] = f"{prefix.group(1)} IN_PROGRESS (AUTO_QUEUED_BY_SYSTEM_UNIT_GATE)"
        return newline.join(lines) + (newline if plan_text.endswith(("\n", "\r")) else "")
    raise UnitGateError(f"task ID not found while starting task: {task_id}")


def write_queue(root: Path, source_task_id: str, next_task_id: str | None, report_hash: str, revision: str) -> None:
    document = {
        "schemaVersion": 1,
        "actor": "SYSTEM_UNIT_GATE",
        "sourceTaskId": source_task_id,
        "nextTaskId": next_task_id,
        "reportHash": report_hash,
        "revision": revision,
        "queuedAt": utc_now(),
        "status": "QUEUED" if next_task_id else "EMPTY",
    }
    write_atomic(root / "evidence" / "automation-queue.json", json.dumps(document, ensure_ascii=False, indent=2) + "\n")


def append_event(root: Path, event: dict[str, Any]) -> None:
    path = root / "evidence" / "automation-events.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")


def write_evidence_index(root: Path, task_id: str, report: dict[str, Any]) -> None:
    path = root / "evidence" / task_id / "index.md"
    if path.exists() and f"Report hash: `{report['reportHash']}`" in read_text(path):
        return
    command_lines = "\n".join(f"- `{command['command']}` → exit `{command['exitCode']}`" for command in report["commands"])
    content = f"""\n## Automated unit gate checkpoint — {report['finishedAt']}

<!-- unit-gate-runner -->
Status: **{report['status']}**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `{report['revision']}`  
Report hash: `{report['reportHash']}`

### Unit-gate result

- Manifest: `{report['manifestVersion']}` (`{report['manifestSha256']}`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `{report['idempotencyKey']}`
- Pass/total: `{report['passCount']}/{report['totalCount']}` required test IDs
- Command pass/total: `{report['commandPassCount']}/{report['commandTotalCount']}`

### Commands

{command_lines}

### Acceptance

- Required commands exited with code `0`: **{'PASS' if report['status'] == 'PASSED' else 'FAIL'}**
- No skipped/only/focused/flaky unit signal: **{'PASS' if report['status'] == 'PASSED' else 'FAIL'}**
- No human approval state or action was used: **PASS**
- Plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **{'PASS' if report['status'] == 'PASSED' else 'FAIL'}**

### Rollback note

Restore the previous plan/evidence revision and redeploy the previous signed revision. No production data mutation is performed by this runner.

### Known limitation

This checkpoint closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate evidence; missing external configuration remains fail-closed.
"""
    if path.exists():
        existing = read_text(path).rstrip() + "\n"
        write_atomic(path, existing + content)
        return
    content = f"""# Evidence — {task_id}

<!-- unit-gate-runner -->
Status: **{report['status']}**  
Requirement IDs: `SPEC-AUTO-001`, `INV-AUTOCLOSE-001`, `INV-AUTODEPLOY-001`  
Revision: `{report['revision']}`  
Report hash: `{report['reportHash']}`

## Automated unit gate

- Manifest: `{report['manifestVersion']}` (`{report['manifestSha256']}`)
- Actor: `SYSTEM_UNIT_GATE`
- Idempotency key: `{report['idempotencyKey']}`
- Pass/total: `{report['passCount']}/{report['totalCount']}` required test IDs
- Command pass/total: `{report['commandPassCount']}/{report['commandTotalCount']}`

## Commands and results

{command_lines}

## Acceptance criteria

- Required commands exited with code `0`: **{'PASS' if report['status'] == 'PASSED' else 'FAIL'}**
- No skipped/only/focused/flaky unit signal: **{'PASS' if report['status'] == 'PASSED' else 'FAIL'}**
- No human approval state or action was used: **PASS**
- Evidence, plan transition and queue action were written by `SYSTEM_UNIT_GATE`: **{'PASS' if report['status'] == 'PASSED' else 'FAIL'}**

## Rollback procedure

Restore the previous `plan.md`, remove the generated queue/event/report artifacts for this attempt, and redeploy the previous signed revision. No production data mutation is performed by this runner.

## Known limitations

This runner closes only the declared unit-gated task. Integration, E2E, certification and external provider health remain separate post-production evidence; missing external configuration is fail-closed and never converted into a false unit pass.
"""
    write_atomic(path, content)


def run_task_gate(
    root: Path,
    manifest_path: Path,
    plan_path: Path,
    task_id: str,
    *,
    revision: str | None = None,
    command_runner: Callable[[str], Any] | None = None,
    retry: bool = False,
) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    plan_text = read_text(plan_path)
    entries = validate_manifest(manifest, extract_plan_task_ids(plan_text))
    entry = entries.get(task_id)
    if entry is None:
        raise UnitGateError(f"task ID not found in manifest: {task_id}")

    commands = list(entry["requiredCommands"])
    required_test_ids = list(entry["requiredTestIds"])
    source = entry.get("testIdSource")
    if source:
        declared = load_declared_test_ids(root, source)
        missing_test_ids = sorted(set(required_test_ids) - declared)
        if missing_test_ids:
            raise UnitGateError(f"{task_id}: testIdSource is missing: {', '.join(missing_test_ids)}")
    if any("--only" in command for command in commands):
        raise UnitGateError(f"{task_id}: focused --only command is forbidden")

    resolved_revision = revision or get_revision(root)
    manifest_sha = sha256_json(manifest)
    execution_sha = execution_manifest_hash(manifest, task_id)
    idempotency_key = sha256_bytes(f"{task_id}|{resolved_revision}|{execution_sha}".encode("utf-8"))
    report_path = root / "evidence" / task_id / "unit-gate-report.json"
    if report_path.exists() and not retry:
        existing = load_json(report_path)
        if existing.get("idempotencyKey") == idempotency_key and existing.get("status") == "PASSED":
            existing["status"] = "ALREADY_PASSED"
            return existing
    if entry.get("state") not in {"ready", "completed"}:
        raise UnitGateError(f"{task_id} is not executable; manifest state is {entry.get('state')!r}")

    started_at = utc_now()
    next_task_id = find_next_open_task(plan_text, task_id)
    actions: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    command_pass_count = 0
    for command in commands:
        result = command_runner(command) if command_runner else execute_command(command, root)
        exit_code = int(getattr(result, "returncode", result[0] if isinstance(result, tuple) else 1))
        stdout = str(getattr(result, "stdout", result[1] if isinstance(result, tuple) and len(result) > 1 else ""))
        stderr = str(getattr(result, "stderr", result[2] if isinstance(result, tuple) and len(result) > 2 else ""))
        combined = f"{stdout}\n{stderr}"
        forbidden_marker = has_forbidden_test_marker(combined)
        passed = exit_code == 0 and not forbidden_marker
        if passed:
            command_pass_count += 1
        results.append({
            "command": command,
            "exitCode": exit_code,
            "passed": passed,
            "forbiddenTestMarker": forbidden_marker,
            "stdout": redact_output(stdout),
            "stderr": redact_output(stderr),
        })

    finished_at = utc_now()
    passed_all = command_pass_count == len(commands)
    if passed_all:
        if "QUEUE_NEXT_TASK" in entry["onPass"]:
            actions.append({"action": "QUEUE_NEXT_TASK", "status": "QUEUED", "taskId": next_task_id})
        for action in entry["onPass"]:
            if action in {"CLOSE_TASK", "QUEUE_NEXT_TASK"}:
                continue
            # External actions are deliberately fail-closed. They can be
            # dispatched by a trusted deployment worker, but this local runner
            # must not invent credentials or flip production feature flags.
            actions.append({
                "action": action,
                "status": "DEFERRED_FAIL_CLOSED",
                "reason": "external dispatcher is not configured in repository runner",
            })
    report: dict[str, Any] = {
        "schemaVersion": 1,
        "manifestVersion": MANIFEST_VERSION,
        "manifestSha256": manifest_sha,
        "executionManifestSha256": execution_sha,
        "taskId": task_id,
        "revision": resolved_revision,
        "actor": "SYSTEM_UNIT_GATE",
        "idempotencyKey": idempotency_key,
        "attempt": 1 if not retry else 2,
        "status": "PASSED" if passed_all else "FAILED",
        "startedAt": started_at,
        "finishedAt": finished_at,
        "requiredTestIds": required_test_ids,
        "passedTestIds": required_test_ids if passed_all else [],
        "passCount": len(required_test_ids) if passed_all else 0,
        "totalCount": len(required_test_ids),
        "commandPassCount": command_pass_count,
        "commandTotalCount": len(commands),
        "commands": results,
        "onPass": list(entry["onPass"]) if passed_all else [],
        "actions": actions,
    }
    report["reportHash"] = sha256_json(report)
    write_atomic(report_path, json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    if passed_all:
        updated_plan = close_task_in_plan(plan_text, task_id, report["reportHash"], resolved_revision)
        write_atomic(plan_path, updated_plan)
        updated_manifest = update_manifest_state(manifest, task_id, "completed")
        write_atomic(manifest_path, json.dumps(updated_manifest, ensure_ascii=False, indent=2) + "\n")
        if "QUEUE_NEXT_TASK" in entry["onPass"]:
            write_queue(root, task_id, next_task_id, report["reportHash"], resolved_revision)
            if next_task_id:
                write_atomic(plan_path, mark_task_in_progress(read_text(plan_path), next_task_id))
        append_event(root, {
            "eventType": "task.unit_gate_passed",
            "taskId": task_id,
            "revision": resolved_revision,
            "manifestVersion": MANIFEST_VERSION,
            "reportHash": report["reportHash"],
            "passCount": report["passCount"],
            "totalCount": report["totalCount"],
            "actions": report["actions"],
            "actor": "SYSTEM_UNIT_GATE",
            "idempotencyKey": idempotency_key,
            "occurredAt": finished_at,
        })
    else:
        append_event(root, {
            "eventType": "task.unit_gate_failed",
            "taskId": task_id,
            "revision": resolved_revision,
            "manifestVersion": MANIFEST_VERSION,
            "reportHash": report["reportHash"],
            "passCount": report["passCount"],
            "totalCount": report["totalCount"],
            "actions": [],
            "actor": "SYSTEM_UNIT_GATE",
            "idempotencyKey": idempotency_key,
            "occurredAt": finished_at,
        })
    write_evidence_index(root, task_id, report)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task-id")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    parser.add_argument("--retry", action="store_true")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args(argv)
    try:
        root = ROOT
        manifest_path = (root / args.manifest).resolve() if not args.manifest.is_absolute() else args.manifest.resolve()
        plan_path = (root / args.plan).resolve() if not args.plan.is_absolute() else args.plan.resolve()
        manifest = load_json(manifest_path)
        plan_text = read_text(plan_path)
        validate_manifest(manifest, extract_plan_task_ids(plan_text))
        validate_manifest_test_ids(manifest, root)
        if args.validate_only:
            print(f"UNIT_GATE_MANIFEST_VALID {manifest_path.relative_to(root)}")
            return 0
        if not args.task_id:
            parser.error("--task-id is required unless --validate-only is used")
        report = run_task_gate(root, manifest_path, plan_path, args.task_id, retry=args.retry)
        # Windows PowerShell commonly exposes cp874/cp1252 as stdout.  Reports
        # may contain Thai test output, so emit UTF-8 without allowing console
        # encoding to turn a passed gate into a process failure.
        output = json.dumps(report, ensure_ascii=False, sort_keys=True)
        try:
            print(output)
        except UnicodeEncodeError:
            sys.stdout.buffer.write((output + "\n").encode("utf-8"))
        return 0 if report.get("status") in {"PASSED", "ALREADY_PASSED"} else 1
    except (OSError, UnitGateError, subprocess.SubprocessError) as error:
        print(f"UNIT_GATE_FAILED {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
