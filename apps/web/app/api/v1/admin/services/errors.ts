import { ServiceError, type ServiceFacts, type ServiceModule, type ServiceDraftInput } from "@citychatbot/services";
import { NextResponse } from "next/server";

export const servicesJsonError = (status: number, reasonCode: string, message: string): NextResponse => NextResponse.json({ error: { reasonCode, message } }, { status });
const statusForCode = (code: string): number => code === "VALIDATION_ERROR" ? 400 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "FEATURE_DISABLED" ? 409 : code === "VERSION_CONFLICT" || code === "INVALID_STATE" || code === "IDEMPOTENCY_CONFLICT" ? 409 : 500;
const messages: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "ข้อมูลบริการไม่ถูกต้องหรือไม่ครบถ้วน",
  FORBIDDEN: "ไม่มีสิทธิ์จัดการข้อมูลบริการใน tenant นี้",
  NOT_FOUND: "ไม่พบข้อมูลบริการในขอบเขตที่บัญชีนี้มีสิทธิ์ดู",
  VERSION_CONFLICT: "ข้อมูลบริการถูกแก้ไขแล้ว กรุณาโหลด version ล่าสุด",
  INVALID_STATE: "สถานะบริการปัจจุบันไม่อนุญาตให้ทำรายการนี้",
  IDEMPOTENCY_CONFLICT: "คำขอซ้ำใช้ idempotency key กับข้อมูลคนละชุด",
  FEATURE_DISABLED: "โมดูลบริการนี้ยังไม่เปิดใช้งานสำหรับ tenant นี้",
  PROCESSING_FAILED: "ไม่สามารถดำเนินการกับข้อมูลบริการได้",
};
export const servicesDomainErrorResponse = (error: unknown): NextResponse => { const code = error instanceof ServiceError ? error.code : "PROCESSING_FAILED"; return servicesJsonError(statusForCode(code), code, messages[code] ?? messages.PROCESSING_FAILED!); };
export const readServicesObjectBody = async (request: Request): Promise<Record<string, unknown>> => { let body: unknown; try { body = await request.json(); } catch { throw new ServiceError("VALIDATION_ERROR", "request body must be valid JSON"); } if (!body || typeof body !== "object" || Array.isArray(body)) throw new ServiceError("VALIDATION_ERROR", "request body must be an object"); return body as Record<string, unknown>; };
export const requiredServiceString = (body: Record<string, unknown>, field: string): string => { const value = body[field]; if (typeof value !== "string" || !value.trim()) throw new ServiceError("VALIDATION_ERROR", `${field} is required`); return value; };
export const serviceIdempotencyKey = (request: Request, body: Record<string, unknown>): string => { const value = body.idempotencyKey ?? request.headers.get("idempotency-key"); if (typeof value !== "string") throw new ServiceError("VALIDATION_ERROR", "idempotencyKey is required"); return value; };
export const serviceExpectedVersion = (request: Request, body: Record<string, unknown>): number => { const header = request.headers.get("if-match")?.replace(/^W\//u, "").replace(/^"|"$/gu, ""); const value = body.expectedVersion ?? (header ? Number(header) : undefined); if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new ServiceError("VALIDATION_ERROR", "expectedVersion is required"); return value; };
const requiredArray = <T>(body: Record<string, unknown>, field: string): T[] => { const value = body[field]; if (!Array.isArray(value)) throw new ServiceError("VALIDATION_ERROR", `${field} must be an array`); return value as T[]; };
export const serviceDraftInput = (body: Record<string, unknown>, request: Request): ServiceDraftInput => {
  const serviceModule = body.module;
  if (serviceModule !== "STANDARD" && serviceModule !== "GOLD_PRICE" && serviceModule !== "PAWNSHOP") throw new ServiceError("VALIDATION_ERROR", "module is invalid");
  const facts = body.facts;
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) throw new ServiceError("VALIDATION_ERROR", "facts is required");
  return { slug: requiredServiceString(body, "slug"), title: requiredServiceString(body, "title"), summary: requiredServiceString(body, "summary"), module: serviceModule as ServiceModule, departmentId: requiredServiceString(body, "departmentId"), facts: facts as ServiceFacts, reason: requiredServiceString(body, "reason"), idempotencyKey: serviceIdempotencyKey(request, body), ...(typeof body.sourceServiceId === "string" && body.sourceServiceId ? { sourceServiceId: body.sourceServiceId } : {}) };
};
