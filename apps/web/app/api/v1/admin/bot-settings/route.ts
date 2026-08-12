import { NextResponse } from "next/server";

import { botSettingsDomainErrorResponse, botConfigInput, botIdempotencyKey, botSettingsJsonError, readBotSettingsObjectBody } from "./errors";
import { isBotSettingsLocalEnvironment, localBotSettingsContext } from "./context";
import { botSettingsRepository } from "./repository";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isBotSettingsLocalEnvironment()) return botSettingsJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่า Bot ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localBotSettingsContext(new URL(request.url));
  if (!actor) return botSettingsJsonError(404, "NOT_FOUND", "ไม่พบเวอร์ชันในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  return NextResponse.json(botSettingsRepository.snapshot(actor));
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isBotSettingsLocalEnvironment()) return botSettingsJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่า Bot ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localBotSettingsContext(new URL(request.url));
  if (!actor) return botSettingsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์จัดการการตั้งค่า Bot");
  try {
    const body = await readBotSettingsObjectBody(request);
    const version = botSettingsRepository.createDraft(actor, botConfigInput(body, request) as never);
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) { return botSettingsDomainErrorResponse(error); }
}
