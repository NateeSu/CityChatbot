import { AuditOperationsError } from "@citychatbot/audit-observability";
import { NextResponse } from "next/server";

const messages: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "ข้อมูล audit หรือ export ไม่ถูกต้อง",
  FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์ดูหรือส่งออกข้อมูลส่วนนี้",
  NOT_FOUND: "ไม่พบข้อมูลในขอบเขต tenant ที่บัญชีนี้มีสิทธิ์",
  CONFLICT: "รายการนี้ขัดแย้งกับสถานะปัจจุบัน",
  VERSION_CONFLICT: "ข้อมูลถูกเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด",
  IDEMPOTENCY_CONFLICT: "Idempotency-Key เดิมถูกใช้กับข้อมูลคนละชุด",
  INVALID_STATE: "สถานะปัจจุบันยังทำรายการนี้ไม่ได้",
  EXPORT_EXPIRED: "ลิงก์ export หมดอายุแล้ว",
  EXPORT_REVOKED: "ลิงก์ export ถูกยกเลิกแล้ว",
  SIGNED_URL_INVALID: "ลิงก์ export ไม่ถูกต้อง",
  CONFIGURATION_UNAVAILABLE: "ฟังก์ชันนี้ยังรอการผูก server session และฐานข้อมูลจริง",
  PROCESSING_FAILED: "ระบบประมวลผล audit ไม่สำเร็จ",
};

const statusForCode = (code: string): number => {
  if (code === "VALIDATION_ERROR") return 400;
  if (code === "FORBIDDEN" || code === "SIGNED_URL_INVALID") return 403;
  if (code === "NOT_FOUND") return 404;
  if (["CONFLICT", "VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "INVALID_STATE", "EXPORT_EXPIRED", "EXPORT_REVOKED"].includes(code)) return 409;
  return 500;
};

export const auditJsonError = (status: number, code: string, message?: string, requestId?: string): NextResponse => NextResponse.json({ error: { code, message: message ?? messages[code] ?? messages.PROCESSING_FAILED }, meta: { requestId: requestId ?? crypto.randomUUID(), serverTime: new Date().toISOString() } }, { status });

export const auditSuccess = (data: unknown, status = 200, requestId?: string): NextResponse => NextResponse.json({ data, meta: { requestId: requestId ?? crypto.randomUUID(), serverTime: new Date().toISOString() } }, { status });

export const auditDomainErrorResponse = (error: unknown, requestId?: string): NextResponse => {
  const code = error instanceof AuditOperationsError ? error.code : "PROCESSING_FAILED";
  return auditJsonError(statusForCode(code), code, messages[code], requestId);
};

export const readAuditObjectBody = async (request: Request): Promise<Record<string, unknown>> => {
  let body: unknown;
  try { body = await request.json(); } catch { throw new AuditOperationsError("VALIDATION_ERROR", "request body must be valid JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AuditOperationsError("VALIDATION_ERROR", "request body must be an object");
  return body as Record<string, unknown>;
};

export const requiredAuditString = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new AuditOperationsError("VALIDATION_ERROR", `${field} is required`);
  return value;
};

export const auditIdempotencyKey = (request: Request, body: Record<string, unknown>): string => {
  const value = body.idempotencyKey ?? request.headers.get("idempotency-key");
  if (typeof value !== "string" || !value.trim()) throw new AuditOperationsError("VALIDATION_ERROR", "Idempotency-Key is required");
  return value;
};

export const auditExpectedVersion = (request: Request, body: Record<string, unknown>): number | undefined => {
  const header = request.headers.get("if-match")?.replace(/^W\//u, "").replace(/^"|"$/gu, "");
  const value = body.expectedVersion ?? (header ? Number(header) : undefined);
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new AuditOperationsError("VALIDATION_ERROR", "expectedVersion is invalid");
  return value;
};

export const auditObject = (body: Record<string, unknown>, field: string): Record<string, unknown> => {
  const value = body[field] ?? {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AuditOperationsError("VALIDATION_ERROR", `${field} must be an object`);
  return value as Record<string, unknown>;
};

export const auditRequestId = (request: Request): string => request.headers.get("x-request-id") ?? crypto.randomUUID();
