import { NextResponse } from "next/server";

import { isLocalSyntheticEnvironment } from "../../citizen/complaints/repository";
import { ensureLocalRichMenuFixtures, localRichMenuActor, localRichMenuService } from "./repository";

export const runtime = "nodejs";

const jsonError = (status: number, reasonCode: string, message: string): NextResponse => NextResponse.json({ error: { reasonCode, message } }, { status });

const requestReason = (body: unknown, fallback: string): string => {
  if (typeof body === "object" && body !== null && typeof (body as { reason?: unknown }).reason === "string") return (body as { reason: string }).reason;
  return fallback;
};

export async function GET(request: Request): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) return jsonError(503, "CONFIGURATION_UNAVAILABLE", "Rich Menu ของเทศบาลยังไม่พร้อมใช้งาน");
  const actor = localRichMenuActor(request.url);
  if (!actor) return jsonError(404, "NOT_FOUND", "ไม่พบ Rich Menu ในขอบเขตที่คุณมีสิทธิ์ดู");
  ensureLocalRichMenuFixtures();
  return NextResponse.json({ items: localRichMenuService.list(actor.tenantId, actor), audit: localRichMenuService.store.audit(actor.tenantId) });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) return jsonError(503, "CONFIGURATION_UNAVAILABLE", "Rich Menu ของเทศบาลยังไม่พร้อมใช้งาน");
  const actor = localRichMenuActor(request.url);
  if (!actor) return jsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์จัดการ Rich Menu");
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) return jsonError(400, "VALIDATION_ERROR", "ต้องระบุ Idempotency-Key");
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) return jsonError(400, "VALIDATION_ERROR", "รูปแบบ Rich Menu ไม่ถูกต้อง");
    const input = { ...(body as Record<string, unknown>), tenantId: actor.tenantId } as never;
    const item = localRichMenuService.create(input, actor, requestReason(body, "สร้าง Rich Menu ฉบับร่าง"), idempotencyKey);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "PROCESSING_FAILED";
    const status = code === "FORBIDDEN" ? 403 : code === "VALIDATION_ERROR" ? 400 : code === "CONFLICT" ? 409 : 500;
    return jsonError(status, code, status === 500 ? "ไม่สามารถสร้าง Rich Menu ได้" : error instanceof Error ? error.message.replace(`${code}: `, "") : "คำขอ Rich Menu ไม่ถูกต้อง");
  }
}
