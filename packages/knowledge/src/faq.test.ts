import { describe, expect, it } from "vitest";

import {
  FaqCandidateError,
  FaqCandidateService,
  InMemoryFaqActiveIndex,
  InMemoryFaqCandidateStore,
  type ProposeFaqInput,
} from "./faq";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const DEPARTMENT_A = "55555555-5555-4555-8555-555555555555";
const DEPARTMENT_B = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-08-11T03:00:00.000Z");

const sourceRecords = new Map<string, {
  tenantId: string;
  ticketId: string;
  messageId: string;
  eventId: string;
  authorType: "STAFF";
  visibility: "PUBLIC";
  isAiDraft: boolean;
  body: string;
}>();

sourceRecords.set("ticket-a|message-a", {
  tenantId: TENANT_A,
  ticketId: "ticket-a",
  messageId: "message-a",
  eventId: "staff-message-a",
  authorType: "STAFF",
  visibility: "PUBLIC",
  isAiDraft: false,
  body: "Staff answered after checking the approved source.",
});
sourceRecords.set("ticket-b|message-b", {
  tenantId: TENANT_A,
  ticketId: "ticket-b",
  messageId: "message-b",
  eventId: "staff-message-b",
  authorType: "STAFF",
  visibility: "PUBLIC",
  isAiDraft: false,
  body: "Another verified staff answer.",
});

const service = (): FaqCandidateService => new FaqCandidateService({
  store: new InMemoryFaqCandidateStore(),
  index: new InMemoryFaqActiveIndex(),
  clock: () => NOW,
  sourceReader: (tenantId, ticketId, messageId) => {
    const value = sourceRecords.get(`${ticketId}|${messageId}`);
    return value?.tenantId === tenantId ? value : undefined;
  },
});

const propose = (faq: FaqCandidateService, overrides: Partial<ProposeFaqInput> = {}): ReturnType<FaqCandidateService["propose"]> => faq.propose({
  tenantId: TENANT_A,
  ticketId: "ticket-a",
  sourceMessageId: "message-a",
  sourceType: "TICKET_MESSAGE",
  evidenceIds: ["retrieval-evidence-a"],
  retrievalTraceId: "retrieval-trace-a",
  question: "question: Where can I request this service?",
  answer: "answer: Submit the request at the municipal service desk.",
  departmentId: DEPARTMENT_A,
  knowledgeCategoryId: "category-civic",
  visibility: "PUBLIC",
  effectiveFrom: NOW,
  effectiveUntil: new Date("2027-08-11T03:00:00.000Z"),
  privacyReviewed: true,
  createdBy: "staff-proposer",
  idempotencyKey: "faq-propose-001",
  now: NOW,
  ...overrides,
});

const approveAndPublish = (faq: FaqCandidateService, candidateId: string, version: number, prefix: string) => {
  const reviewed = faq.reviewOwner({
    tenantId: TENANT_A,
    candidateId,
    expectedVersion: version,
    reviewerId: "department-reviewer",
    reviewerDepartmentIds: [DEPARTMENT_A],
    decision: "APPROVE",
    reason: "Owner verified the source and effective window.",
    idempotencyKey: `${prefix}-review`,
    now: NOW,
  });
  const approved = faq.approveCoordinator({
    tenantId: TENANT_A,
    candidateId,
    expectedVersion: reviewed.candidate.rowVersion,
    coordinatorId: "tenant-coordinator",
    idempotencyKey: `${prefix}-approve`,
    now: NOW,
  });
  return faq.publish({
    tenantId: TENANT_A,
    candidateId,
    expectedVersion: approved.candidate.rowVersion,
    actorId: "tenant-coordinator",
    idempotencyKey: `${prefix}-publish`,
    now: NOW,
  });
};

describe("FAQ candidate governance and incremental active index", () => {
  it("keeps an unapproved candidate out of retrieval and creates immutable source lineage on approval", () => {
    const faq = service();
    const proposed = propose(faq);
    expect(faq.index.listSearchable(TENANT_A, "service")).toEqual([]);
    expect(faq.knowledgeRepository.listRetrievableVersions(TENANT_A)).toEqual([]);

    const reviewed = faq.reviewOwner({
      tenantId: TENANT_A,
      candidateId: proposed.candidate.id,
      expectedVersion: proposed.candidate.rowVersion,
      reviewerId: "department-reviewer",
      reviewerDepartmentIds: [DEPARTMENT_A],
      decision: "APPROVE",
      reason: "Source is owned by the department.",
      idempotencyKey: "faq-review-001",
      now: NOW,
    });
    const approved = faq.approveCoordinator({
      tenantId: TENANT_A,
      candidateId: proposed.candidate.id,
      expectedVersion: reviewed.candidate.rowVersion,
      coordinatorId: "tenant-coordinator",
      idempotencyKey: "faq-approve-001",
      now: NOW,
    });
    expect(approved.candidate.status).toBe("APPROVED");
    expect(approved.candidate.source.sourceEventId).toBe("staff-message-a");
    expect(approved.candidate.source.evidenceIds).toEqual(["retrieval-evidence-a"]);
    expect(approved.candidate.documentVersionId).toBeDefined();
    expect(approved.candidate.coordinatorApprovedBy).toBe("tenant-coordinator");
    expect(faq.knowledgeRepository.listApprovals(TENANT_A, approved.candidate.documentVersionId!)).toMatchObject([
      { decision: "APPROVED", reviewerAccountId: "tenant-coordinator" },
    ]);
    expect(faq.index.listSearchable(TENANT_A, "service")).toEqual([]);

    const published = faq.publish({
      tenantId: TENANT_A,
      candidateId: proposed.candidate.id,
      expectedVersion: approved.candidate.rowVersion,
      actorId: "tenant-coordinator",
      idempotencyKey: "faq-publish-001",
      now: NOW,
    });
    expect(published.candidate.status).toBe("PUBLISHED");
    expect(faq.index.activeSnapshot(TENANT_A)?.entries[0]?.searchText).toContain("request this service");
    expect(faq.index.listSearchable(TENANT_A, "request this service", { at: NOW })).toHaveLength(1);
    expect(faq.knowledgeRepository.listRetrievableVersions(TENANT_A).map((version) => version.id)).toEqual([published.candidate.documentVersionId]);
  });

  it("does not auto-learn a staff reply; only explicit source selection creates a candidate", () => {
    const faq = service();
    expect(faq.list(TENANT_A)).toEqual([]);
    expect(sourceRecords.get("ticket-a|message-a")?.authorType).toBe("STAFF");
    expect(faq.index.listSearchable(TENANT_A, "staff answered")).toEqual([]);
    const first = propose(faq);
    const replay = propose(faq);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.candidate.id).toBe(first.candidate.id);
    expect(faq.list(TENANT_A)).toHaveLength(1);
  });

  it("blocks unresolved duplicate/conflicting answers before publication", () => {
    const faq = service();
    approveAndPublish(faq, propose(faq).candidate.id, 1, "faq-first");
    const conflicting = propose(faq, {
      ticketId: "ticket-b",
      sourceMessageId: "message-b",
      question: "question: Where can I request this service?",
      answer: "answer: Submit the request through an unverified private channel.",
      idempotencyKey: "faq-conflict-001",
    });
    expect(conflicting.candidate.status).toBe("CONFLICT");
    expect(conflicting.candidate.duplicateCheck.status).toBe("CONFLICT");
    expect(() => faq.publish({
      tenantId: TENANT_A,
      candidateId: conflicting.candidate.id,
      expectedVersion: conflicting.candidate.rowVersion,
      actorId: "tenant-coordinator",
      idempotencyKey: "faq-conflict-publish",
      now: NOW,
    })).toThrowError(/CONFLICT/);
  });

  it("revokes the active FAQ, removes it from search, and retains rollback history", () => {
    const faq = service();
    const published = approveAndPublish(faq, propose(faq).candidate.id, 1, "faq-rollback");
    expect(faq.index.listSearchable(TENANT_A, "service", { at: NOW })).toHaveLength(1);
    const revoked = faq.revoke({
      tenantId: TENANT_A,
      candidateId: published.candidate.id,
      expectedVersion: published.candidate.rowVersion,
      actorId: "tenant-coordinator",
      reason: "The source was superseded and must be disabled.",
      rollback: true,
      idempotencyKey: "faq-rollback-revoke",
      now: NOW,
    });
    expect(revoked.candidate.status).toBe("REVOKED");
    expect(revoked.indexSnapshot?.reason).toBe("ROLLBACK");
    expect(faq.index.listSearchable(TENANT_A, "service")).toEqual([]);
    expect(faq.index.listSnapshots(TENANT_A).length).toBe(2);
    expect(faq.knowledgeRepository.getVersion(TENANT_A, published.candidate.documentVersionId!).state).toBe("RETIRED");
  });

  it("enforces tenant and department scopes for candidate review and retrieval", () => {
    const faq = service();
    const candidate = propose(faq);
    expect(() => faq.reviewOwner({
      tenantId: TENANT_A,
      candidateId: candidate.candidate.id,
      expectedVersion: candidate.candidate.rowVersion,
      reviewerId: "wrong-department-reviewer",
      reviewerDepartmentIds: [DEPARTMENT_B],
      decision: "APPROVE",
      reason: "This reviewer is outside the owner department.",
      idempotencyKey: "faq-wrong-department",
      now: NOW,
    })).toThrowError(new FaqCandidateError("FORBIDDEN", "reviewer is outside the FAQ department scope"));
    expect(faq.get(TENANT_A, candidate.candidate.id).tenantId).toBe(TENANT_A);
    expect(() => faq.get(TENANT_B, candidate.candidate.id)).toThrowError(/NOT_FOUND|TENANT_BOUNDARY/);
    approveAndPublish(faq, candidate.candidate.id, candidate.candidate.rowVersion, "faq-scope");
    expect(faq.index.listSearchable(TENANT_B, "service")).toEqual([]);
    expect(faq.list(TENANT_A, { departmentIds: [DEPARTMENT_A] })).toHaveLength(1);
    expect(faq.list(TENANT_A, { departmentIds: [DEPARTMENT_B] })).toEqual([]);
  });
});
