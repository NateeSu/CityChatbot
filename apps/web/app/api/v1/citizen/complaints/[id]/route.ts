import { NextResponse } from "next/server";

import { complaintRepository, hasLocalCitizenIdentity, isLocalSyntheticEnvironment, LOCAL_LINE_USER_ID, LOCAL_TENANT_ID } from "../repository";

export const runtime = "nodejs";

const jsonError = (status: number, reasonCode: string, message: string): NextResponse =>
  NextResponse.json({ error: { reasonCode, message } }, { status });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) return jsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบติดตามเรื่องยังไม่พร้อมใช้งาน");
  if (!hasLocalCitizenIdentity(request)) return jsonError(404, "NOT_FOUND", "ไม่พบเรื่องร้องเรียน");
  const { id } = await context.params;
  const view = complaintRepository.getPublicView(LOCAL_TENANT_ID, LOCAL_LINE_USER_ID, id);
  if (!view) return jsonError(404, "NOT_FOUND", "ไม่พบเรื่องร้องเรียน");
  return NextResponse.json({ item: view });
}
