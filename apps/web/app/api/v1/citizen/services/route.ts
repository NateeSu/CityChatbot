import { NextResponse } from "next/server";

import { isServicesLocalEnvironment, localCitizenServicesContext, LOCAL_SERVICES_TENANT_ID } from "./context";
import { servicesRepository } from "./repository";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isServicesLocalEnvironment()) return NextResponse.json({ error: { reasonCode: "CONFIGURATION_UNAVAILABLE", message: "บริการยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้" } }, { status: 503 });
  const url = new URL(request.url);
  const actor = localCitizenServicesContext(url);
  if (!actor) return NextResponse.json({ error: { reasonCode: "NOT_FOUND", message: "ไม่พบข้อมูลบริการ" } }, { status: 404 });
  return NextResponse.json({ items: servicesRepository.listPublished(LOCAL_SERVICES_TENANT_ID, url.searchParams.get("q") ?? ""), featureFlags: servicesRepository.snapshot(actor).featureFlags });
}
