import { NextResponse } from "next/server";

import { isNewsLocalEnvironment, localNewsContext } from "./context";
import { newsDomainErrorResponse, newsDraftInput, newsJsonError, readNewsObjectBody } from "./errors";
import { newsRepository } from "./repository";

export const runtime = "nodejs";
const unavailable = () => newsJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบข่าวยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");

export async function GET(request: Request): Promise<NextResponse> {
  if (!isNewsLocalEnvironment()) return unavailable();
  const actor = localNewsContext(new URL(request.url));
  if (!actor) return newsJsonError(404, "NOT_FOUND", "ไม่พบข่าวใน tenant นี้");
  return NextResponse.json(newsRepository.snapshot(actor));
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isNewsLocalEnvironment()) return unavailable();
  const actor = localNewsContext(new URL(request.url));
  if (!actor) return newsJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์สร้างข่าว");
  try {
    const body = await readNewsObjectBody(request);
    const post = newsRepository.createDraft(actor, newsDraftInput(body, request));
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) { return newsDomainErrorResponse(error); }
}
