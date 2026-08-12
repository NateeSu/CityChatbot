import { describe, expect, it } from "vitest";

import { faqService, ensureLocalSupportFixtures, supportStore, LOCAL_SUPPORT_QUEUE_ID } from "./repository";
import { LOCAL_DEPARTMENT_B_ID } from "../complaints/repository";
import { LOCAL_TENANT_ID } from "../../citizen/complaints/repository";

describe("local FAQ source integration", () => {
  it("accepts an explicitly selected public staff message as a candidate source", () => {
    ensureLocalSupportFixtures();
    const ticket = supportStore.list(LOCAL_TENANT_ID).find((item) => item.publicTicketId === "SUP-2026-000005");
    expect(ticket?.defaultIntakeQueueId).toBe(LOCAL_SUPPORT_QUEUE_ID);
    const message = ticket ? supportStore.listMessages(LOCAL_TENANT_ID, ticket.id).find((item) => item.authorType === "STAFF" && item.visibility === "PUBLIC" && !item.isAiDraft) : undefined;
    expect(message).toBeDefined();
    const proposed = faqService.propose({
      tenantId: LOCAL_TENANT_ID,
      ticketId: ticket!.id,
      sourceMessageId: message!.id,
      sourceType: "TICKET_MESSAGE",
      evidenceIds: ["local-evidence-005"],
      question: "question: What is the verified municipal service answer?",
      answer: "answer: Please contact the responsible municipal department.",
      departmentId: LOCAL_DEPARTMENT_B_ID,
      knowledgeCategoryId: "category-civic",
      visibility: "PUBLIC",
      effectiveFrom: "2026-08-11T00:00:00.000Z",
      privacyReviewed: true,
      createdBy: "10000000-0000-4000-8000-000000000003",
      idempotencyKey: "faq-local-integration-001",
      now: "2026-08-11T03:00:00.000Z",
    });
    expect(proposed.candidate.source.sourceEventId).toContain("staff-message:");
    expect(proposed.candidate.status).toBe("PENDING_OWNER_REVIEW");
  });
});
