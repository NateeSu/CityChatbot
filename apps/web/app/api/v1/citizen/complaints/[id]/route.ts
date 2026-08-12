import { NextResponse } from "next/server";

import { getCitizenComplaint } from "../../runtime";
import { mapCitizenError, requireCitizenSession } from "../../session";
import { complaintRepository, hasLocalCitizenIdentity, isLocalSyntheticEnvironment, LOCAL_LINE_USER_ID, LOCAL_TENANT_ID } from "../repository";

export const runtime = "nodejs";

const jsonError = (status: number, reasonCode: string, message: string): NextResponse =>
  NextResponse.json({ error: { reasonCode, message } }, { status });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) {
    try {
      const session = requireCitizenSession(request);
      const { id } = await context.params;
      const item = await getCitizenComplaint({ tenantId: session.tenantId, lineUserId: session.lineUserId, complaintId: id });
      return item ? NextResponse.json({ item }) : jsonError(404, "NOT_FOUND", "ไม่พบเรื่องร้องเรียน");
    } catch (error) {
      const mapped = mapCitizenError(error);
      return jsonError(mapped.status, mapped.code, "ไม่สามารถโหลดรายละเอียดเรื่องได้");
    }
  }
  if (!hasLocalCitizenIdentity(request)) return jsonError(404, "NOT_FOUND", "ไม่พบเรื่องร้องเรียน");
  const { id } = await context.params;
  const view = complaintRepository.getPublicView(LOCAL_TENANT_ID, LOCAL_LINE_USER_ID, id);
  if (!view) return jsonError(404, "NOT_FOUND", "ไม่พบเรื่องร้องเรียน");
  return NextResponse.json({ item: view });
}
