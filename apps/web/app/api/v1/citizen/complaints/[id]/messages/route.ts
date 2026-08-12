import { complaintRepository, hasLocalComplaintIdentity, isLocalSyntheticEnvironment, LOCAL_LINE_USER_ID, LOCAL_TENANT_ID } from "../../repository";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const jsonError = (status: number, reasonCode: string, message: string): NextResponse =>
  NextResponse.json({ error: { reasonCode, message } }, { status });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) return jsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบส่งข้อมูลเพิ่มเติมยังไม่พร้อมใช้งาน");
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
  const message = typeof body.body === "string" ? body.body : undefined;
  if (!message) return jsonError(400, "VALIDATION_ERROR", "กรุณาระบุข้อมูลเพิ่มเติม");
  const current = complaintRepository.getInternalView(LOCAL_TENANT_ID, id);
  if (!current || current.record.lineUserId !== LOCAL_LINE_USER_ID) return jsonError(404, "NOT_FOUND", "ไม่พบเรื่องร้องเรียน");
  const requestedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : current.record.rowVersion;
  try {
    const result = complaintRepository.addCitizenInformation({
      tenantId: LOCAL_TENANT_ID,
      lineUserId: LOCAL_LINE_USER_ID,
      complaintId: id,
      expectedVersion: requestedVersion,
      body: message,
      idempotencyKey,
    });
    return NextResponse.json({ messageId: result.messageId, item: result.view, idempotentReplay: result.idempotentReplay }, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "PROCESSING_FAILED";
    const status = code === "NOT_FOUND" || code === "FORBIDDEN" ? 404 : code === "VALIDATION_ERROR" ? 400 : code === "CONFLICT" || code === "VERSION_CONFLICT" || code === "IDEMPOTENCY_CONFLICT" ? 409 : 500;
    return jsonError(status, code, status === 500 ? "ไม่สามารถส่งข้อมูลเพิ่มเติมได้" : "ไม่สามารถส่งข้อมูลเพิ่มเติมได้ กรุณาตรวจสอบแล้วลองใหม่");
  }
}
