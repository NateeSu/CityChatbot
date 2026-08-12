import { NextResponse } from "next/server";

import { BotSettingsError } from "@citychatbot/bot-settings";

import { botSettingsDomainErrorResponse, botSettingsJsonError, readBotSettingsObjectBody } from "../../errors";
import { isBotSettingsLocalEnvironment, localBotSettingsContext } from "../../context";
import { botSettingsRepository } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isBotSettingsLocalEnvironment()) return botSettingsJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่า Bot ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localBotSettingsContext(new URL(request.url));
  if (!actor) return botSettingsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์ดู test console ของการตั้งค่า Bot");
  try {
    const body = await readBotSettingsObjectBody(request);
    if (typeof body.question !== "string" || !Array.isArray(body.sourceLabels) || body.sourceLabels.some((value) => typeof value !== "string")) throw new BotSettingsError("VALIDATION_ERROR", "question และ sourceLabels เป็นข้อมูลที่ต้องระบุ");
    const { id } = await params;
    const preview = botSettingsRepository.preview(actor, id, { question: body.question, sourceLabels: body.sourceLabels });
    return NextResponse.json({ preview });
  } catch (error) { return botSettingsDomainErrorResponse(error); }
}
