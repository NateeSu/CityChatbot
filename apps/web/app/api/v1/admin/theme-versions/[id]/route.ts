import { NextResponse } from "next/server";

import { themeConfigInput, themeExpectedVersion, themeIdempotencyKey, themeSettingsDomainErrorResponse, themeSettingsJsonError, readThemeSettingsObjectBody, requiredThemeString } from "../errors";
import { isThemeSettingsLocalEnvironment, localThemeSettingsContext } from "../context";
import { themeSettingsRepository } from "../repository";

export const runtime = "nodejs";
const unavailable = () => themeSettingsJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่า Theme ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isThemeSettingsLocalEnvironment()) return unavailable();
  const actor = localThemeSettingsContext(new URL(request.url));
  if (!actor) return themeSettingsJsonError(404, "NOT_FOUND", "ไม่พบ Theme ในขอบเขต tenant นี้");
  try { return NextResponse.json({ version: themeSettingsRepository.get(actor, (await params).id) }); } catch (error) { return themeSettingsDomainErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isThemeSettingsLocalEnvironment()) return unavailable();
  const actor = localThemeSettingsContext(new URL(request.url));
  if (!actor) return themeSettingsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์แก้ไข Theme");
  try {
    const body = await readThemeSettingsObjectBody(request);
    const version = themeSettingsRepository.updateDraft(actor, (await params).id, themeExpectedVersion(request, body), { config: themeConfigInput(body), reason: requiredThemeString(body, "reason"), idempotencyKey: themeIdempotencyKey(request, body) });
    return NextResponse.json({ version });
  } catch (error) { return themeSettingsDomainErrorResponse(error); }
}
