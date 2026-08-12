import { buildAdminComplaintPage, type ComplaintAdminQueue, type ComplaintAdminSort, type ComplaintPriority, type ComplaintState } from "@citychatbot/complaints";
import { NextResponse } from "next/server";

import { complaintRepository, isLocalSyntheticEnvironment, LOCAL_TENANT_ID } from "../../citizen/complaints/repository";
import { ensureLocalAdminFixtures, localDepartmentName } from "./repository";
import { localAdminContext } from "./context";

export const runtime = "nodejs";

const jsonError = (status: number, reasonCode: string, message: string): NextResponse => NextResponse.json({ error: { reasonCode, message } }, { status });

export async function GET(request: Request): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) return jsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบรายการเรื่องร้องเรียนเจ้าหน้าที่ยังไม่พร้อมใช้งาน");
  const url = new URL(request.url);
  const context = localAdminContext(url);
  if (!context) return jsonError(404, "NOT_FOUND", "ไม่พบรายการเรื่องร้องเรียน");
  ensureLocalAdminFixtures();
  const rawStatus = url.searchParams.get("status");
  const rawPriority = url.searchParams.get("priority");
  const rawQueue = url.searchParams.get("queue");
  const rawSort = url.searchParams.get("sort");
  try {
    const result = buildAdminComplaintPage(complaintRepository.listInternal(LOCAL_TENANT_ID), context, {
      ...(url.searchParams.get("limit") ? { limit: Number(url.searchParams.get("limit")) } : {}),
      ...(url.searchParams.get("cursor") ? { cursor: url.searchParams.get("cursor")! } : {}),
      ...(url.searchParams.get("search") ? { search: url.searchParams.get("search")! } : {}),
      ...(rawStatus ? { status: rawStatus === "ALL" ? "ALL" : rawStatus as ComplaintState } : {}),
      ...(rawPriority ? { priority: rawPriority === "ALL" ? "ALL" : rawPriority as ComplaintPriority } : {}),
      ...(url.searchParams.get("departmentId") ? { departmentId: url.searchParams.get("departmentId")! } : {}),
      ...(rawQueue ? { queue: rawQueue as ComplaintAdminQueue } : {}),
      ...(rawSort ? { sort: rawSort as ComplaintAdminSort } : {}),
    }, { departmentNameForId: localDepartmentName });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "PROCESSING_FAILED";
    const status = code === "VALIDATION_ERROR" ? 400 : code === "FORBIDDEN" ? 403 : 500;
    return jsonError(status, code, status === 500 ? "ไม่สามารถโหลดรายการเรื่องร้องเรียนได้" : "ตัวกรองรายการไม่ถูกต้อง");
  }
}
