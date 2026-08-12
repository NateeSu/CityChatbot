import { NextResponse } from "next/server";

import { isNewsLocalEnvironment, localNewsContext } from "../context";
import { newsDomainErrorResponse, newsDraftInput, newsExpectedVersion, newsJsonError, readNewsObjectBody } from "../errors";
import { newsRepository } from "../repository";

export const runtime = "nodejs";
const unavailable = () => newsJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบข่าวยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isNewsLocalEnvironment()) return unavailable();
  const actor = localNewsContext(new URL(request.url));
  if (!actor) return newsJsonError(404, "NOT_FOUND", "ไม่พบข่าวใน tenant นี้");
  try { return NextResponse.json({ post: newsRepository.get(actor, (await params).id) }); } catch (error) { return newsDomainErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isNewsLocalEnvironment()) return unavailable();
  const actor = localNewsContext(new URL(request.url));
  if (!actor) return newsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์แก้ไขข่าว");
  try {
    const body = await readNewsObjectBody(request);
    const post = newsRepository.updateDraft(actor, (await params).id, newsExpectedVersion(request, body), newsDraftInput(body, request));
    return NextResponse.json({ post });
  } catch (error) { return newsDomainErrorResponse(error); }
}
