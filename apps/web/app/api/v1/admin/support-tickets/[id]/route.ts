import { NextResponse } from "next/server";

import { localSupportAdminContext } from "../context";
import { supportDomainErrorResponse, supportJsonError } from "../errors";
import { ensureLocalSupportFixtures, getAdminSupportDetail, isSupportLocalEnvironment } from "../repository";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isSupportLocalEnvironment()) return supportJsonError(503, "CONFIGURATION_UNAVAILABLE", "รายละเอียด support ticket ยังไม่พร้อมใช้งาน");
  const url = new URL(request.url);
  const adminContext = localSupportAdminContext(url);
  if (!adminContext) return supportJsonError(404, "NOT_FOUND", "ไม่พบ ticket ในขอบเขตที่คุณมีสิทธิ์ดู");
  ensureLocalSupportFixtures();
  try {
    const { id } = await context.params;
    return NextResponse.json(getAdminSupportDetail(adminContext, id));
  } catch (error) {
    return supportDomainErrorResponse(error);
  }
}

