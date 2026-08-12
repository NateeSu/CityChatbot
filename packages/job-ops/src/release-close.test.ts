import { describe, expect, it } from "vitest";

import { ReleaseCloseGenerator, type ReleaseArtifact, type ReleaseEvidenceRecord, type ReleaseTraceRecord } from "./release-close";

const EVIDENCE: ReleaseEvidenceRecord[] = [{ taskId: "P9-BAU-001", evidencePath: "evidence/P9-BAU-001/index.md", status: "DONE", reportHash: "a".repeat(64) }, { taskId: "P9-CLOSE-001", evidencePath: "evidence/P9-CLOSE-001/index.md", status: "DONE", reportHash: "b".repeat(64) }];
const TRACE: ReleaseTraceRecord[] = [{ requirementId: "RF-15", taskId: "P9-BAU-001", testId: "P9-BAU-ALERT" }, { requirementId: "RF-18", taskId: "P9-CLOSE-001", testId: "P9-CLOSE-TRACE" }];
const ARTIFACTS: ReleaseArtifact[] = [{ path: "evidence/P9-BAU-001/unit-gate-report.json", sha256: "c".repeat(64) }];
const AVAILABLE = [...EVIDENCE.map((record) => record.evidencePath), ...ARTIFACTS.map((artifact) => artifact.path)];

describe("P9-CLOSE-001 release close", () => {
  it("generates a linked evidence/trace/archive summary", () => {
    const result = new ReleaseCloseGenerator().close({ releaseId: "release-2026-08", revision: "revision-2026-08", evidence: EVIDENCE, traceability: TRACE, artifacts: ARTIFACTS, availablePaths: AVAILABLE, knownLimitations: ["external provider observation is separate"], idempotencyKey: "close:1", now: new Date("2026-08-13T00:00:00.000Z") });
    expect(result.summary).toMatchObject({ status: "CLOSED", taskCount: 2, evidenceCount: 2, traceCount: 2, artifactCount: 1 });
    expect(result.archive.archiveHash).toHaveLength(64);
    expect(result.archive.traceHash).toHaveLength(64);
  });

  it("rejects missing links and orphan trace rows", () => {
    expect(() => new ReleaseCloseGenerator().close({ releaseId: "release-2026-08", revision: "revision-2026-08", evidence: EVIDENCE, traceability: [{ requirementId: "RF-18", taskId: "P9-NOT-EVIDENCED", testId: "test-1" }], artifacts: ARTIFACTS, availablePaths: [], knownLimitations: [], idempotencyKey: "close:invalid", now: new Date("2026-08-13T00:00:00.000Z") })).toThrowError(/RELEASE_CLOSE_INVALID/);
  });

  it("closes idempotently and rejects changed input on the same key", () => {
    const generator = new ReleaseCloseGenerator();
    const input = { releaseId: "release-2026-08", revision: "revision-2026-08", evidence: EVIDENCE, traceability: TRACE, artifacts: ARTIFACTS, availablePaths: AVAILABLE, knownLimitations: [], idempotencyKey: "close:idempotent", now: new Date("2026-08-13T00:00:00.000Z") };
    const first = generator.close(input);
    expect(generator.close({ ...input, now: new Date("2026-08-13T00:00:01.000Z") })).toEqual(first);
    expect(() => generator.close({ ...input, knownLimitations: ["changed"], now: input.now })).toThrowError(/IDEMPOTENCY_CONFLICT/);
  });
});

