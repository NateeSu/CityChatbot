import { NextResponse } from "next/server";

import { isNewsLocalEnvironment, localNewsContext } from "../../context";
import { newsDomainErrorResponse, newsExpectedVersion, newsIdempotencyKey, newsJsonError, readNewsObjectBody, requiredNewsString } from "../../errors";
import { newsRepository } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isNewsLocalEnvironment()) return newsJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบข่าวยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localNewsContext(new URL(request.url));
  if (!actor) return newsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์ส่งข่าวตรวจสอบ");
  try { const body = await readNewsObjectBody(request); const post = newsRepository.submitReview(actor, (await params).id, newsExpectedVersion(request, body), newsIdempotencyKey(request, body), requiredNewsString(body, "reason")); return NextResponse.json({ post }); } catch (error) { return newsDomainErrorResponse(error); }
}
