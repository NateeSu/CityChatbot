import { createHash } from "node:crypto";

export type ReleaseEvidenceRecord = {
  taskId: string;
  evidencePath: string;
  status: "DONE" | "N/A";
  reportHash?: string;
};

export type ReleaseTraceRecord = {
  requirementId: string;
  taskId: string;
  testId: string;
};

export type ReleaseArtifact = {
  path: string;
  sha256: string;
};

export type ReleaseSummary = {
  releaseId: string;
  revision: string;
  status: "CLOSED";
  taskCount: number;
  evidenceCount: number;
  traceCount: number;
  artifactCount: number;
  knownLimitations: readonly string[];
  closedAt: string;
};

export type ReleaseArchive = {
  archiveId: string;
  releaseId: string;
  revision: string;
  evidencePaths: readonly string[];
  traceHash: string;
  archiveHash: string;
};

export type ReleaseCloseResult = {
  summary: ReleaseSummary;
  archive: ReleaseArchive;
};

export class ReleaseCloseError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ReleaseCloseError";
  }
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,160}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const PATH_PATTERN = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+(?:\.[A-Za-z0-9._-]+)?$/;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
const assertKey = (value: string, field: string): void => {
  if (!KEY_PATTERN.test(value)) throw new ReleaseCloseError("VALIDATION_ERROR", `${field} is invalid`);
};
const assertPath = (value: string, field: string): void => {
  if (!PATH_PATTERN.test(value) || value.includes("..")) throw new ReleaseCloseError("VALIDATION_ERROR", `${field} is invalid`);
};

export class ReleaseCloseGenerator {
  private readonly closed = new Map<string, { requestHash: string; result: ReleaseCloseResult }>();

  close(input: { releaseId: string; revision: string; evidence: readonly ReleaseEvidenceRecord[]; traceability: readonly ReleaseTraceRecord[]; artifacts: readonly ReleaseArtifact[]; availablePaths: readonly string[]; knownLimitations: readonly string[]; idempotencyKey: string; now?: Date }): ReleaseCloseResult {
    assertKey(input.releaseId, "releaseId");
    assertKey(input.revision, "revision");
    assertKey(input.idempotencyKey, "idempotencyKey");
    const requestHash = hash({ releaseId: input.releaseId, revision: input.revision, evidence: input.evidence, traceability: input.traceability, artifacts: input.artifacts, knownLimitations: input.knownLimitations });
    const prior = this.closed.get(`${input.releaseId}:${input.idempotencyKey}`);
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ReleaseCloseError("IDEMPOTENCY_CONFLICT", "release close idempotency key was reused with different input");
      return clone(prior.result);
    }
    const available = new Set(input.availablePaths);
    const evidenceTaskIds = new Set<string>();
    const errors: string[] = [];
    for (const record of input.evidence) {
      assertKey(record.taskId, "evidence.taskId");
      assertPath(record.evidencePath, "evidence.evidencePath");
      if (evidenceTaskIds.has(record.taskId)) errors.push(`DUPLICATE_EVIDENCE_TASK:${record.taskId}`);
      evidenceTaskIds.add(record.taskId);
      if (!available.has(record.evidencePath)) errors.push(`EVIDENCE_LINK_MISSING:${record.evidencePath}`);
      if (record.status === "DONE" && record.reportHash && !HASH_PATTERN.test(record.reportHash)) errors.push(`REPORT_HASH_INVALID:${record.taskId}`);
    }
    const traceKeys = new Set<string>();
    for (const record of input.traceability) {
      if (!/^RF-[0-9]{2}$/.test(record.requirementId) || !KEY_PATTERN.test(record.taskId) || !KEY_PATTERN.test(record.testId)) errors.push(`TRACE_ROW_INVALID:${record.taskId}`);
      const key = `${record.requirementId}:${record.taskId}:${record.testId}`;
      if (traceKeys.has(key)) errors.push(`TRACE_ROW_DUPLICATE:${key}`);
      traceKeys.add(key);
      if (!evidenceTaskIds.has(record.taskId)) errors.push(`TRACE_TASK_WITHOUT_EVIDENCE:${record.taskId}`);
    }
    for (const artifact of input.artifacts) {
      assertPath(artifact.path, "artifact.path");
      if (!HASH_PATTERN.test(artifact.sha256)) errors.push(`ARTIFACT_HASH_INVALID:${artifact.path}`);
      if (!available.has(artifact.path)) errors.push(`ARTIFACT_LINK_MISSING:${artifact.path}`);
    }
    if (!input.evidence.length) errors.push("EVIDENCE_EMPTY");
    if (!input.traceability.length) errors.push("TRACE_EMPTY");
    if (errors.length) throw new ReleaseCloseError("RELEASE_CLOSE_INVALID", errors.join(","));
    const now = input.now ?? new Date();
    const closedAt = now.toISOString();
    if (Number.isNaN(now.getTime())) throw new ReleaseCloseError("VALIDATION_ERROR", "date is invalid");
    const archiveId = hash({ releaseId: input.releaseId, revision: input.revision, evidence: input.evidence.map((record) => record.evidencePath), traceability: input.traceability }).slice(0, 32);
    const traceHash = hash(input.traceability);
    const summary: ReleaseSummary = { releaseId: input.releaseId, revision: input.revision, status: "CLOSED", taskCount: evidenceTaskIds.size, evidenceCount: input.evidence.length, traceCount: input.traceability.length, artifactCount: input.artifacts.length, knownLimitations: [...input.knownLimitations].map((value) => value.slice(0, 256)), closedAt };
    const archive: ReleaseArchive = { archiveId, releaseId: input.releaseId, revision: input.revision, evidencePaths: input.evidence.map((record) => record.evidencePath).sort(), traceHash, archiveHash: hash({ summary, archiveId, traceHash }) };
    const result = { summary, archive };
    this.closed.set(`${input.releaseId}:${input.idempotencyKey}`, { requestHash, result: clone(result) });
    return clone(result);
  }
}

