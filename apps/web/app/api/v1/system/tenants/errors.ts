import { TenantProvisioningError } from "@citychatbot/tenant-provisioning";
import { NextResponse } from "next/server";

export const tenantSystemJsonError = (status: number, reasonCode: string, message: string): NextResponse => NextResponse.json({ error: { reasonCode, message } }, { status });

const statusForCode = (code: string): number => {
  if (code === "VALIDATION_ERROR") return 400;
  if (code === "FORBIDDEN" || code === "TEST_TARGET_REQUIRED") return 403;
  if (code === "NOT_FOUND") return 404;
  if (["DUPLICATE", "VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "INVALID_STATE", "DEPENDENCY_UNMET", "FEATURE_DISABLED", "USAGE_LIMIT_EXCEEDED"].includes(code)) return 409;
  return 500;
};

const messages: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "ข้อมูล tenant หรือ provisioning ไม่ถูกต้อง",
  FORBIDDEN: "ต้องใช้ Super Admin ที่ผ่าน MFA step-up",
  NOT_FOUND: "ไม่พบ tenant ในขอบเขตที่อนุญาต",
  DUPLICATE: "slug หรือ configuration นี้มีอยู่แล้ว",
  VERSION_CONFLICT: "ข้อมูล tenant ถูกแก้ไขแล้ว กรุณาโหลด version ล่าสุด",
  IDEMPOTENCY_CONFLICT: "คำขอซ้ำใช้ idempotency key กับข้อมูลคนละชุด",
  INVALID_STATE: "สถานะ tenant ปัจจุบันไม่อนุญาตให้ทำรายการนี้",
  DEPENDENCY_UNMET: "feature dependency ยังไม่ผ่าน",
  FEATURE_DISABLED: "feature นี้ยังไม่เปิดใช้งานสำหรับ tenant",
  USAGE_LIMIT_EXCEEDED: "เกิน usage limit ของ tenant",
  TEST_TARGET_REQUIRED: "การ archive ใช้ได้เฉพาะ test tenant ที่ยืนยันเป้าหมายแล้ว",
};

export const tenantSystemErrorResponse = (error: unknown): NextResponse => {
  const code = error instanceof TenantProvisioningError ? error.code : "PROCESSING_FAILED";
  return tenantSystemJsonError(statusForCode(code), code, messages[code] ?? "ไม่สามารถจัดการ tenant ได้");
};

export const readTenantSystemBody = async (request: Request): Promise<Record<string, unknown>> => {
  let body: unknown;
  try { body = await request.json(); } catch { throw new TenantProvisioningError("VALIDATION_ERROR", "request body must be valid JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new TenantProvisioningError("VALIDATION_ERROR", "request body must be an object");
  return body as Record<string, unknown>;
};

export const requiredTenantString = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new TenantProvisioningError("VALIDATION_ERROR", `${field} is required`);
  return value;
};

export const tenantSystemIdempotencyKey = (request: Request, body: Record<string, unknown>): string => {
  const value = body.idempotencyKey ?? request.headers.get("idempotency-key");
  if (typeof value !== "string") throw new TenantProvisioningError("VALIDATION_ERROR", "idempotencyKey is required");
  return value;
};

export const tenantExpectedVersion = (request: Request, body: Record<string, unknown>): number => {
  const header = request.headers.get("if-match")?.replace(/^W\//u, "").replace(/^"|"$/gu, "");
  const value = body.expectedVersion ?? (header ? Number(header) : undefined);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new TenantProvisioningError("VALIDATION_ERROR", "expectedVersion is required");
  return value;
};
