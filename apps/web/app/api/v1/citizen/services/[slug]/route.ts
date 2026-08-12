import { NextResponse } from "next/server";

import { isServicesLocalEnvironment, localCitizenServicesContext } from "../context";
import { servicesRepository } from "../repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  if (!isServicesLocalEnvironment()) return NextResponse.json({ error: { reasonCode: "CONFIGURATION_UNAVAILABLE", message: "บริการยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้" } }, { status: 503 });
  const actor = localCitizenServicesContext(new URL(request.url));
  if (!actor) return NextResponse.json({ error: { reasonCode: "NOT_FOUND", message: "ไม่พบข้อมูลบริการ" } }, { status: 404 });
  try { return NextResponse.json({ item: servicesRepository.getPublishedBySlug(actor.tenantId, (await params).slug) }); } catch { return NextResponse.json({ error: { reasonCode: "NOT_FOUND", message: "ไม่พบบริการที่เผยแพร่แล้ว" } }, { status: 404 }); }
}
