import { NextResponse } from "next/server";

import { themeSettingsDomainErrorResponse, themeSettingsJsonError } from "../../errors";
import { isThemeSettingsLocalEnvironment, localThemeSettingsContext } from "../../context";
import { themeSettingsRepository } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isThemeSettingsLocalEnvironment()) return themeSettingsJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่า Theme ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localThemeSettingsContext(new URL(request.url));
  if (!actor) return themeSettingsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์ตรวจสอบ Theme");
  try {
    const id = (await params).id;
    return NextResponse.json({ version: themeSettingsRepository.get(actor, id), validation: themeSettingsRepository.validate(actor, id) });
  } catch (error) { return themeSettingsDomainErrorResponse(error); }
}
