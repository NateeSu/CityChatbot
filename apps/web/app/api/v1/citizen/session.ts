import { createHash } from "node:crypto";

import { decodeProductionLiffSession, LIFF_SESSION_COOKIE_NAME, verifyProductionLiffCsrf, type ProductionLiffSessionClaims } from "@citychatbot/liff";

export type CitizenSession = ProductionLiffSessionClaims;

export const readCitizenSession = (request: Request): CitizenSession | undefined => {
  const secret = process.env.LIFF_SESSION_SECRET;
  if (!secret) return undefined;
  const cookie = request.headers.get("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${LIFF_SESSION_COOKIE_NAME}=`))?.slice(LIFF_SESSION_COOKIE_NAME.length + 1);
  return decodeProductionLiffSession(cookie, secret);
};

export const requireCitizenSession = (request: Request): CitizenSession => {
  const session = readCitizenSession(request);
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
};

export const requireCitizenCsrf = (request: Request, session: CitizenSession): void => {
  const csrfSecret = process.env.CSRF_SECRET;
  if (!csrfSecret || !verifyProductionLiffCsrf({ csrfToken: request.headers.get("x-csrf-token") ?? undefined, csrfSecret, sessionId: session.sessionId })) {
    throw new Error("FORBIDDEN");
  }
};

export const requestHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const mapCitizenError = (error: unknown): { status: number; code: string } => {
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate?.message === "string" && /^[A-Z_]+$/u.test(candidate.message) ? candidate.message : typeof candidate?.code === "string" ? candidate.code : "PROCESSING_FAILED";
  if (code === "UNAUTHENTICATED") return { status: 401, code };
  if (code === "FORBIDDEN" || code === "FEATURE_DISABLED") return { status: code === "FEATURE_DISABLED" ? 403 : 403, code };
  if (code === "NOT_FOUND") return { status: 404, code };
  if (code === "VALIDATION_ERROR") return { status: 400, code };
  if (code === "IDEMPOTENCY_CONFLICT" || code === "CONFLICT" || code === "VERSION_CONFLICT") return { status: 409, code };
  return { status: 503, code: "DEPENDENCY_NOT_READY" };
};
