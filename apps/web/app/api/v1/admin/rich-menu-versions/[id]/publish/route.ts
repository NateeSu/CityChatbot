import { NextResponse } from "next/server";

import { isLocalSyntheticEnvironment } from "../../../../citizen/complaints/repository";
import { localRichMenuActor, localRichMenuService } from "../../repository";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
const jsonError = (status: number, reasonCode: string, message: string): NextResponse => NextResponse.json({ error: { reasonCode, message } }, { status });

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) return jsonError(503, "CONFIGURATION_UNAVAILABLE", "Rich Menu ของเทศบาลยังไม่พร้อมใช้งาน");
  const actor = localRichMenuActor(request.url);
  if (!actor) return jsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์เผยแพร่ Rich Menu");
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) return jsonError(400, "VALIDATION_ERROR", "ต้องระบุ Idempotency-Key");
  try {
    const body = await request.json() as { expectedVersion?: unknown; reason?: unknown };
    const expectedVersion = typeof body.expectedVersion === "number" && Number.isSafeInteger(body.expectedVersion) ? body.expectedVersion : undefined;
    if (expectedVersion === undefined) return jsonError(400, "VALIDATION_ERROR", "expectedVersion ไม่ถูกต้อง");
    const { id } = await params;
    const item = await localRichMenuService.publish(actor.tenantId, id, actor, expectedVersion, typeof body.reason === "string" ? body.reason : "เผยแพร่ Rich Menu", idempotencyKey);
    return NextResponse.json({ item });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "PROCESSING_FAILED";
    const status = code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "VALIDATION_ERROR" ? 400 : code === "CONFLICT" ? 409 : code === "EXTERNAL_DEPENDENCY_FAILED" ? 502 : 500;
    return jsonError(status, code, status === 500 ? "ไม่สามารถเผยแพร่ Rich Menu ได้" : error instanceof Error ? error.message.replace(`${code}: `, "") : "เผยแพร่ Rich Menu ไม่สำเร็จ");
  }
}
