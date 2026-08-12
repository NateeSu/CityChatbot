import { randomUUID } from "node:crypto";

import { decodeProductionLiffSession, LIFF_SESSION_COOKIE_NAME } from "@citychatbot/liff";
import { NextResponse } from "next/server";

import { resolveLiffBootstrap } from "../../liff/runtime";

export const runtime = "nodejs";

const error = (status: number, reasonCode: string, message: string, requestId: string): NextResponse => NextResponse.json({ error: { reasonCode, message }, meta: { requestId } }, { status });

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const sessionSecret = process.env.LIFF_SESSION_SECRET;
  const cookie = request.headers.get("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${LIFF_SESSION_COOKIE_NAME}=`))?.slice(LIFF_SESSION_COOKIE_NAME.length + 1);
  const session = sessionSecret ? decodeProductionLiffSession(cookie, sessionSecret) : undefined;
  if (!session) return error(401, "UNAUTHENTICATED", "กรุณาเริ่มเซสชัน LIFF ก่อนใช้งาน", requestId);
  try {
    const bootstrap = await resolveLiffBootstrap({ liffAppId: session.liffAppId, tenantId: session.tenantId, lineUserId: session.lineUserId });
    if (!bootstrap) return error(404, "NOT_FOUND", "ไม่พบข้อมูลสำหรับบัญชีนี้", requestId);
    return NextResponse.json({ data: bootstrap, meta: { requestId } });
  } catch {
    return error(503, "DEPENDENCY_NOT_READY", "ระบบข้อมูลประชาชนยังไม่พร้อมใช้งาน", requestId);
  }
}
