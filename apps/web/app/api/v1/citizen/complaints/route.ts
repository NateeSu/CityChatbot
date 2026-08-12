import { type ComplaintPublicListStatus, type ComplaintSubmitRequest } from "@citychatbot/complaints";
import { encryptSecret } from "@citychatbot/security/secret-vault";
import { NextResponse } from "next/server";

import { resolveLiffBootstrap } from "../../liff/runtime";
import { createCitizenComplaint, listCitizenComplaints } from "../runtime";
import { mapCitizenError, requestHash, requireCitizenCsrf, requireCitizenSession } from "../session";
import { complaintRecoveryService, complaintRepository, hasLocalCitizenIdentity, isLocalSyntheticEnvironment, LOCAL_LINE_USER_ID, LOCAL_QUEUE_ID, LOCAL_TENANT_ID } from "./repository";

export const runtime = "nodejs";

const jsonError = (status: number, reasonCode: string, message: string): NextResponse =>
  NextResponse.json({ error: { reasonCode, message } }, { status });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const asString = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;

const encryptCitizenPhone = (phone: string): string | undefined => {
  if (!phone) return undefined;
  const value = process.env.TENANT_CREDENTIAL_KEY;
  const version = process.env.TENANT_CREDENTIAL_KEY_VERSION;
  if (!value || !version) throw new Error("DEPENDENCY_NOT_READY");
  const key = Buffer.from(value, "base64url");
  if (key.byteLength !== 32) throw new Error("DEPENDENCY_NOT_READY");
  return JSON.stringify(encryptSecret(phone, key, version));
};

const parseRequest = (value: unknown, idempotencyKey: string, allowMissingIdentity = false): ComplaintSubmitRequest | undefined => {
  if (!isRecord(value)) return undefined;
  const tenantId = asString(value.tenantId) ?? (allowMissingIdentity ? "" : undefined);
  const lineUserId = asString(value.lineUserId) ?? (allowMissingIdentity ? "" : undefined);
  const intakeQueueId = asString(value.intakeQueueId) ?? (allowMissingIdentity ? "" : undefined);
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
  if ((!allowMissingIdentity && (!tenantId || !lineUserId || !intakeQueueId)) || !title || !description || !notifyChannel || !consentVersion || value.consentAccepted !== true) return undefined;
  if (!categoryId && !categoryUncertain) return undefined;
  if (categoryId && categoryUncertain) return undefined;
  if (attachments.length > 5 || attachments.some((attachment) => !isRecord(attachment) || attachment.state !== "QUARANTINED")) return undefined;
  if (phone && !/^[0-9+()\-\s]{8,32}$/.test(phone)) return undefined;
  return {
    tenantId: tenantId ?? "",
    lineUserId: lineUserId ?? "",
    intakeQueueId: intakeQueueId ?? "",
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
  const production = !isLocalSyntheticEnvironment();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "VALIDATION_ERROR", "รูปแบบข้อมูลไม่ถูกต้อง");
  }
  const parsed = parseRequest(body, idempotencyKey, production);
  if (!parsed) return jsonError(400, "VALIDATION_ERROR", "กรุณาตรวจสอบข้อมูลก่อนส่งเรื่อง");
  if (production) {
    if (parsed.attachments.length > 0) return jsonError(403, "FEATURE_DISABLED", "การแนบรูปยังไม่เปิดในช่วง canary กรุณาส่งเรื่องโดยไม่แนบรูปก่อน");
    try {
      const session = requireCitizenSession(request);
      requireCitizenCsrf(request, session);
      const bootstrap = await resolveLiffBootstrap({ liffAppId: session.liffAppId, tenantId: session.tenantId, lineUserId: session.lineUserId });
      if (!bootstrap?.intakeQueueId) return jsonError(403, "FEATURE_DISABLED", "ช่องทางรับเรื่องของเทศบาลยังไม่พร้อม");
      const payload = {
        tenantId: session.tenantId,
        lineUserId: session.lineUserId,
        liffAppId: session.liffAppId,
        intakeQueueId: bootstrap.intakeQueueId,
        categoryId: parsed.categoryId ?? null,
        categoryUncertain: parsed.categoryUncertain,
        citizenName: parsed.citizenName,
        phone: parsed.phone,
        title: parsed.title,
        description: parsed.description,
        location: parsed.location ?? null,
        consentVersion: parsed.consentVersion,
      };
      const result = await createCitizenComplaint({
        liffAppId: session.liffAppId,
        tenantId: session.tenantId,
        lineUserId: session.lineUserId,
        idempotencyKey,
        requestHash: requestHash(payload),
        ...(parsed.categoryId ? { categoryId: parsed.categoryId } : {}),
        categoryUncertain: parsed.categoryUncertain,
        ...(parsed.citizenName ? { citizenName: parsed.citizenName } : {}),
        ...(parsed.phone ? { citizenPhoneEncrypted: encryptCitizenPhone(parsed.phone) } : {}),
        title: parsed.title,
        description: parsed.description,
        ...(parsed.location?.text ? { locationText: parsed.location.text } : {}),
        ...(parsed.location?.latitude !== undefined ? { latitude: parsed.location.latitude } : {}),
        ...(parsed.location?.longitude !== undefined ? { longitude: parsed.location.longitude } : {}),
        intakeQueueId: bootstrap.intakeQueueId,
      });
      return NextResponse.json({ complaintId: result.complaintId, complaintNo: result.complaintNo, status: result.status, createdAt: result.createdAt, trackingUrl: `/liff/complaints/${result.complaintId}`, idempotentReplay: result.idempotentReplay, mode: "production" }, { status: result.idempotentReplay ? 200 : 201 });
    } catch (error) {
      const mapped = mapCitizenError(error);
      return jsonError(mapped.status, mapped.code, mapped.status >= 500 ? "ระบบรับเรื่องยังไม่พร้อม กรุณาลองใหม่อีกครั้ง" : "ไม่สามารถส่งเรื่องนี้ได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่");
    }
  }
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
  if (!isLocalSyntheticEnvironment()) {
    try {
      const session = requireCitizenSession(request);
      const url = new URL(request.url);
      const rawStatus = url.searchParams.get("status") ?? "ALL";
      if (rawStatus !== "ALL" && rawStatus !== "ACTIVE" && rawStatus !== "CLOSED") throw new Error("VALIDATION_ERROR");
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const rawCursor = url.searchParams.get("cursor");
      const cursor = rawCursor === null ? undefined : Number(rawCursor);
      if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(cursor ?? 0)) throw new Error("VALIDATION_ERROR");
      const page = await listCitizenComplaints({ tenantId: session.tenantId, lineUserId: session.lineUserId, status: rawStatus, limit, ...(cursor === undefined ? {} : { cursor }) });
      return NextResponse.json(page);
    } catch (error) {
      const mapped = mapCitizenError(error);
      return jsonError(mapped.status, mapped.code, "ไม่สามารถโหลดรายการเรื่องร้องเรียนได้");
    }
  }
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
