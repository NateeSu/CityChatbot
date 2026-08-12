import { randomUUID } from "node:crypto";

import { HttpLineIdentityProvider, LiffIdentityError, type LiffAppConfig } from "@citychatbot/liff";
import { issueProductionLiffSession, productionLiffContextFromClaims, validateProductionLineClaims } from "@citychatbot/liff";
import { NextResponse } from "next/server";

import { persistLiffIdentity, resolveLiffApp } from "../runtime";

export const runtime = "nodejs";
export const maxDuration = 10;

const identityProvider = new HttpLineIdentityProvider();

const jsonError = (status: number, reasonCode: string, message: string, requestId: string): NextResponse =>
  NextResponse.json({ error: { reasonCode, message }, meta: { requestId } }, { status });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isTokenKind = (value: unknown): value is "id_token" | "access_token" => value === "id_token" || value === "access_token";
const asText = (value: unknown, max: number): string | undefined => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined;

const mapError = (error: unknown): { status: number; code: string; message: string } => {
  if (error instanceof LiffIdentityError) {
    const status = error.code === "FEATURE_DISABLED" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION_ERROR" ? 400 : 401;
    return { status, code: error.code, message: error.code === "FEATURE_DISABLED" ? "LIFF ยังไม่เปิดใช้งานสำหรับช่องทางนี้" : "ไม่สามารถยืนยันตัวตน LINE ได้" };
  }
  return { status: 503, code: "DEPENDENCY_NOT_READY", message: "ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน" };
};

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const sessionSecret = process.env.LIFF_SESSION_SECRET;
  const csrfSecret = process.env.CSRF_SECRET;
  if (!sessionSecret || !csrfSecret || !process.env.DATABASE_URL) return jsonError(503, "DEPENDENCY_NOT_READY", "ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน", requestId);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError(400, "VALIDATION_ERROR", "รูปแบบข้อมูลไม่ถูกต้อง", requestId); }
  if (!isRecord(body)) return jsonError(400, "VALIDATION_ERROR", "รูปแบบข้อมูลไม่ถูกต้อง", requestId);
  const liffAppId = asText(body.liffAppId, 128);
  const token = asText(body.token, 16_384);
  const tokenKind = isTokenKind(body.tokenKind) ? body.tokenKind : undefined;
  const consentVersion = asText(body.consentVersion, 128);
  const consentAccepted = body.consentAccepted === true;
  if (!liffAppId || !token || !tokenKind) return jsonError(400, "VALIDATION_ERROR", "ต้องระบุ LIFF app และ token ที่ถูกต้อง", requestId);
  try {
    const config = await resolveLiffApp(liffAppId);
    if (!config) throw new LiffIdentityError("NOT_FOUND", "LIFF app configuration was not found");
    const liffConfig: LiffAppConfig = {
      liffAppId: config.liffAppId,
      tenantId: config.tenantId,
      channelId: config.channelId,
      callbackUrl: config.callbackUrl,
      allowedReturnUrls: Array.isArray(config.allowedReturnUrls) ? config.allowedReturnUrls.filter((value): value is string => typeof value === "string") : [],
      enabled: config.enabled,
      ...(config.requiredConsentVersion ? { requiredConsentVersion: config.requiredConsentVersion } : {}),
      sessionTtlSeconds: config.sessionTtlSeconds,
    };
    const claims = tokenKind === "id_token"
      ? await identityProvider.verifyIdToken({ token, channelId: config.channelId })
      : await identityProvider.verifyAccessToken({ token, channelId: config.channelId });
    const verified = validateProductionLineClaims({ claims, config: liffConfig, tokenKind });
    if (config.requiredConsentVersion && (!consentAccepted || consentVersion !== config.requiredConsentVersion)) {
      throw new LiffIdentityError("VALIDATION_ERROR", "required privacy consent is missing or outdated");
    }
    const persisted = await persistLiffIdentity({ liffAppId, lineUserId: verified.lineUserId, verifiedAt: new Date(), ...(consentVersion ? { consentVersion, consentAccepted } : {}) });
    const issued = issueProductionLiffSession({
      context: {
        sessionId: randomUUID(),
        tenantId: persisted.tenantId,
        liffAppId: persisted.liffAppId,
        channelId: persisted.channelId,
        lineUserId: verified.lineUserId,
        expiresAt: new Date(Date.now() + persisted.sessionTtlSeconds * 1000),
        ...(consentAccepted && consentVersion ? { consentVersion } : {}),
      },
      sessionSecret,
      csrfSecret,
      environment: "production",
    });
    const response = NextResponse.json({ data: { tenantId: persisted.tenantId, tenantName: persisted.tenantDisplayName, liffAppId: persisted.liffAppId, lineUserId: verified.lineUserId, csrfToken: issued.csrfToken }, meta: { requestId } }, { status: 201 });
    response.cookies.set(issued.sessionCookie.name, issued.sessionCookie.value, issued.sessionCookie.options);
    return response;
  } catch (error) {
    const mapped = mapError(error);
    return jsonError(mapped.status, mapped.code, mapped.message, requestId);
  }
}
