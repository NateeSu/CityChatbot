import { NewsError, type NewsAttachment, type NewsDraftInput } from "@citychatbot/news";
import { NextResponse } from "next/server";

export const newsJsonError = (status: number, reasonCode: string, message: string): NextResponse => NextResponse.json({ error: { reasonCode, message } }, { status });
const statusForCode = (code: string): number => code === "VALIDATION_ERROR" ? 400 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "VERSION_CONFLICT" || code === "INVALID_STATE" || code === "IDEMPOTENCY_CONFLICT" ? 409 : 500;
const messages: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "ข้อมูลข่าวไม่ถูกต้องหรือมีเนื้อหาที่ไม่ปลอดภัย",
  FORBIDDEN: "ไม่มีสิทธิ์จัดการข่าวใน tenant นี้",
  NOT_FOUND: "ไม่พบข่าวในขอบเขตที่บัญชีนี้มีสิทธิ์ดู",
  VERSION_CONFLICT: "ข้อมูลข่าวถูกแก้ไขแล้ว กรุณาโหลด version ล่าสุด",
  INVALID_STATE: "สถานะข่าวปัจจุบันไม่อนุญาตให้ทำรายการนี้",
  IDEMPOTENCY_CONFLICT: "คำขอซ้ำใช้ idempotency key กับข้อมูลคนละชุด",
  CONFIGURATION_UNAVAILABLE: "ระบบข่าวยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้",
  PROCESSING_FAILED: "ไม่สามารถดำเนินการกับข่าวได้",
};

export const newsDomainErrorResponse = (error: unknown): NextResponse => {
  const code = error instanceof NewsError ? error.code : "PROCESSING_FAILED";
  return newsJsonError(statusForCode(code), code, messages[code] ?? messages.PROCESSING_FAILED!);
};

export const readNewsObjectBody = async (request: Request): Promise<Record<string, unknown>> => {
  let body: unknown;
  try { body = await request.json(); } catch { throw new NewsError("VALIDATION_ERROR", "request body must be valid JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new NewsError("VALIDATION_ERROR", "request body must be an object");
  return body as Record<string, unknown>;
};

export const requiredNewsString = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new NewsError("VALIDATION_ERROR", `${field} is required`);
  return value;
};

export const newsIdempotencyKey = (request: Request, body: Record<string, unknown>): string => {
  const value = body.idempotencyKey ?? request.headers.get("idempotency-key");
  if (typeof value !== "string") throw new NewsError("VALIDATION_ERROR", "idempotencyKey is required");
  return value;
};

export const newsExpectedVersion = (request: Request, body: Record<string, unknown>): number => {
  const header = request.headers.get("if-match")?.replace(/^W\//u, "").replace(/^"|"$/gu, "");
  const value = body.expectedVersion ?? (header ? Number(header) : undefined);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new NewsError("VALIDATION_ERROR", "expectedVersion is required");
  return value;
};

const requiredArray = <T>(body: Record<string, unknown>, field: string): T[] => {
  const value = body[field];
  if (!Array.isArray(value)) throw new NewsError("VALIDATION_ERROR", `${field} must be an array`);
  return value as T[];
};

export const newsDraftInput = (body: Record<string, unknown>, request: Request): NewsDraftInput => {
  const attachments = (body.attachments ?? []) as NewsAttachment[];
  if (!Array.isArray(attachments)) throw new NewsError("VALIDATION_ERROR", "attachments must be an array");
  const input: NewsDraftInput = {
    slug: requiredNewsString(body, "slug"),
    title: requiredNewsString(body, "title"),
    excerpt: requiredNewsString(body, "excerpt"),
    bodyHtml: requiredNewsString(body, "bodyHtml"),
    categoryIds: requiredArray<string>(body, "categoryIds"),
    tags: requiredArray<string>(body, "tags"),
    attachments,
    effectiveFrom: requiredNewsString(body, "effectiveFrom"),
    ...(typeof body.expiresAt === "string" && body.expiresAt ? { expiresAt: body.expiresAt } : {}),
    ...(body.timezone === undefined ? {} : { timezone: body.timezone as NewsDraftInput["timezone"] }),
    aiDraft: body.aiDraft === true,
    reason: requiredNewsString(body, "reason"),
    idempotencyKey: newsIdempotencyKey(request, body),
    ...(typeof body.sourcePostId === "string" && body.sourcePostId ? { sourcePostId: body.sourcePostId } : {}),
  };
  return input;
};
