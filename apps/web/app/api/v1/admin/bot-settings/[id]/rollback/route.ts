import { NextResponse } from "next/server";

import { botExpectedVersion, botIdempotencyKey, botSettingsDomainErrorResponse, botSettingsJsonError, readBotSettingsObjectBody, requiredBotString } from "../../errors";
import { isBotSettingsLocalEnvironment, localBotSettingsContext } from "../../context";
import { botSettingsRepository } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isBotSettingsLocalEnvironment()) return botSettingsJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่า Bot ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localBotSettingsContext(new URL(request.url));
  if (!actor) return botSettingsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์ rollback การตั้งค่า Bot");
  try {
    const body = await readBotSettingsObjectBody(request);
    const { id } = await params;
    const version = botSettingsRepository.rollback(actor, id, botExpectedVersion(request, body), requiredBotString(body, "reason"), botIdempotencyKey(request, body));
    return NextResponse.json({ version });
  } catch (error) { return botSettingsDomainErrorResponse(error); }
}
