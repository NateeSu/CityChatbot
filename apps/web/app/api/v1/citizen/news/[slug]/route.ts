import { NextResponse } from "next/server";

import { localCitizenNewsContext } from "../../../admin/news/context";
import { newsRepository } from "../../../admin/news/repository";
import { isCitizenNewsLocalEnvironment } from "../context";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  if (!isCitizenNewsLocalEnvironment()) return NextResponse.json({ error: { reasonCode: "CONFIGURATION_UNAVAILABLE", message: "ข่าวยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้" } }, { status: 503 });
  const actor = localCitizenNewsContext(new URL(request.url));
  if (!actor) return NextResponse.json({ error: { reasonCode: "NOT_FOUND", message: "ไม่พบข่าว" } }, { status: 404 });
  try { return NextResponse.json({ item: newsRepository.getPublishedBySlug(actor.tenantId, (await params).slug) }); } catch { return NextResponse.json({ error: { reasonCode: "NOT_FOUND", message: "ไม่พบข่าวที่เผยแพร่แล้ว" } }, { status: 404 }); }
}
