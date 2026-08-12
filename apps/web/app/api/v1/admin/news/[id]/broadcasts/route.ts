import { NextResponse } from "next/server";

import { isNewsLocalEnvironment, localNewsContext } from "../../context";
import { newsDomainErrorResponse, newsIdempotencyKey, newsJsonError, readNewsObjectBody, requiredNewsString } from "../../errors";
import { newsRepository } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isNewsLocalEnvironment()) return newsJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบข่าวยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localNewsContext(new URL(request.url));
  if (!actor) return newsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์ดูหรือส่ง broadcast");
  try {
    const body = await readNewsObjectBody(request);
    const action = body.action;
    const id = (await params).id;
    if (action === "preview") return NextResponse.json({ preview: newsRepository.previewBroadcast(actor, id) });
    if (action !== "queue") return newsJsonError(400, "VALIDATION_ERROR", "action ต้องเป็น preview หรือ queue");
    return NextResponse.json({ run: newsRepository.queueBroadcast(actor, id, newsIdempotencyKey(request, body), requiredNewsString(body, "reason")) }, { status: 202 });
  } catch (error) { return newsDomainErrorResponse(error); }
}
