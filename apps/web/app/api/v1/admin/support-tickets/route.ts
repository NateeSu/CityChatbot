import { SUPPORT_TICKET_STATUSES, SupportHandoffError, type SupportTicketStatus } from "@citychatbot/support-handoff";
import { NextResponse } from "next/server";

import { localSupportAdminContext } from "./context";
import { supportDomainErrorResponse, supportJsonError } from "./errors";
import { ensureLocalSupportFixtures, isSupportLocalEnvironment, listAdminSupportTickets } from "./repository";

export const runtime = "nodejs";

const parseStatus = (value: string | null): SupportTicketStatus | "ALL" | undefined => {
  if (!value) return undefined;
  if (value === "ALL") return "ALL";
  if (SUPPORT_TICKET_STATUSES.includes(value as SupportTicketStatus)) return value as SupportTicketStatus;
  throw new SupportHandoffError("VALIDATION_ERROR", "status is invalid");
};

const parsePriority = (value: string | null): "NORMAL" | "URGENT" | "ALL" | undefined => {
  if (!value) return undefined;
  if (value === "ALL" || value === "NORMAL" || value === "URGENT") return value;
  throw new SupportHandoffError("VALIDATION_ERROR", "priority is invalid");
};

const parseEnum = <T extends string>(value: string | null, allowed: readonly T[], field: string): T | undefined => {
  if (!value) return undefined;
  if (allowed.includes(value as T)) return value as T;
  throw new SupportHandoffError("VALIDATION_ERROR", field + " is invalid");
};

export async function GET(request: Request): Promise<NextResponse> {
  if (!isSupportLocalEnvironment()) return supportJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบ support ticket ยังไม่พร้อมใช้งาน");
  const url = new URL(request.url);
  const adminContext = localSupportAdminContext(url);
  if (!adminContext) return supportJsonError(404, "NOT_FOUND", "ไม่พบ ticket ในขอบเขตที่คุณมีสิทธิ์ดู");
  ensureLocalSupportFixtures();
  try {
    const result = listAdminSupportTickets(adminContext, {
      ...(url.searchParams.get("search") ? { search: url.searchParams.get("search")! } : {}),
      ...(parseStatus(url.searchParams.get("status")) ? { status: parseStatus(url.searchParams.get("status")) } : {}),
      ...(parsePriority(url.searchParams.get("priority")) ? { priority: parsePriority(url.searchParams.get("priority")) } : {}),
      ...(url.searchParams.get("queue") ? { queue: parseEnum(url.searchParams.get("queue"), ["ALL", "UNASSIGNED", "MINE", "DEPARTMENT", "TENANT"] as const, "queue") } : {}),
      ...(url.searchParams.get("sla") ? { sla: parseEnum(url.searchParams.get("sla"), ["ALL", "NEAR_DUE", "OVERDUE"] as const, "sla") } : {}),
      ...(url.searchParams.get("sort") ? { sort: parseEnum(url.searchParams.get("sort"), ["UPDATED_DESC", "CREATED_DESC", "PRIORITY_DESC"] as const, "sort") } : {}),
      ...(url.searchParams.get("limit") ? { limit: Number(url.searchParams.get("limit")) } : {}),
    });
    return NextResponse.json(result);
  } catch (error) {
    return error instanceof SupportHandoffError ? supportDomainErrorResponse(error) : supportDomainErrorResponse(error);
  }
}

