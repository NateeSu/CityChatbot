import { NextResponse } from "next/server";

import { themeIdempotencyKey, themeSettingsDomainErrorResponse, themeSettingsJsonError, readThemeSettingsObjectBody, requiredThemeString } from "../../errors";
import { isThemeSettingsLocalEnvironment, localThemeSettingsContext } from "../../context";
import { themeSettingsRepository } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isThemeSettingsLocalEnvironment()) return themeSettingsJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่า Theme ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localThemeSettingsContext(new URL(request.url));
  if (!actor) return themeSettingsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์ publish Theme");
  try {
    const body = await readThemeSettingsObjectBody(request);
    const version = themeSettingsRepository.publish(actor, (await params).id, themeIdempotencyKey(request, body), requiredThemeString(body, "reason"));
    return NextResponse.json({ version });
  } catch (error) { return themeSettingsDomainErrorResponse(error); }
}
