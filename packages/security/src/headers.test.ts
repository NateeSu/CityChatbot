import { describe, expect, it } from "vitest";

import { buildCorsHeaders, buildSecurityHeaders, isAllowedCorsOrigin } from "./headers";

const header = (environment: Parameters<typeof buildSecurityHeaders>[0], key: string): string | undefined =>
  buildSecurityHeaders(environment).find((item) => item.key === key)?.value;

describe("security headers", () => {
  it("sets browser isolation and CSP directives in every environment", () => {
    const csp = header("local", "Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(header("local", "X-Content-Type-Options")).toBe("nosniff");
    expect(header("local", "X-Frame-Options")).toBe("DENY");
    expect(header("local", "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("local", "Content-Security-Policy")).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    const productionCsp = header("production", "Content-Security-Policy");
    expect(productionCsp).not.toContain("unsafe-eval");
    expect(productionCsp).toContain("script-src 'self' 'unsafe-inline' https://static.line-scdn.net");
    expect(productionCsp).toContain("connect-src 'self' https://api.line.me https://access.line.me https://liff.line.me");
  });

  it("enables HSTS only for production", () => {
    expect(header("local", "Strict-Transport-Security")).toBeUndefined();
    expect(header("staging", "Strict-Transport-Security")).toBeUndefined();
    expect(header("production", "Strict-Transport-Security")).toContain("max-age=63072000");
  });

  it("allows only exact configured CORS origins and never emits a wildcard", () => {
    const allowlist = ["https://city.example.com"] as const;
    expect(isAllowedCorsOrigin("https://city.example.com", allowlist)).toBe(true);
    expect(isAllowedCorsOrigin("https://city.example.com.evil.test", allowlist)).toBe(false);
    expect(isAllowedCorsOrigin("*", allowlist)).toBe(false);

    const headers = buildCorsHeaders("https://city.example.com", {
      allowlist,
      allowCredentials: true,
      allowedMethods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token"],
    });
    expect(headers).toEqual(expect.arrayContaining([
      { key: "Access-Control-Allow-Origin", value: "https://city.example.com" },
      { key: "Access-Control-Allow-Credentials", value: "true" },
    ]));
    expect(headers.some((item) => item.value === "*")).toBe(false);
    expect(buildCorsHeaders("https://unknown.example.com", { allowlist })).toEqual([]);
  });
});
