import { NextResponse } from "next/server";

import { isStaffLocalEnvironment, localStaffContext } from "./context";
import { staffJsonError } from "./errors";
import { userManagementRepository } from "./repository";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isStaffLocalEnvironment()) return staffJsonError(503, "CONFIGURATION_UNAVAILABLE", "การจัดการผู้ใช้ยังไม่พร้อมใช้งาน");
  const actor = localStaffContext(new URL(request.url));
  if (!actor) return staffJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try { return NextResponse.json(userManagementRepository.snapshot(actor)); } catch (error) { return staffJsonError(500, "PROCESSING_FAILED", error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูลเจ้าหน้าที่ได้"); }
}
