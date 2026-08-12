import { NextResponse } from "next/server";

import { isServicesLocalEnvironment, localServicesContext } from "../context";
import { readServicesObjectBody, serviceDraftInput, serviceExpectedVersion, servicesDomainErrorResponse, servicesJsonError } from "../errors";
import { servicesRepository } from "../repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isServicesLocalEnvironment()) return servicesJsonError(503, "CONFIGURATION_UNAVAILABLE", "บริการยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localServicesContext(new URL(request.url));
  if (!actor) return servicesJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลบริการใน tenant นี้");
  try { return NextResponse.json({ service: servicesRepository.get(actor, (await params).id) }); } catch (error) { return servicesDomainErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isServicesLocalEnvironment()) return servicesJsonError(503, "CONFIGURATION_UNAVAILABLE", "บริการยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");
  const actor = localServicesContext(new URL(request.url));
  if (!actor) return servicesJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลบริการใน tenant นี้");
  try { const body = await readServicesObjectBody(request); return NextResponse.json({ service: servicesRepository.updateDraft(actor, (await params).id, serviceExpectedVersion(request, body), serviceDraftInput(body, request)) }); } catch (error) { return servicesDomainErrorResponse(error); }
}
