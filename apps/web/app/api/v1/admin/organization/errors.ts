import { OrganizationConfigError } from "@citychatbot/org-config";
import { NextResponse } from "next/server";

export const organizationJsonError = (status: number, reasonCode: string, message: string, extra?: Record<string, unknown>): NextResponse => NextResponse.json({ error: { reasonCode, message }, ...extra }, { status });

const statusForCode = (code: string): number => code === "VALIDATION_ERROR" || code === "EFFECTIVE_DATE_REQUIRED" ? 400 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "DUPLICATE" || code === "VERSION_CONFLICT" || code === "CONFLICT" || code === "INVALID_STATE" || code === "IDEMPOTENCY_CONFLICT" || code === "IN_USE" ? 409 : 500;
const messages: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "ข้อมูลการตั้งค่าไม่ถูกต้อง",
  EFFECTIVE_DATE_REQUIRED: "ต้องระบุวันที่มีผลก่อน publish",
  FORBIDDEN: "ไม่มีสิทธิ์แก้ไขการตั้งค่านี้",
  NOT_FOUND: "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู",
  DUPLICATE: "รหัสนี้ถูกใช้งานแล้ว",
  VERSION_CONFLICT: "ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดเวอร์ชันล่าสุด",
  CONFLICT: "ช่วงเวลาหรือกฎการตั้งค่าขัดแย้งกับรายการที่ active",
  INVALID_STATE: "สถานะปัจจุบันไม่อนุญาตให้ทำรายการนี้",
  IDEMPOTENCY_CONFLICT: "คำขอซ้ำมีข้อมูลไม่ตรงกับครั้งแรก",
  IN_USE: "รายการนี้ยังถูกใช้งาน ต้อง archive configuration ก่อน",
  PROCESSING_FAILED: "ไม่สามารถดำเนินการตั้งค่าได้",
};

export const organizationDomainErrorResponse = (error: unknown): NextResponse => {
  const code = error instanceof OrganizationConfigError ? error.code : "PROCESSING_FAILED";
  return organizationJsonError(statusForCode(code), code, messages[code] ?? messages.PROCESSING_FAILED!);
};

export const readOrganizationObjectBody = async (request: Request): Promise<Record<string, unknown>> => {
  let body: unknown;
  try { body = await request.json(); } catch { return Promise.reject(new OrganizationConfigError("VALIDATION_ERROR", "request body must be valid JSON")); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new OrganizationConfigError("VALIDATION_ERROR", "request body must be an object");
  return body as Record<string, unknown>;
};

export const readOrganizationIdempotencyKey = (request: Request, body: Record<string, unknown>): string => {
  const key = body.idempotencyKey ?? request.headers.get("idempotency-key");
  if (typeof key !== "string") throw new OrganizationConfigError("VALIDATION_ERROR", "idempotencyKey is required");
  return key;
};

export const readOrganizationExpectedVersion = (request: Request, body: Record<string, unknown>): number => {
  const header = request.headers.get("if-match")?.replace(/^W\//, "").replace(/^\"|\"$/g, "");
  const value = body.expectedVersion ?? (header ? Number(header) : undefined);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new OrganizationConfigError("VALIDATION_ERROR", "expectedVersion is required");
  return value;
};

export const requiredString = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new OrganizationConfigError("VALIDATION_ERROR", `${field} is required`);
  return value;
};
