import { ThemeSettingsError, type ThemeSettingsConfigInput } from "@citychatbot/theme-settings";
import { NextResponse } from "next/server";

export const themeSettingsJsonError = (status: number, reasonCode: string, message: string): NextResponse => NextResponse.json({ error: { reasonCode, message } }, { status });

const statusForCode = (code: string): number => code === "VALIDATION_ERROR" || code === "CONTRAST_GATE_FAILED" ? 400 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "VERSION_CONFLICT" || code === "INVALID_STATE" || code === "IDEMPOTENCY_CONFLICT" ? 409 : 500;
const messages: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "ข้อมูล Theme ไม่ถูกต้อง",
  CONTRAST_GATE_FAILED: "Theme ไม่ผ่าน contrast gate จึงยัง publish ไม่ได้",
  FORBIDDEN: "ไม่มีสิทธิ์จัดการ Theme ของ tenant นี้",
  NOT_FOUND: "ไม่พบ Theme version ในขอบเขตที่บัญชีนี้มีสิทธิ์ดู",
  VERSION_CONFLICT: "ข้อมูลถูกแก้ไขแล้ว กรุณาโหลด version ล่าสุด",
  INVALID_STATE: "สถานะปัจจุบันไม่อนุญาตให้ทำรายการนี้",
  IDEMPOTENCY_CONFLICT: "คำขอซ้ำใช้ idempotency key กับข้อมูลคนละชุด",
  CONFIGURATION_UNAVAILABLE: "การตั้งค่า Theme ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้",
  PROCESSING_FAILED: "ไม่สามารถดำเนินการกับ Theme ได้",
};

export const themeSettingsDomainErrorResponse = (error: unknown): NextResponse => {
  const code = error instanceof ThemeSettingsError ? error.code : "PROCESSING_FAILED";
  return themeSettingsJsonError(statusForCode(code), code, messages[code] ?? messages.PROCESSING_FAILED!);
};

export const readThemeSettingsObjectBody = async (request: Request): Promise<Record<string, unknown>> => {
  let body: unknown;
  try { body = await request.json(); } catch { throw new ThemeSettingsError("VALIDATION_ERROR", "request body must be valid JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ThemeSettingsError("VALIDATION_ERROR", "request body must be an object");
  return body as Record<string, unknown>;
};

export const requiredThemeString = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new ThemeSettingsError("VALIDATION_ERROR", `${field} is required`);
  return value;
};

export const themeIdempotencyKey = (request: Request, body: Record<string, unknown>): string => {
  const value = body.idempotencyKey ?? request.headers.get("idempotency-key");
  if (typeof value !== "string") throw new ThemeSettingsError("VALIDATION_ERROR", "idempotencyKey is required");
  return value;
};

export const themeExpectedVersion = (request: Request, body: Record<string, unknown>): number => {
  const header = request.headers.get("if-match")?.replace(/^W\//u, "").replace(/^"|"$/gu, "");
  const value = body.expectedVersion ?? (header ? Number(header) : undefined);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new ThemeSettingsError("VALIDATION_ERROR", "expectedVersion is required");
  return value;
};

export const themeConfigInput = (body: Record<string, unknown>): ThemeSettingsConfigInput => {
  const config = body.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new ThemeSettingsError("VALIDATION_ERROR", "config is required and must be an object");
  return config as ThemeSettingsConfigInput;
};
