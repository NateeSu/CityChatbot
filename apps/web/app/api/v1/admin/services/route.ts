import { NextResponse } from "next/server";

import { isServicesLocalEnvironment, localServicesContext } from "./context";
import { readServicesObjectBody, requiredServiceString, serviceDraftInput, servicesDomainErrorResponse, servicesJsonError } from "./errors";
import { servicesRepository } from "./repository";

export const runtime = "nodejs";
const unavailable = () => servicesJsonError(503, "CONFIGURATION_UNAVAILABLE", "บริการยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้");

export async function GET(request: Request): Promise<NextResponse> {
  if (!isServicesLocalEnvironment()) return unavailable();
  const actor = localServicesContext(new URL(request.url));
  if (!actor) return servicesJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลบริการใน tenant นี้");
  return NextResponse.json(servicesRepository.snapshot(actor));
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isServicesLocalEnvironment()) return unavailable();
  const actor = localServicesContext(new URL(request.url));
  if (!actor) return servicesJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลบริการใน tenant นี้");
  try { const body = await readServicesObjectBody(request); const service = servicesRepository.createDraft(actor, serviceDraftInput(body, request)); return NextResponse.json({ service }, { status: 201 }); } catch (error) { return servicesDomainErrorResponse(error); }
}
