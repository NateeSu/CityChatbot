import { DUPLICATE_DECISIONS, recordDuplicateDecision, InMemoryDuplicateDecisionRepository, type DuplicateDecisionInput } from "@citychatbot/complaints";
import { NextResponse } from "next/server";

import { complaintRepository, isLocalSyntheticEnvironment } from "../../../../citizen/complaints/repository";
import { actorForAdminContext, localAdminContext } from "../../context";
import { domainErrorResponse, jsonError, readExpectedVersion, readIdempotencyKey, readObjectBody, readRequiredString } from "../../errors";
import { ensureLocalAdminFixtures } from "../../repository";

export const runtime = "nodejs";

const duplicateDecisionRepository = new InMemoryDuplicateDecisionRepository();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) return jsonError(503, "CONFIGURATION_UNAVAILABLE", "การตัดสินใจเรื่องซ้ำยังไม่พร้อมใช้งาน");
  const url = new URL(request.url);
  const adminContext = localAdminContext(url);
  if (!adminContext) return jsonError(404, "NOT_FOUND", "ไม่พบเรื่องร้องเรียนในขอบเขตที่คุณมีสิทธิ์ดู");
  ensureLocalAdminFixtures();
  const { id } = await context.params;
  try {
    const body = await readObjectBody(request);
    const decision = readRequiredString(body, "decision");
    if (!DUPLICATE_DECISIONS.includes(decision as (typeof DUPLICATE_DECISIONS)[number])) throw new Error("decision is invalid");
    const input: DuplicateDecisionInput = {
      tenantId: adminContext.tenantId,
      complaintId: id,
      candidateComplaintId: readRequiredString(body, "candidateComplaintId"),
      decision: decision as DuplicateDecisionInput["decision"],
      reason: readRequiredString(body, "reason"),
      expectedVersion: readExpectedVersion(request, body),
      actor: { accountId: adminContext.accountId, role: adminContext.role },
      idempotencyKey: readIdempotencyKey(request, body),
    };
    const result = recordDuplicateDecision(duplicateDecisionRepository, complaintRepository.listInternal(adminContext.tenantId).map((view) => view.record), input);
    return NextResponse.json({ item: result.record, idempotentReplay: result.idempotentReplay }, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "decision is invalid") return jsonError(400, "VALIDATION_ERROR", "decision ไม่ถูกต้อง");
    return domainErrorResponse(error, complaintRepository, adminContext, id);
  }
}
