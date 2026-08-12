import { createHash, randomUUID } from "node:crypto";

import { ComplaintDomainError, type ComplaintPriority, type ComplaintRecord, type ComplaintState } from "./complaint";

export const DUPLICATE_DECISIONS = ["LINK", "MERGE_REFERENCE", "NOT_DUPLICATE"] as const;
export type DuplicateDecision = (typeof DUPLICATE_DECISIONS)[number];

export const DUPLICATE_STAFF_ROLES = ["STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] as const;
export type DuplicateDecisionRole = (typeof DUPLICATE_STAFF_ROLES)[number];

const TERMINAL_DUPLICATE_STATES: readonly ComplaintState[] = ["RESOLVED", "CLOSED", "OUT_OF_JURISDICTION", "CANCELLED"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const EARTH_RADIUS_METERS = 6_371_008.8;

export type DuplicateCandidateQuery = {
  tenantId: string;
  sourceComplaintId: string;
  records: readonly ComplaintRecord[];
  radiusMeters?: number;
  windowHours?: number;
  minTextSimilarity?: number;
  limit?: number;
};

export type DuplicateCandidate = {
  candidateComplaintId: string;
  complaintNo: string;
  categoryId?: string;
  canonicalStatus: ComplaintState;
  priority: ComplaintPriority;
  createdAt: string;
  distanceMeters: number;
  timeDistanceSeconds: number;
  sameCategory: boolean;
  textSimilarity: number;
  score: number;
  /** Rounded staff-only point. Citizen responses must use map clusters instead. */
  mapPoint: { latitude: number; longitude: number };
};

export type DuplicateMapCluster = {
  clusterKey: string;
  candidateCount: number;
  latitude: number;
  longitude: number;
  highDensity: boolean;
};

export type DuplicateMapOptions = {
  gridMeters?: number;
  highDensityThreshold?: number;
};

export type DuplicateDecisionActor = {
  accountId: string;
  role: DuplicateDecisionRole;
};

export type DuplicateDecisionInput = {
  tenantId: string;
  complaintId: string;
  candidateComplaintId: string;
  decision: DuplicateDecision;
  reason: string;
  expectedVersion: number;
  actor: DuplicateDecisionActor;
  idempotencyKey: string;
  occurredAt?: Date;
};

export type DuplicateDecisionRecord = {
  id: string;
  tenantId: string;
  complaintId: string;
  candidateComplaintId: string;
  decision: DuplicateDecision;
  decidedByAccountId: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type DuplicateDecisionAudit = {
  id: string;
  tenantId: string;
  complaintId: string;
  candidateComplaintId: string;
  decision: DuplicateDecision;
  actorAccountId: string;
  actorRole: DuplicateDecisionRole;
  reason: string;
  occurredAt: string;
};

export type DuplicateDecisionResult = {
  record: DuplicateDecisionRecord;
  idempotentReplay: boolean;
};

type Coordinates = { latitude: number; longitude: number };
type StoredIdempotency = { requestHash: string; result: DuplicateDecisionResult };

const round = (value: number, decimals: number): number => Number(value.toFixed(decimals));

const isTerminal = (status: ComplaintState): boolean => TERMINAL_DUPLICATE_STATES.includes(status);

const coordinatesFor = (record: ComplaintRecord): Coordinates | undefined => {
  const latitude = record.location?.latitude;
  const longitude = record.location?.longitude;
  if (latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude };
};

const parseTimestamp = (value: string, field: string): number => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new ComplaintDomainError("VALIDATION_ERROR", `${field} is invalid`);
  return timestamp;
};

const validateUuid = (value: string, field: string): void => {
  if (!UUID_PATTERN.test(value)) throw new ComplaintDomainError("VALIDATION_ERROR", `${field} is invalid`);
};

const validateQuery = (query: DuplicateCandidateQuery): Required<Pick<DuplicateCandidateQuery, "radiusMeters" | "windowHours" | "minTextSimilarity" | "limit">> => {
  validateUuid(query.tenantId, "tenantId");
  validateUuid(query.sourceComplaintId, "sourceComplaintId");
  const radiusMeters = query.radiusMeters ?? 100;
  const windowHours = query.windowHours ?? 72;
  const minTextSimilarity = query.minTextSimilarity ?? 0.4;
  const limit = query.limit ?? 20;
  if (!Number.isFinite(radiusMeters) || radiusMeters < 1 || radiusMeters > 10_000) throw new ComplaintDomainError("VALIDATION_ERROR", "radiusMeters must be between 1 and 10000");
  if (!Number.isFinite(windowHours) || windowHours < 1 || windowHours > 720) throw new ComplaintDomainError("VALIDATION_ERROR", "windowHours must be between 1 and 720");
  if (!Number.isFinite(minTextSimilarity) || minTextSimilarity < 0 || minTextSimilarity > 1) throw new ComplaintDomainError("VALIDATION_ERROR", "minTextSimilarity must be between 0 and 1");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new ComplaintDomainError("VALIDATION_ERROR", "limit must be between 1 and 50");
  return { radiusMeters, windowHours, minTextSimilarity, limit };
};

const tokensFor = (value: string): Set<string> => new Set(
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2),
);

const textSimilarity = (left: string, right: string): number => {
  const leftTokens = tokensFor(left);
  const rightTokens = tokensFor(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  return intersection / (leftTokens.size + rightTokens.size - intersection);
};

const distanceMeters = (left: Coordinates, right: Coordinates): number => {
  const latitudeDelta = (right.latitude - left.latitude) * Math.PI / 180;
  const longitudeDelta = (right.longitude - left.longitude) * Math.PI / 180;
  const latitudeOne = left.latitude * Math.PI / 180;
  const latitudeTwo = right.latitude * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
};

/**
 * Generates a bounded staff candidate set. The filters intentionally run before
 * scoring so tenant/status/location/time isolation is a hard boundary, not a
 * ranking preference. This mirrors the database function in the duplicate
 * candidate migration; the application implementation is used by the local
 * fixture and unit suite.
 */
export const buildDuplicateCandidates = (query: DuplicateCandidateQuery): DuplicateCandidate[] => {
  const { radiusMeters, windowHours, minTextSimilarity, limit } = validateQuery(query);
  const source = query.records.find((record) => record.id === query.sourceComplaintId && record.tenantId === query.tenantId);
  if (!source) throw new ComplaintDomainError("NOT_FOUND", "source complaint was not found");
  if (isTerminal(source.canonicalStatus)) return [];
  const sourceCoordinates = coordinatesFor(source);
  if (!sourceCoordinates) return [];
  const sourceTime = parseTimestamp(source.createdAt, "source.createdAt");
  const windowSeconds = windowHours * 60 * 60;

  const candidates = query.records
    .filter((candidate) => candidate.tenantId === query.tenantId)
    .filter((candidate) => candidate.id !== source.id)
    .filter((candidate) => !isTerminal(candidate.canonicalStatus))
    .map((candidate) => {
      const candidateCoordinates = coordinatesFor(candidate);
      if (!candidateCoordinates) return undefined;
      const candidateTime = parseTimestamp(candidate.createdAt, "candidate.createdAt");
      const timeDistanceSeconds = Math.abs(candidateTime - sourceTime) / 1000;
      if (timeDistanceSeconds > windowSeconds) return undefined;
      const distance = distanceMeters(sourceCoordinates, candidateCoordinates);
      if (distance > radiusMeters + 0.000001) return undefined;
      const sameCategory = Boolean(source.categoryId && candidate.categoryId && source.categoryId === candidate.categoryId);
      const similarity = textSimilarity(source.title, candidate.title);
      if (!sameCategory && similarity < minTextSimilarity) return undefined;
      const proximityScore = Math.max(0, 1 - distance / radiusMeters);
      const timeScore = Math.max(0, 1 - timeDistanceSeconds / windowSeconds);
      const score = (sameCategory ? 0.55 : 0) + similarity * 0.25 + proximityScore * 0.15 + timeScore * 0.05;
      return {
        candidateComplaintId: candidate.id,
        complaintNo: candidate.complaintNo,
        ...(candidate.categoryId ? { categoryId: candidate.categoryId } : {}),
        canonicalStatus: candidate.canonicalStatus,
        priority: candidate.priority,
        createdAt: candidate.createdAt,
        distanceMeters: round(distance, 3),
        timeDistanceSeconds: round(timeDistanceSeconds, 3),
        sameCategory,
        textSimilarity: round(similarity, 6),
        score: round(score, 6),
        mapPoint: { latitude: round(candidateCoordinates.latitude, 4), longitude: round(candidateCoordinates.longitude, 4) },
      } satisfies DuplicateCandidate;
    })
    .filter((candidate): candidate is DuplicateCandidate => candidate !== undefined);

  return candidates
    .sort((left, right) => right.score - left.score || left.distanceMeters - right.distanceMeters || left.timeDistanceSeconds - right.timeDistanceSeconds || left.candidateComplaintId.localeCompare(right.candidateComplaintId))
    .slice(0, limit)
    .map((candidate) => ({ ...candidate, mapPoint: { ...candidate.mapPoint } }));
};

/**
 * Produces an aggregated map projection. It deliberately contains no complaint
 * ids, reporter identity, title, description, phone, or LINE identifier, so it
 * is safe to reuse only as a density layer after an explicit staff-scope check.
 */
export const buildCitizenSafeDuplicateMap = (candidates: readonly DuplicateCandidate[], options: DuplicateMapOptions = {}): DuplicateMapCluster[] => {
  const gridMeters = options.gridMeters ?? 100;
  const highDensityThreshold = options.highDensityThreshold ?? 5;
  if (!Number.isFinite(gridMeters) || gridMeters < 25 || gridMeters > 1_000) throw new ComplaintDomainError("VALIDATION_ERROR", "gridMeters must be between 25 and 1000");
  if (!Number.isSafeInteger(highDensityThreshold) || highDensityThreshold < 2 || highDensityThreshold > 100) throw new ComplaintDomainError("VALIDATION_ERROR", "highDensityThreshold must be between 2 and 100");

  const cells = new Map<string, { latitudeTotal: number; longitudeTotal: number; count: number }>();
  for (const candidate of candidates) {
    const latitudeStep = gridMeters / 111_320;
    const longitudeStep = gridMeters / (111_320 * Math.max(Math.cos(candidate.mapPoint.latitude * Math.PI / 180), 0.01));
    const latitudeCell = Math.floor(candidate.mapPoint.latitude / latitudeStep);
    const longitudeCell = Math.floor(candidate.mapPoint.longitude / longitudeStep);
    const clusterKey = `${latitudeCell}:${longitudeCell}`;
    const cell = cells.get(clusterKey) ?? { latitudeTotal: 0, longitudeTotal: 0, count: 0 };
    cell.latitudeTotal += candidate.mapPoint.latitude;
    cell.longitudeTotal += candidate.mapPoint.longitude;
    cell.count += 1;
    cells.set(clusterKey, cell);
  }
  return [...cells.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([clusterKey, cell]) => ({
      clusterKey,
      candidateCount: cell.count,
      latitude: round(cell.latitudeTotal / cell.count, 4),
      longitude: round(cell.longitudeTotal / cell.count, 4),
      highDensity: cell.count >= highDensityThreshold,
    }));
};

const cloneDecision = (record: DuplicateDecisionRecord): DuplicateDecisionRecord => ({ ...record });
const cloneDecisionResult = (result: DuplicateDecisionResult, idempotentReplay: boolean): DuplicateDecisionResult => ({ record: cloneDecision(result.record), idempotentReplay });
const pairKeyFor = (tenantId: string, left: string, right: string): string => `${tenantId}:${[left, right].sort().join(":")}`;

const validateDecisionInput = (input: DuplicateDecisionInput): void => {
  validateUuid(input.tenantId, "tenantId");
  validateUuid(input.complaintId, "complaintId");
  validateUuid(input.candidateComplaintId, "candidateComplaintId");
  validateUuid(input.actor.accountId, "actor.accountId");
  if (input.complaintId === input.candidateComplaintId) throw new ComplaintDomainError("VALIDATION_ERROR", "duplicate decision requires two different complaints");
  if (!DUPLICATE_DECISIONS.includes(input.decision)) throw new ComplaintDomainError("VALIDATION_ERROR", "decision is invalid");
  if (!DUPLICATE_STAFF_ROLES.includes(input.actor.role)) throw new ComplaintDomainError("FORBIDDEN", "actor role cannot decide duplicates");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new ComplaintDomainError("VALIDATION_ERROR", "expectedVersion is invalid");
  if (typeof input.reason !== "string" || input.reason.trim().length < 3 || input.reason.trim().length > 2_000 || CONTROL_PATTERN.test(input.reason)) throw new ComplaintDomainError("VALIDATION_ERROR", "reason must be between 3 and 2000 characters");
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 255 || CONTROL_PATTERN.test(input.idempotencyKey)) throw new ComplaintDomainError("VALIDATION_ERROR", "idempotencyKey is invalid");
  if (input.occurredAt !== undefined && (!(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime()))) throw new ComplaintDomainError("VALIDATION_ERROR", "occurredAt is invalid");
};

export class InMemoryDuplicateDecisionRepository {
  private readonly decisions = new Map<string, DuplicateDecisionRecord>();
  private readonly idempotency = new Map<string, StoredIdempotency>();
  private readonly audit: DuplicateDecisionAudit[] = [];

  constructor(private readonly clock: () => Date = () => new Date()) {}

  record(records: readonly ComplaintRecord[], input: DuplicateDecisionInput): DuplicateDecisionResult {
    validateDecisionInput(input);
    const requestHash = createHash("sha256").update(JSON.stringify({
      tenantId: input.tenantId,
      complaintId: input.complaintId,
      candidateComplaintId: input.candidateComplaintId,
      decision: input.decision,
      reason: input.reason.trim(),
      expectedVersion: input.expectedVersion,
      actor: input.actor,
      occurredAt: input.occurredAt?.toISOString() ?? null,
    })).digest("hex");
    const idempotencyScope = `${input.tenantId}:${input.actor.accountId}:duplicate-decision:${input.idempotencyKey}`;
    const replay = this.idempotency.get(idempotencyScope);
    if (replay) {
      if (replay.requestHash !== requestHash) throw new ComplaintDomainError("IDEMPOTENCY_CONFLICT", "duplicate decision idempotency key was reused with different request data");
      return cloneDecisionResult(replay.result, true);
    }

    const source = records.find((record) => record.id === input.complaintId && record.tenantId === input.tenantId);
    const candidate = records.find((record) => record.id === input.candidateComplaintId && record.tenantId === input.tenantId);
    if (!source || !candidate) throw new ComplaintDomainError("NOT_FOUND", "complaint candidate was not found");
    if (isTerminal(source.canonicalStatus) || isTerminal(candidate.canonicalStatus)) throw new ComplaintDomainError("CONFLICT", "duplicate decisions require unresolved complaints");
    if (source.rowVersion !== input.expectedVersion) throw new ComplaintDomainError("VERSION_CONFLICT", "complaint version is stale", { currentVersion: source.rowVersion });
    if (!buildDuplicateCandidates({ tenantId: input.tenantId, sourceComplaintId: source.id, records, limit: 50 }).some((item) => item.candidateComplaintId === candidate.id)) {
      throw new ComplaintDomainError("CONFLICT", "candidate is outside the configured duplicate suggestion boundary");
    }

    const now = (input.occurredAt ?? this.clock()).toISOString();
    const pairKey = pairKeyFor(input.tenantId, input.complaintId, input.candidateComplaintId);
    const existing = this.decisions.get(pairKey);
    const record: DuplicateDecisionRecord = existing ? {
      ...existing,
      decision: input.decision,
      decidedByAccountId: input.actor.accountId,
      reason: input.reason.trim(),
      updatedAt: now,
      rowVersion: existing.rowVersion + 1,
    } : {
      id: randomUUID(),
      tenantId: input.tenantId,
      complaintId: [input.complaintId, input.candidateComplaintId].sort()[0]!,
      candidateComplaintId: [input.complaintId, input.candidateComplaintId].sort()[1]!,
      decision: input.decision,
      decidedByAccountId: input.actor.accountId,
      reason: input.reason.trim(),
      createdAt: now,
      updatedAt: now,
      rowVersion: 1,
    };
    this.decisions.set(pairKey, record);
    this.audit.push({
      id: randomUUID(),
      tenantId: input.tenantId,
      complaintId: input.complaintId,
      candidateComplaintId: input.candidateComplaintId,
      decision: input.decision,
      actorAccountId: input.actor.accountId,
      actorRole: input.actor.role,
      reason: input.reason.trim(),
      occurredAt: now,
    });
    const result: DuplicateDecisionResult = { record: cloneDecision(record), idempotentReplay: false };
    this.idempotency.set(idempotencyScope, { requestHash, result });
    return result;
  }

  get(tenantId: string, complaintId: string, candidateComplaintId: string): DuplicateDecisionRecord | undefined {
    const record = this.decisions.get(pairKeyFor(tenantId, complaintId, candidateComplaintId));
    return record && record.tenantId === tenantId ? cloneDecision(record) : undefined;
  }

  list(tenantId: string): DuplicateDecisionRecord[] {
    return [...this.decisions.values()].filter((record) => record.tenantId === tenantId).map(cloneDecision);
  }

  listAudit(tenantId: string): DuplicateDecisionAudit[] {
    return this.audit.filter((entry) => entry.tenantId === tenantId).map((entry) => ({ ...entry }));
  }
}

export const recordDuplicateDecision = (repository: InMemoryDuplicateDecisionRepository, records: readonly ComplaintRecord[], input: DuplicateDecisionInput): DuplicateDecisionResult => repository.record(records, input);
