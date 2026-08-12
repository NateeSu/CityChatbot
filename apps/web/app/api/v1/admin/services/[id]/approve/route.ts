import { NextResponse } from "next/server";

import { isServicesLocalEnvironment, localServicesContext } from "../../context";
import { requiredServiceString, readServicesObjectBody, serviceExpectedVersion, serviceIdempotencyKey, servicesDomainErrorResponse, servicesJsonError } from "../../errors";
import { servicesRepository } from "../../repository";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isServicesLocalEnvironment()) return servicesJsonError(503, "CONFIGURATION_UNAVAILABLE", "บริการยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localServicesContext(new URL(request.url)); if (!actor) return servicesJsonError(403, "FORBIDDEN", "ไม่มีสิทธิ์อนุมัติบริการ");
  try { const body = await readServicesObjectBody(request); return NextResponse.json({ service: servicesRepository.approve(actor, (await params).id, serviceExpectedVersion(request, body), serviceIdempotencyKey(request, body), requiredServiceString(body, "reason")) }); } catch (error) { return servicesDomainErrorResponse(error); }
}
