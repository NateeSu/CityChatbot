import { SupportHandoffError } from "@citychatbot/support-handoff";
import { SupportLineDeliveryError } from "@citychatbot/support-delivery";
import { FaqCandidateError } from "@citychatbot/knowledge";
import { NextResponse } from "next/server";

export const supportJsonError = (status: number, reasonCode: string, message: string, extra?: Record<string, unknown>): NextResponse =>
  NextResponse.json({ error: { reasonCode, message }, ...extra }, { status });

const statusForCode = (code: string): number => code === "VALIDATION_ERROR" || code === "IDEMPOTENCY_CONFLICT" || code === "EFFECTIVE_DATE_REQUIRED" || code === "SOURCE_NOT_VERIFIED" || code === "PII_REVIEW_REQUIRED" ? 400 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "VERSION_CONFLICT" || code === "CONFLICT" || code === "DUPLICATE" || code === "INVALID_STATE_TRANSITION" || code === "INVALID_STATE" ? 409 : 500;

const messages: Readonly<Record<string, string>> = {
  EFFECTIVE_DATE_REQUIRED: "FAQ ต้องมีวันที่มีผลหรือยืนยันว่าไม่ทราบวันที่",
  SOURCE_NOT_VERIFIED: "ยังยืนยันแหล่งที่มาและหลักฐานของ FAQ ไม่ได้",
  PII_REVIEW_REQUIRED: "ต้องตรวจข้อมูลส่วนบุคคลก่อนอนุมัติ FAQ",
  DUPLICATE: "FAQ ซ้ำกับรายการที่มีอยู่",
  INVALID_STATE: "สถานะ FAQ ไม่อนุญาตให้ทำรายการนี้",
  VALIDATION_ERROR: "ข้อมูลคำขอไม่ถูกต้อง",
  IDEMPOTENCY_CONFLICT: "คำขอซ้ำมีข้อมูลไม่ตรงกับครั้งแรก",
  FORBIDDEN: "ไม่มีสิทธิ์ดำเนินการกับ ticket นี้",
  NOT_FOUND: "ไม่พบ ticket ในขอบเขตที่คุณมีสิทธิ์ดู",
  VERSION_CONFLICT: "ticket ถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนลองใหม่",
  CONFLICT: "ไม่สามารถดำเนินการกับสถานะปัจจุบันได้",
  INVALID_STATE_TRANSITION: "การเปลี่ยนสถานะนี้ไม่อยู่ใน workflow ที่อนุญาต",
  PROCESSING_FAILED: "ไม่สามารถดำเนินการกับ ticket ได้",
  LINE_QUOTA_EXCEEDED: "โควตา LINE ของ tenant เต็มชั่วคราว",
};

export const supportDomainErrorResponse = (error: unknown): NextResponse => {
  const code = error instanceof SupportHandoffError || error instanceof SupportLineDeliveryError || error instanceof FaqCandidateError ? error.code : "PROCESSING_FAILED";
  const status = statusForCode(code);
  return supportJsonError(status, code, messages[code] ?? messages.PROCESSING_FAILED ?? "ไม่สามารถดำเนินการกับ ticket ได้");
};

export const readSupportObjectBody = async (request: Request): Promise<Record<string, unknown>> => {
  let body: unknown;
  try { body = await request.json(); } catch { throw new SupportHandoffError("VALIDATION_ERROR", "request body must be valid JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SupportHandoffError("VALIDATION_ERROR", "request body must be an object");
  return body as Record<string, unknown>;
};

export const readSupportExpectedVersion = (request: Request, body: Record<string, unknown>): number => {
  const header = request.headers.get("if-match")?.replace(/^W\//, "").replace(/^\"|\"$/g, "");
  const value = body.expectedVersion ?? (header ? Number(header) : undefined);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new SupportHandoffError("VALIDATION_ERROR", "expectedVersion is required");
  return value;
};

export const readSupportIdempotencyKey = (request: Request, body: Record<string, unknown>): string => {
  const value = body.idempotencyKey ?? request.headers.get("idempotency-key");
  if (typeof value !== "string" || value.length < 8 || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value)) throw new SupportHandoffError("VALIDATION_ERROR", "idempotencyKey is required");
  return value;
};

export const readSupportRequiredString = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new SupportHandoffError("VALIDATION_ERROR", `${field} is required`);
  return value;
};

export const readSupportOptionalString = (body: Record<string, unknown>, field: string): string | undefined => {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new SupportHandoffError("VALIDATION_ERROR", `${field} is invalid`);
  return value;
};
