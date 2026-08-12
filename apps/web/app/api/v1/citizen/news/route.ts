import { NextResponse } from "next/server";

import { localCitizenNewsContext } from "../../admin/news/context";
import { newsRepository } from "./repository";
import { isCitizenNewsLocalEnvironment, LOCAL_CITIZEN_NEWS_TENANT_ID } from "./context";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isCitizenNewsLocalEnvironment()) return NextResponse.json({ error: { reasonCode: "CONFIGURATION_UNAVAILABLE", message: "ข่าวยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้" } }, { status: 503 });
  const actor = localCitizenNewsContext(new URL(request.url));
  if (!actor) return NextResponse.json({ error: { reasonCode: "NOT_FOUND", message: "ไม่พบข่าว" } }, { status: 404 });
  const snapshot = newsRepository.snapshot(actor);
  return NextResponse.json({ items: newsRepository.listPublished(LOCAL_CITIZEN_NEWS_TENANT_ID), categories: snapshot.categories });
}
