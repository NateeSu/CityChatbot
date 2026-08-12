import { NextResponse } from "next/server";

import { botConfigInput, botExpectedVersion, botSettingsDomainErrorResponse, botSettingsJsonError, readBotSettingsObjectBody } from "../errors";
import { isBotSettingsLocalEnvironment, localBotSettingsContext } from "../context";
import { botSettingsRepository } from "../repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isBotSettingsLocalEnvironment()) return botSettingsJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่า Bot ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localBotSettingsContext(new URL(request.url));
  if (!actor) return botSettingsJsonError(404, "NOT_FOUND", "ไม่พบเวอร์ชันในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try { const { id } = await params; return NextResponse.json({ version: botSettingsRepository.getVersion(actor, id) }); } catch (error) { return botSettingsDomainErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isBotSettingsLocalEnvironment()) return botSettingsJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่า Bot ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localBotSettingsContext(new URL(request.url));
  if (!actor) return botSettingsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์จัดการการตั้งค่า Bot");
  try {
    const { id } = await params;
    const body = await readBotSettingsObjectBody(request);
    const version = botSettingsRepository.updateDraft(actor, id, { ...botConfigInput(body, request), expectedVersion: botExpectedVersion(request, body) } as never);
    return NextResponse.json({ version });
  } catch (error) { return botSettingsDomainErrorResponse(error); }
}
