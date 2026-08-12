import { FaqCandidateError } from "@citychatbot/knowledge";
import { NextResponse } from "next/server";

import { localSupportAdminContext } from "../../context";
import { readSupportExpectedVersion, readSupportIdempotencyKey, readSupportObjectBody, readSupportRequiredString, supportDomainErrorResponse, supportJsonError } from "../../errors";
import {
  assertLocalSupportTicketAccess,
  ensureLocalSupportFixtures,
  faqService,
  getAdminFaqCandidate,
  getAdminSupportDetail,
  isSupportLocalEnvironment,
  type SupportAdminRole,
} from "../../repository";

export const runtime = "nodejs";

const roleCanPropose = (role: SupportAdminRole): boolean => role === "STAFF" || role === "DEPARTMENT_HEAD" || role === "TENANT_ADMIN";
const roleCanReview = (role: SupportAdminRole): boolean => role === "STAFF" || role === "DEPARTMENT_HEAD";
const roleCanCoordinate = (role: SupportAdminRole): boolean => role === "TENANT_ADMIN";

const readArray = (body: Record<string, unknown>, field: string): string[] => {
  const value = body[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) throw new FaqCandidateError("VALIDATION_ERROR", `${field} is invalid`);
  return value.map((item) => (item as string).trim());
};

const readBoolean = (body: Record<string, unknown>, field: string, fallback = false): boolean => {
  const value = body[field];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new FaqCandidateError("VALIDATION_ERROR", `${field} is invalid`);
  return value;
};

const readCandidateId = (body: Record<string, unknown>): string => readSupportRequiredString(body, "candidateId");

const assertCandidateBelongsToTicket = (tenantId: string, candidateId: string, ticketId: string): void => {
  const candidate = faqService.get(tenantId, candidateId);
  if (candidate.ticketId !== ticketId) throw new FaqCandidateError("NOT_FOUND", "FAQ candidate was not found for this support ticket");
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isSupportLocalEnvironment()) return supportJsonError(503, "CONFIGURATION_UNAVAILABLE", "FAQ candidate workflow is not configured");
  const adminContext = localSupportAdminContext(new URL(request.url));
  if (!adminContext) return supportJsonError(404, "NOT_FOUND", "support ticket was not found in the authorized scope");
  ensureLocalSupportFixtures();
  try {
    const { id } = await context.params;
    assertLocalSupportTicketAccess(adminContext, id);
    const detail = getAdminSupportDetail(adminContext, id);
    return NextResponse.json({ items: detail.faqCandidates, ticketId: id, synthetic: true });
  } catch (error) {
    return supportDomainErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isSupportLocalEnvironment()) return supportJsonError(503, "CONFIGURATION_UNAVAILABLE", "FAQ candidate workflow is not configured");
  const adminContext = localSupportAdminContext(new URL(request.url));
  if (!adminContext) return supportJsonError(404, "NOT_FOUND", "support ticket was not found in the authorized scope");
  ensureLocalSupportFixtures();
  try {
    const { id } = await context.params;
    const ticket = assertLocalSupportTicketAccess(adminContext, id);
    const body = await readSupportObjectBody(request);
    const action = readSupportRequiredString(body, "action").toUpperCase();
    const idempotencyKey = readSupportIdempotencyKey(request, body);
    let result;
    if (action === "PROPOSE") {
      if (!roleCanPropose(adminContext.role)) throw new FaqCandidateError("FORBIDDEN", "you cannot propose a FAQ");
      const departmentId = readSupportRequiredString(body, "departmentId");
      if (adminContext.role !== "TENANT_ADMIN" && !adminContext.departmentIds.includes(departmentId)) throw new FaqCandidateError("FORBIDDEN", "FAQ department is outside your scope");
      const sourceMessageId = readSupportRequiredString(body, "sourceMessageId");
      const evidenceIds = readArray(body, "evidenceIds");
      const retrievalTraceId = typeof body.retrievalTraceId === "string" ? body.retrievalTraceId : ticket.source.retrievalTraceId;
      result = faqService.propose({
        tenantId: adminContext.tenantId,
        ticketId: id,
        sourceMessageId,
        sourceType: "TICKET_MESSAGE",
        ...(retrievalTraceId ? { retrievalTraceId } : {}),
        evidenceIds: evidenceIds.length > 0 ? evidenceIds : [sourceMessageId],
        question: readSupportRequiredString(body, "question"),
        answer: readSupportRequiredString(body, "answer"),
        departmentId,
        knowledgeCategoryId: readSupportRequiredString(body, "knowledgeCategoryId"),
        visibility: readSupportRequiredString(body, "visibility") as "PUBLIC" | "INTERNAL" | "RESTRICTED",
        ...(typeof body.effectiveFrom === "string" ? { effectiveFrom: body.effectiveFrom } : {}),
        ...(typeof body.effectiveUntil === "string" ? { effectiveUntil: body.effectiveUntil } : {}),
        effectiveDateUnknown: readBoolean(body, "effectiveDateUnknown"),
        privacyReviewed: readBoolean(body, "privacyReviewed"),
        createdBy: adminContext.accountId,
        idempotencyKey,
      });
    } else if (action === "EDIT") {
      const candidateId = readCandidateId(body);
      assertCandidateBelongsToTicket(adminContext.tenantId, candidateId, id);
      const departmentId = typeof body.departmentId === "string" ? body.departmentId : undefined;
      if (departmentId && adminContext.role !== "TENANT_ADMIN" && !adminContext.departmentIds.includes(departmentId)) throw new FaqCandidateError("FORBIDDEN", "FAQ department is outside your scope");
      result = faqService.edit({
        tenantId: adminContext.tenantId,
        candidateId,
        expectedVersion: readSupportExpectedVersion(request, body),
        ...(typeof body.question === "string" ? { question: body.question } : {}),
        ...(typeof body.answer === "string" ? { answer: body.answer } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(typeof body.knowledgeCategoryId === "string" ? { knowledgeCategoryId: body.knowledgeCategoryId } : {}),
        ...(typeof body.visibility === "string" ? { visibility: body.visibility as "PUBLIC" | "INTERNAL" | "RESTRICTED" } : {}),
        ...(typeof body.effectiveFrom === "string" || body.effectiveFrom === null ? { effectiveFrom: body.effectiveFrom as string | null } : {}),
        ...(typeof body.effectiveUntil === "string" || body.effectiveUntil === null ? { effectiveUntil: body.effectiveUntil as string | null } : {}),
        ...(body.effectiveDateUnknown !== undefined ? { effectiveDateUnknown: readBoolean(body, "effectiveDateUnknown") } : {}),
        ...(body.privacyReviewed !== undefined ? { privacyReviewed: readBoolean(body, "privacyReviewed") } : {}),
        actorId: adminContext.accountId,
        idempotencyKey,
      });
    } else if (action === "REVIEW") {
      if (!roleCanReview(adminContext.role)) throw new FaqCandidateError("FORBIDDEN", "owner review is restricted to department staff");
      const candidateId = readCandidateId(body);
      assertCandidateBelongsToTicket(adminContext.tenantId, candidateId, id);
      result = faqService.reviewOwner({
        tenantId: adminContext.tenantId,
        candidateId,
        expectedVersion: readSupportExpectedVersion(request, body),
        reviewerId: adminContext.accountId,
        reviewerDepartmentIds: adminContext.departmentIds,
        decision: readSupportRequiredString(body, "decision") as "APPROVE" | "REJECT",
        reason: readSupportRequiredString(body, "reason"),
        idempotencyKey,
      });
    } else if (action === "APPROVE") {
      if (!roleCanCoordinate(adminContext.role)) throw new FaqCandidateError("FORBIDDEN", "coordinator approval is restricted to tenant governance");
      const candidateId = readCandidateId(body);
      assertCandidateBelongsToTicket(adminContext.tenantId, candidateId, id);
      result = faqService.approveCoordinator({
        tenantId: adminContext.tenantId,
        candidateId,
        expectedVersion: readSupportExpectedVersion(request, body),
        coordinatorId: adminContext.accountId,
        confirmUnknownEffectiveDate: readBoolean(body, "confirmUnknownEffectiveDate"),
        idempotencyKey,
      });
    } else if (action === "PUBLISH") {
      if (!roleCanCoordinate(adminContext.role)) throw new FaqCandidateError("FORBIDDEN", "FAQ publication is restricted to tenant governance");
      const candidateId = readCandidateId(body);
      assertCandidateBelongsToTicket(adminContext.tenantId, candidateId, id);
      result = faqService.publish({
        tenantId: adminContext.tenantId,
        candidateId,
        expectedVersion: readSupportExpectedVersion(request, body),
        actorId: adminContext.accountId,
        idempotencyKey,
      });
    } else if (action === "REVOKE" || action === "ROLLBACK") {
      if (!roleCanCoordinate(adminContext.role)) throw new FaqCandidateError("FORBIDDEN", "FAQ rollback is restricted to tenant governance");
      const candidateId = readCandidateId(body);
      assertCandidateBelongsToTicket(adminContext.tenantId, candidateId, id);
      result = faqService.revoke({
        tenantId: adminContext.tenantId,
        candidateId,
        expectedVersion: readSupportExpectedVersion(request, body),
        actorId: adminContext.accountId,
        reason: readSupportRequiredString(body, "reason"),
        rollback: action === "ROLLBACK" || readBoolean(body, "rollback"),
        idempotencyKey,
      });
    } else {
      throw new FaqCandidateError("VALIDATION_ERROR", "action is invalid");
    }
    return NextResponse.json({ faqCandidate: getAdminFaqCandidate(adminContext, result.candidate.id), detail: getAdminSupportDetail(adminContext, id), synthetic: true }, { status: action === "PROPOSE" ? 201 : 200 });
  } catch (error) {
    return supportDomainErrorResponse(error);
  }
}
