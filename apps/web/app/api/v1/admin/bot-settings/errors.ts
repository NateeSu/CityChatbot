import { BotSettingsError } from "@citychatbot/bot-settings";
import { NextResponse } from "next/server";

export const botSettingsJsonError = (status: number, reasonCode: string, message: string): NextResponse => NextResponse.json({ error: { reasonCode, message } }, { status });

const statusForCode = (code: string): number => code === "VALIDATION_ERROR" || code === "POLICY_LOCKED" ? 400 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "VERSION_CONFLICT" || code === "INVALID_STATE" || code === "IDEMPOTENCY_CONFLICT" ? 409 : 500;
const messages: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "ข้อมูลการตั้งค่า Bot ไม่ถูกต้อง",
  POLICY_LOCKED: "นโยบายความปลอดภัยบังคับและแก้ไขไม่ได้",
  FORBIDDEN: "ไม่มีสิทธิ์จัดการการตั้งค่า Bot",
  NOT_FOUND: "ไม่พบเวอร์ชันในขอบเขต tenant ที่คุณมีสิทธิ์ดู",
  VERSION_CONFLICT: "ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดเวอร์ชันล่าสุด",
  INVALID_STATE: "สถานะปัจจุบันไม่อนุญาตให้ทำรายการนี้",
  IDEMPOTENCY_CONFLICT: "คำขอซ้ำมีข้อมูลไม่ตรงกับครั้งแรก",
  CONFIGURATION_UNAVAILABLE: "การตั้งค่า Bot ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้",
  PROCESSING_FAILED: "ไม่สามารถดำเนินการกับการตั้งค่า Bot ได้",
};

export const botSettingsDomainErrorResponse = (error: unknown): NextResponse => {
  const code = error instanceof BotSettingsError ? error.code : "PROCESSING_FAILED";
  return botSettingsJsonError(statusForCode(code), code, messages[code] ?? messages.PROCESSING_FAILED!);
};

export const readBotSettingsObjectBody = async (request: Request): Promise<Record<string, unknown>> => {
  let body: unknown;
  try { body = await request.json(); } catch { throw new BotSettingsError("VALIDATION_ERROR", "request body must be valid JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new BotSettingsError("VALIDATION_ERROR", "request body must be an object");
  return body as Record<string, unknown>;
};

export const requiredBotString = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new BotSettingsError("VALIDATION_ERROR", `${field} is required`);
  return value;
};

export const botIdempotencyKey = (request: Request, body: Record<string, unknown>): string => {
  const value = body.idempotencyKey ?? request.headers.get("idempotency-key");
  if (typeof value !== "string") throw new BotSettingsError("VALIDATION_ERROR", "idempotencyKey is required");
  return value;
};

export const botExpectedVersion = (request: Request, body: Record<string, unknown>): number => {
  const header = request.headers.get("if-match")?.replace(/^W\//u, "").replace(/^"|"$/gu, "");
  const value = body.expectedVersion ?? (header ? Number(header) : undefined);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new BotSettingsError("VALIDATION_ERROR", "expectedVersion is required");
  return value;
};

const CONFIG_FIELDS = ["tone", "responseStyle", "locale", "welcomeMessage", "disclaimerMessage", "fallbackMessage", "handoffMessage", "afterHoursMessage"] as const;
const LOCKED_FIELDS = ["policy", "aiDisclosureEnabled", "groundingRequired", "handoffEnabled", "tenantIsolationRequired", "safeAbstentionRequired", "allowedOutcomes", "allowedReasonCodes"] as const;

export const botConfigInput = (body: Record<string, unknown>, request: Request): Record<string, unknown> => {
  const result: Record<string, unknown> = { reason: requiredBotString(body, "reason"), idempotencyKey: botIdempotencyKey(request, body) };
  for (const field of CONFIG_FIELDS) if (Object.prototype.hasOwnProperty.call(body, field)) result[field] = body[field];
  for (const field of LOCKED_FIELDS) if (Object.prototype.hasOwnProperty.call(body, field)) result[field] = body[field];
  return result;
};
