import { getAdminComplaintDetail } from "@citychatbot/complaints";
import { NextResponse } from "next/server";

import { complaintRepository, isLocalSyntheticEnvironment } from "../../../citizen/complaints/repository";
import { domainErrorResponse, jsonError } from "../errors";
import { localAdminContext } from "../context";
import { ensureLocalAdminFixtures, localDepartmentName } from "../repository";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) return jsonError(503, "CONFIGURATION_UNAVAILABLE", "รายละเอียดเรื่องร้องเรียนยังไม่พร้อมใช้งาน");
  const url = new URL(request.url);
  const adminContext = localAdminContext(url);
  if (!adminContext) return jsonError(404, "NOT_FOUND", "ไม่พบเรื่องร้องเรียนในขอบเขตที่คุณมีสิทธิ์ดู");
  ensureLocalAdminFixtures();
  const { id } = await context.params;
  try {
    return NextResponse.json(getAdminComplaintDetail(complaintRepository, adminContext, id, { departmentNameForId: localDepartmentName }));
  } catch (error) {
    return domainErrorResponse(error, complaintRepository, adminContext, id);
  }
}
