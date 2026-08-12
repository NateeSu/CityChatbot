import { complaintRepository, hasLocalComplaintIdentity, isLocalSyntheticEnvironment, LOCAL_LINE_USER_ID, LOCAL_TENANT_ID } from "../../repository";
import { submitCitizenSurvey } from "../../../runtime";
import { mapCitizenError, requestHash, requireCitizenCsrf, requireCitizenSession } from "../../../session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const jsonError = (status: number, reasonCode: string, message: string): NextResponse =>
  NextResponse.json({ error: { reasonCode, message } }, { status });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) {
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 255) return jsonError(400, "VALIDATION_ERROR", "ต้องมี Idempotency-Key");
    try {
      const session = requireCitizenSession(request);
      requireCitizenCsrf(request, session);
      const { id } = await context.params;
      const body = await request.json() as { rating?: unknown; comment?: unknown };
      if (typeof body.rating !== "number") return jsonError(400, "VALIDATION_ERROR", "กรุณาให้คะแนนความพึงพอใจ");
      const comment = typeof body.comment === "string" ? body.comment : undefined;
      const result = await submitCitizenSurvey({ tenantId: session.tenantId, lineUserId: session.lineUserId, complaintId: id, rating: body.rating, ...(comment ? { comment } : {}), idempotencyKey, requestHash: requestHash({ complaintId: id, rating: body.rating, comment: comment ?? null }) });
      return NextResponse.json(result, { status: result.idempotentReplay ? 200 : 201 });
    } catch (error) {
      const mapped = mapCitizenError(error);
      return jsonError(mapped.status, mapped.code, "ไม่สามารถบันทึกแบบประเมินได้");
    }
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 255) return jsonError(400, "VALIDATION_ERROR", "ต้องมี Idempotency-Key");
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "VALIDATION_ERROR", "รูปแบบข้อมูลไม่ถูกต้อง");
  }
  if (!isRecord(body) || !hasLocalComplaintIdentity(body)) return jsonError(404, "NOT_FOUND", "ไม่พบเรื่องร้องเรียน");
  const rating = typeof body.rating === "number" ? body.rating : undefined;
  const comment = typeof body.comment === "string" ? body.comment : undefined;
  try {
    const result = complaintRepository.submitSurvey({
      tenantId: LOCAL_TENANT_ID,
      lineUserId: LOCAL_LINE_USER_ID,
      complaintId: id,
      rating: rating ?? 0,
      ...(comment ? { comment } : {}),
      idempotencyKey,
    });
    return NextResponse.json(result, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "PROCESSING_FAILED";
    const status = code === "NOT_FOUND" || code === "FORBIDDEN" ? 404 : code === "VALIDATION_ERROR" ? 400 : code === "CONFLICT" || code === "IDEMPOTENCY_CONFLICT" ? 409 : 500;
    return jsonError(status, code, status === 500 ? "ไม่สามารถบันทึกแบบประเมินได้" : "ไม่สามารถบันทึกแบบประเมินได้ กรุณาตรวจสอบแล้วลองใหม่");
  }
}
