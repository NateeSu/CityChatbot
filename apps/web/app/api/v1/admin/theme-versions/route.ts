import { NextResponse } from "next/server";

import { themeSettingsDomainErrorResponse, themeConfigInput, themeIdempotencyKey, readThemeSettingsObjectBody, requiredThemeString, themeSettingsJsonError } from "./errors";
import { isThemeSettingsLocalEnvironment, localThemeSettingsContext } from "./context";
import { themeSettingsRepository } from "./repository";

export const runtime = "nodejs";

const unavailable = () => themeSettingsJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่า Theme ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");

export async function GET(request: Request): Promise<NextResponse> {
  if (!isThemeSettingsLocalEnvironment()) return unavailable();
  const actor = localThemeSettingsContext(new URL(request.url));
  if (!actor) return themeSettingsJsonError(404, "NOT_FOUND", "ไม่พบ Theme ในขอบเขต tenant นี้");
  return NextResponse.json(themeSettingsRepository.snapshot(actor));
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isThemeSettingsLocalEnvironment()) return unavailable();
  const actor = localThemeSettingsContext(new URL(request.url));
  if (!actor) return themeSettingsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์สร้าง Theme");
  try {
    const body = await readThemeSettingsObjectBody(request);
    const version = themeSettingsRepository.createDraft(actor, { config: themeConfigInput(body), reason: requiredThemeString(body, "reason"), idempotencyKey: themeIdempotencyKey(request, body) });
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) { return themeSettingsDomainErrorResponse(error); }
}
