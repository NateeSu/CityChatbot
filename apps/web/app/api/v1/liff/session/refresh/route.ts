import { randomUUID } from "node:crypto";

import { HttpLineIdentityProvider, LiffIdentityError, type LiffAppConfig } from "@citychatbot/liff";
import { decodeProductionLiffSession, issueProductionLiffSession, validateProductionLineClaims } from "@citychatbot/liff";
import { NextResponse } from "next/server";

import { persistLiffIdentity, resolveLiffApp } from "../../runtime";
import { LIFF_SESSION_COOKIE_NAME } from "@citychatbot/liff";

export const runtime = "nodejs";
export const maxDuration = 10;

const identityProvider = new HttpLineIdentityProvider();
const jsonError = (status: number, reasonCode: string, message: string, requestId: string): NextResponse => NextResponse.json({ error: { reasonCode, message }, meta: { requestId } }, { status });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asText = (value: unknown, max: number): string | undefined => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined;
const tokenKind = (value: unknown): value is "id_token" | "access_token" => value === "id_token" || value === "access_token";

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const sessionSecret = process.env.LIFF_SESSION_SECRET;
  const csrfSecret = process.env.CSRF_SECRET;
  const currentCookie = request.headers.get("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${LIFF_SESSION_COOKIE_NAME}=`))?.slice(LIFF_SESSION_COOKIE_NAME.length + 1);
  const current = sessionSecret ? decodeProductionLiffSession(currentCookie, sessionSecret) : undefined;
  if (!sessionSecret || !csrfSecret || !process.env.DATABASE_URL) return jsonError(503, "DEPENDENCY_NOT_READY", "ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน", requestId);
  if (!current) return jsonError(401, "UNAUTHENTICATED", "เซสชันหมดอายุ กรุณาเริ่มใหม่", requestId);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError(400, "VALIDATION_ERROR", "รูปแบบข้อมูลไม่ถูกต้อง", requestId); }
  if (!isRecord(body)) return jsonError(400, "VALIDATION_ERROR", "รูปแบบข้อมูลไม่ถูกต้อง", requestId);
  const token = asText(body.token, 16_384);
  const kind = tokenKind(body.tokenKind) ? body.tokenKind : undefined;
  if (!token || !kind) return jsonError(400, "VALIDATION_ERROR", "ต้องระบุ token ที่ถูกต้อง", requestId);
  try {
    const config = await resolveLiffApp(current.liffAppId);
    if (!config || config.tenantId !== current.tenantId) throw new LiffIdentityError("UNAUTHENTICATED", "LIFF session is not active");
    const liffConfig: LiffAppConfig = { liffAppId: config.liffAppId, tenantId: config.tenantId, channelId: config.channelId, callbackUrl: config.callbackUrl, allowedReturnUrls: [], enabled: config.enabled, ...(config.requiredConsentVersion ? { requiredConsentVersion: config.requiredConsentVersion } : {}), sessionTtlSeconds: config.sessionTtlSeconds };
    const claims = kind === "id_token" ? await identityProvider.verifyIdToken({ token, channelId: config.channelId }) : await identityProvider.verifyAccessToken({ token, channelId: config.channelId });
    const verified = validateProductionLineClaims({ claims, config: liffConfig, tokenKind: kind });
    if (verified.lineUserId !== current.lineUserId) throw new LiffIdentityError("UNAUTHENTICATED", "LIFF token does not match the active session");
    const persisted = await persistLiffIdentity({ liffAppId: current.liffAppId, lineUserId: current.lineUserId, verifiedAt: new Date(), ...(current.consentVersion ? { consentVersion: current.consentVersion, consentAccepted: true } : {}) });
    const issued = issueProductionLiffSession({ context: { sessionId: randomUUID(), tenantId: persisted.tenantId, liffAppId: persisted.liffAppId, channelId: persisted.channelId, lineUserId: current.lineUserId, expiresAt: new Date(Date.now() + persisted.sessionTtlSeconds * 1000), ...(current.consentVersion ? { consentVersion: current.consentVersion } : {}) }, sessionSecret, csrfSecret, environment: "production" });
    const response = NextResponse.json({ data: { tenantId: persisted.tenantId, tenantName: persisted.tenantDisplayName, liffAppId: persisted.liffAppId, lineUserId: current.lineUserId, csrfToken: issued.csrfToken }, meta: { requestId } });
    response.cookies.set(issued.sessionCookie.name, issued.sessionCookie.value, issued.sessionCookie.options);
    return response;
  } catch (error) {
    const isIdentity = error instanceof LiffIdentityError;
    return jsonError(isIdentity ? 401 : 503, isIdentity ? "UNAUTHENTICATED" : "DEPENDENCY_NOT_READY", isIdentity ? "ไม่สามารถต่ออายุเซสชันได้" : "ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน", requestId);
  }
}
