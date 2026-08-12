import { ComplaintDomainError, getAdminComplaintDetail, type ComplaintAdminContext, type InMemoryComplaintRepository } from "@citychatbot/complaints";
import { NextResponse } from "next/server";

export const jsonError = (status: number, reasonCode: string, message: string, extra?: Record<string, unknown>): NextResponse =>
  NextResponse.json({ error: { reasonCode, message }, ...extra }, { status });

const statusForCode = (code: string): number => code === "VALIDATION_ERROR" || code === "IDEMPOTENCY_CONFLICT" ? 400 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "VERSION_CONFLICT" || code === "CONFLICT" || code === "INVALID_STATE_TRANSITION" ? 409 : 500;

export const domainErrorResponse = (
  error: unknown,
  repository?: InMemoryComplaintRepository,
  context?: ComplaintAdminContext,
  complaintId?: string,
): NextResponse => {
  const code = error instanceof ComplaintDomainError ? error.code : "PROCESSING_FAILED";
  const status = statusForCode(code);
  const extra: Record<string, unknown> = {};
  if (code === "VERSION_CONFLICT" && repository && context && complaintId) {
    try {
      const current = getAdminComplaintDetail(repository, context, complaintId);
      extra.current = { id: current.id, complaintNo: current.complaintNo, canonicalStatus: current.canonicalStatus, rowVersion: current.rowVersion, updatedAt: current.updatedAt };
    } catch {
      // The normal error body remains indistinguishable if the current row is no longer visible.
    }
  }
  const messages: Record<string, string> = {
    VALIDATION_ERROR: "ข้อมูลคำขอไม่ถูกต้อง",
    IDEMPOTENCY_CONFLICT: "คำขอซ้ำมีข้อมูลไม่ตรงกับครั้งแรก",
    FORBIDDEN: "ไม่มีสิทธิ์ดำเนินการกับเรื่องนี้",
    NOT_FOUND: "ไม่พบเรื่องร้องเรียนในขอบเขตที่คุณมีสิทธิ์ดู",
    VERSION_CONFLICT: "ข้อมูลเรื่องนี้ถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนลองใหม่",
    CONFLICT: "ไม่สามารถดำเนินการกับสถานะปัจจุบันได้",
    INVALID_STATE_TRANSITION: "การเปลี่ยนสถานะนี้ไม่อยู่ใน workflow ที่อนุญาต",
    PROCESSING_FAILED: "ไม่สามารถดำเนินการกับเรื่องร้องเรียนได้",
  };
  return jsonError(status, code, messages[code] ?? "ไม่สามารถดำเนินการกับเรื่องร้องเรียนได้", extra);
};

export const readObjectBody = async (request: Request): Promise<Record<string, unknown>> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ComplaintDomainError("VALIDATION_ERROR", "request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ComplaintDomainError("VALIDATION_ERROR", "request body must be an object");
  return body as Record<string, unknown>;
};

export const readExpectedVersion = (request: Request, body: Record<string, unknown>): number => {
  const header = request.headers.get("if-match")?.replace(/^W\//, "").replace(/^\"|\"$/g, "");
  const value = body.expectedVersion ?? (header ? Number(header) : undefined);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new ComplaintDomainError("VALIDATION_ERROR", "expectedVersion is required");
  return value;
};

export const readIdempotencyKey = (request: Request, body: Record<string, unknown>): string => {
  const value = body.idempotencyKey ?? request.headers.get("idempotency-key");
  if (typeof value !== "string" || value.length < 8 || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value)) throw new ComplaintDomainError("VALIDATION_ERROR", "idempotencyKey is required");
  return value;
};

export const readRequiredString = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new ComplaintDomainError("VALIDATION_ERROR", `${field} is required`);
  return value;
};

export const readOptionalString = (body: Record<string, unknown>, field: string): string | undefined => {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ComplaintDomainError("VALIDATION_ERROR", `${field} is invalid`);
  return value;
};
