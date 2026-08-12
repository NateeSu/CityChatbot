import { type ComplaintPublicListStatus, type ComplaintSubmitRequest } from "@citychatbot/complaints";
import { NextResponse } from "next/server";
import { complaintRecoveryService, complaintRepository, hasLocalCitizenIdentity, isLocalSyntheticEnvironment, LOCAL_LINE_USER_ID, LOCAL_QUEUE_ID, LOCAL_TENANT_ID } from "./repository";

export const runtime = "nodejs";

const jsonError = (status: number, reasonCode: string, message: string): NextResponse =>
  NextResponse.json({ error: { reasonCode, message } }, { status });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const asString = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;

const parseRequest = (value: unknown, idempotencyKey: string): ComplaintSubmitRequest | undefined => {
  if (!isRecord(value)) return undefined;
  const tenantId = asString(value.tenantId);
  const lineUserId = asString(value.lineUserId);
  const intakeQueueId = asString(value.intakeQueueId);
  const title = asString(value.title);
  const description = asString(value.description);
  const citizenName = asString(value.citizenName) ?? "";
  const phone = asString(value.phone) ?? "";
  const consentVersion = asString(value.consentVersion) ?? "";
  const notifyChannel = value.notifyChannel === "PHONE" ? "PHONE" : value.notifyChannel === "LINE" ? "LINE" : undefined;
  const categoryId = asString(value.categoryId);
  const categoryUncertain = value.categoryUncertain === true;
  const attachments = Array.isArray(value.attachments) ? value.attachments : [];
  const location = isRecord(value.location)
    ? {
        ...(asString(value.location.text) ? { text: asString(value.location.text) } : {}),
        ...(typeof value.location.latitude === "number" ? { latitude: value.location.latitude } : {}),
        ...(typeof value.location.longitude === "number" ? { longitude: value.location.longitude } : {}),
      }
    : undefined;
  if (!tenantId || !lineUserId || !intakeQueueId || !title || !description || !notifyChannel || !consentVersion || value.consentAccepted !== true) return undefined;
  if (!categoryId && !categoryUncertain) return undefined;
  if (categoryId && categoryUncertain) return undefined;
  if (attachments.length > 5 || attachments.some((attachment) => !isRecord(attachment) || attachment.state !== "QUARANTINED")) return undefined;
  if (phone && !/^[0-9+()\-\s]{8,32}$/.test(phone)) return undefined;
  return {
    tenantId,
    lineUserId,
    intakeQueueId,
    idempotencyKey,
    ...(categoryId ? { categoryId } : {}),
    categoryUncertain,
    title,
    description,
    attachments: attachments as ComplaintSubmitRequest["attachments"],
    ...(location ? { location } : {}),
    citizenName,
    phone,
    notifyChannel,
    consentAccepted: true,
    consentVersion,
  };
};

export async function POST(request: Request): Promise<NextResponse> {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 255) {
    return jsonError(400, "VALIDATION_ERROR", "Idempotency-Key is required");
  }
  if (!isLocalSyntheticEnvironment()) {
    return jsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบยังไม่พร้อมรับเรื่อง กรุณาลองใหม่ภายหลัง");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "VALIDATION_ERROR", "รูปแบบข้อมูลไม่ถูกต้อง");
  }
  const parsed = parseRequest(body, idempotencyKey);
  if (!parsed) return jsonError(400, "VALIDATION_ERROR", "กรุณาตรวจสอบข้อมูลก่อนส่งเรื่อง");
  if (parsed.tenantId !== LOCAL_TENANT_ID || parsed.intakeQueueId !== LOCAL_QUEUE_ID || parsed.lineUserId !== LOCAL_LINE_USER_ID) {
    return jsonError(403, "FORBIDDEN", "ไม่พบสิทธิ์สำหรับข้อมูลชุดนี้");
  }
  try {
    // Local/test is deliberately synthetic and never used outside non-production
    // environments. Production will require the verified LIFF session and a
    // durable repository before this endpoint accepts writes.
    const result = await complaintRecoveryService.submit({
      tenantId: parsed.tenantId,
      lineUserId: parsed.lineUserId,
      ...(parsed.categoryId ? { categoryId: parsed.categoryId } : {}),
      categoryUncertain: parsed.categoryUncertain,
      ...(parsed.citizenName ? { citizenName: parsed.citizenName } : {}),
      title: parsed.title,
      description: parsed.description,
      ...(parsed.location ? { location: parsed.location } : {}),
      intakeQueueId: parsed.intakeQueueId,
      idempotencyKey: parsed.idempotencyKey,
    });
    return NextResponse.json({
      complaintId: result.complaintId,
      complaintNo: result.complaintNo,
      idempotentReplay: result.idempotentReplay,
      mode: "local-synthetic",
    }, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "PROCESSING_FAILED";
    const status = code === "IDEMPOTENCY_CONFLICT" ? 409 : code === "VALIDATION_ERROR" ? 400 : 500;
    return jsonError(status, code, status === 500 ? "ไม่สามารถบันทึกเรื่องได้ กรุณาลองใหม่" : "กรุณาตรวจสอบข้อมูลก่อนส่งเรื่อง");
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) return jsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบติดตามเรื่องยังไม่พร้อมใช้งาน");
  if (!hasLocalCitizenIdentity(request)) return jsonError(404, "NOT_FOUND", "ไม่พบรายการเรื่องร้องเรียน");
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const rawStatus = url.searchParams.get("status") ?? "ALL";
  const status: ComplaintPublicListStatus = rawStatus === "ACTIVE" || rawStatus === "CLOSED" ? rawStatus : "ALL";
  try {
    const page = complaintRepository.listPublicPage(LOCAL_TENANT_ID, LOCAL_LINE_USER_ID, {
      ...(rawLimit ? { limit: Number(rawLimit) } : {}),
      ...(url.searchParams.get("cursor") ? { cursor: url.searchParams.get("cursor")! } : {}),
      status,
    });
    return NextResponse.json(page);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "PROCESSING_FAILED";
    return jsonError(code === "VALIDATION_ERROR" ? 400 : 500, code, "ไม่สามารถโหลดรายการเรื่องร้องเรียนได้");
  }
}
