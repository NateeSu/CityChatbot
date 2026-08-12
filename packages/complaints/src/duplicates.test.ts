import { describe, expect, it } from "vitest";

import { ComplaintDomainError, InMemoryComplaintRepository, InMemoryDuplicateDecisionRepository, buildCitizenSafeDuplicateMap, buildDuplicateCandidates, recordDuplicateDecision, type ComplaintCreateInput, type ComplaintRecord } from "./index";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const QUEUE = "44444444-4444-4444-8444-444444444444";
const CATEGORY_WASTE = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ROAD = "55555555-5555-4555-8555-555555555555";
const ACCOUNT = "66666666-6666-4666-8666-666666666666";

const input = (overrides: Partial<ComplaintCreateInput> = {}): ComplaintCreateInput => ({
  tenantId: TENANT_A,
  lineUserId: "Uduplicate-test",
  categoryId: CATEGORY_WASTE,
  title: "ถนนชำรุดหน้าตลาด",
  description: "รายละเอียดสังเคราะห์สำหรับทดสอบ candidate duplicate",
  intakeQueueId: QUEUE,
  idempotencyKey: "duplicate-create-001",
  occurredAt: new Date("2026-08-10T00:00:00.000Z"),
  location: { latitude: 13.690000, longitude: 101.077000 },
  ...overrides,
});

const recordsFor = (): ComplaintRecord[] => {
  const repository = new InMemoryComplaintRepository({ prefixForTenant: () => "CCM" });
  const source = repository.create(input({ idempotencyKey: "duplicate-source-001" })).record;
  const samePoint = repository.create(input({ idempotencyKey: "duplicate-same-001", lineUserId: "Usame-point", occurredAt: new Date("2026-08-10T00:30:00.000Z") })).record;
  const edgeDistance = repository.create(input({ idempotencyKey: "duplicate-edge-001", lineUserId: "Uedge", location: { latitude: 13.690899, longitude: 101.077000 }, occurredAt: new Date("2026-08-10T01:00:00.000Z") })).record;
  const outsideDistance = repository.create(input({ idempotencyKey: "duplicate-far-001", lineUserId: "Ufar", location: { latitude: 13.700000, longitude: 101.077000 } })).record;
  const outsideTime = repository.create(input({ idempotencyKey: "duplicate-old-001", lineUserId: "Uold", occurredAt: new Date("2026-08-01T00:00:00.000Z") })).record;
  const missingGps = repository.create(input({ idempotencyKey: "duplicate-nogps-001", lineUserId: "Unogps", location: undefined })).record;
  const otherCategory = repository.create(input({ idempotencyKey: "duplicate-other-category-001", lineUserId: "Ucategory", categoryId: CATEGORY_ROAD, title: "ถนนชำรุดหน้าตลาด", occurredAt: new Date("2026-08-10T00:20:00.000Z") })).record;
  const otherTenant = repository.create(input({ idempotencyKey: "duplicate-other-tenant-001", tenantId: TENANT_B, lineUserId: "Utenantb", location: { latitude: 13.690000, longitude: 101.077000 } })).record;
  return [source, samePoint, edgeDistance, outsideDistance, outsideTime, missingGps, otherCategory, otherTenant];
};

describe("duplicate candidate generation", () => {
  it("enforces tenant, unresolved, spatial, time and category boundaries deterministically", () => {
    const records = recordsFor();
    const source = records[0]!;
    const query = { tenantId: TENANT_A, sourceComplaintId: source.id, records, radiusMeters: 100, windowHours: 4, limit: 10 };
    const first = buildDuplicateCandidates(query);
    const second = buildDuplicateCandidates({ ...query, records: [...records].reverse() });
    expect(first.map((candidate) => candidate.candidateComplaintId)).toEqual(second.map((candidate) => candidate.candidateComplaintId));
    expect(first).toHaveLength(3);
    expect(first.map((candidate) => candidate.candidateComplaintId).slice(0, 2)).toEqual([records[1]!.id, records[2]!.id]);
    expect(first.map((candidate) => candidate.candidateComplaintId)).toContain(records[6]!.id);
    expect(first[0]).toMatchObject({ distanceMeters: 0, timeDistanceSeconds: 1800, sameCategory: true });
    expect(first[1]!.distanceMeters).toBeGreaterThan(90);
    expect(first.every((candidate) => candidate.candidateComplaintId !== records[3]!.id && candidate.candidateComplaintId !== records[4]!.id && candidate.candidateComplaintId !== records[5]!.id && candidate.candidateComplaintId !== records[7]!.id)).toBe(true);
  });

  it("supports text similarity when category differs, keeps limits bounded, and returns no result without GPS", () => {
    const records = recordsFor();
    const source = records[0]!;
    const result = buildDuplicateCandidates({ tenantId: TENANT_A, sourceComplaintId: source.id, records, radiusMeters: 100, windowHours: 4, minTextSimilarity: 0.8, limit: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]!.candidateComplaintId).toBe(records[1]!.id);
    expect(() => buildDuplicateCandidates({ tenantId: TENANT_A, sourceComplaintId: source.id, records, radiusMeters: 100, windowHours: 4, minTextSimilarity: 1.01 })).toThrowError(ComplaintDomainError);
    const noGps = records.find((record) => record.id === records[5]!.id)!;
    expect(buildDuplicateCandidates({ tenantId: TENANT_A, sourceComplaintId: noGps.id, records, radiusMeters: 100, windowHours: 4 })).toEqual([]);
  });

  it("aggregates high-density points without exposing complaint or reporter identity", () => {
    const records = recordsFor();
    const candidates = buildDuplicateCandidates({ tenantId: TENANT_A, sourceComplaintId: records[0]!.id, records, radiusMeters: 100, windowHours: 4, limit: 10 });
    const clusters = buildCitizenSafeDuplicateMap(candidates.filter((candidate) => candidate.distanceMeters === 0), { gridMeters: 100, highDensityThreshold: 2 });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ candidateCount: 2, highDensity: true });
    expect(JSON.stringify(clusters)).not.toContain("candidateComplaintId");
    expect(JSON.stringify(clusters)).not.toContain("lineUserId");
  });
});

describe("duplicate staff decisions", () => {
  it("records LINK/MERGE_REFERENCE/NOT_DUPLICATE idempotently and never mutates complaint status", () => {
    const records = recordsFor();
    const source = records[0]!;
    const candidate = records[1]!;
    const repository = new InMemoryDuplicateDecisionRepository(() => new Date("2026-08-10T02:00:00.000Z"));
    const inputBase = { tenantId: TENANT_A, complaintId: source.id, candidateComplaintId: candidate.id, decision: "MERGE_REFERENCE" as const, reason: "เจ้าหน้าที่ตรวจพบว่าเป็นเหตุเดียวกัน", expectedVersion: source.rowVersion, actor: { accountId: ACCOUNT, role: "DEPARTMENT_HEAD" as const }, idempotencyKey: "duplicate-decision-001" };
    const result = recordDuplicateDecision(repository, records, inputBase);
    expect(result.idempotentReplay).toBe(false);
    expect(recordDuplicateDecision(repository, records, inputBase)).toMatchObject({ idempotentReplay: true, record: { decision: "MERGE_REFERENCE", rowVersion: 1 } });
    expect(records[0]!.canonicalStatus).toBe("RECEIVED");
    expect(records[1]!.canonicalStatus).toBe("RECEIVED");
    expect(repository.listAudit(TENANT_A)).toHaveLength(1);
    expect(repository.get(TENANT_A, candidate.id, source.id)?.complaintId).toBe([candidate.id, source.id].sort()[0]);
  });

  it("rejects cross-tenant, stale and mismatched idempotency decisions", () => {
    const records = recordsFor();
    const source = records[0]!;
    const candidate = records[1]!;
    const repository = new InMemoryDuplicateDecisionRepository();
    const base = { tenantId: TENANT_A, complaintId: source.id, candidateComplaintId: candidate.id, decision: "LINK" as const, reason: "ตรวจสอบแล้ว", expectedVersion: source.rowVersion, actor: { accountId: ACCOUNT, role: "STAFF" as const }, idempotencyKey: "duplicate-decision-002" };
    recordDuplicateDecision(repository, records, base);
    expect(() => recordDuplicateDecision(repository, records, { ...base, decision: "NOT_DUPLICATE", reason: "เปลี่ยนผล", })).toThrowError(ComplaintDomainError);
    expect(() => recordDuplicateDecision(repository, records, { ...base, idempotencyKey: "duplicate-decision-003", candidateComplaintId: records[7]!.id })).toThrowError(ComplaintDomainError);
    expect(() => recordDuplicateDecision(repository, records, { ...base, idempotencyKey: "duplicate-decision-005", candidateComplaintId: records[3]!.id })).toThrowError(ComplaintDomainError);
    expect(() => recordDuplicateDecision(repository, records, { ...base, idempotencyKey: "duplicate-decision-004", expectedVersion: 99 })).toThrowError(ComplaintDomainError);
  });
});
