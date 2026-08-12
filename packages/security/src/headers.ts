export type SecurityEnvironment = "local" | "test" | "staging" | "production";

export type SecurityHeader = {
  key: string;
  value: string;
};

const buildContentSecurityPolicy = (environment: SecurityEnvironment): string => [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${environment === "production" ? " https://static.line-scdn.net" : " 'unsafe-eval'"}`,
  `connect-src 'self'${environment === "production" ? " https://api.line.me https://access.line.me https://liff.line.me" : " ws: wss:"}`,
  "worker-src 'self' blob:",
].join("; ");

export const buildSecurityHeaders = (environment: SecurityEnvironment): SecurityHeader[] => {
  const headers: SecurityHeader[] = [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(environment) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ];

  if (environment === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
};

export type CorsPolicy = {
  allowlist: readonly string[];
  allowCredentials?: boolean;
  allowedMethods?: readonly string[];
  allowedHeaders?: readonly string[];
};

const isValidOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === origin;
  } catch {
    return false;
  }
};

export const isAllowedCorsOrigin = (origin: string | undefined, allowlist: readonly string[]): boolean =>
  origin !== undefined && isValidOrigin(origin) && allowlist.includes(origin);

export const buildCorsHeaders = (origin: string | undefined, policy: CorsPolicy): SecurityHeader[] => {
  if (origin === undefined || !isAllowedCorsOrigin(origin, policy.allowlist)) return [];

  const headers: SecurityHeader[] = [
    { key: "Access-Control-Allow-Origin", value: origin },
    { key: "Vary", value: "Origin" },
  ];

  if (policy.allowCredentials) {
    headers.push({ key: "Access-Control-Allow-Credentials", value: "true" });
  }
  if (policy.allowedMethods?.length) {
    headers.push({ key: "Access-Control-Allow-Methods", value: policy.allowedMethods.join(", ") });
  }
  if (policy.allowedHeaders?.length) {
    headers.push({ key: "Access-Control-Allow-Headers", value: policy.allowedHeaders.join(", ") });
  }

  return headers;
};
