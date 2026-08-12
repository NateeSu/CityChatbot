import { UserManagementError } from "@citychatbot/user-management";
import { NextResponse } from "next/server";

export const staffJsonError = (status: number, reasonCode: string, message: string, extra?: Record<string, unknown>): NextResponse => NextResponse.json({ error: { reasonCode, message }, ...extra }, { status });

const statusForCode = (code: string): number => {
  if (code === "VALIDATION_ERROR" || code === "INVITATION_EXPIRED") return 400;
  if (code === "FORBIDDEN" || code === "LAST_ADMIN_GUARD") return 403;
  if (code === "NOT_FOUND") return 404;
  if (["DUPLICATE", "VERSION_CONFLICT", "INVALID_STATE", "IDEMPOTENCY_CONFLICT", "INVITATION_REPLAYED"].includes(code)) return 409;
  return 500;
};

const messages: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "ข้อมูลเจ้าหน้าที่หรือคำเชิญไม่ถูกต้อง",
  FORBIDDEN: "ไม่มีสิทธิ์จัดการเจ้าหน้าที่ใน tenant นี้",
  NOT_FOUND: "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู",
  DUPLICATE: "บัญชีหรือคำเชิญนี้มีอยู่แล้ว",
  VERSION_CONFLICT: "ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดเวอร์ชันล่าสุด",
  INVALID_STATE: "สถานะปัจจุบันไม่อนุญาตให้ทำรายการนี้",
  IDEMPOTENCY_CONFLICT: "คำขอซ้ำใช้ idempotency key กับข้อมูลคนละชุด",
  INVITATION_EXPIRED: "คำเชิญหมดอายุแล้ว",
  INVITATION_REPLAYED: "คำเชิญนี้ถูกใช้หรือยกเลิกแล้ว",
  LAST_ADMIN_GUARD: "ต้องมีผู้ดูแลเทศบาลที่ใช้งานได้อย่างน้อยหนึ่งคน",
};

export const staffDomainErrorResponse = (error: unknown): NextResponse => {
  const code = error instanceof UserManagementError ? error.code : "PROCESSING_FAILED";
  return staffJsonError(statusForCode(code), code, messages[code] ?? "ไม่สามารถดำเนินการจัดการผู้ใช้ได้");
};

export const readStaffObjectBody = async (request: Request): Promise<Record<string, unknown>> => {
  let body: unknown;
  try { body = await request.json(); } catch { throw new UserManagementError("VALIDATION_ERROR", "request body must be valid JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new UserManagementError("VALIDATION_ERROR", "request body must be an object");
  return body as Record<string, unknown>;
};

export const requiredStaffString = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new UserManagementError("VALIDATION_ERROR", `${field} is required`);
  return value;
};

export const staffIdempotencyKey = (request: Request, body: Record<string, unknown>): string => {
  const value = body.idempotencyKey ?? request.headers.get("idempotency-key");
  if (typeof value !== "string") throw new UserManagementError("VALIDATION_ERROR", "idempotencyKey is required");
  return value;
};

export const staffExpectedVersion = (request: Request, body: Record<string, unknown>): number => {
  const header = request.headers.get("if-match")?.replace(/^W\//u, "").replace(/^"|"$/gu, "");
  const value = body.expectedVersion ?? (header ? Number(header) : undefined);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new UserManagementError("VALIDATION_ERROR", "expectedVersion is required");
  return value;
};

export const staffStringArray = (body: Record<string, unknown>, field: string, required = false): string[] => {
  const value = body[field];
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new UserManagementError("VALIDATION_ERROR", `${field} must be an array of strings`);
  return value as string[];
};
